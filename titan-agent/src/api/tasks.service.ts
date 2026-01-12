import { Injectable, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database/database.service';
import {
  CreateTaskDto,
  TaskResponseDto,
  TaskEvent,
  Step,
  Artifact,
} from '../models/task.model';
import { v4 as uuidv4 } from 'uuid';
import { TasksGateway } from './tasks.gateway';

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

@Injectable()
export class TasksService {
  constructor(
    private db: DatabaseService,
    @Inject(forwardRef(() => TasksGateway))
    private gateway: TasksGateway,
  ) {}

  /**
   * Create a new task
   */
  async createTask(
    userId: string,
    createTaskDto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const id = uuidv4();
    const now = new Date();

    const result = await this.db.query(
      `INSERT INTO tasks (id, "userId", goal, status, context, events, artifacts, "createdAt", metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb, ARRAY[]::jsonb[], ARRAY[]::jsonb[], $6, $7::jsonb)
       RETURNING *`,
      [
        id,
        userId,
        createTaskDto.goal,
        'queued',
        JSON.stringify(createTaskDto.context || {}),
        now,
        '{}',
      ],
    );

    return this.mapRowToDto(result.rows[0]);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string, userId: string): Promise<TaskResponseDto> {
    const result = await this.db.query(
      `SELECT * FROM tasks WHERE id = $1 AND "userId" = $2`,
      [taskId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return this.mapRowToDto(result.rows[0]);
  }

  /**
   * Get all tasks for a user
   */
  async getUserTasks(
    userId: string,
    status?: TaskStatus,
    limit = 50,
    offset = 0,
  ): Promise<TaskResponseDto[]> {
    let query = `SELECT * FROM tasks WHERE "userId" = $1`;
    const params: any[] = [userId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows.map((row) => this.mapRowToDto(row));
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    error?: string,
  ): Promise<void> {
    const updates: string[] = ['status = $2'];
    const params: any[] = [taskId, status];
    let paramIndex = 3;

    if (status === 'running') {
      updates.push(`"startedAt" = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    if (['succeeded', 'failed', 'cancelled'].includes(status)) {
      updates.push(`"completedAt" = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    if (error) {
      updates.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify({ error }));
      paramIndex++;
    }

    await this.db.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $1`,
      params,
    );
  }

  /**
   * Update task plan
   */
  async updateTaskPlan(taskId: string, plan: Step[]): Promise<void> {
    await this.db.query(
      `UPDATE tasks SET plan = $1 WHERE id = $2`,
      [JSON.stringify(plan), taskId],
    );
  }

  /**
   * Update a specific step in the plan
   */
  async updateStep(taskId: string, stepId: string, result: any): Promise<void> {
    const taskResult = await this.db.query(
      `SELECT plan FROM tasks WHERE id = $1`,
      [taskId],
    );

    if (taskResult.rows.length === 0 || !taskResult.rows[0].plan) {
      throw new NotFoundException(`Task ${taskId} or plan not found`);
    }

    const plan = taskResult.rows[0].plan as Step[];
    const stepIndex = plan.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) {
      throw new NotFoundException(`Step ${stepId} not found in task plan`);
    }

    plan[stepIndex] = {
      ...plan[stepIndex],
      ...result,
    };

    await this.db.query(
      `UPDATE tasks SET plan = $1 WHERE id = $2`,
      [JSON.stringify(plan), taskId],
    );
  }

  /**
   * Add event to task
   */
  async addTaskEvent(
    taskId: string,
    type: string,
    data: Record<string, any>,
  ): Promise<void> {
    const taskResult = await this.db.query(
      `SELECT events FROM tasks WHERE id = $1`,
      [taskId],
    );

    if (taskResult.rows.length === 0) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const event: TaskEvent = {
      timestamp: new Date(),
      type: type as any,
      data,
    };

    const events = [...(taskResult.rows[0].events || []), event];

    // Convert events array to PostgreSQL array of JSONB
    const eventsJson = events.map(e => JSON.stringify(e));
    await this.db.query(
      `UPDATE tasks SET events = ARRAY[${eventsJson.map((_, i) => `$${i + 2}::jsonb`).join(', ')}] WHERE id = $1`,
      [taskId, ...eventsJson],
    );

    // Broadcast event via WebSocket
    if (this.gateway) {
      this.gateway.broadcastTaskEvent(taskId, { type, data });
    }
  }

  /**
   * Add artifact to task
   */
  async addTaskArtifact(taskId: string, artifact: Artifact): Promise<void> {
    const taskResult = await this.db.query(
      `SELECT artifacts FROM tasks WHERE id = $1`,
      [taskId],
    );

    if (taskResult.rows.length === 0) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const artifacts = [...(taskResult.rows[0].artifacts || []), artifact];

    // Convert artifacts array to PostgreSQL array of JSONB
    const artifactsJson = artifacts.map(a => JSON.stringify(a));
    await this.db.query(
      `UPDATE tasks SET artifacts = ARRAY[${artifactsJson.map((_, i) => `$${i + 2}::jsonb`).join(', ')}] WHERE id = $1`,
      [taskId, ...artifactsJson],
    );
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string, userId: string): Promise<void> {
    const taskResult = await this.db.query(
      `SELECT status FROM tasks WHERE id = $1 AND "userId" = $2`,
      [taskId, userId],
    );

    if (taskResult.rows.length === 0) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const status = taskResult.rows[0].status;
    if (status !== 'running' && status !== 'queued') {
      throw new Error(`Cannot cancel task with status: ${status}`);
    }

    await this.updateTaskStatus(taskId, 'cancelled');
  }

  /**
   * Map database row to DTO
   */
  private mapRowToDto(row: any): TaskResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      goal: row.goal,
      status: row.status,
      context: row.context,
      plan: row.plan,
      events: row.events || [],
      artifacts: row.artifacts || [],
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      metadata: row.metadata,
    };
  }
}

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { QueueService } from '../infrastructure/queue/queue.service';
import { CreateTaskDto, TaskResponseDto } from '../models/task.model';

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Create a new task
   * POST /tasks
   */
  @Post()
  async createTask(
    @Headers('authorization') authorization: string,
    @Body() createTaskDto: CreateTaskDto,
  ): Promise<{ taskId: string }> {
    // Extract userId from API key (simplified for Phase 1)
    const userId = this.extractUserIdFromAuth(authorization);

    if (!createTaskDto.goal || createTaskDto.goal.trim().length === 0) {
      throw new BadRequestException('Goal is required and cannot be empty');
    }

    const task = await this.tasksService.createTask(userId, createTaskDto);

    // Add task to BullMQ queue for processing
    await this.queueService.addTask({
      taskId: task.id,
      userId: task.userId,
      goal: task.goal,
      context: task.context,
    });

    return { taskId: task.id };
  }

  /**
   * Get task status and history
   * GET /tasks/:id
   */
  @Get(':id')
  async getTask(
    @Headers('authorization') authorization: string,
    @Param('id') taskId: string,
  ): Promise<TaskResponseDto> {
    const userId = this.extractUserIdFromAuth(authorization);
    return await this.tasksService.getTask(taskId, userId);
  }

  /**
   * Get all tasks for authenticated user
   * GET /tasks
   */
  @Get()
  async getUserTasks(
    @Headers('authorization') authorization: string,
    @Query('status') status?: TaskStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<TaskResponseDto[]> {
    const userId = this.extractUserIdFromAuth(authorization);

    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return await this.tasksService.getUserTasks(
      userId,
      status,
      parsedLimit,
      parsedOffset,
    );
  }

  /**
   * Cancel a running task
   * DELETE /tasks/:id
   */
  @Delete(':id')
  async cancelTask(
    @Headers('authorization') authorization: string,
    @Param('id') taskId: string,
  ): Promise<{ message: string }> {
    const userId = this.extractUserIdFromAuth(authorization);
    await this.tasksService.cancelTask(taskId, userId);

    // TODO: Signal worker to stop processing this task

    return { message: `Task ${taskId} cancelled successfully` };
  }

  /**
   * Extract userId from authorization header
   * Phase 1: Simple API key format: "Bearer <apiKey>"
   * TODO: Phase 2: Implement proper JWT token validation
   */
  private extractUserIdFromAuth(authorization: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    // Phase 1: Simple Bearer token format
    // Format: "Bearer <apiKey>"
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const apiKey = parts[1];

    // TODO: Look up user by API key in database
    // For now, we'll use a hardcoded demo user ID
    // This will be replaced with proper API key validation in Phase 1 completion

    if (apiKey === 'dev-key-123') {
      return 'demo-user-id';
    }

    throw new UnauthorizedException('Invalid API key');
  }
}

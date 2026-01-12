import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { TaskJob } from './queue.service';
import { TasksService } from '../../api/tasks.service';
import { SandboxManagerService } from '../../core/sandbox/sandbox-manager.service';
import { OrchestratorService } from '../../core/agent/orchestrator.service';

@Injectable()
export class TaskWorker implements OnModuleInit {
  private readonly logger = new Logger(TaskWorker.name);
  private worker!: Worker<TaskJob>;
  private connection: Redis;

  constructor(
    private configService: ConfigService,
    private tasksService: TasksService,
    private sandboxManager: SandboxManagerService,
    private orchestrator: OrchestratorService,
  ) {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      'redis://localhost:6379';

    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  onModuleInit() {
    this.worker = new Worker<TaskJob>(
      'agent-tasks',
      async (job: Job<TaskJob>) => {
        return this.processTask(job);
      },
      {
        connection: this.connection,
        concurrency: 5, // Process 5 tasks concurrently
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job failed: ${job?.id}, Error: ${err.message}`);
    });

    this.logger.log('Task worker started');
  }

  /**
   * Process a task job
   */
  private async processTask(job: Job<TaskJob>): Promise<void> {
    const { taskId, userId, goal, context } = job.data;

    this.logger.log(`Processing task: ${taskId}`);
    this.logger.log(`Goal: ${goal}`);

    let sandboxId: string | null = null;

    try {
      // Update task status to running
      await this.tasksService.updateTaskStatus(taskId, 'running');
      await this.tasksService.addTaskEvent(taskId, 'task_started', {
        message: 'Task execution started',
      });

      // Create sandbox
      sandboxId = `task-${taskId}`;
      this.logger.log(`Creating sandbox: ${sandboxId}`);

      const sandbox = await this.sandboxManager.create(sandboxId);

      await this.tasksService.addTaskEvent(taskId, 'sandbox_created', {
        sandboxId: sandbox.id,
        ports: sandbox.ports,
      });

      // Execute orchestrator (planner + executor)
      this.logger.log('Executing orchestrator');
      await this.orchestrator.run(taskId, userId, goal, sandboxId, context);

      // Mark task as succeeded
      await this.tasksService.updateTaskStatus(taskId, 'succeeded');
      await this.tasksService.addTaskEvent(taskId, 'task_completed', {
        message: 'Task completed successfully',
      });

      this.logger.log(`Task completed: ${taskId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Task failed: ${taskId}, Error: ${errorMessage}`);

      await this.tasksService.updateTaskStatus(
        taskId,
        'failed',
        errorMessage,
      );
      await this.tasksService.addTaskEvent(taskId, 'task_failed', {
        error: errorMessage,
        stack: errorStack,
      });

      throw error;
    } finally {
      // Clean up sandbox
      if (sandboxId) {
        try {
          await this.sandboxManager.destroy(sandboxId);
          this.logger.log(`Sandbox destroyed: ${sandboxId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to destroy sandbox: ${sandboxId}, Error: ${errorMessage}`,
          );
        }
      }
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export interface TaskJob {
  taskId: string;
  userId: string;
  goal: string;
  context?: Record<string, any>;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private taskQueue: Queue<TaskJob>;
  private connection: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.taskQueue = new Queue<TaskJob>('agent-tasks', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600, // 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // 7 days
        },
      },
    });

    this.logger.log('Queue service initialized');
  }

  async onModuleDestroy() {
    await this.taskQueue.close();
    await this.connection.quit();
    this.logger.log('Queue service destroyed');
  }

  /**
   * Add a task to the queue
   */
  async addTask(job: TaskJob): Promise<string> {
    this.logger.log(`Adding task to queue: ${job.taskId}`);

    const bullJob = await this.taskQueue.add('execute-task', job, {
      jobId: job.taskId,
    });

    return bullJob.id || job.taskId;
  }

  /**
   * Get task queue
   */
  getTaskQueue(): Queue<TaskJob> {
    return this.taskQueue;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string) {
    return this.taskQueue.getJob(jobId);
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Job removed: ${jobId}`);
    }
  }
}

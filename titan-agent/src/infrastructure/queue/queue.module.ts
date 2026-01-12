import { Module, forwardRef } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TaskWorker } from './task.worker';
import { TasksModule } from '../../api/tasks.module';
import { SandboxModule } from '../../core/sandbox/sandbox.module';
import { AgentModule } from '../../core/agent/agent.module';

@Module({
  imports: [forwardRef(() => TasksModule), SandboxModule, AgentModule],
  providers: [QueueService, TaskWorker],
  exports: [QueueService],
})
export class QueueModule {}

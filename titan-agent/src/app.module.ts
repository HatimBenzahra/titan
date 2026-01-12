import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { TasksModule } from './api/tasks.module';
import { SandboxModule } from './core/sandbox/sandbox.module';

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Database connection
    DatabaseModule,
    // Sandbox management
    SandboxModule,
    // Queue system
    QueueModule,
    // API modules
    TasksModule,
  ],
})
export class AppModule {}

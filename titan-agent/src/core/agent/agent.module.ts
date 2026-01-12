import { Module, forwardRef } from '@nestjs/common';
import { PlannerAgent } from './planner.agent';
import { ExecutorAgent } from './executor.agent';
import { OrchestratorService } from './orchestrator.service';
import { ToolsModule } from '../tools/tools.module';
import { TasksModule } from '../../api/tasks.module';

@Module({
  imports: [ToolsModule, forwardRef(() => TasksModule)],
  providers: [PlannerAgent, ExecutorAgent, OrchestratorService],
  exports: [OrchestratorService],
})
export class AgentModule {}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlannerAgent } from './planner.agent';
import { ExecutorAgent } from './executor.agent';
import { CriticAgent } from './critic.agent';
import { TasksService } from '../../api/tasks.service';
import { Step } from '../../models/task.model';
import { ToolContext } from '../tools/tool.interface';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly enableCritic: boolean;
  private readonly criticConfidenceThreshold: number;

  constructor(
    private plannerAgent: PlannerAgent,
    private executorAgent: ExecutorAgent,
    private criticAgent: CriticAgent,
    private tasksService: TasksService,
    private configService: ConfigService,
  ) {
    this.enableCritic = this.configService.get<boolean>('ENABLE_CRITIC') !== false;
    this.criticConfidenceThreshold = this.configService.get<number>('CRITIC_CONFIDENCE_THRESHOLD') || 0.7;
  }

  /**
   * Main orchestration loop for task execution
   */
  async run(
    taskId: string,
    userId: string,
    goal: string,
    sandboxId: string,
    context?: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`Starting orchestration for task ${taskId}`);
    this.logger.log(`Goal: ${goal}`);

    try {
      // Step 1: Generate plan
      this.logger.log('Phase 1: Planning');
      await this.tasksService.addTaskEvent(taskId, 'planning_started', {
        goal,
        context,
      });

      const plan: Step[] = await this.plannerAgent.generatePlan(goal, context);

      await this.tasksService.updateTaskPlan(taskId, plan);
      await this.tasksService.addTaskEvent(taskId, 'plan_generated', {
        stepCount: plan.length,
        steps: plan.map((s) => ({ id: s.id, description: s.description })),
      });

      this.logger.log(`Plan generated with ${plan.length} steps`);

      // Step 2: Execute plan
      this.logger.log('Phase 2: Execution');
      await this.tasksService.addTaskEvent(taskId, 'execution_started', {
        stepCount: plan.length,
      });

      const toolContext: ToolContext = {
        sandboxId,
        userId,
        taskId,
        timeout: 30000,
        cwd: '/work',
      };

      let currentPlan = [...plan];
      for (let i = 0; i < currentPlan.length; i++) {
        const step = currentPlan[i];

        await this.tasksService.addTaskEvent(taskId, 'step_started', {
          stepId: step.id,
          stepNumber: i + 1,
          totalSteps: currentPlan.length,
          description: step.description,
          tool: step.tool,
        });

        const executedStep = await this.executorAgent.executeStep(
          step,
          toolContext,
        );

        // Update step in database
        await this.tasksService.updateStep(taskId, step.id, executedStep);

        await this.tasksService.addTaskEvent(taskId, 'step_completed', {
          stepId: step.id,
          stepNumber: i + 1,
          totalSteps: currentPlan.length,
          status: executedStep.status,
          success: executedStep.result?.success,
          output: executedStep.result?.output?.substring(0, 500), // Truncate for event log
          error: executedStep.result?.error,
        });

        // Phase 2.5: Critic Agent Evaluation (if enabled)
        if (this.enableCritic) {
          try {
            const executionHistory = currentPlan.filter(s => s.status !== 'pending');
            const evaluation = await this.criticAgent.evaluate(
              goal,
              currentPlan,
              executionHistory,
              executedStep
            );

            this.logger.debug(`Critic evaluation: ${JSON.stringify(evaluation)}`);

            // If critic detects issues with high confidence, generate corrections
            if (!evaluation.isOnTrack && evaluation.confidence >= this.criticConfidenceThreshold) {
              this.logger.warn(`Critic detected issues: ${evaluation.issues.join(', ')}`);

              await this.tasksService.addTaskEvent(taskId, 'critic_evaluation', {
                isOnTrack: false,
                issues: evaluation.issues,
                suggestions: evaluation.suggestions,
                confidence: evaluation.confidence
              });

              // Generate corrective steps
              const corrections = await this.criticAgent.generateCorrection(
                goal,
                currentPlan,
                evaluation.issues[0]
              );

              if (corrections.length > 0) {
                // Insert corrections after current step
                currentPlan.splice(i + 1, 0, ...corrections);
                await this.tasksService.updateTaskPlan(taskId, currentPlan);

                await this.tasksService.addTaskEvent(taskId, 'correction_applied', {
                  originalStep: step.id,
                  issues: evaluation.issues,
                  corrections: corrections.map(c => ({ id: c.id, description: c.description })),
                  insertedAfterStep: i + 1
                });

                this.logger.log(`Added ${corrections.length} corrective steps to plan`);
              }
            }
          } catch (criticError) {
            const criticErrorMessage = criticError instanceof Error ? criticError.message : String(criticError);
            this.logger.error(`Critic agent failed: ${criticErrorMessage}`);
            // Continue execution even if critic fails
          }
        }

        // Check if step failed and is required
        if (executedStep.status === 'failed' && step.required !== false) {
          this.logger.error(
            `Required step ${step.id} failed, stopping execution`,
          );
          await this.tasksService.addTaskEvent(taskId, 'execution_stopped', {
            reason: 'required_step_failed',
            failedStep: step.id,
          });
          break;
        }
      }

      // Step 3: Determine final status
      const task = await this.tasksService.getTask(taskId, userId);
      const allStepsCompleted = task.plan?.every(
        (s: Step) => s.status === 'completed',
      );

      if (allStepsCompleted) {
        this.logger.log(`Task ${taskId} completed successfully`);
        await this.tasksService.addTaskEvent(taskId, 'task_succeeded', {
          message: 'All steps completed successfully',
        });
      } else {
        this.logger.warn(`Task ${taskId} completed with failures`);
        await this.tasksService.addTaskEvent(taskId, 'task_completed_with_failures', {
          message: 'Some steps failed',
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Orchestration failed for task ${taskId}: ${errorMessage}`);

      await this.tasksService.addTaskEvent(taskId, 'orchestration_failed', {
        error: errorMessage,
      });

      throw error;
    }
  }
}

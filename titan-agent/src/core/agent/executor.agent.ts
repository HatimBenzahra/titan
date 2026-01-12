import { Injectable, Logger } from '@nestjs/common';
import { Step } from '../../models/task.model';
import { ToolRegistry } from '../tools/tool.registry';
import { ToolContext, ToolResult } from '../tools/tool.interface';

@Injectable()
export class ExecutorAgent {
  private readonly logger = new Logger(ExecutorAgent.name);

  constructor(private toolRegistry: ToolRegistry) {}

  /**
   * Execute a single step
   */
  async executeStep(step: Step, context: ToolContext): Promise<Step> {
    this.logger.log(`Executing step: ${step.id} - ${step.description}`);
    this.logger.debug(`Tool: ${step.tool}`);
    this.logger.debug(`Arguments: ${JSON.stringify(step.arguments)}`);

    const tool = this.toolRegistry.get(step.tool);
    if (!tool) {
      this.logger.error(`Tool not found: ${step.tool}`);
      return {
        ...step,
        status: 'failed',
        result: {
          success: false,
          output: '',
          error: `Tool not found: ${step.tool}`,
        },
      };
    }

    try {
      const result: ToolResult = await tool.run(step.arguments, context);

      this.logger.log(`Step ${step.id} completed`);
      this.logger.debug(`Result: ${result.success ? 'success' : 'failed'}`);
      if (result.output) {
        this.logger.debug(`Output: ${result.output.substring(0, 200)}...`);
      }

      return {
        ...step,
        status: result.success ? 'completed' : 'failed',
        result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Step ${step.id} failed: ${errorMessage}`);

      return {
        ...step,
        status: 'failed',
        result: {
          success: false,
          output: '',
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Execute a sequence of steps
   */
  async executeSteps(
    steps: Step[],
    context: ToolContext,
  ): Promise<{ steps: Step[]; success: boolean }> {
    const executedSteps: Step[] = [];
    let allSucceeded = true;

    for (const step of steps) {
      const executedStep = await this.executeStep(step, context);
      executedSteps.push(executedStep);

      if (executedStep.status === 'failed') {
        allSucceeded = false;
        // If step is required and failed, stop execution
        if (step.required !== false) {
          this.logger.warn(
            `Required step ${step.id} failed, stopping execution`,
          );
          break;
        } else {
          this.logger.warn(
            `Optional step ${step.id} failed, continuing execution`,
          );
        }
      }
    }

    return {
      steps: executedSteps,
      success: allSucceeded,
    };
  }
}

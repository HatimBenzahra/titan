import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Step } from '../../models/task.model';
import { ToolRegistry } from '../tools/tool.registry';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  private anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private toolRegistry: ToolRegistry,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey || apiKey === 'sk-ant-your-anthropic-key') {
      this.logger.warn(
        'ANTHROPIC_API_KEY not configured. PlannerAgent will not work properly.',
      );
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Generate a plan for accomplishing the given goal
   */
  async generatePlan(
    goal: string,
    context?: Record<string, any>,
  ): Promise<Step[]> {
    this.logger.log(`Generating plan for goal: ${goal}`);

    const toolSchemas = this.toolRegistry.getToolSchemas();
    const toolDescriptions = toolSchemas
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    const systemPrompt = `You are an AI agent planner. Your job is to break down user goals into a sequence of executable steps.

Available Tools:
${toolDescriptions}

Guidelines:
1. Create a clear, sequential plan to accomplish the user's goal
2. Each step should use ONE tool
3. Steps should be atomic and focused
4. Include success criteria for each step
5. Be specific about tool arguments
6. Consider dependencies between steps
7. Keep the plan simple and direct

Output Format:
Return a valid JSON array of steps. Each step must have:
- id: unique identifier (e.g., "step-1", "step-2")
- tool: name of the tool to use
- description: human-readable description of what this step does
- arguments: object with tool-specific arguments
- successCriteria: how to determine if the step succeeded
- required: boolean indicating if failure should stop execution

Example:
[
  {
    "id": "step-1",
    "tool": "file_write",
    "description": "Create Python script file",
    "arguments": {
      "path": "hello.py",
      "content": "print('Hello, World!')"
    },
    "successCriteria": "File created successfully",
    "required": true
  },
  {
    "id": "step-2",
    "tool": "shell",
    "description": "Run the Python script",
    "arguments": {
      "command": "python3 hello.py"
    },
    "successCriteria": "Script executes without errors and prints output",
    "required": true
  }
]`;

    const userPrompt = context
      ? `Goal: ${goal}\n\nContext: ${JSON.stringify(context, null, 2)}\n\nGenerate a plan to accomplish this goal.`
      : `Goal: ${goal}\n\nGenerate a plan to accomplish this goal.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText
          .replace(/^```json\n/, '')
          .replace(/\n```$/, '')
          .trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/^```\n/, '')
          .replace(/\n```$/, '')
          .trim();
      }

      const plan = JSON.parse(jsonText) as Step[];

      // Validate plan structure
      if (!Array.isArray(plan)) {
        throw new Error('Plan must be an array');
      }

      for (const step of plan) {
        if (!step.id || !step.tool || !step.description || !step.arguments) {
          throw new Error(`Invalid step structure: ${JSON.stringify(step)}`);
        }

        // Validate tool exists
        if (!this.toolRegistry.has(step.tool)) {
          throw new Error(`Unknown tool: ${step.tool}`);
        }

        // Set defaults
        step.status = 'pending';
        step.required = step.required !== false; // Default to true
      }

      this.logger.log(`Plan generated with ${plan.length} steps`);
      return plan;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate plan: ${errorMessage}`);
      throw new Error(`Plan generation failed: ${errorMessage}`);
    }
  }
}

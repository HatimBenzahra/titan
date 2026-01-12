import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Step } from '../../models/task.model';
import { ToolRegistry } from '../tools/tool.registry';

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  private ollamaUrl: string;
  private model: string;

  constructor(
    private configService: ConfigService,
    private toolRegistry: ToolRegistry,
  ) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL') || 'http://100.68.221.26:11434';
    this.model = this.configService.get<string>('MODEL_PLANNER') || 'mistral:latest';
    this.logger.log(`Using Ollama at ${this.ollamaUrl} with model ${this.model}`);
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
Return ONLY a valid JSON array of steps. Each step must have:
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
]

Return ONLY the JSON array, no other text.`;

    const userPrompt = context
      ? `Goal: ${goal}\n\nContext: ${JSON.stringify(context, null, 2)}\n\nGenerate a plan to accomplish this goal.`
      : `Goal: ${goal}\n\nGenerate a plan to accomplish this goal.`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 2048,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseText = data.response.trim();

      this.logger.log(`LLM Raw Response: ${responseText.substring(0, 500)}`);

      // Extract JSON from response (handle markdown code blocks)
      let jsonText = responseText;
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

      this.logger.log(`Extracted JSON: ${jsonText.substring(0, 500)}`);

      let plan = JSON.parse(jsonText);

      // If Ollama returns a single object instead of an array, wrap it
      if (!Array.isArray(plan)) {
        this.logger.log('LLM returned single object, wrapping in array');
        plan = [plan];
      }

      plan = plan as Step[];

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

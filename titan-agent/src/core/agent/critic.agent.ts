import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Step } from '../../models/task.model';

interface CriticEvaluation {
  isOnTrack: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

@Injectable()
export class CriticAgent {
  private readonly logger = new Logger(CriticAgent.name);
  private ollamaUrl: string;
  private model: string;

  constructor(private configService: ConfigService) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL') || 'http://100.68.221.26:11434';
    this.model = this.configService.get<string>('MODEL_GENERAL') || 'qwen3:32b';
  }

  async evaluate(
    goal: string,
    plan: Step[],
    executionHistory: Step[],
    currentStep: Step
  ): Promise<CriticEvaluation> {
    this.logger.log(`Evaluating execution progress for step: ${currentStep.id}`);

    const systemPrompt = `You are a critical evaluator reviewing an AI agent's task execution.

Your job is to:
1. Assess if the agent is making progress toward the goal
2. Identify mistakes or issues
3. Suggest corrections if needed

Return ONLY valid JSON with this structure:
{
  "isOnTrack": boolean,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "confidence": 0.0-1.0
}`;

    const userPrompt = `Goal: ${goal}

Original Plan:
${plan.map((s, i) => `${i + 1}. ${s.description} (${s.status})`).join('\n')}

Recent Execution History (last 5 steps):
${executionHistory.slice(-5).map(s => `- ${s.description}: ${s.status}${s.error ? ` (Error: ${s.error})` : ''}`).join('\n')}

Current Step:
- Description: ${currentStep.description}
- Tool: ${currentStep.tool}
- Status: ${currentStep.status}
${currentStep.error ? `- Error: ${currentStep.error}` : ''}
${currentStep.result ? `- Result: ${JSON.stringify(currentStep.result).substring(0, 200)}` : ''}

Evaluate the execution. Are we on track?`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: { temperature: 0.3, num_predict: 1024 }
        })
      });

      const data = await response.json();
      let responseText = data.response.trim();

      // Extract JSON from markdown if needed
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\n/, '').replace(/\n```$/, '').trim();
      }

      const evaluation = JSON.parse(responseText) as CriticEvaluation;

      this.logger.log(`Evaluation complete: ${evaluation.isOnTrack ? 'On track' : 'Off track'} (confidence: ${evaluation.confidence})`);
      return evaluation;

    } catch (error) {
      this.logger.error(`Critic evaluation failed: ${error instanceof Error ? error.message : String(error)}`);

      // Default to optimistic evaluation on failure
      return {
        isOnTrack: true,
        issues: ['Critic agent failed to evaluate'],
        suggestions: [],
        confidence: 0.5
      };
    }
  }

  async generateCorrection(
    goal: string,
    originalPlan: Step[],
    issue: string
  ): Promise<Step[]> {
    this.logger.log(`Generating correction for issue: ${issue}`);

    const systemPrompt = `You are a planning agent that generates corrective action plans.

Given an issue with the current execution, create a revised plan to address it.

Return ONLY a valid JSON array of steps:
[
  {
    "id": "correction-1",
    "tool": "shell|file_read|file_write|file_list|browser",
    "description": "...",
    "arguments": {...},
    "successCriteria": "...",
    "required": true
  }
]`;

    const userPrompt = `Goal: ${goal}

Original Plan:
${originalPlan.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

Issue: ${issue}

Generate a corrective action plan.`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: { temperature: 0.7, num_predict: 2048 }
        })
      });

      const data = await response.json();
      let responseText = data.response.trim();

      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\n/, '').replace(/\n```$/, '').trim();
      }

      let correctionPlan = JSON.parse(responseText);

      // Auto-wrap single objects in array (like PlannerAgent does)
      if (!Array.isArray(correctionPlan)) {
        this.logger.log('LLM returned single object, wrapping in array');
        correctionPlan = [correctionPlan];
      }

      // Set defaults
      correctionPlan.forEach((step: Step) => {
        step.status = 'pending';
        step.required = step.required !== false;
      });

      this.logger.log(`Generated ${correctionPlan.length} corrective steps`);
      return correctionPlan as Step[];

    } catch (error) {
      this.logger.error(`Correction generation failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

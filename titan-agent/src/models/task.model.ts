// Task status type
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

// Step interface for task execution plan
export interface Step {
  id: string;
  description: string;
  tool: string; // e.g., "shell", "browser", "file_read", "file_write"
  arguments: Record<string, any>;
  expectedOutput?: string;
  successCriteria?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  required?: boolean; // If true, task stops on failure; defaults to true
}

// Task event types for execution history
export type TaskEventType =
  | 'plan_generated'
  | 'step_started'
  | 'step_completed'
  | 'correction_applied'
  | 'error'
  | 'complete';

// Task event interface
export interface TaskEvent {
  timestamp: Date;
  type: TaskEventType;
  data: Record<string, any>;
}

// Artifact types
export type ArtifactType = 'file' | 'url' | 'text' | 'data';

// Artifact interface
export interface Artifact {
  id: string;
  type: ArtifactType;
  path?: string;
  url?: string;
  content?: string;
  metadata?: Record<string, any>;
}

// Task creation DTO
export interface CreateTaskDto {
  goal: string;
  context?: Record<string, any>;
}

// Task response DTO
export interface TaskResponseDto {
  id: string;
  userId: string;
  goal: string;
  status: TaskStatus;
  context?: Record<string, any>;
  plan?: Step[];
  events: TaskEvent[];
  artifacts: Artifact[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

// Task memory for agent execution context
export interface TaskMemory {
  goal: string;
  plan: Step[];
  executionHistory: ToolCall[];
  currentStep: Step | null;
  context: Record<string, any>;
  errors: string[];
  successMetrics: Record<string, any>;
}

// Tool call history
export interface ToolCall {
  timestamp: Date;
  tool: string;
  arguments: Record<string, any>;
  result: ToolResult;
  duration: number;
  status: 'success' | 'failure';
}

// Tool execution context
export interface ToolContext {
  sandboxId: string;
  userId: string;
  taskId: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

// Tool execution result
export interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: string[];
  error?: string;
  metadata?: Record<string, any>;
}

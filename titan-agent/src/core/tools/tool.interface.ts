/**
 * Tool context provided to each tool execution
 */
export interface ToolContext {
  sandboxId: string;
  userId: string;
  taskId: string;
  timeout?: number;
  cwd?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: Array<{
    type: string;
    path?: string;
    content?: string;
    metadata?: Record<string, any>;
  }>;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * JSON Schema for tool parameters
 */
export interface ToolSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Base tool interface
 */
export interface Tool {
  name: string;
  description: string;
  schema: ToolSchema;

  /**
   * Execute the tool with given arguments
   */
  run(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}

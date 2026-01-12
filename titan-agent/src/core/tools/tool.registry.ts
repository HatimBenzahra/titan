import { Injectable, Logger } from '@nestjs/common';
import { Tool, ToolSchema } from './tool.interface';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool ${tool.name} is already registered, overwriting`);
    }

    this.tools.set(tool.name, tool);
    this.logger.log(`Tool registered: ${tool.name}`);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get schema for all tools (useful for LLM function calling)
   */
  getToolSchemas(): Array<{
    name: string;
    description: string;
    parameters: ToolSchema;
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      this.logger.log(`Tool unregistered: ${name}`);
    }
    return removed;
  }

  /**
   * Get number of registered tools
   */
  count(): number {
    return this.tools.size;
  }
}

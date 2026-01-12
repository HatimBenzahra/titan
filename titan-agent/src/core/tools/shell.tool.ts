import { Injectable, Logger } from '@nestjs/common';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';
import { Tool, ToolContext, ToolResult, ToolSchema } from './tool.interface';

@Injectable()
export class ShellTool implements Tool {
  private readonly logger = new Logger(ShellTool.name);

  name = 'shell';
  description =
    'Execute shell commands in the sandbox environment. Use this to run bash commands, install packages, run scripts, etc. Commands are executed in a secure, isolated container.';

  schema: ToolSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Optional timeout in milliseconds (default: 30000)',
      },
      cwd: {
        type: 'string',
        description:
          'Optional working directory for command execution (default: /work)',
      },
    },
    required: ['command'],
    additionalProperties: false,
  };

  constructor(private sandboxManager: SandboxManagerService) {}

  async run(
    args: Record<string, any>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const command = args.command as string;
    const timeout = (args.timeout as number) || ctx.timeout || 30000;
    const cwd = (args.cwd as string) || ctx.cwd || '/work';

    this.logger.log(`Executing shell command in sandbox ${ctx.sandboxId}`);
    this.logger.debug(`Command: ${command}`);
    this.logger.debug(`CWD: ${cwd}`);

    try {
      const result = await this.sandboxManager.executeShell(
        ctx.sandboxId,
        command,
        { timeout, cwd },
      );

      if (result.success) {
        return {
          success: true,
          output: result.stdout || '',
          metadata: {
            exitCode: result.exitCode,
            stderr: result.stderr,
            command,
            cwd,
          },
        };
      } else {
        return {
          success: false,
          output: result.stdout || '',
          error: result.error || result.stderr || 'Command execution failed',
          metadata: {
            exitCode: result.exitCode,
            stderr: result.stderr,
            command,
            cwd,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Shell tool execution failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        metadata: {
          command,
          cwd,
        },
      };
    }
  }
}

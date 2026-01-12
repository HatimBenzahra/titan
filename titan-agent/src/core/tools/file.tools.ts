import { Injectable, Logger } from '@nestjs/common';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';
import { Tool, ToolContext, ToolResult, ToolSchema } from './tool.interface';

/**
 * File Read Tool
 */
@Injectable()
export class FileReadTool implements Tool {
  private readonly logger = new Logger(FileReadTool.name);

  name = 'file_read';
  description =
    'Read the contents of a file from the sandbox workspace. Returns the file content as a string.';

  schema: ToolSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read (relative to /work)',
      },
    },
    required: ['path'],
    additionalProperties: false,
  };

  constructor(private sandboxManager: SandboxManagerService) {}

  async run(
    args: Record<string, any>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const filePath = args.path as string;

    this.logger.log(`Reading file: ${filePath} from sandbox ${ctx.sandboxId}`);

    try {
      const result = await this.sandboxManager.readFile(ctx.sandboxId, filePath);

      if (result.success && result.content !== undefined) {
        return {
          success: true,
          output: result.content,
          metadata: {
            path: result.path,
            size: result.size,
          },
        };
      } else {
        return {
          success: false,
          output: '',
          error: result.error || 'Failed to read file',
          metadata: {
            path: filePath,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`File read failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        metadata: {
          path: filePath,
        },
      };
    }
  }
}

/**
 * File Write Tool
 */
@Injectable()
export class FileWriteTool implements Tool {
  private readonly logger = new Logger(FileWriteTool.name);

  name = 'file_write';
  description =
    'Write content to a file in the sandbox workspace. Creates the file if it does not exist, overwrites if it does.';

  schema: ToolSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write (relative to /work)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  };

  constructor(private sandboxManager: SandboxManagerService) {}

  async run(
    args: Record<string, any>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const filePath = args.path as string;
    const content = args.content as string;

    this.logger.log(`Writing file: ${filePath} in sandbox ${ctx.sandboxId}`);

    try {
      const result = await this.sandboxManager.writeFile(
        ctx.sandboxId,
        filePath,
        content,
      );

      if (result.success) {
        return {
          success: true,
          output: `File written successfully: ${filePath}`,
          artifacts: [
            {
              type: 'file',
              path: result.path,
              metadata: {
                size: result.size,
              },
            },
          ],
          metadata: {
            path: result.path,
            size: result.size,
          },
        };
      } else {
        return {
          success: false,
          output: '',
          error: result.error || 'Failed to write file',
          metadata: {
            path: filePath,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`File write failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        metadata: {
          path: filePath,
        },
      };
    }
  }
}

/**
 * File List Tool
 */
@Injectable()
export class FileListTool implements Tool {
  private readonly logger = new Logger(FileListTool.name);

  name = 'file_list';
  description =
    'List files and directories in a directory in the sandbox workspace. Returns file names, types, sizes, and modification times.';

  schema: ToolSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'The path to the directory to list (relative to /work, default: ".")',
      },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(private sandboxManager: SandboxManagerService) {}

  async run(
    args: Record<string, any>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const dirPath = (args.path as string) || '.';

    this.logger.log(`Listing directory: ${dirPath} in sandbox ${ctx.sandboxId}`);

    try {
      const result = await this.sandboxManager.listDirectory(
        ctx.sandboxId,
        dirPath,
      );

      if (result.success && result.files) {
        const fileList = result.files
          .map(
            (file) =>
              `${file.type === 'directory' ? '[DIR]' : '[FILE]'} ${file.name} (${file.size} bytes, modified: ${new Date(file.modified).toISOString()})`,
          )
          .join('\n');

        return {
          success: true,
          output: fileList || '(empty directory)',
          metadata: {
            path: result.path,
            fileCount: result.files.length,
            files: result.files,
          },
        };
      } else {
        return {
          success: false,
          output: '',
          error: result.error || 'Failed to list directory',
          metadata: {
            path: dirPath,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Directory list failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        metadata: {
          path: dirPath,
        },
      };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Tool, ToolContext, ToolResult } from './tool.interface';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';

@Injectable()
export class BrowserTool implements Tool {
  private readonly logger = new Logger(BrowserTool.name);

  name = 'browser';
  description = 'Navigate web pages, extract content, take screenshots, and interact with web elements. Actions: open (visit URL), read (extract page content and text), screenshot (capture page), extract_table (extract table data), click (click element by CSS selector), fill_form (fill form fields).';

  schema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open', 'read', 'screenshot', 'extract_table', 'click', 'fill_form'],
        description: 'Action to perform: open (visit URL), read (get content), screenshot (capture), extract_table (get tables), click (click element), fill_form (fill fields)'
      },
      url: {
        type: 'string',
        description: 'URL to visit'
      },
      selector: {
        type: 'string',
        description: 'CSS selector (required for click action)'
      },
      instructions: {
        type: 'object',
        description: 'Form fields as key-value pairs where key is CSS selector and value is text to enter (required for fill_form action)'
      },
      timeout: {
        type: 'number',
        default: 15000,
        description: 'Timeout in milliseconds (default: 15000)'
      }
    },
    required: ['action', 'url']
  };

  constructor(private sandboxManager: SandboxManagerService) {}

  async run(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult> {
    this.logger.log(`Browser action: ${args.action} on ${args.url}`);

    try {
      const result = await this.sandboxManager.executeBrowser(
        ctx.sandboxId,
        args.action,
        {
          url: args.url,
          selector: args.selector,
          instructions: args.instructions,
          timeout: args.timeout || 15000
        }
      );

      if (!result.success) {
        return {
          success: false,
          output: '',
          error: result.error || 'Browser action failed',
          metadata: { action: args.action, url: args.url }
        };
      }

      // Format output based on action
      let output = '';
      switch (args.action) {
        case 'open':
          output = `Opened ${result.data?.url || args.url}`;
          break;
        case 'read':
          output = `Page Title: ${result.data?.title || 'N/A'}\n\n`;
          output += `URL: ${result.data?.url || args.url}\n\n`;
          output += `Text Content:\n${result.data?.textContent || result.data?.content || ''}`;
          break;
        case 'screenshot':
          output = `Screenshot captured from ${result.data?.url || args.url}`;
          break;
        case 'extract_table':
          output = `Extracted ${result.data?.tables?.length || 0} tables:\n${JSON.stringify(result.data?.tables || [], null, 2)}`;
          break;
        case 'click':
          output = `Clicked element "${args.selector}" at ${result.data?.url || args.url}`;
          break;
        case 'fill_form':
          output = `Filled form at ${result.data?.url || args.url}`;
          break;
        default:
          output = JSON.stringify(result.data, null, 2);
      }

      return {
        success: true,
        output: output,
        artifacts: result.screenshot ? [{
          type: 'screenshot',
          path: `screenshot_${Date.now()}.png`,
          content: result.screenshot,
          metadata: { format: 'base64' }
        }] : undefined,
        metadata: {
          action: args.action,
          url: args.url,
          finalUrl: result.data?.url,
          title: result.data?.title
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Browser tool failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        metadata: { action: args.action, url: args.url }
      };
    }
  }
}

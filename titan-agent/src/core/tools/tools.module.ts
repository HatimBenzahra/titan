import { Module, OnModuleInit } from '@nestjs/common';
import { ToolRegistry } from './tool.registry';
import { ShellTool } from './shell.tool';
import { FileReadTool, FileWriteTool, FileListTool } from './file.tools';
import { BrowserTool } from './browser.tool';
import { SandboxModule } from '../sandbox/sandbox.module';

@Module({
  imports: [SandboxModule],
  providers: [
    ToolRegistry,
    ShellTool,
    FileReadTool,
    FileWriteTool,
    FileListTool,
    BrowserTool,
  ],
  exports: [ToolRegistry],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    private toolRegistry: ToolRegistry,
    private shellTool: ShellTool,
    private fileReadTool: FileReadTool,
    private fileWriteTool: FileWriteTool,
    private fileListTool: FileListTool,
    private browserTool: BrowserTool,
  ) {}

  onModuleInit() {
    // Register all tools on module initialization
    this.toolRegistry.register(this.shellTool);
    this.toolRegistry.register(this.fileReadTool);
    this.toolRegistry.register(this.fileWriteTool);
    this.toolRegistry.register(this.fileListTool);
    this.toolRegistry.register(this.browserTool);
  }
}

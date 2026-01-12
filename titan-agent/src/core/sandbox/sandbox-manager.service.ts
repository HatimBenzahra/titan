import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import {
  Sandbox,
  SandboxConfig,
  ShellResult,
  FileResult,
  BrowserResult,
} from './sandbox.interface';

const execAsync = promisify(exec);

@Injectable()
export class SandboxManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(SandboxManagerService.name);
  private sandboxes: Map<string, Sandbox> = new Map();
  private readonly imageName = 'titan-agent-sandbox';

  constructor(private configService: ConfigService) {}

  async onModuleDestroy() {
    this.logger.log('Cleaning up sandboxes...');
    const sandboxIds = Array.from(this.sandboxes.keys());
    await Promise.all(sandboxIds.map((id) => this.destroy(id)));
  }

  /**
   * Build the sandbox Docker image
   */
  async buildImage(): Promise<void> {
    this.logger.log('Building sandbox Docker image...');
    const dockerfilePath = path.join(
      process.cwd(),
      'docker',
      'Dockerfile.sandbox',
    );
    const contextPath = path.join(process.cwd(), 'docker');

    try {
      const { stdout, stderr } = await execAsync(
        `docker build -f "${dockerfilePath}" -t ${this.imageName} "${contextPath}"`,
        { maxBuffer: 10 * 1024 * 1024 },
      );

      this.logger.log('Sandbox image built successfully');
      if (stdout) this.logger.debug(stdout);
      if (stderr) this.logger.debug(stderr);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to build sandbox image: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create a new sandbox container
   */
  async create(
    sandboxId: string,
    config: SandboxConfig = {},
  ): Promise<Sandbox> {
    this.logger.log(`Creating sandbox: ${sandboxId}`);

    const cpuLimit = config.cpuLimit || '2.0';
    const memoryLimit = config.memoryLimit || '2g';
    const timeout = config.timeout || 3600000; // 1 hour default

    try {
      // Check if image exists, build if not
      try {
        await execAsync(`docker image inspect ${this.imageName}`);
      } catch {
        this.logger.log('Sandbox image not found, building...');
        await this.buildImage();
      }

      // Check if container already exists (from previous failed attempt)
      const containerName = `sandbox-${sandboxId}`;
      try {
        const { stdout: existingContainer } = await execAsync(
          `docker ps -a --filter "name=${containerName}" --format "{{.ID}}"`
        );
        if (existingContainer.trim()) {
          this.logger.log(`Removing existing container: ${containerName}`);
          await execAsync(`docker rm -f ${existingContainer.trim()}`);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
        this.logger.debug(`Container cleanup check: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }

      // Create container
      const createCommand = `docker run -d \
        --name ${containerName} \
        --cpus="${cpuLimit}" \
        --memory="${memoryLimit}" \
        --network bridge \
        --cap-drop=ALL \
        --security-opt=no-new-privileges \
        --tmpfs /tmp:rw,noexec,nosuid,size=1g \
        --tmpfs /work:rw,exec,nosuid,size=2g,uid=1000,gid=1000,mode=1777 \
        -p 0:3001 \
        -p 0:3002 \
        -p 0:3003 \
        ${this.imageName}`;

      const { stdout: containerId } = await execAsync(createCommand);
      const cleanContainerId = containerId.trim();

      this.logger.log(`Container created: ${cleanContainerId}`);

      // Get mapped ports
      const { stdout: portsOutput } = await execAsync(
        `docker port ${cleanContainerId}`,
      );

      const shellPort = this.extractPort(portsOutput, '3001');
      const browserPort = this.extractPort(portsOutput, '3002');
      const filePort = this.extractPort(portsOutput, '3003');

      if (!shellPort || !browserPort || !filePort) {
        throw new Error('Failed to get mapped ports');
      }

      // Wait for services to be ready
      await this.waitForServices(shellPort, browserPort, filePort);

      const sandbox: Sandbox = {
        id: sandboxId,
        containerId: cleanContainerId,
        status: 'running',
        createdAt: new Date(),
        ports: {
          shell: shellPort,
          browser: browserPort,
          file: filePort,
        },
      };

      this.sandboxes.set(sandboxId, sandbox);

      // Set timeout for automatic cleanup
      setTimeout(() => {
        this.destroy(sandboxId).catch((err) =>
          this.logger.error(`Failed to auto-destroy sandbox: ${err.message}`),
        );
      }, timeout);

      this.logger.log(
        `Sandbox ready: ${sandboxId} (shell:${shellPort}, browser:${browserPort}, file:${filePort})`,
      );

      return sandbox;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create sandbox: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Extract port mapping from docker port output
   */
  private extractPort(output: string, containerPort: string): number | null {
    const regex = new RegExp(`${containerPort}/tcp.*:(\\d+)`, 'i');
    const match = output.match(regex);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Wait for sandbox services to be ready
   */
  private async waitForServices(
    shellPort: number,
    browserPort: number,
    filePort: number,
    maxRetries = 30,
  ): Promise<void> {
    this.logger.debug('Waiting for sandbox services to be ready...');

    for (let i = 0; i < maxRetries; i++) {
      try {
        await execAsync(`curl -s http://localhost:${shellPort}/health`);
        await execAsync(`curl -s http://localhost:${browserPort}/health`);
        await execAsync(`curl -s http://localhost:${filePort}/health`);
        this.logger.debug('Sandbox services are ready');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Sandbox services failed to start in time');
  }

  /**
   * Get sandbox by ID
   */
  get(sandboxId: string): Sandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Execute shell command in sandbox
   */
  async executeShell(
    sandboxId: string,
    command: string,
    options: { timeout?: number; cwd?: string } = {},
  ): Promise<ShellResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const url = `http://localhost:${sandbox.ports.shell}/execute`;
    const timeout = options.timeout || 30000;
    const cwd = options.cwd || '/work';

    try {
      const payload = JSON.stringify({ command, timeout, cwd });
      const { stdout } = await execAsync(
        `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`,
        { timeout: timeout + 5000 },
      );

      return JSON.parse(stdout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Shell execution failed: ${errorMessage}`);
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: errorMessage,
        error: errorMessage,
      };
    }
  }

  /**
   * Read file from sandbox
   */
  async readFile(sandboxId: string, filePath: string): Promise<FileResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const url = `http://localhost:${sandbox.ports.file}/read?path=${encodeURIComponent(filePath)}`;

    try {
      const { stdout } = await execAsync(`curl -s "${url}"`);
      return JSON.parse(stdout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`File read failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Write file to sandbox
   */
  async writeFile(
    sandboxId: string,
    filePath: string,
    content: string,
  ): Promise<FileResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const url = `http://localhost:${sandbox.ports.file}/write`;

    try {
      const payload = JSON.stringify({ path: filePath, content });
      const { stdout } = await execAsync(
        `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`,
      );
      return JSON.parse(stdout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`File write failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List directory in sandbox
   */
  async listDirectory(
    sandboxId: string,
    dirPath: string = '.',
  ): Promise<FileResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const url = `http://localhost:${sandbox.ports.file}/list?path=${encodeURIComponent(dirPath)}`;

    try {
      const { stdout } = await execAsync(`curl -s "${url}"`);
      return JSON.parse(stdout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Directory list failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute browser action in sandbox
   */
  async executeBrowser(
    sandboxId: string,
    action: string,
    options: {
      url: string;
      selector?: string;
      instructions?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<BrowserResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    const url = `http://localhost:${sandbox.ports.browser}/execute`;

    try {
      const payload = JSON.stringify({ action, ...options });
      const { stdout } = await execAsync(
        `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`,
        { timeout: (options.timeout || 15000) + 5000, maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Browser action failed'
        };
      }

      return {
        success: true,
        data: result,
        screenshot: result.screenshot
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Browser execution failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Destroy sandbox and clean up container
   */
  async destroy(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      this.logger.warn(`Sandbox not found for cleanup: ${sandboxId}`);
      return;
    }

    this.logger.log(`Destroying sandbox: ${sandboxId}`);

    try {
      // Stop and remove container
      await execAsync(`docker stop ${sandbox.containerId}`, {
        timeout: 10000,
      });
      await execAsync(`docker rm ${sandbox.containerId}`, { timeout: 10000 });

      this.sandboxes.delete(sandboxId);
      this.logger.log(`Sandbox destroyed: ${sandboxId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to destroy sandbox: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get all active sandboxes
   */
  getAll(): Sandbox[] {
    return Array.from(this.sandboxes.values());
  }
}

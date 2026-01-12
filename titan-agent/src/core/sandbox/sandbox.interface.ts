/**
 * Sandbox instance interface
 */
export interface Sandbox {
  id: string;
  containerId: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  createdAt: Date;
  ports: {
    shell: number;
    file: number;
    browser: number;
  };
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  cpuLimit?: string; // e.g., "2.0"
  memoryLimit?: string; // e.g., "2g"
  diskLimit?: string; // e.g., "10g"
  timeout?: number; // milliseconds
  workDir?: string;
}

/**
 * Shell execution result
 */
export interface ShellResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * File operation result
 */
export interface FileResult {
  success: boolean;
  content?: string;
  size?: number;
  path?: string;
  files?: Array<{
    name: string;
    type: 'file' | 'directory';
    size: number;
    modified: Date;
  }>;
  error?: string;
}

/**
 * Browser operation result
 */
export interface BrowserResult {
  success: boolean;
  data?: any;
  screenshot?: string; // base64 encoded
  error?: string;
}

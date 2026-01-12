const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Dangerous command patterns to block
const COMMAND_BLOCKLIST = [
  /sudo\s/,
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+\*/,
  /:\(\)\{\s*:\|:&\s*\};:/,  // Fork bomb
  /mkfs/,
  /dd\s+if=/,
  /shutdown/,
  /reboot/,
  /halt/,
  /poweroff/,
  /init\s+[0-6]/,
  />(\/dev\/sda|\/dev\/hda)/,
  /mv\s+.*\/dev\/(null|zero|random)/,
  /chmod\s+-R\s+777\s+\//,
  /chown\s+-R/,
  /wget.*\|\s*sh/,
  /curl.*\|\s*sh/,
  /nc\s+-l/,  // Netcat listener
  /nohup.*&/,  // Background process that persists
];

// Check if command is blocked
function isCommandBlocked(command) {
  return COMMAND_BLOCKLIST.some(pattern => pattern.test(command));
}

// Execute shell command
app.post('/execute', async (req, res) => {
  try {
    const { command, timeout = 30000, cwd = '/work' } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Command is required and must be a string'
      });
    }

    // Security check: block dangerous commands
    if (isCommandBlocked(command)) {
      console.log(`[BLOCKED] Dangerous command: ${command}`);
      return res.status(403).json({
        success: false,
        error: 'Command blocked for security reasons',
        exitCode: 1,
        stdout: '',
        stderr: 'This command is not allowed'
      });
    }

    console.log(`[EXEC] Running: ${command}`);
    console.log(`[EXEC] Working directory: ${cwd}`);
    console.log(`[EXEC] Timeout: ${timeout}ms`);

    // Execute command with timeout
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB max output
      shell: '/bin/bash',
      env: {
        ...process.env,
        HOME: '/home/agent',
        USER: 'agent',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    });

    // Truncate output if too large
    const maxOutputLength = 10000;
    const truncatedStdout = stdout.length > maxOutputLength
      ? stdout.substring(0, maxOutputLength) + '\n... (output truncated)'
      : stdout;
    const truncatedStderr = stderr.length > maxOutputLength
      ? stderr.substring(0, maxOutputLength) + '\n... (output truncated)'
      : stderr;

    console.log(`[EXEC] Success`);
    res.json({
      success: true,
      exitCode: 0,
      stdout: truncatedStdout,
      stderr: truncatedStderr
    });

  } catch (error) {
    console.error(`[EXEC] Error: ${error.message}`);

    // Handle timeout
    if (error.killed) {
      return res.status(408).json({
        success: false,
        error: 'Command execution timed out',
        exitCode: -1,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      });
    }

    // Handle command failure (non-zero exit code)
    res.json({
      success: false,
      exitCode: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'shell-server' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐚 Shell server listening on port ${PORT}`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Execute: POST http://0.0.0.0:${PORT}/execute`);
});

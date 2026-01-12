Titan Agent Backend – Complete Technical Roadmap
> Building an autonomous AI agent platform similar to Manus AI, with full backend infrastructure for planning, execution, and self-correction in secure sandboxes.
***Table of Contents
Overview
High-Level Architecture
Agent Core Loop & Planning
Tooling Layer Design
Sandbox & Infrastructure
Memory, State & Self-Correction
Implementation Roadmap (Phases)
Tech Stack Recommendations
Getting Started
***Overview
Goal: Build a backend that powers an autonomous AI agent capable of:
Understanding complex, multi-step objectives
Planning structured task workflows
Executing actions via tools (terminal, browser, file system, APIs)
Self-correcting based on feedback and outcomes
Operating securely within isolated sandboxes
Target Use Cases:
Code generation & testing
Web automation & scraping
Data processing & analysis
Report generation
System administration tasks
Research & information gathering
***High-Level Architecture
The system consists of four main layers:
Layer 1: Gateway API
Purpose: Accept user requests, manage sessions, expose task status
Technology: NestJS or Fastify with TypeScript
Endpoints:
POST /tasks – Create new task
GET /tasks/:id – Get task status and history
DELETE /tasks/:id – Cancel running task
WS /tasks/:id/stream – WebSocket for real-time events
Auth: API keys (Phase 1) → JWT/OAuth (Phase 2+)
Layer 2: Agent Orchestrator
Purpose: Implement the core agent decision loop
Responsibilities:
Interpret user goals
Generate execution plans
Manage tool calls and results
Implement self-correction loops
Track task progress and events
Layer 3: Tool Layer
Purpose: Provide standardized interfaces to capabilities
Tools:
ShellTool (terminal commands)
BrowserTool (web interaction)
FileTools (read/write/list operations)
HttpTool (API calls)
SqlTool (database queries)
VectorSearchTool (embeddings-based search)
Layer 4: Sandbox Runtime
Purpose: Isolate agent execution from host system
Technology: Docker containers per task
Features:
Non-root user execution
Resource limits (CPU, memory, disk)
Network policies and egress proxying
Ephemeral filesystems
Automatic cleanup on task completion
***Agent Core Loop & Planning
2.1 Task Representation
Every task is modeled as:
interface Task {
  id: string;                    // UUID
  userId: string;                // User who created it
  goal: string;                  // Natural language goal
  status: TaskStatus;            // queued | running | succeeded | failed | cancelled
  context?: Record<string, any>; // Initial context/constraints
  plan?: Step[];                 // Generated plan steps
  events: TaskEvent[];           // Execution history
  artifacts?: Artifact[];        // Generated outputs
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}
interface Step {
  id: string;
  description: string;
  tool: string;                  // e.g., "shell", "browser", "file"
  arguments: Record<string, any>;
  expectedOutput?: string;
  successCriteria?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}
interface TaskEvent {
  timestamp: Date;
  type: 'plan_generated' | 'step_started' | 'step_completed' | 'correction_applied' | 'error' | 'complete';
  data: Record<string, any>;
}
interface Artifact {
  id: string;
  type: 'file' | 'url' | 'text' | 'data';
  path?: string;
  url?: string;
  content?: string;
}
Storage: PostgreSQL with JSON columns for plan/events, or MongoDB for flexibility.
2.2 Planning Strategy (ReAct Pattern)
The agent uses a Reasoning + Acting loop:
Step 1: Interpret Goal
Input: goal (string), context (object)
LLM Prompt: "Given this goal and context, define:
  - Required skills/tools
  - Success criteria
  - Constraints
  - Risk factors"
Output: task_spec (JSON)
Step 2: Generate Plan
Input: task_spec, available_tools, history
LLM Prompt: "Create a step-by-step plan as a JSON array:
  [{
    "description": "...",
    "tool": "shell|browser|file|http",
    "arguments": {...},
    "successCriteria": "..."
  }, ...]"
Output: plan (Step[])
Step 3: Execute Step
1. Pick next pending step
2. Call appropriate tool with arguments
3. Log output and any errors
4. Mark step as completed or failed
5. Store result in step.result
Step 4: Observe & Reflect
After each step or upon error:
LLM Prompt: "Given:
  - Original goal
  - Plan
  - Execution history
  - Last observation
  
Should we:
  A) Continue to next step?
  B) Revise the plan?
  C) Try a different tool?
  D) Declare success or failure?"
Output: decision + updated_plan (if needed)
Step 5: Self-Correction
Optional critic model:
LLM Prompt: "Review the execution history. 
  - Are we on track?
  - Are there any mistakes?
  - Should we correct course?"
Output: correction_instruction (or "continue")
Step 6: Stop Conditions
Success criteria met → mark task as succeeded
Max steps exceeded → fail with "timeout"
Unrecoverable error → fail with error message
User cancellation → mark as cancelled
2.3 Implementation Architecture
Orchestrator Service
├── TaskManager (CRUD operations)
├── PlannerAgent (generates plans using LLM)
├── ExecutorAgent (decides which tool to call)
├── CriticAgent (checks if we're on track)
├── ToolDispatcher (routes tool calls)
├── StateManager (maintains context and history)
└── EventEmitter (publishes events for UI/webhooks)
***Tooling Layer Design
3.1 Tool Interface & Registry
Define a generic tool interface:
interface ToolContext {
  sandboxId: string;          // Unique sandbox for this task
  userId: string;
  taskId: string;
  timeout?: number;           // milliseconds
  cwd?: string;               // working directory
  env?: Record<string, string>;
}
interface ToolResult {
  success: boolean;
  output: string;             // stdout/result
  artifacts?: string[];       // paths to generated files
  error?: string;
  metadata?: Record<string, any>;
}
interface Tool {
  name: string;
  description: string;
  schema: JSONSchema;         // For LLM to understand arguments
  run(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  getSchema(): Record<string, any> {
    // For LLM prompt context
    return Object.fromEntries(
      this.getAll().map(t => [t.name, { description: t.description, schema: t.schema }])
    );
  }
}
3.2 Shell Tool (Terminal Access)
Executes shell commands in a sandboxed container.
Implementation:
class ShellTool implements Tool {
  name = 'shell';
  description = 'Execute shell commands in the sandbox';
  schema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute (e.g., "npm test", "ls -la")'
      },
      workdir: {
        type: 'string',
        description: 'Working directory (optional)'
      }
    },
    required: ['command']
  };
  constructor(private sandboxService: SandboxService) {}
  async run(args: { command: string; workdir?: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      // Call sandbox service
      const result = await this.sandboxService.executeShell({
        sandboxId: ctx.sandboxId,
        command: args.command,
        cwd: args.workdir || ctx.cwd,
        timeout: ctx.timeout || 30000
      });
      return {
        success: result.exitCode === 0,
        output: result.stdout + result.stderr,
        error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err.message
      };
    }
  }
}
Safety Guardrails:
Blocklist dangerous commands: sudo, rm -rf /, shutdown, etc.
Timeout: 30 seconds per command (configurable)
Output truncation: Max 10,000 chars logged
User isolation: Run as unprivileged user in container
Resource limits: Enforced at container level
3.3 Browser Tool (Web Interaction)
Enables web browsing, scraping, and screenshot capabilities.
Implementation:
class BrowserTool implements Tool {
  name = 'browser';
  description = 'Open URLs, extract content, take screenshots';
  schema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open', 'read', 'screenshot', 'extract_table'],
        description: 'Action to perform'
      },
      url: {
        type: 'string',
        description: 'URL to open'
      },
      selector: {
        type: 'string',
        description: 'CSS selector for extraction'
      },
      instructions: {
        type: 'string',
        description: 'Natural language instructions (e.g., "click submit button")'
      }
    },
    required: ['action', 'url']
  };
  constructor(private browserService: BrowserService) {}
  async run(args: any, ctx: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.browserService.execute({
        sandboxId: ctx.sandboxId,
        action: args.action,
        url: args.url,
        selector: args.selector,
        instructions: args.instructions,
        timeout: ctx.timeout || 15000
      });
      return {
        success: true,
        output: result.content || result.screenshot,
        artifacts: result.artifacts
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err.message
      };
    }
  }
}
Technical Stack:
Headless Playwright or Puppeteer for browser automation
Isolated browser context per task
Screenshot capability for visual debugging
DOM extraction and text parsing
Network interception to prevent data exfiltration
3.4 File Tools (Read/Write/List)
Manage project files within the sandbox filesystem.
class FileReadTool implements Tool {
  name = 'file_read';
  description = 'Read contents of a file';
  schema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to file' }
    },
    required: ['path']
  };
  async run(args: { path: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const content = await this.sandboxService.readFile({
        sandboxId: ctx.sandboxId,
        path: args.path
      });
      return { success: true, output: content };
    } catch (err) {
      return { success: false, output: '', error: err.message };
    }
  }
}
class FileWriteTool implements Tool {
  name = 'file_write';
  description = 'Write or create a file';
  schema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['path', 'content']
  };
  async run(args: { path: string; content: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      await this.sandboxService.writeFile({
        sandboxId: ctx.sandboxId,
        path: args.path,
        content: args.content
      });
      return { success: true, output: `File written: ${args.path}` };
    } catch (err) {
      return { success: false, output: '', error: err.message };
    }
  }
}
class FileListTool implements Tool {
  name = 'file_list';
  description = 'List directory contents';
  schema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (default: .)' }
    }
  };
  async run(args: { path?: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const files = await this.sandboxService.listDirectory({
        sandboxId: ctx.sandboxId,
        path: args.path || '.'
      });
      return { success: true, output: JSON.stringify(files, null, 2) };
    } catch (err) {
      return { success: false, output: '', error: err.message };
    }
  }
}
Security:
Path validation (prevent ../../../etc/passwd)
File size limits (max 5MB per file)
Blacklist sensitive files (.env, SSH keys, etc.)
Audit all reads/writes in task logs
3.5 HTTP Tool (API Calls)
Call external APIs and webhooks.
class HttpTool implements Tool {
  name = 'http';
  description = 'Make HTTP requests to external APIs';
  schema = {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      url: { type: 'string' },
      headers: { type: 'object' },
      body: { type: 'string' },
      timeout: { type: 'number' }
    },
    required: ['method', 'url']
  };
  async run(args: any, ctx: ToolContext): Promise<ToolResult> {
    try {
      // URL whitelist/blacklist check
      if (!this.isAllowedUrl(args.url)) {
        throw new Error('URL not allowed');
      }
      const response = await fetch(args.url, {
        method: args.method || 'GET',
        headers: args.headers,
        body: args.body,
        timeout: args.timeout || 10000
      });
      const content = await response.text();
      return {
        success: response.ok,
        output: content,
        metadata: { status: response.status }
      };
    } catch (err) {
      return { success: false, output: '', error: err.message };
    }
  }
  private isAllowedUrl(url: string): boolean {
    // Implement URL allowlist/blocklist logic
    // Block: localhost, 127.0.0.1, private IP ranges, etc.
    return true;
  }
}
3.6 Optional: SQL Tool
Query databases for data retrieval.
class SqlTool implements Tool {
  name = 'sql';
  description = 'Execute read-only SQL queries';
  schema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL SELECT query' },
      database: { type: 'string', description: 'Database name or connection string' }
    },
    required: ['query']
  };
  async run(args: { query: string; database?: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      // Only allow SELECT queries
      if (!/^\s*SELECT\s+/i.test(args.query)) {
        throw new Error('Only SELECT queries allowed');
      }
      const result = await this.executeQuery(args.query, args.database);
      return { success: true, output: JSON.stringify(result, null, 2) };
    } catch (err) {
      return { success: false, output: '', error: err.message };
    }
  }
  private async executeQuery(query: string, dbName?: string): Promise<any> {
    // Implementation depends on your DB setup
    return [];
  }
}
***Sandbox & Infrastructure
4.1 Sandbox Architecture
Each task runs inside an isolated Docker container with controlled access:
┌─────────────────────────────────────────────────────────┐
│ Titan Agent Sandbox Container                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ Shell Server (Port 3001)                          ││
│  │ - Execute commands                                ││
│  │ - Capture stdout/stderr                           ││
│  │ - Resource limits enforced                        ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ Browser Server (Port 3002)                        ││
│  │ - Headless Chrome/Playwright                      ││
│  │ - Screenshot capability                           ││
│  │ - DOM extraction                                  ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ File Server (Port 3003)                           ││
│  │ - Read/write ephemeral volume                      ││
│  │ - Path validation                                 ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ Ephemeral Filesystem (/work)                      ││
│  │ - /work/project (mounted)                         ││
│  │ - /work/artifacts (scratch)                       ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
         ↕ HTTP API (Port 8000 on host)
Titan Agent Backend
4.2 Sandbox Lifecycle
interface SandboxManager {
  // Create a new isolated environment
  async create(config: SandboxConfig): Promise<Sandbox>;
  
  // Get existing sandbox
  async get(sandboxId: string): Promise<Sandbox>;
  
  // Execute command/action in sandbox
  async execute(sandboxId: string, action: string, payload: any): Promise<any>;
  
  // Clean up and destroy
  async destroy(sandboxId: string): Promise<void>;
}
interface Sandbox {
  id: string;
  userId: string;
  taskId: string;
  containerId: string;
  status: 'running' | 'paused' | 'terminated';
  createdAt: Date;
  expiresAt: Date;  // Auto-cleanup after timeout
  config: SandboxConfig;
}
interface SandboxConfig {
  cpuLimit: number;        // e.g., 2 (2 CPU cores)
  memoryLimit: string;     // e.g., "2Gi" (2 GB)
  diskLimit: string;       // e.g., "10Gi"
  timeout: number;         // milliseconds, e.g., 3600000 (1 hour)
  networkPolicy: 'isolated' | 'proxy_only' | 'restricted';
  tools: string[];         // e.g., ['shell', 'browser', 'file']
}
Implementation Approaches:
Option A: Docker Containers
# Dockerfile for sandbox image
FROM ubuntu:22.04
# Install core tools
RUN apt-get update && apt-get install -y \
    curl wget git build-essential \
    node.js python3 pip \
    chromium-browser \
    && rm -rf /var/lib/apt/lists/*
# Create non-root user
RUN useradd -m -s /bin/bash agent
# Copy tool servers
COPY --chown=agent:agent ./servers /app/servers
# Expose ports
EXPOSE 3001 3002 3003
# Run as non-root
USER agent
WORKDIR /work
CMD ["node", "/app/servers/start.js"]
Then manage via Docker API or Docker Compose.
Option B: Kubernetes Pods
apiVersion: v1
kind: Pod
metadata:
  name: agent-sandbox-{{ taskId }}
  namespace: agent-sandboxes
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
  containers:
  - name: sandbox
    image: titan-agent-sandbox:latest
    resources:
      limits:
        cpu: 2000m
        memory: 2Gi
      requests:
        cpu: 1000m
        memory: 1Gi
    ports:
    - containerPort: 3001
    - containerPort: 3002
    - containerPort: 3003
    volumeMounts:
    - name: workspace
      mountPath: /work
  volumes:
  - name: workspace
    emptyDir: {}
  ttlSecondsAfterFinished: 300  # Auto-delete after 5 minutes
4.3 Sandbox Services
Shell Server (runs inside sandbox):
// /app/servers/shell-server.js
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const app = express();
app.use(express.json());
const COMMAND_BLOCKLIST = ['sudo', 'rm -rf', 'shutdown', 'reboot'];
app.post('/execute', async (req, res) => {
  const { command, timeout = 30000 } = req.body;
  // Check blocklist
  if (COMMAND_BLOCKLIST.some(blocked => command.includes(blocked))) {
    return res.status(403).json({ error: 'Command not allowed' });
  }
  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    res.json({ exitCode: 0, stdout, stderr });
  } catch (err) {
    res.status(200).json({
      exitCode: err.code || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message
    });
  }
});
app.listen(3001, () => console.log('Shell server listening on 3001'));
File Server (runs inside sandbox):
// /app/servers/file-server.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
const app = express();
app.use(express.json());
const WORKSPACE = '/work';
const BLOCKED_PATHS = ['.env', '.ssh', '.credentials'];
function validatePath(filePath) {
  const resolved = path.resolve(WORKSPACE, filePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error('Path traversal detected');
  }
  if (BLOCKED_PATHS.some(blocked => resolved.includes(blocked))) {
    throw new Error('Access to sensitive files denied');
  }
  return resolved;
}
app.get('/read', async (req, res) => {
  try {
    const filePath = validatePath(req.query.path);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post('/write', async (req, res) => {
  try {
    const filePath = validatePath(req.body.path);
    await fs.writeFile(filePath, req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get('/list', async (req, res) => {
  try {
    const dirPath = validatePath(req.query.path || '.');
    const files = await fs.readdir(dirPath);
    res.json({ files });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.listen(3003, () => console.log('File server listening on 3003'));
4.4 Task Orchestration & Queuing
Use a job queue to avoid blocking the API:
import BullMQ from 'bullmq';
import Redis from 'redis';
const redis = new Redis();
const taskQueue = new BullMQ.Queue('agent-tasks', { connection: redis });
// Worker process
const worker = new BullMQ.Worker('agent-tasks', async (job) => {
  const { taskId, goal, context } = job.data;
  try {
    // Create sandbox
    const sandbox = await sandboxManager.create({
      taskId,
      cpuLimit: 2,
      memoryLimit: '2Gi',
      timeout: 3600000
    });
    // Run agent
    const orchestrator = new AgentOrchestrator(taskId, sandbox);
    const result = await orchestrator.run(goal, context);
    // Clean up
    await sandboxManager.destroy(sandbox.id);
    return result;
  } catch (err) {
    await taskRepository.updateStatus(taskId, 'failed', err.message);
    throw err;
  }
}, { connection: redis });
// API endpoint
app.post('/tasks', async (req, res) => {
  const { goal, context } = req.body;
  const task = await taskRepository.create({
    userId: req.user.id,
    goal,
    context,
    status: 'queued'
  });
  await taskQueue.add('process-task', {
    taskId: task.id,
    goal,
    context
  });
  res.json({ taskId: task.id });
});
***Memory, State & Self-Correction
5.1 Short-Term Context Management
During task execution, maintain a "working memory" of what's happened:
interface TaskMemory {
  goal: string;
  plan: Step[];
  executionHistory: ToolCall[];
  currentStep: Step | null;
  context: Record<string, any>;
  errors: string[];
  successMetrics: Record<string, any>;
}
interface ToolCall {
  timestamp: Date;
  tool: string;
  arguments: Record<string, any>;
  result: ToolResult;
  duration: number;
  status: 'success' | 'failure';
}
When the context grows too long (>4000 tokens), implement context summarization:
async summarizeHistory(memory: TaskMemory): Promise<string> {
  const summary = await llm.call({
    model: 'gpt-4',
    messages: [{
      role: 'system',
      content: 'Summarize this task execution history concisely.'
    }, {
      role: 'user',
      content: JSON.stringify(memory.executionHistory.slice(-20), null, 2)
    }]
  });
  return summary;
}
5.2 Long-Term Memory (Optional)
Store successful patterns for reuse:
interface SuccessPattern {
  id: string;
  userId: string;
  goalPattern: string;              // e.g., "Write and test Node.js service"
  solutionPlan: Step[];
  successRate: number;
  tags: string[];
}
async searchSuccessPatterns(goal: string, embeddings): Promise<SuccessPattern[]> {
  const goalEmbedding = await embeddings.embed(goal);
  const similar = await vectorStore.search(goalEmbedding, { limit: 3 });
  return similar.map(item => item.data);
}
Use embeddings (e.g., OpenAI text-embedding-3-small) to index past solutions.
5.3 Self-Correction Loop
Implement a "Critic Agent" that validates execution:
class CriticAgent {
  async evaluate(
    goal: string,
    plan: Step[],
    history: ToolCall[],
    currentStep: Step
  ): Promise<{
    isOnTrack: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const prompt = `
Goal: ${goal}
Plan: ${JSON.stringify(plan.map(s => s.description))}
History: ${JSON.stringify(history.slice(-5))}
Current Step: ${JSON.stringify(currentStep)}
Are we on track? Identify issues and suggest corrections.
    `;
    const response = await llm.call({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });
    return parseResponse(response);
  }
  async generateCorrection(issue: string, plan: Step[]): Promise<Step[]> {
    const prompt = `
Issue: ${issue}
Current Plan: ${JSON.stringify(plan)}
Suggest a revised plan to address this issue.
    `;
    const response = await llm.call({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });
    return parseSteps(response);
  }
}
Usage in orchestrator:
// After each step or error
const evaluation = await critic.evaluate(goal, plan, history, currentStep);
if (!evaluation.isOnTrack) {
  logger.warn(`Issue detected: ${evaluation.issues[0]}`);
  const newPlan = await critic.generateCorrection(evaluation.issues[0], plan);
  plan = newPlan;
  await emitEvent({
    type: 'correction_applied',
    data: { originalPlan: plan, newPlan, reason: evaluation.issues[0] }
  });
}
***Implementation Roadmap (Phases)
Phase 1: MVP – Single-Agent Shell & File Tools (Weeks 1-3)
Goals:
Proof of concept for a single agent
Shell tool working reliably
File operations for code editing
Basic planning
Deliverables:
Core API
POST /tasks → accepts goal, returns taskId
GET /tasks/:id → returns status and events
Basic auth (API key header)
Agent Orchestrator
Basic planner (hardcoded steps + LLM refinement)
Simple executor (tool dispatcher)
Memory management (in-process)
Tools
ShellTool (with blocklist)
FileReadTool, FileWriteTool, FileListTool
Sandbox
Docker container per task
Shell and file servers
Basic resource limits
Storage
PostgreSQL for tasks, events, artifacts
No persistence between runs
Success Metrics:
Agent can write a simple Python script and run tests
Agent can fix test failures (2-3 iterations)
No security breaches in sandbox isolation
Phase 2: Browser & Advanced Planning (Weeks 4-6)
Goals:
Add browser automation
Implement explicit planning with JSON output
Introduce critic/self-correction
WebSocket streaming
Deliverables:
BrowserTool
Open URLs, extract content
Basic screenshot
Click/form interactions (optional)
Advanced Planning
Planner model that outputs structured JSON
5+ step plans with dependencies
Success criteria evaluation
Critic Agent
Validate execution after each step
Suggest corrections automatically
Track confidence levels
Event Streaming
WebSocket endpoint for real-time updates
Emit events: step_started, step_completed, correction_applied, etc.
Logging & Observability
Structured logs (JSON)
Trace IDs for debugging
Optional: send to Datadog/NewRelic
Success Metrics:
Agent can scrape a website and extract data
Agent can fill out a form and submit
Plan adaptability: agent recovers from 1-2 tool failures
WebSocket clients receive real-time updates
Phase 3: Production Readiness (Weeks 7-9)
Goals:
Multi-user support
Org-level configurations
Advanced monitoring and billing
Performance optimization
Deliverables:
Multi-Tenancy
User isolation
Rate limiting per user
Org-level settings (e.g., tool allowlists)
Monitoring & Tracing
Prometheus metrics (task duration, success rate, tool usage)
OpenTelemetry traces
Cost tracking (LLM tokens, compute)
Guardrails & Safety
Command filtering (refined blocklist)
Prompt injection detection
Data masking for sensitive outputs
Performance
Task caching (skip re-planning if similar goal exists)
Async tool calls (parallel tools when possible)
Sandbox warm-up (pre-created containers)
Documentation
API docs (OpenAPI spec)
Tool custom creation guide
Deployment guide (Docker, K8s)
Success Metrics:
Support 100+ concurrent tasks
P95 task latency < 5 minutes
Zero security incidents in penetration tests
API uptime > 99.5%
Phase 4: Advanced Capabilities (Weeks 10+)
Goals:
Multi-agent coordination
Custom tool marketplace
Fine-tuning on user domain
Vision & audio support
Deliverables:
Multi-Agent System
Researcher agent (web search, data gathering)
Planner agent (strategy, resource allocation)
Executor agent (hands-on execution)
Critic agent (validation)
Custom Tool Framework
Tool SDK (simple interface)
Community tool marketplace
Version management
Domain Fine-Tuning
Allow orgs to fine-tune on private data
Custom prompts per use case
Transfer learning from similar tasks
Multimodal
Vision: image recognition, OCR
Audio: voice commands, transcription
Integration with Claude 3, GPT-4V
***Tech Stack Recommendations
Backend Framework
NestJS (recommended)
Pros: Enterprise-ready, strong typing, built-in DI, modular
Cons: Heavier than minimal frameworks
Alternative: Fastify (lightweight, high-performance)
LLM Integration
OpenAI SDK (GPT-4, GPT-4 Turbo)
Alternative: Anthropic SDK (Claude 3)
Alternative: LangChain (abstracts multiple LLM providers)
Database
PostgreSQL (primary)
JSONB columns for flexible schemas
Strong ACID guarantees
MongoDB (optional alternative)
Better for semi-structured data
Easier horizontal scaling
Queue/Job System
BullMQ (Node.js, uses Redis)
Simple, reliable, actively maintained
Alternative: RabbitMQ (more enterprise, complex setup)
Sandbox/Containerization
Docker (development and production)
Kubernetes (production scaling)
Use namespace-per-user for isolation
TTL for automatic cleanup
Alternative: Podman (Docker-compatible, more secure)
Monitoring & Observability
Prometheus (metrics)
OpenTelemetry (distributed tracing)
ELK Stack (Elasticsearch, Logstash, Kibana) for logs
Or: Datadog / NewRelic (managed options)
Authentication
Phase 1: Simple API key (Authorization: Bearer <key>)
Phase 2: JWT with refresh tokens
Phase 3: OAuth2 / OIDC for multi-tenant SSO
Development Tools
TypeScript (strict mode)
ESLint + Prettier (code quality)
Jest (unit tests)
Docker Compose (local development)
GitHub Actions (CI/CD)
***Getting Started
Prerequisites
Node.js 18+
Docker & Docker Compose
PostgreSQL 14+
Redis 7+
Quick Start (Local Development)
Clone and setup
git clone https://github.com/yourorg/titan-agent.git
cd titan-agent
npm install
Environment variables (.env)
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/titan_dev
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
PORT=3000
Start services (Docker Compose)
docker-compose up -d postgres redis
npm run migrate
npm run dev
Create your first task
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer dev-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Create a Node.js Hello World app and test it",
    "context": {}
  }'
Project Structure
titan-agent/
├── src/
│   ├── core/
│   │   ├── agent/
│   │   │   ├── orchestrator.ts
│   │   │   ├── planner.ts
│   │   │   ├── executor.ts
│   │   │   └── critic.ts
│   │   ├── tools/
│   │   │   ├── tool.interface.ts
│   │   │   ├── shell.tool.ts
│   │   │   ├── browser.tool.ts
│   │   │   └── file.tool.ts
│   │   └── sandbox/
│   │       ├── sandbox-manager.ts
│   │       └── sandbox.service.ts
│   ├── api/
│   │   ├── tasks.controller.ts
│   │   ├── tasks.service.ts
│   │   └── tasks.module.ts
│   ├── models/
│   │   ├── task.model.ts
│   │   ├── step.model.ts
│   │   └── tool-result.model.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── queue/
│   │   ├── cache/
│   │   └── logger/
│   └── main.ts
├── tests/
├── docker/
│   ├── Dockerfile.app
│   └── Dockerfile.sandbox
├── docker-compose.yml
├── .env.example
└── README.md
Next Steps
Implement basic API and database models
Build local sandbox container
Create first tool (shell)
Test end-to-end flow: API → Orchestrator → Tool → Sandbox
Iterate and add more tools
***References & Resources
Manus AI: https://manus.im
LangChain: https://langchain.com
ReAct Pattern: https://arxiv.org/abs/2210.03629
Agentic AI Roadmap: https://www.kdnuggets.com/agentic-ai-a-self-study-roadmap
Docker Best Practices: https://docs.docker.com/develop/dev-best-practices/
OpenTelemetry: https://opentelemetry.io
***Last Updated: January 2026
Maintainers: Titan Agent Team
For questions or contributions, open an issue on GitHub or contact the team.
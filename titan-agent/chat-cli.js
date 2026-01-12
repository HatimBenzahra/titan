#!/usr/bin/env node
/**
 * Interactive Chat CLI for Titan Agent
 *
 * This provides a simple command-line interface to interact with the agent
 * like a chatbot. Just type your tasks and see the agent execute them!
 */

const readline = require('readline');

const API_URL = 'http://localhost:3000';
const API_KEY = 'dev-key-123';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n🤖 You: '
});

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         Titan Agent - Interactive Chat Interface          ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log('💬 Chat with the AI agent! Type your tasks and press Enter.');
console.log('📝 Examples:');
console.log('   - "Create a Python script that prints Hello World"');
console.log('   - "List all files in the current directory"');
console.log('   - "Write a factorial function in JavaScript"');
console.log('');
console.log('Commands:');
console.log('   /exit    - Exit the chat');
console.log('   /clear   - Clear the screen');
console.log('   /tasks   - Show recent tasks');
console.log('');

async function createTask(goal) {
  const response = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ goal })
  });

  return await response.json();
}

async function getTaskStatus(taskId) {
  const response = await fetch(`${API_URL}/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  });

  return await response.json();
}

async function waitForTaskCompletion(taskId, maxWaitTime = 60000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const task = await getTaskStatus(taskId);

    if (task.status === 'succeeded' || task.status === 'failed') {
      return task;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return await getTaskStatus(taskId);
}

async function handleUserInput(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    return;
  }

  // Handle commands
  if (trimmed === '/exit') {
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  }

  if (trimmed === '/clear') {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Titan Agent - Interactive Chat Interface          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    return;
  }

  if (trimmed === '/tasks') {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      const tasks = await response.json();

      console.log('\n📋 Recent Tasks:');
      tasks.slice(0, 5).forEach((task, i) => {
        const statusEmoji = task.status === 'succeeded' ? '✅' :
                           task.status === 'failed' ? '❌' :
                           task.status === 'running' ? '⏳' : '⏸️';
        console.log(`   ${i + 1}. ${statusEmoji} ${task.goal.substring(0, 50)}${task.goal.length > 50 ? '...' : ''}`);
        console.log(`      ID: ${task.id} | Status: ${task.status}`);
      });
    } catch (error) {
      console.log('❌ Error fetching tasks:', error.message);
    }
    return;
  }

  // Create and execute task
  try {
    console.log('\n🤖 Agent: Got it! Let me work on that...\n');

    // Create task
    const createResult = await createTask(trimmed);
    const taskId = createResult.taskId;

    console.log(`   📝 Task created: ${taskId.substring(0, 8)}...`);
    console.log('   ⏳ Waiting for completion...\n');

    // Wait for completion
    const task = await waitForTaskCompletion(taskId);

    // Display results
    if (task.status === 'succeeded') {
      console.log('   ✅ Task completed successfully!\n');

      if (task.plan && task.plan.length > 0) {
        console.log('   📋 What I did:');
        task.plan.forEach((step, i) => {
          const stepStatus = step.status === 'completed' ? '✓' :
                            step.status === 'failed' ? '✗' : '⏸';
          console.log(`      ${stepStatus} ${step.description}`);

          // Show output if available
          if (step.result && step.result.output) {
            const output = step.result.output.trim();
            if (output && output.length < 200) {
              console.log(`        Output: ${output}`);
            } else if (output) {
              console.log(`        Output: ${output.substring(0, 200)}...`);
            }
          }

          // Show error if failed
          if (step.result && step.result.error) {
            console.log(`        ❌ Error: ${step.result.error}`);
          }
        });
      }
    } else if (task.status === 'failed') {
      console.log('   ❌ Task failed\n');

      if (task.plan && task.plan.length > 0) {
        console.log('   📋 Execution steps:');
        task.plan.forEach((step) => {
          const stepStatus = step.status === 'completed' ? '✓' :
                            step.status === 'failed' ? '✗' : '⏸';
          console.log(`      ${stepStatus} ${step.description}`);

          if (step.result && step.result.error) {
            console.log(`        ❌ ${step.result.error}`);
          }
        });
      }
    } else {
      console.log(`   ⏸️  Task status: ${task.status}\n`);
    }

    console.log(`\n   🔍 View details: curl -s ${API_URL}/tasks/${taskId} -H "Authorization: Bearer ${API_KEY}" | jq`);

  } catch (error) {
    console.log(`\n   ❌ Error: ${error.message}`);
  }
}

// Start the chat interface
rl.prompt();

rl.on('line', async (line) => {
  await handleUserInput(line);
  rl.prompt();
}).on('close', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

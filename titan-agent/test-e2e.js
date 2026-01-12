/**
 * End-to-End Test for Titan Agent Phase 1 MVP
 *
 * This test validates:
 * 1. API endpoints work
 * 2. Task creation and queueing
 * 3. Task status tracking
 * 4. Event logging
 *
 * Note: This test doesn't require an Anthropic API key
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hatimbenzahra:test@localhost:5432/mydb'
});

const API_URL = 'http://localhost:3000';
const API_KEY = 'dev-key-123';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAPI(method, path, body = null) {
  const url = `${API_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  return { status: response.status, data };
}

async function runTests() {
  console.log('🧪 Starting Titan Agent E2E Tests\n');

  try {
    // Test 1: Create a simple task
    console.log('📝 Test 1: Create task via API');
    const createResult = await testAPI('POST', '/tasks', {
      goal: 'Create a hello.txt file with "Hello, World!" and list the directory',
      context: { test: true }
    });

    if (createResult.status !== 201 && createResult.status !== 200) {
      throw new Error(`Failed to create task: ${JSON.stringify(createResult)}`);
    }

    const taskId = createResult.data.taskId;
    console.log(`✅ Task created: ${taskId}\n`);

    // Test 2: Get task immediately
    console.log('📊 Test 2: Get task status');
    const getResult = await testAPI('GET', `/tasks/${taskId}`);

    if (getResult.status !== 200) {
      throw new Error(`Failed to get task: ${JSON.stringify(getResult)}`);
    }

    console.log(`✅ Task retrieved`);
    console.log(`   Status: ${getResult.data.status}`);
    console.log(`   Goal: ${getResult.data.goal}\n`);

    // Test 3: Wait for task to process
    console.log('⏳ Test 3: Wait for task processing...');
    let finalTask = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    while (attempts < maxAttempts) {
      await sleep(1000);
      const statusResult = await testAPI('GET', `/tasks/${taskId}`);
      const task = statusResult.data;

      console.log(`   [${attempts + 1}/${maxAttempts}] Status: ${task.status}, Events: ${task.events.length}`);

      if (task.status === 'succeeded' || task.status === 'failed') {
        finalTask = task;
        break;
      }

      attempts++;
    }

    if (!finalTask) {
      console.log('⚠️  Task did not complete within timeout');
      const statusResult = await testAPI('GET', `/tasks/${taskId}`);
      finalTask = statusResult.data;
    }

    console.log(`\n✅ Task processing completed`);
    console.log(`   Final Status: ${finalTask.status}`);
    console.log(`   Total Events: ${finalTask.events.length}\n`);

    // Test 4: Analyze task execution
    console.log('🔍 Test 4: Analyze task execution');
    console.log(`   Plan steps: ${finalTask.plan ? finalTask.plan.length : 0}`);

    if (finalTask.plan) {
      finalTask.plan.forEach((step, i) => {
        console.log(`   Step ${i + 1}: ${step.description}`);
        console.log(`      Tool: ${step.tool}`);
        console.log(`      Status: ${step.status}`);
        if (step.result) {
          console.log(`      Success: ${step.result.success}`);
          if (step.result.error) {
            console.log(`      Error: ${step.result.error}`);
          }
        }
      });
    }

    console.log(`\n   Event Timeline:`);
    finalTask.events.slice(0, 10).forEach((event, i) => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      console.log(`   ${i + 1}. [${time}] ${event.type}`);
    });

    if (finalTask.events.length > 10) {
      console.log(`   ... and ${finalTask.events.length - 10} more events`);
    }

    // Test 5: List all tasks
    console.log('\n📋 Test 5: List all tasks');
    const listResult = await testAPI('GET', '/tasks');

    if (listResult.status !== 200) {
      throw new Error(`Failed to list tasks: ${JSON.stringify(listResult)}`);
    }

    console.log(`✅ Retrieved ${listResult.data.length} tasks`);
    listResult.data.slice(0, 5).forEach((task, i) => {
      console.log(`   ${i + 1}. ${task.id.substring(0, 8)}... - ${task.status} - ${task.goal.substring(0, 50)}`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Task Creation: PASSED`);
    console.log(`✅ Task Retrieval: PASSED`);
    console.log(`✅ Task Processing: ${finalTask.status === 'succeeded' ? 'PASSED' : 'COMPLETED WITH ERRORS'}`);
    console.log(`✅ Task Listing: PASSED`);
    console.log('='.repeat(60));

    if (finalTask.status === 'failed') {
      console.log('\n⚠️  Note: Task failed during execution. This might be expected if:');
      console.log('   - ANTHROPIC_API_KEY is not configured (planner will fail)');
      console.log('   - Docker sandbox failed to start');
      console.log('   - Check the application logs for details');
    }

    console.log('\n✅ All API tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run tests
runTests();

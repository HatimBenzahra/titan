const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://hatimbenzahra:test@localhost:5432/mydb'
});

async function test() {
  try {
    // 1. Check if users table exists, if not create it
    console.log('📋 Checking database schema...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating users table...');
      await pool.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          "passwordHash" VARCHAR(255) NOT NULL,
          "apiKey" VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    // 2. Insert a demo user
    console.log('👤 Creating demo user...');
    await pool.query(`
      INSERT INTO users (id, email, "passwordHash", "apiKey", role, "updatedAt")
      VALUES ('demo-user-id', 'demo@example.com', 'hash', 'dev-key-123', 'user', CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Demo user created with ID: demo-user-id');

    // 3. Test creating a task via direct database query
    console.log('\n📝 Testing task creation via database...');
    const taskId = 'test-' + Date.now();
    const result = await pool.query(
      `INSERT INTO tasks (id, "userId", goal, status, context, events, artifacts, "createdAt", metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb, ARRAY[]::jsonb[], ARRAY[]::jsonb[], $6, $7::jsonb)
       RETURNING *`,
      [
        taskId,
        'demo-user-id',
        'Write a hello world Python script',
        'queued',
        JSON.stringify({}),
        new Date(),
        JSON.stringify({})
      ]
    );
    console.log('✅ Task created:', result.rows[0].id);
    console.log('   Status:', result.rows[0].status);
    console.log('   Goal:', result.rows[0].goal);

    // 4. Test querying the task
    console.log('\n🔍 Testing task retrieval...');
    const getResult = await pool.query(
      `SELECT * FROM tasks WHERE id = $1 AND "userId" = $2`,
      [taskId, 'demo-user-id']
    );
    console.log('✅ Task retrieved:', getResult.rows[0].id);

    // 5. Clean up test task
    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    console.log('\n🧹 Cleanup complete');

    console.log('\n✅ All database tests passed!');
    console.log('\n📡 Now test the API endpoint:');
    console.log('curl -X POST http://localhost:3000/tasks \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Authorization: Bearer dev-key-123" \\');
    console.log('  -d \'{"goal":"Write a hello world Python script"}\'');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

test();

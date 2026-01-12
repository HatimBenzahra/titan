const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://titan:password@localhost:5432/titan_agent'
});

async function test() {
  try {
    // Test connection
    const result1 = await pool.query('SELECT COUNT(*) FROM users');
    console.log('✅ Users count:', result1.rows[0].count);

    // Test insert
    const id = 'test-' + Date.now();
    const result2 = await pool.query(
      `INSERT INTO tasks (id, "userId", goal, status, context, events, artifacts, "createdAt", metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, 'demo-user-id', 'Test goal', 'queued', '{}', '[]', '[]', new Date(), '{}']
    );
    console.log('✅ Task created:', result2.rows[0].id);

    // Clean up
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    console.log('✅ Test passed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

test();

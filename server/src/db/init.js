export async function verifyDatabaseConnection(pool) {
  await pool.query('SELECT 1')
}

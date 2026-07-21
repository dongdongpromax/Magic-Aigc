export { migrateProvidersSchema, seedProvidersIfEmpty } from './seedProviders.js'

export async function verifyDatabaseConnection(pool) {
  await pool.query('SELECT 1')
}

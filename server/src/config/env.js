import 'dotenv/config'

function readNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getServerEnv() {
  return {
    port: readNumber(process.env.PORT, 4398),
    mysqlHost: process.env.MYSQL_HOST || 'mysql',
    mysqlPort: readNumber(process.env.MYSQL_PORT, 3306),
    mysqlDatabase: process.env.MYSQL_DATABASE || 'ai_chat_draw',
    mysqlUser: process.env.MYSQL_USER || 'root',
    mysqlPassword: process.env.MYSQL_PASSWORD || 'root',
    openrouterApiKey:
      process.env.OPENROUTER_API_KEY ||
      'REMOVED_SECRET-e05e6d32624bd1d214a83cc10e6a0c9b4af41b87c49426efc8f6e55f32eee44c',
    openrouterBaseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  }
}

import 'dotenv/config'

/**
 * 读取数值类型的环境变量，非有限数时回退到默认值
 * @param {string|undefined} value 原始环境变量值
 * @param {number} fallback 默认值
 * @returns {number}
 */
function readNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 汇总服务端运行所需的环境变量
 *
 * 安全说明：OPENROUTER_API_KEY 不再提供硬编码默认值，
 * 必须通过 server/.env 或容器环境变量注入；缺失时调用图像生成接口会返回明确错误。
 * @returns {ReturnType<import('mysql2/promise').createPool> extends never ? never : {
 *   port: number;
 *   mysqlHost: string;
 *   mysqlPort: number;
 *   mysqlDatabase: string;
 *   mysqlUser: string;
 *   mysqlPassword: string;
 *   openrouterApiKey: string;
 *   openrouterBaseURL: string;
 * }}
 */
export function getServerEnv() {
  return {
    port: readNumber(process.env.PORT, 4398),
    mysqlHost: process.env.MYSQL_HOST || 'mysql',
    mysqlPort: readNumber(process.env.MYSQL_PORT, 3306),
    mysqlDatabase: process.env.MYSQL_DATABASE || 'ai_chat_draw',
    mysqlUser: process.env.MYSQL_USER || 'root',
    mysqlPassword: process.env.MYSQL_PASSWORD || 'root',
    // 不再硬编码真实 key 作为默认值；缺失时返回空字符串，由 openrouterClient 在调用前显式抛错
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterBaseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  }
}

import mysql from 'mysql2/promise'

export function createPool(config) {
  return mysql.createPool({
    host: config.mysqlHost,
    port: config.mysqlPort,
    database: config.mysqlDatabase,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    waitForConnections: true,
    connectionLimit: 10,
  })
}

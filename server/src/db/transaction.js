/**
 * 数据库事务辅助模块
 *
 * 设计动机：原 saveGeneratedConversation 等多步 DB 操作各自独立执行 pool.query，
 * 任一步失败会留下不一致状态（孤儿 message、message_count 错误、封面丢失）。
 * 本模块集中处理 getConnection / beginTransaction / commit / rollback / release，
 * 让服务层用 runTransaction(pool, async (conn) => {...}) 显式声明事务边界。
 *
 * 兼容性：仓储层方法接收可选 executor 参数，默认为 pool；
 * 服务层在事务内显式传入 conn（PoolConnection），二者鸭子类型兼容（都暴露 .query）。
 */

/**
 * 在单个数据库连接上执行事务
 *
 * 流程：
 *   1. 从连接池获取独占连接
 *   2. 开启事务
 *   3. 执行业务函数（业务函数内的所有 query 都应使用传入的 conn）
 *   4. 业务函数成功 → commit；失败 → rollback
 *   5. 无论成功失败，finally 中释放连接，避免连接泄漏
 *
 * @template T
 * @param {import('mysql2/promise').Pool} pool 连接池
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn 业务函数，接收独占连接
 * @returns {Promise<T>} 业务函数的返回值
 * @throws {Error} 业务函数抛出的原始错误（rollback 后重新抛出）
 */
export async function runTransaction(pool, fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    // 回滚失败不应掩盖原始错误，单独捕获并忽略
    try {
      await conn.rollback()
    } catch {
      /* 忽略回滚错误：连接可能已断开，原始错误更有诊断价值 */
    }
    throw err
  } finally {
    // 始终释放连接，防止连接池耗尽
    conn.release()
  }
}

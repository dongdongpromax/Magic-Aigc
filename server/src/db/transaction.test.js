/**
 * 事务辅助模块测试
 *
 * 覆盖 runTransaction 的三种关键路径：
 *   1. 业务函数成功 → commit 并释放连接
 *   2. 业务函数抛错 → rollback、重新抛出原始错误、释放连接
 *   3. 无论成功失败，finally 始终 release（防连接泄漏）
 */
import { describe, expect, it, vi } from 'vitest'
import { runTransaction } from './transaction.js'

/**
 * 构造 mock 连接池和连接
 * @param {object} overrides 可选覆盖连接方法
 */
function createMockPool(overrides = {}) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(),
    commit: vi.fn().mockResolvedValue(),
    rollback: vi.fn().mockResolvedValue(),
    release: vi.fn(),
    ...overrides,
  }
  const pool = {
    getConnection: vi.fn().mockResolvedValue(conn),
  }
  return { pool, conn }
}

describe('runTransaction', () => {
  it('业务函数成功时 commit 并释放连接', async () => {
    const { pool, conn } = createMockPool()
    const business = vi.fn().mockResolvedValue('result')

    const result = await runTransaction(pool, business)

    expect(result).toBe('result')
    // 顺序：getConnection → beginTransaction → business → commit → release
    expect(pool.getConnection).toHaveBeenCalledTimes(1)
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1)
    expect(business).toHaveBeenCalledWith(conn)
    expect(conn.commit).toHaveBeenCalledTimes(1)
    expect(conn.release).toHaveBeenCalledTimes(1)
    // 成功路径不应 rollback
    expect(conn.rollback).not.toHaveBeenCalled()
  })

  it('业务函数抛错时 rollback 并重新抛出原始错误', async () => {
    const { pool, conn } = createMockPool()
    const error = new Error('business failed')
    const business = vi.fn().mockRejectedValue(error)

    await expect(runTransaction(pool, business)).rejects.toThrow('business failed')

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1)
    expect(conn.rollback).toHaveBeenCalledTimes(1)
    // 抛错后不应 commit
    expect(conn.commit).not.toHaveBeenCalled()
    // finally 仍要释放连接
    expect(conn.release).toHaveBeenCalledTimes(1)
  })

  it('rollback 失败时不掩盖原始错误', async () => {
    const { pool, conn } = createMockPool({
      rollback: vi.fn().mockRejectedValue(new Error('rollback failed')),
    })
    const originalError = new Error('business failed')
    const business = vi.fn().mockRejectedValue(originalError)

    // 应抛出原始错误而非 rollback 错误
    await expect(runTransaction(pool, business)).rejects.toThrow('business failed')
    expect(conn.rollback).toHaveBeenCalledTimes(1)
    expect(conn.release).toHaveBeenCalledTimes(1)
  })

  it('业务函数接收的连接即从池中获取的连接', async () => {
    const { pool, conn } = createMockPool()
    let receivedConn = null
    const business = vi.fn(async (c) => {
      receivedConn = c
      return 'ok'
    })

    await runTransaction(pool, business)

    expect(receivedConn).toBe(conn)
  })
})

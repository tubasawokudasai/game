import { Context, Next } from 'hono';
import { Env } from '../models/env';

/**
 * 校验 Cloudflare D1 数据库实例是否存在
 * 若未绑定或未初始化则直接中断请求并返回 500
 */
export const requireDb = async (
  c: Context<{ Bindings: Env }>,
  next: Next
) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库实例未初始化或未绑定' }, 500);
  }
  await next();
};

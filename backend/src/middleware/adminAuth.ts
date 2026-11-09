import { Context, Next } from 'hono';
import { Env } from '../models/env';
import { verifyAuthToken, JwtAuthPayload } from '../utils/crypto';

export type AdminAuthContext = Context<{
  Bindings: Env;
  Variables: { adminUser: JwtAuthPayload };
}>;

/**
 * 管理员身份鉴权中间件。
 * 抽离为独立文件，供 adminRoutes / adminGrantRoutes 等多个后台路由复用，
 * 避免系统发放模块复制一份鉴权逻辑。
 */
export const adminAuthMiddleware = async (c: AdminAuthContext, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未提供管理员访问凭据，请重新登录' }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return c.json({ error: '无效的访问凭据' }, 401);
  }

  try {
    const payload = await verifyAuthToken(token, c.env.JWT_SECRET);
    if (!payload || payload.role !== 'admin') {
      return c.json({ error: '权限不足：仅限系统管理员访问' }, 403);
    }
    c.set('adminUser', payload);
    await next();
  } catch (err: any) {
    console.error('[AdminAuth] 管理员鉴权异常:', err);
    return c.json({ error: '管理员身份凭据已过期或校验失败，请重新登录' }, 401);
  }
};

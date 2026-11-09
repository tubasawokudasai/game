import { Hono } from 'hono';
import { Env } from '../models/env';
import { verifyAuthToken, JwtAuthPayload } from '../utils/crypto';
import { requireDb } from '../middleware/dbMiddleware';
import { authService, AuthError } from '../services/authService';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.use('*', requireDb);

/**
 * 辅助方法：从请求头解析并校验 JWT Bearer Token
 */
export async function extractAuthPayload(
  c: { req: { header: (name: string) => string | undefined }; env: Env }
): Promise<JwtAuthPayload | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    return await verifyAuthToken(token, c.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 1. 匿名免登录换取 Token
 * POST /api/auth/guest
 */
authRoutes.post('/guest', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const deviceId = (body.deviceId || '').trim();
  if (!deviceId) {
    return c.json({ error: '缺少浏览器设备唯一标识 deviceId' }, 400);
  }

  try {
    const result = await authService.guestLogin(c.env, deviceId);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Auth Guest API] 异常:', err);
    return c.json(
      { error: '免登录初始化失败: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 2. 账号升级 (原地转正)
 * POST /api/auth/register
 */
authRoutes.post('/register', async (c) => {
  const payload = await extractAuthPayload(c);
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  if (!username || username.length < 3) {
    return c.json({ error: '账号名至少需 3 个字符' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ error: '登录密码至少需 6 个字符' }, 400);
  }

  try {
    const result = await authService.register(c.env, payload?.sub, username, password);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err instanceof Error ? err.message : '账号升级异常' }, 400);
  }
});

/**
 * 3. 现有账号合并
 * POST /api/auth/merge
 */
authRoutes.post('/merge', async (c) => {
  const payload = await extractAuthPayload(c);
  if (!payload || !payload.sub) {
    return c.json({ error: '请先以匿名游客身份进入游戏再行合并' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  if (!username || !password) {
    return c.json({ error: '请输入已有正式账号及登录密码' }, 400);
  }

  try {
    const result = await authService.mergeGuest(c.env, payload.sub, username, password);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Auth Merge API] 异常:', err);
    return c.json({ error: err instanceof Error ? err.message : '账号合并异常' }, 400);
  }
});

/**
 * 4. 正式账号直接登录
 * POST /api/auth/login
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  if (!username || !password) {
    return c.json({ error: '请输入账号与密码' }, 400);
  }

  try {
    const result = await authService.login(c.env, username, password);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: '登录异常: ' + (err instanceof Error ? err.message : String(err)) }, 500);
  }
});

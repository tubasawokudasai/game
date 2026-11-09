import { Hono } from 'hono';
import { Env } from '../models/env';
import { JwtAuthPayload } from '../utils/crypto';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requireDb } from '../middleware/dbMiddleware';
import { SystemGrantMailSchema } from '../models/schemas';
import { adminGrantService, AdminGrantError } from '../services/adminGrantService';

export const adminGrantRoutes = new Hono<{
  Bindings: Env;
  Variables: {
    adminUser: JwtAuthPayload;
  };
}>();

adminGrantRoutes.use('*', requireDb);
adminGrantRoutes.use('*', adminAuthMiddleware);

/**
 * 系统发放模版目录
 * GET /api/admin/grants/catalog
 */
adminGrantRoutes.get('/catalog', async (c) => {
  try {
    const res = await adminGrantService.getCatalog(c.env.DB);
    return c.json(res);
  } catch (err: unknown) {
    console.error('[AdminGrant] 读取发放目录失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '读取发放目录失败' },
      500
    );
  }
});

/**
 * 通过系统邮件发放道具 / 角色 / 货币
 * POST /api/admin/grants/send
 */
adminGrantRoutes.post('/send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SystemGrantMailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: '系统发放参数不合法',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400
    );
  }

  try {
    const adminUsername = String(c.get('adminUser')?.username || 'admin');
    const res = await adminGrantService.sendSystemGrant(c.env, parsed.data, adminUsername);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof AdminGrantError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[AdminGrant] 系统发放失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '系统发放失败' },
      400
    );
  }
});

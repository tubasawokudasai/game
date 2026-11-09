import { createAdminRouter } from './types';
import { signAuthToken } from '../../utils/crypto';
import { adminAuthMiddleware } from '../../middleware/adminAuth';

export const authRoutes = createAdminRouter();

/**
 * 管理员登录
 * POST /api/admin/login
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  const expectedUsername = c.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = c.env.ADMIN_PASSWORD || 'admin123';

  if (!username || !password) {
    return c.json({ error: '账号和密码不能为空' }, 400);
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return c.json({ error: '管理员账号或密码错误' }, 401);
  }

  const token = await signAuthToken(
    {
      sub: 'admin_' + username,
      username,
      isGuest: false,
      role: 'admin',
    },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    token,
    user: {
      username,
      role: 'admin',
    },
  });
});

/**
 * 获取当前登录管理员信息
 * GET /api/admin/me
 */
authRoutes.get('/me', adminAuthMiddleware, async (c) => {
  const user = c.get('adminUser');
  return c.json({
    username: user.username || 'admin',
    role: user.role,
  });
});

/**
 * 仪表盘概览统计
 * GET /api/admin/stats
 */
authRoutes.get('/stats', adminAuthMiddleware, async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const [totalPlayersRes, guestPlayersRes, totalScenesRes, totalNpcsRes, totalMedicinesRes, totalSkillsRes] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM players').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM players WHERE is_guest = 1').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM scenes').first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM npc_instances WHERE instance_type = 'WORLD'").first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM medicines').first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM combat_skills').first<{ count: number }>().catch(() => ({ count: 0 })),
  ]);

  return c.json({
    totalPlayers: totalPlayersRes?.count || 0,
    guestPlayers: guestPlayersRes?.count || 0,
    registeredPlayers: (totalPlayersRes?.count || 0) - (guestPlayersRes?.count || 0),
    totalScenes: totalScenesRes?.count || 0,
    totalNpcs: totalNpcsRes?.count || 0,
    totalMedicines: totalMedicinesRes?.count || 0,
    totalSkills: totalSkillsRes?.count || 0,
  });
});

import { Hono } from 'hono';
import { Env } from '../models/env';
import { JwtAuthPayload } from '../utils/crypto';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import {
  DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG,
  LEVEL_UP_NOTIFICATION_VARIABLES,
  PLAYER_LEVEL_UP_FIXED_RULES,
  getLevelUpNotificationConfig,
  resetLevelUpNotificationConfig,
  saveLevelUpNotificationConfig,
} from '../services/levelUpNotificationService';
import {
  DEFAULT_STORY_NOTIFICATION_CONFIG,
  STORY_NODE_TRIGGER_EVENT_CODE,
  STORY_NOTIFICATION_FIXED_RULES,
  STORY_NOTIFICATION_VARIABLES,
  getStoryNotificationConfig,
  resetStoryNotificationConfig,
  saveStoryNotificationConfig,
  listStoryNotifications,
  createStoryNotification,
  updateStoryNotification,
  deleteStoryNotification,
} from '../services/storyNotificationService';

/**
 * 后台「通知管理」接口。
 *
 * 权限：复用现有 adminAuthMiddleware（仅 role=admin 的 JWT 可访问）。
 * 当前仅实现 PLAYER_LEVEL_UP，后续扩展其他通知事件时按同样模式新增路由即可。
 */
export const adminNotificationRoutes = new Hono<{
  Bindings: Env;
  Variables: {
    adminUser: JwtAuthPayload;
  };
}>();

adminNotificationRoutes.use('*', adminAuthMiddleware);

function notificationMeta() {
  return {
    fixedRules: PLAYER_LEVEL_UP_FIXED_RULES,
    variables: LEVEL_UP_NOTIFICATION_VARIABLES,
    defaults: DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG,
  };
}

/**
 * 通知事件列表
 * GET /api/admin/notifications
 *
 * 后台「通知管理」一级页面使用。按事件维度返回列表。
 */
adminNotificationRoutes.get('/', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const [config, storyConfig, storyNotifications] = await Promise.all([
      getLevelUpNotificationConfig(c.env.DB),
      getStoryNotificationConfig(c.env.DB),
      listStoryNotifications(c.env.DB),
    ]);

    const enabledStoryCount = storyNotifications.filter((n) => n.enabled === 1).length;
    const storyGrantCount = storyNotifications.reduce(
      (total, notification) => total + notification.grants.length,
      0
    );

    const data = [
      {
        eventCode: PLAYER_LEVEL_UP_FIXED_RULES.eventCode,
        eventName: PLAYER_LEVEL_UP_FIXED_RULES.eventName,
        triggerCondition: PLAYER_LEVEL_UP_FIXED_RULES.triggerCondition,
        action: PLAYER_LEVEL_UP_FIXED_RULES.action,
        target: PLAYER_LEVEL_UP_FIXED_RULES.target,
        enabled: config.enabled,
        title: config.title,
        content: config.content,
        grantCount: config.grants.length,
        notificationCount: 0,
        updatedBy: config.updatedBy || null,
        updatedAt: config.updatedAt || null,
        configPath: '/notifications/player-level-up',
      },
      {
        eventCode: STORY_NODE_TRIGGER_EVENT_CODE,
        eventName: '剧情通知',
        triggerCondition: STORY_NOTIFICATION_FIXED_RULES.triggerCondition,
        action: STORY_NOTIFICATION_FIXED_RULES.action,
        target: STORY_NOTIFICATION_FIXED_RULES.target,
        enabled: enabledStoryCount > 0,
        title:
          storyNotifications.length > 0
            ? `已配置 ${storyNotifications.length} 条独立通知`
            : '尚未配置独立通知',
        content: storyConfig.content,
        grantCount: storyGrantCount,
        notificationCount: storyNotifications.length,
        updatedBy: storyConfig.updatedBy || null,
        updatedAt: storyConfig.updatedAt || null,
        configPath: '/notifications/story-trigger',
      },
    ];

    return c.json({
      success: true,
      data,
      total: data.length,
    });
  } catch (err) {
    console.error('[AdminNotification] 读取通知事件列表失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '读取通知事件列表失败' },
      500
    );
  }
});

/**
 * 读取玩家升级通知配置
 * GET /api/admin/notifications/player-level-up
 */
adminNotificationRoutes.get('/player-level-up', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const data = await getLevelUpNotificationConfig(c.env.DB);
    return c.json({
      success: true,
      data,
      ...notificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 读取玩家升级通知配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '读取玩家升级通知配置失败' },
      500
    );
  }
});

/**
 * 保存玩家升级通知配置
 * PUT /api/admin/notifications/player-level-up
 * body: { enabled, title, content, grants: [{ type: 'ITEM'|'COMPANION'|'CURRENCY', ... }] }
 */
adminNotificationRoutes.put('/player-level-up', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const admin = c.get('adminUser');

  try {
    const data = await saveLevelUpNotificationConfig(
      c.env.DB,
      {
        enabled: body.enabled,
        title: body.title,
        content: body.content,
        grants: body.grants ?? body.rewardItems,
      },
      admin?.username || 'admin'
    );

    return c.json({
      success: true,
      message: '玩家升级通知配置已保存',
      data,
      ...notificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 保存玩家升级通知配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '保存玩家升级通知配置失败' },
      400
    );
  }
});

/**
 * 恢复默认配置
 * POST /api/admin/notifications/player-level-up/reset
 */
adminNotificationRoutes.post('/player-level-up/reset', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const admin = c.get('adminUser');

  try {
    const data = await resetLevelUpNotificationConfig(
      c.env.DB,
      admin?.username || 'admin'
    );

    return c.json({
      success: true,
      message: '已恢复玩家升级通知默认配置',
      data,
      ...notificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 恢复玩家升级通知默认配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '恢复玩家升级通知默认配置失败' },
      500
    );
  }
});

// ==============================================================================
// 通知管理 · 剧情节点触发器通知
// ==============================================================================

function storyNotificationMeta() {
  return {
    defaults: DEFAULT_STORY_NOTIFICATION_CONFIG,
    variables: STORY_NOTIFICATION_VARIABLES,
    fixedRules: STORY_NOTIFICATION_FIXED_RULES,
  };
}

/**
 * 读取剧情节点触发器通知配置
 * GET /api/admin/notifications/story-trigger
 */
adminNotificationRoutes.get('/story-trigger', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const data = await getStoryNotificationConfig(c.env.DB);
    return c.json({
      success: true,
      data,
      ...storyNotificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 读取剧情节点通知配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '读取剧情节点通知配置失败' },
      500
    );
  }
});

/**
 * 保存剧情节点触发器通知配置
 * PUT /api/admin/notifications/story-trigger
 * body: { enabled, title, content, grants }
 */
adminNotificationRoutes.put('/story-trigger', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const admin = c.get('adminUser');

  try {
    const data = await saveStoryNotificationConfig(
      c.env.DB,
      {
        enabled: body.enabled,
        title: body.title,
        content: body.content,
        grants: body.grants ?? body.rewardItems,
      },
      admin?.username || 'admin'
    );

    return c.json({
      success: true,
      message: '剧情节点通知配置已保存',
      data,
      ...storyNotificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 保存剧情节点通知配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '保存剧情节点通知配置失败' },
      400
    );
  }
});

/**
 * 恢复剧情节点通知默认配置
 * POST /api/admin/notifications/story-trigger/reset
 */
adminNotificationRoutes.post('/story-trigger/reset', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const admin = c.get('adminUser');

  try {
    const data = await resetStoryNotificationConfig(
      c.env.DB,
      admin?.username || 'admin'
    );

    return c.json({
      success: true,
      message: '已恢复剧情节点通知默认配置',
      data,
      ...storyNotificationMeta(),
    });
  } catch (err) {
    console.error('[AdminNotification] 恢复剧情节点通知配置失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '恢复剧情节点通知配置失败' },
      500
    );
  }
});

// ==============================================================================
// 剧情通知资产 CRUD（一套剧本 / 一个节点可配置多条独立通知）
// ==============================================================================

function storyNotificationDto<T extends { enabled: number }>(row: T): Omit<T, 'enabled'> & { enabled: boolean } {
  return { ...row, enabled: Number(row.enabled) === 1 };
}

/**
 * 剧情通知列表
 * GET /api/admin/notifications/story-notifications?package_id=...
 */
adminNotificationRoutes.get('/story-notifications', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const packageId = c.req.query('package_id') || null;
    const rows = await listStoryNotifications(c.env.DB, packageId);
    return c.json({ success: true, data: rows.map(storyNotificationDto) });
  } catch (err) {
    console.error('[AdminNotification] 读取剧情通知列表失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '读取剧情通知列表失败' },
      500
    );
  }
});

/**
 * 新建剧情通知
 * POST /api/admin/notifications/story-notifications
 */
adminNotificationRoutes.post('/story-notifications', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const admin = c.get('adminUser');

  try {
    const row = await createStoryNotification(
      c.env.DB,
      {
        package_id: body.package_id,
        node_id: body.node_id,
        trigger_event: body.trigger_event,
        name: body.name,
        title: body.title,
        content: body.content,
        grants: body.grants ?? body.rewardItems,
        enabled: body.enabled,
      },
      admin?.username || 'admin'
    );

    return c.json({
      success: true,
      message: '剧情通知已创建',
      data: storyNotificationDto(row),
    });
  } catch (err) {
    console.error('[AdminNotification] 创建剧情通知失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '创建剧情通知失败' },
      400
    );
  }
});

/**
 * 更新剧情通知
 * PUT /api/admin/notifications/story-notifications/:id
 */
adminNotificationRoutes.put('/story-notifications/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  try {
    const row = await updateStoryNotification(c.env.DB, id, body);
    return c.json({
      success: true,
      message: '剧情通知已保存',
      data: storyNotificationDto(row),
    });
  } catch (err) {
    console.error('[AdminNotification] 更新剧情通知失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '更新剧情通知失败' },
      400
    );
  }
});

/**
 * 删除剧情通知
 * DELETE /api/admin/notifications/story-notifications/:id
 */
adminNotificationRoutes.delete('/story-notifications/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');

  try {
    await deleteStoryNotification(c.env.DB, id);
    return c.json({ success: true, message: '剧情通知已删除' });
  } catch (err) {
    console.error('[AdminNotification] 删除剧情通知失败:', err);
    return c.json(
      { error: err instanceof Error ? err.message : '删除剧情通知失败' },
      500
    );
  }
});

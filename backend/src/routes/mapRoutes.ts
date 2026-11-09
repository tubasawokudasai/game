import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { mapService } from '../services/map/mapService';
import { requireDb } from '../middleware/dbMiddleware';

export const mapRoutes = new Hono<{ Bindings: Env }>();

// 统一前置中间件：DB 实例校验
mapRoutes.use('*', requireDb);

/**
 * 获取全九州所有场景元数据列表 (大区、都城、坊市)
 * GET /api/map
 * 纯数据库驱动：动态读取 D1 scenes 表全量数据
 */
mapRoutes.get('/', async (c) => {
  const scenes = await mapService.listScenes(c.env.DB);
  return c.json({ scenes });
});

/**
 * 获取指定场景内的坊市/名胜画卷
 * GET /api/map/venues?sceneId=square
 * 注意：必须注册在 /:mapId 之前，否则 /venues 会被当成 mapId 匹配
 */
mapRoutes.get('/venues', async (c) => {
  const sceneId = c.req.query('sceneId') || 'square';
  const venues = await mapService.listVenues(c.env.DB, sceneId);
  return c.json({ venues });
});

/**
 * 获取指定地图场景元数据与常驻 NPC 列表
 * GET /api/map/:mapId
 * 纯数据库驱动：完全去除代码中的硬编码数据，动态读取 scenes 与 npc_instances 表
 */
mapRoutes.get('/:mapId', async (c) => {
  const mapId = c.req.param('mapId');
  const authPayload = await extractAuthPayload(c).catch(() => null);
  const playerId = authPayload?.sub || null;

  const detail = await mapService.getSceneDetail(c.env, mapId, playerId);
  if (!detail) {
    return c.json({ error: `未找到场景 [${mapId}] 的配置信息` }, 404);
  }

  return c.json(detail);
});

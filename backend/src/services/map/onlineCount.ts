import { Env } from '../../models/env';

/**
 * 封装 Durable Object 实时在线人数查询
 * 支持 ZONE_DO 或 MAP_DO，异常时降级返回 1
 */
export async function getMapOnlineCount(env: Env, mapId: string): Promise<number> {
  const normalizedKey = (mapId || 'square').toLowerCase();
  try {
    const doNamespace = env.ZONE_DO || env.MAP_DO;
    if (!doNamespace) return 1;

    const doId = doNamespace.idFromName('global_game_world');
    const mapDoStub = doNamespace.get(doId);
    const statusRes = await mapDoStub.fetch('http://do/status');
    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as { areaStats?: Record<string, number> };
      return statusData.areaStats?.[normalizedKey] || statusData.areaStats?.[mapId] || 1;
    }
  } catch {
    // 忽略未激活异常，降级返回 1
  }
  return 1;
}

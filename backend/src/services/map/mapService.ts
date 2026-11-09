import { Env } from '../../models/env';
import { sceneDb } from '../../db/sceneDb';
import { venueDb, VenueRecord } from '../../db/venueDb';
import { npcDb } from '../../db/npcDb';
import { playerStateDb } from '../../db/playerStateDb';
import { toSceneDto, SceneDto } from '../../mappers/sceneMapper';
import { getMapOnlineCount } from './onlineCount';
import { prefetchEncounterPreviews } from './encounterPreview';
import { presentNpc, PresentedNpcDto } from './npcPresenter';
import { bootstrapPlayerStoryNpcs } from '../npc/storyNpcStateService';

export interface SceneDetailResult {
  scene: SceneDto;
  npcs: PresentedNpcDto[];
}

export interface VenueDto {
  id: string;
  name: string;
  badge: string;
  tag: string;
  desc: string;
  chips: string[];
  actionNotice: string;
  img: string;
}

export const mapService = {
  /**
   * 获取所有全九州场景列表
   */
  async listScenes(db: D1Database): Promise<SceneDto[]> {
    const scenes = await sceneDb.listScenes(db);
    return scenes.map((s) => toSceneDto(s, 1));
  },

  /**
   * 获取场景内的坊市/建筑列表
   */
  async listVenues(db: D1Database, sceneId: string): Promise<VenueDto[]> {
    const records = await venueDb.listVenuesByScene(db, sceneId);
    return records.map((v) => {
      let chips: string[] = [];
      try {
        const parsed: unknown = JSON.parse(v.chips_json || '[]');
        if (Array.isArray(parsed)) chips = parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        chips = [];
      }
      return {
        id: v.id,
        name: v.name,
        badge: v.badge || '',
        tag: v.tag || '',
        desc: v.description || '',
        chips,
        actionNotice: v.action_notice || '',
        img: v.img || '',
      };
    });
  },

  /**
   * 获取指定地图场景元数据与常驻 NPC 列表
   * 并行取数优化：在线人数、场景信息、NPC 列表、玩家击杀/Flag 状态并行获取
   */
  async getSceneDetail(
    env: Env,
    mapId: string,
    playerId: string | null
  ): Promise<SceneDetailResult | null> {
    const normalizedKey = (mapId || 'square').toLowerCase();

    // 首次进入地图时补齐当前玩家的剧情 NPC 位置记录；之后只更新，不重复创建
    if (playerId) {
      try {
        await bootstrapPlayerStoryNpcs(env.DB, playerId);
      } catch (err) {
        console.warn('[mapService] 初始化剧情 NPC 位置失败:', err);
      }
    }

    // 互不依赖的查询用 Promise.all 并行进行
    const [onlineCount, scene, npcs, encounterMap, playerFlags] = await Promise.all([
      getMapOnlineCount(env, mapId),
      sceneDb.getSceneById(env.DB, normalizedKey),
      npcDb.listVisibleNpcs(env.DB, playerId),
      playerId ? playerStateDb.getEncounterStates(env.DB, playerId) : Promise.resolve(new Map()),
      playerId ? playerStateDb.getActiveFlags(env.DB, playerId) : Promise.resolve(new Set<string>()),
    ]);

    if (!scene) {
      return null;
    }

    // 过滤出属于当前场景的 NPC
    const sceneNpcs = npcs.filter((n) => n.scene_id === scene.id);

    // 预取战斗阵容
    const encounterPreviewByNpcId = await prefetchEncounterPreviews(env.DB, sceneNpcs);

    const now = Date.now();
    const formattedNpcs = sceneNpcs.map((n) =>
      presentNpc(n, {
        now,
        encounterMap,
        playerFlags,
        encounterPreviewByNpcId,
      })
    );

    return {
      scene: toSceneDto(scene, onlineCount),
      npcs: formattedNpcs,
    };
  },
};

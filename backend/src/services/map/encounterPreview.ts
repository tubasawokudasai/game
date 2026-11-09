import { loadEncounterEnemies } from '../../db/combatDb';
import { NpcInstanceRow } from '../../db/npcDb';

export interface EnemyPreviewItem {
  id: string;
  name: string;
  avatar: string;
  position: string;
  slotIndex: number;
  isBoss: boolean;
  hp: number;
  maxHp: number;
}

export interface EncounterPreviewResult {
  name: string;
  enemies: EnemyPreviewItem[];
}

export function toEnemyPreview(enemyTeam: Array<any>): EnemyPreviewItem[] {
  return enemyTeam.map((e) => ({
    id: e.id,
    name: e.name,
    avatar: e.idleAvatar || e.avatar || '',
    position: e.position || 'FRONT',
    slotIndex: e.slotIndex ?? 0,
    isBoss: Boolean(e.isActionActive),
    hp: e.hp,
    maxHp: e.maxHp,
  }));
}

/**
 * 预取战斗 NPC 的敌方阵容预览
 * 保留同一战阵 + 等级覆盖的缓存 key 逻辑，以及加载失败时返回空预览的容错
 */
export async function prefetchEncounterPreviews(
  db: D1Database,
  npcs: NpcInstanceRow[]
): Promise<Map<string, EncounterPreviewResult>> {
  const monsterGroupMap = new Map<string, EncounterPreviewResult>();
  const encounterPreviewByNpcId = new Map<string, EncounterPreviewResult>();

  for (const npc of npcs) {
    if (npc.type !== 'battle') continue;

    if (npc.battle_group_id) {
      // 同一战阵 + 同一等级覆盖只算一次；不同地图 NPC 可覆盖不同槽位等级
      const cacheKey = `${npc.battle_group_id}::${npc.battle_member_levels_json || '{}'}`;
      if (!monsterGroupMap.has(cacheKey)) {
        try {
          const { group, enemyTeam } = await loadEncounterEnemies(db, npc as any);
          monsterGroupMap.set(cacheKey, {
            name: group.name,
            enemies: toEnemyPreview(enemyTeam),
          });
        } catch {
          // 配置损坏/未部署时不阻断地图，前端会显示为不可挑战
          monsterGroupMap.set(cacheKey, { name: '', enemies: [] });
        }
      }
      encounterPreviewByNpcId.set(npc.id, monsterGroupMap.get(cacheKey)!);
      continue;
    }

    try {
      const { group, enemyTeam } = await loadEncounterEnemies(db, npc as any);
      encounterPreviewByNpcId.set(npc.id, {
        name: group.name,
        enemies: toEnemyPreview(enemyTeam),
      });
    } catch {
      encounterPreviewByNpcId.set(npc.id, { name: '', enemies: [] });
    }
  }

  return encounterPreviewByNpcId;
}

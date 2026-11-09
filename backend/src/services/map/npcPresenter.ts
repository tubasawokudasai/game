import { NpcInstanceRow } from '../../db/npcDb';
import { EncounterPreviewResult, EnemyPreviewItem } from './encounterPreview';

export interface PresentedNpcDto {
  id: string;
  key: string;
  name: string | null;
  badge: string;
  title: string;
  avatar: string;
  type: string;
  templateId?: string;
  templateName?: string;
  isStoryNpc?: boolean;
  storyPackageId?: string;
  npcRole: string;
  ownerPlayerId?: string;
  posX?: number;
  posY?: number;
  battleMode?: 'SOLO' | 'GROUP';
  battleGroupId?: string;
  battleGroupName?: string;
  battleLevel?: number;
  battleReward?: any;
  respawnSeconds?: number;
  onceFlag?: string;
  canFight?: boolean;
  cooldownRemaining?: number;
  enemyPreview?: EnemyPreviewItem[];
}

export interface PresentNpcContext {
  now?: number;
  encounterMap?: Map<string, { defeat_count: number; last_defeat_at: number }>;
  playerFlags?: Set<string>;
  encounterPreviewByNpcId?: Map<string, EncounterPreviewResult>;
}

/**
 * 纯函数：将 NpcInstanceRow 映射为前端展示的 NPC DTO
 * 纯逻辑计算：canFight / cooldownRemaining（-1 代表一次性强敌已击溃）/ battleMode 等
 */
export function presentNpc(
  n: NpcInstanceRow,
  ctx: PresentNpcContext = {}
): PresentedNpcDto {
  const now = ctx.now ?? Date.now();
  const encounterMap = ctx.encounterMap || new Map();
  const playerFlags = ctx.playerFlags || new Set();
  const encounterPreviewByNpcId = ctx.encounterPreviewByNpcId || new Map();

  const type = n.type || 'dialogue';
  const isBattle = type === 'battle';
  const groupInfo = isBattle ? encounterPreviewByNpcId.get(n.id) : null;
  const enemyPreview = groupInfo?.enemies || [];
  const isSolo = isBattle && !n.battle_group_id;

  let battleReward: any = {};
  if (n.battle_reward_json) {
    try {
      battleReward = JSON.parse(n.battle_reward_json);
    } catch {
      battleReward = {};
    }
  }

  let canFight = true;
  let cooldownRemaining = 0;
  const enc = encounterMap.get(n.id);

  if (isBattle) {
    if (!groupInfo || groupInfo.enemies.length === 0) {
      canFight = false;
    } else if (n.once_flag && playerFlags.has(n.once_flag)) {
      canFight = false;
      cooldownRemaining = -1; // -1 表示一次性强敌已被击溃
    } else if (Number(n.respawn_seconds) > 0 && enc?.last_defeat_at) {
      const elapsedSec = Math.floor((now - enc.last_defeat_at) / 1000);
      if (elapsedSec < Number(n.respawn_seconds)) {
        canFight = false;
        cooldownRemaining = Number(n.respawn_seconds) - elapsedSec;
      }
    }
  }

  return {
    id: n.id,
    key: n.key,
    name: n.name || n.template_name || null,
    badge: n.badge || n.template_badge || '',
    title: n.title || n.template_title || '',
    avatar: n.avatar || n.template_avatar || '',
    type,
    templateId: n.template_id || undefined,
    templateName: n.template_name || undefined,
    isStoryNpc: n.npc_role === 'STORY' || undefined,
    storyPackageId: n.dialogue_package_id || undefined,
    npcRole: n.npc_role || 'MAP',
    ownerPlayerId: n.owner_player_id || undefined,
    posX: n.pos_x !== null && n.pos_x !== undefined ? Number(n.pos_x) : undefined,
    posY: n.pos_y !== null && n.pos_y !== undefined ? Number(n.pos_y) : undefined,
    battleMode: isBattle ? (isSolo ? 'SOLO' : 'GROUP') : undefined,
    battleGroupId: n.battle_group_id || undefined,
    battleGroupName: isBattle && !isSolo ? groupInfo?.name || undefined : undefined,
    battleLevel: isBattle ? Number(n.battle_level) || 1 : undefined,
    battleReward: isBattle ? battleReward : undefined,
    respawnSeconds: isBattle ? Number(n.respawn_seconds) || 0 : undefined,
    onceFlag: isBattle ? n.once_flag || undefined : undefined,
    canFight: isBattle ? canFight : undefined,
    cooldownRemaining: isBattle ? cooldownRemaining : undefined,
    enemyPreview: isBattle && enemyPreview.length > 0 ? enemyPreview : undefined,
  };
}

import { normalizeNpcBattleMemberLevels } from '../../utils/npcBattleLevels';

/**
 * 剧情战斗角色（STORY_BATTLE）。
 *
 * 每个战斗选项只保留一条 npc_instances 定义：
 * - 不进入地图人物列表；
 * - 不按玩家/按战斗复制；
 * - 选项保存时 upsert，选项删除时删除。
 */

export interface StoryEncounterRewardItem {
  id: string;
  count: number;
  name?: string;
}

export interface StoryEncounterConfig {
  templateId: string;
  battleMode: 'SOLO' | 'GROUP';
  battleGroupId?: string | null;
  battleLevel: number;
  battleMemberLevels?: Record<string, number>;
  battleReward?: {
    exp?: number;
    gold?: number;
    silver?: number;
    items?: StoryEncounterRewardItem[];
  };
  respawnSeconds?: number;
  onceFlag?: string | null;
}

interface NpcTemplateRecord {
  id: string;
  name: string;
  badge: string | null;
  title: string | null;
  avatar: string | null;
  quote: string | null;
  gossip: string | null;
}

interface StoryBattleNpcInput {
  optionId: string;
  packageId: string | null;
  nodeSceneId: string | null;
  config: StoryEncounterConfig;
}

function sanitizeIdPart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, '_')
    .slice(0, 96);
}

function normalizeReward(config: StoryEncounterConfig['battleReward']): {
  exp: number;
  gold: number;
  silver: number;
  items: Array<{ id: string; count: number; name?: string }>;
} {
  const raw = config || {};
  return {
    exp: Math.max(0, Math.round(Number(raw.exp) || 0)),
    gold: Math.max(0, Math.round(Number(raw.gold) || 0)),
    silver: Math.max(0, Math.round(Number(raw.silver) || 0)),
    items: Array.isArray(raw.items)
      ? raw.items
          .map((item) => ({
            id: String(item?.id || '').trim(),
            count: Math.max(1, Math.round(Number(item?.count) || 1)),
            ...(item?.name ? { name: String(item.name) } : {}),
          }))
          .filter((item) => Boolean(item.id))
      : [],
  };
}

async function validateConfig(db: D1Database, config: StoryEncounterConfig): Promise<{
  template: NpcTemplateRecord;
  reward: ReturnType<typeof normalizeReward>;
  memberLevels: Record<string, number>;
}> {
  const templateId = String(config.templateId || '').trim();
  if (!templateId) {
    throw new Error('剧情战斗必须选择一个战斗角色模板');
  }

  const template = await db
    .prepare(
      `SELECT id, name, badge, title, avatar, quote, gossip
       FROM npc_templates WHERE id = ? OR key = ? LIMIT 1`
    )
    .bind(templateId, templateId)
    .first<NpcTemplateRecord>();

  if (!template) {
    throw new Error(`战斗角色模板 [${templateId}] 不存在`);
  }

  const battleMode = config.battleMode === 'GROUP' ? 'GROUP' : 'SOLO';
  const groupId = String(config.battleGroupId || '').trim();

  if (battleMode === 'GROUP') {
    if (!groupId) {
      throw new Error('多人战阵模式必须选择一套战斗配置');
    }
    const group = await db
      .prepare('SELECT id FROM monster_groups WHERE id = ?')
      .bind(groupId)
      .first<{ id: string }>();
    if (!group) {
      throw new Error(`战斗配置 [${groupId}] 不存在`);
    }
    const member = await db
      .prepare('SELECT 1 FROM monster_group_members WHERE group_id = ? LIMIT 1')
      .bind(groupId)
      .first();
    if (!member) {
      throw new Error(`战斗配置 [${groupId}] 尚未配置任何敌方槽位`);
    }
  }

  const reward = normalizeReward(config.battleReward);
  if (reward.items.length > 0) {
    const ids = Array.from(new Set(reward.items.map((item) => item.id)));
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, name FROM item_templates WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: string; name: string }>();
    const nameMap = new Map((results || []).map((row) => [row.id, row.name]));
    const missing = ids.filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      throw new Error(`奖励道具未备案：${missing.join('、')}`);
    }
    reward.items = reward.items.map((item) => ({
      ...item,
      name: nameMap.get(item.id) || item.name || item.id,
    }));
  }

  return {
    template,
    reward,
    memberLevels: normalizeNpcBattleMemberLevels(config.battleMemberLevels),
  };
}

/**
 * 保存战斗选项时 upsert 对应的 STORY_BATTLE 定义。
 * 返回稳定 npcId，供 dialogue_options.actions_json 引用。
 */
export async function upsertStoryBattleNpcForOption(
  db: D1Database,
  input: StoryBattleNpcInput
): Promise<string> {
  const config = input.config;
  const battleMode = config.battleMode === 'GROUP' ? 'GROUP' : 'SOLO';
  const battleGroupId = battleMode === 'GROUP' ? String(config.battleGroupId || '').trim() : null;
  const battleLevel = Math.max(1, Math.round(Number(config.battleLevel) || 1));
  const respawnSeconds = Math.max(0, Math.round(Number(config.respawnSeconds) || 0));
  const onceFlag = String(config.onceFlag || '').trim() || null;

  const { template, reward, memberLevels } = await validateConfig(db, {
    ...config,
    battleMode,
    battleGroupId,
    battleLevel,
    respawnSeconds,
    onceFlag,
  });

  const npcId = `npcinst_storybattle_${sanitizeIdPart(input.optionId)}`;

  await db
    .prepare(
      `INSERT INTO npc_instances
         (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
          type, quote, gossip, dialogue_package_id, dialogue_root_node_id, npc_role, pos_x, pos_y,
          owner_player_id, created_by, source, source_ref,
          battle_group_id, battle_level, battle_member_levels_json, battle_reward_json,
          respawn_seconds, once_flag, level)
       VALUES (?, ?, 'BATTLE', 'ACTIVE', ?, NULL, ?, ?, ?, ?,
               'battle', ?, ?, ?, NULL, 'STORY_BATTLE', NULL, NULL,
               NULL, 'DIALOGUE', 'DIALOGUE', ?,
               ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(npc_id) DO UPDATE SET
         template_id = excluded.template_id,
         status = 'ACTIVE',
         scene_id = excluded.scene_id,
         name = excluded.name,
         badge = excluded.badge,
         title = excluded.title,
         avatar = excluded.avatar,
         quote = excluded.quote,
         gossip = excluded.gossip,
         dialogue_package_id = excluded.dialogue_package_id,
         source_ref = excluded.source_ref,
         battle_group_id = excluded.battle_group_id,
         battle_level = excluded.battle_level,
         battle_member_levels_json = excluded.battle_member_levels_json,
         battle_reward_json = excluded.battle_reward_json,
         respawn_seconds = excluded.respawn_seconds,
         once_flag = excluded.once_flag,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      npcId,
      template.id,
      input.nodeSceneId,
      template.name,
      template.badge || '',
      template.title || '江湖中人',
      template.avatar || '',
      template.quote || '',
      template.gossip || '',
      input.packageId,
      input.optionId,
      battleGroupId,
      battleLevel,
      JSON.stringify(memberLevels),
      JSON.stringify(reward),
      respawnSeconds,
      onceFlag
    )
    .run();

  return npcId;
}

export async function deleteStoryBattleNpcForOption(
  db: D1Database,
  optionId: string
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM npc_instances
       WHERE npc_role = 'STORY_BATTLE' AND source_ref = ?`
    )
    .bind(optionId)
    .run();
}

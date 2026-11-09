import {
  CombatFighter,
  CombatBuff,
  CombatCamp,
  CombatSkillInfo,
  CombatSkillTargetType,
  CombatSkillKind,
  DUEL_SKILLS,
} from '../models/combat';
import { CombatEngine } from '../services/combat/CombatEngine';
import { Fighter, RoundLog } from '../services/combat/types';
import { CombatScriptEvent } from '../models/combat';
import {
  calculateNpcAttributesFromRows,
  toNpcCombatStats,
  type NpcAttributeTemplateRow,
} from '../services/npc/attributes';
import {
  normalizeNpcBattleMemberLevels,
  type NpcBattleMemberLevels,
} from '../utils/npcBattleLevels';
import { experienceService } from '../services/experienceService';
import {
  hidePlayerStoryNpcs,
  upsertStoryProgress,
} from '../services/npc/storyNpcStateService';

/**
 * 战斗数据访问模块 (combatDb.ts)
 *
 * 约定：
 * - 我方阵容 = players（队长） + party_members（出战伙伴），
 *   伙伴的战斗立绘与八维属性来自 npc_templates（任何 NPC 模板均可入队）；
 * - 敌方阵容 = monster_group_members JOIN npc_instances JOIN npc_templates；
 * - 所有 NPC 属性统一由 NpcAttributeCalculator 生成，本文件不保留任何成长公式、
 *   品质倍率或角色能力值副本。
 */

interface PartyCombatRow extends NpcAttributeTemplateRow {
  member_key: string;
  member_name: string;
  role: string;
  realm: string | null;
  level: number;
  avatar: string | null;
  sort_order: number;
  combat_idle_avatar: string | null;
  combat_attack_avatar: string | null;
  template_skills_json?: string | null;
  instance_skills_json?: string | null;
  instance_quality?: string | null;
  instance_growth_template?: string | null;
  instance_realm?: string | null;
  instance_bonus_json?: string | null;
}

interface PlayerCombatRow {
  id: string;
  nickname: string;
  avatar: string | null;
  level: number;
  realm: string | null;
  max_hp: number;
  max_mp: number;
  combat_power: number;
  /** 玩家当前穿戴的战斗模型（battle_models.model_key） */
  combat_model_key?: string | null;
}

interface BattleModelRow {
  idle_avatar: string | null;
  attack_avatar: string | null;
}

/** battle_models 尚未迁移/未配置时的兜底战斗模型 */
const DEFAULT_PLAYER_BATTLE_MODEL = '/assets/combat/characters/player_default_trans.png';

// 老库未迁移时只提示一次，避免每场战斗刷日志
let battleModelWarningLogged = false;

interface PlayerBattleModel {
  idleAvatar: string;
  attackAvatar: string;
}

/** 解析 NPC 实例技能，为空或无法解析时回退继承模板技能 */
export function resolveNpcFighterSkills(
  instanceSkillsJson?: string | null,
  templateSkillsJson?: string | null
): string[] {
  if (instanceSkillsJson && typeof instanceSkillsJson === 'string' && instanceSkillsJson.trim()) {
    try {
      const parsed = JSON.parse(instanceSkillsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      // 实例配置异常则回退模板
    }
  }

  if (templateSkillsJson && typeof templateSkillsJson === 'string' && templateSkillsJson.trim()) {
    try {
      const parsed = JSON.parse(templateSkillsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      // 模板配置异常则回退默认
    }
  }

  return ['skill_basic_attack'];
}

/**
 * 读取玩家战斗模型。
 * 与 players.avatar（个人头像/立绘）解耦：战斗场景只使用 battle_models 中的模型。
 * 老库没有 battle_models 表或未配置模型时，回退到默认模型，不阻断战斗。
 */
async function loadPlayerBattleModel(
  db: D1Database,
  modelKey: string
): Promise<PlayerBattleModel> {
  try {
    let row = await db
      .prepare('SELECT idle_avatar, attack_avatar FROM battle_models WHERE model_key = ?')
      .bind(modelKey)
      .first<BattleModelRow>();

    // 指定模型不存在时，回退到表内标记的默认模型
    if (!row?.idle_avatar) {
      row = await db
        .prepare(
          `SELECT idle_avatar, attack_avatar FROM battle_models
           WHERE is_default = 1
           ORDER BY sort_order ASC
           LIMIT 1`
        )
        .first<BattleModelRow>();
    }

    if (row?.idle_avatar) {
      return {
        idleAvatar: row.idle_avatar,
        attackAvatar: row.attack_avatar || row.idle_avatar,
      };
    }
  } catch (err) {
    if (!battleModelWarningLogged) {
      console.warn('[combatDb] battle_models 查询失败，使用默认战斗模型:', err);
      battleModelWarningLogged = true;
    }
  }
  return {
    idleAvatar: DEFAULT_PLAYER_BATTLE_MODEL,
    attackAvatar: DEFAULT_PLAYER_BATTLE_MODEL,
  };
}

interface MonsterGroupRow {
  id: string;
  name: string;
}

export interface CombatGroupMeta {
  id: string;
  name: string;
}

/** monster_group_members JOIN npc_instances + npc_templates 的一行 */
interface MonsterMemberRow extends NpcAttributeTemplateRow {
  npc_instance_id: string;
  slot_index: number;
  level: number;
  position: string;
  is_boss: number;
  member_quality: string | null;
  hp_override: number | null;
  mp_override: number | null;
  attack_override: number | null;
  defense_override: number | null;
  speed_override: number | null;
  name: string;
  avatar: string | null;
  idle_avatar: string | null;
  template_skills_json?: string | null;
  instance_skills_json?: string | null;
  instance_quality: string | null;
  instance_growth_template: string | null;
  instance_realm: string | null;
  instance_bonus_json: string | null;
}

export interface PreparedCombat {
  group: CombatGroupMeta;
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  /** 与切磋共用的服务端技能表（combat_skills / DUEL_SKILLS 兜底） */
  skills: CombatSkillInfo[];
}

const createBuffs = (): CombatBuff[] => [];

/**
 * 读取指定玩家的出战阵容：主角（阵眼）固定出战 + 最多 3 名出战伙伴。
 * 主角取自 players 表；伙伴取自 party_members + npc_templates。
 */
export async function buildPlayerTeam(
  db: D1Database,
  playerId: string
): Promise<CombatFighter[]> {
  // 1. 主角（阵眼）固定出战；属性取 players，战斗模型取 battle_models
  let player: PlayerCombatRow | null = null;
  try {
    player = await db
      .prepare(
        'SELECT id, nickname, avatar, level, realm, max_hp, max_mp, combat_power, combat_model_key FROM players WHERE id = ?'
      )
      .bind(playerId)
      .first<PlayerCombatRow>();
  } catch (err) {
    // 老库尚未执行 battle_models 迁移（players 无 combat_model_key 列）
    if (!battleModelWarningLogged) {
      console.warn('[combatDb] 读取 combat_model_key 失败，回退旧玩家查询:', err);
      battleModelWarningLogged = true;
    }
    player = await db
      .prepare(
        'SELECT id, nickname, avatar, level, realm, max_hp, max_mp, combat_power FROM players WHERE id = ?'
      )
      .bind(playerId)
      .first<PlayerCombatRow>();
  }

  if (!player) {
    throw new Error('修仙者不存在或尚未建立玉牒');
  }

  const power = Math.max(500, Number(player.combat_power) || 800);
  const playerHp = Math.max(1, Number(player.max_hp) || 3000);
  const playerMp = Math.max(0, Number(player.max_mp) || 1000);
  const battleModel = await loadPlayerBattleModel(
    db,
    player.combat_model_key || 'player_default'
  );

  const leaderAttack = Math.max(1, Math.round(power * 0.9));
  const leaderDefense = Math.max(0, Math.round(power * 0.5));
  const leader: CombatFighter = {
    id: `player_${player.id}`,
    name: player.nickname,
    // 战斗场景不使用 players.avatar，统一使用 battle_models 的战斗模型
    avatar: battleModel.idleAvatar,
    idleAvatar: battleModel.idleAvatar,
    attackAvatar: battleModel.attackAvatar,
    camp: 'PLAYER',
    position: 'FRONT',
    slotIndex: 0,
    hp: playerHp,
    maxHp: playerHp,
    mp: playerMp,
    maxMp: playerMp,
    rage: 100,
    maxRage: 100,
    attack: leaderAttack,
    // 玩家沿用旧战斗模型：物法同源，暴击保持旧引擎基线
    matk: leaderAttack,
    defense: leaderDefense,
    mdef: leaderDefense,
    speed: 120,
    critRate: 0.25,
    critDmg: 2,
    level: Number(player.level) || 1,
    isAlive: true,
    buffs: createBuffs(),
    // 玩家主角技能：若未单独配置则默认拥有全部已启用技能（至少包含纯阳剑煞与普攻）
    skills: undefined,
  };

  // 2. 出战伙伴（最多 3 名，与队伍上限 4 人一致）
  let rows: PartyCombatRow[] = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT p.member_key, p.member_name, p.role, p.realm, p.level, p.avatar, p.sort_order,
                t.idle_avatar AS combat_idle_avatar, t.attack_avatar AS combat_attack_avatar,
                t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
                t.base_matk, t.base_mdef, t.base_crit,
                t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
                t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
                t.growth_template, t.quality, t.bonus_json,
                t.skills_json AS template_skills_json,
                i.skills_json AS instance_skills_json,
                i.quality AS instance_quality,
                i.growth_template AS instance_growth_template,
                i.realm AS instance_realm,
                i.bonus_json AS instance_bonus_json
         FROM party_members p
         LEFT JOIN npc_instances i ON i.npc_id = p.member_key
         LEFT JOIN npc_templates t ON t.id = i.template_id
         WHERE p.player_id = ? AND p.is_active = 1
         ORDER BY p.sort_order ASC, p.created_at ASC`
      )
      .bind(playerId)
      .all<PartyCombatRow>();
    rows = results || [];
  } catch (err) {
    // 容灾降级：若数据库 npc_templates 尚未同步战斗属性字段，退回仅查 party_members
    console.warn('[combatDb] buildPlayerTeam 关联 npc_templates 异常，尝试降级查询:', err);
    try {
      const { results } = await db
        .prepare(
          `SELECT p.member_key, p.member_name, p.role, p.realm, p.level, p.avatar, p.sort_order,
                  NULL as combat_idle_avatar, NULL as combat_attack_avatar,
                  NULL as base_hp, NULL as base_mp, NULL as base_attack, NULL as base_defense, NULL as base_speed,
                  NULL as base_matk, NULL as base_mdef, NULL as base_crit,
                  NULL as growth_hp, NULL as growth_mp, NULL as growth_attack, NULL as growth_matk,
                  NULL as growth_defense, NULL as growth_mdef, NULL as growth_speed, NULL as growth_crit,
                  NULL as growth_template, NULL as quality, NULL as bonus_json,
                  NULL as instance_quality, NULL as instance_growth_template,
                  NULL as instance_realm, NULL as instance_bonus_json
           FROM party_members p
           WHERE p.player_id = ? AND p.is_active = 1
           ORDER BY p.sort_order ASC, p.created_at ASC`
        )
        .bind(playerId)
        .all<PartyCombatRow>();
      rows = results || [];
    } catch (e) {
      console.warn('[combatDb] 查询 party_members 亦异常，仅主角出战:', e);
      rows = [];
    }
  }

  const companions: CombatFighter[] = rows.slice(0, 3).map((row, index) => {
    // 伙伴同样属于 NPC：统一走属性计算服务，等级来自 party_members.level
    const final = calculateNpcAttributesFromRows({
      template: {
        base_hp: row.base_hp ?? 8000,
        base_mp: row.base_mp ?? 200,
        base_attack: row.base_attack ?? 2000,
        base_defense: row.base_defense ?? 1000,
        base_speed: row.base_speed ?? 100,
        base_matk: row.base_matk,
        base_mdef: row.base_mdef,
        base_crit: row.base_crit,
        growth_hp: row.growth_hp,
        growth_mp: row.growth_mp,
        growth_attack: row.growth_attack,
        growth_matk: row.growth_matk,
        growth_defense: row.growth_defense,
        growth_mdef: row.growth_mdef,
        growth_speed: row.growth_speed,
        growth_crit: row.growth_crit,
        growth_template: row.growth_template,
        quality: row.quality,
        bonus_json: row.bonus_json,
      },
      instance: {
        quality: row.instance_quality,
        growth_template: row.instance_growth_template,
        realm: row.instance_realm,
        bonus_json: row.instance_bonus_json,
      },
      // 伙伴境界优先取 party_members.realm，其次回落到实例境界
      realm: row.realm || row.instance_realm || null,
      level: Number(row.level) || 1,
    });
    const stats = toNpcCombatStats(final);

    return {
      id: row.member_key,
      name: row.member_name,
      avatar: row.combat_idle_avatar || row.avatar || '',
      idleAvatar: row.combat_idle_avatar || row.avatar || undefined,
      attackAvatar: row.combat_attack_avatar || row.combat_idle_avatar || row.avatar || undefined,
      camp: 'PLAYER',
      position: 'BACK',
      slotIndex: index + 1,
      hp: stats.hp,
      maxHp: stats.maxHp,
      mp: stats.mp,
      maxMp: stats.maxMp,
      rage: 40,
      maxRage: 100,
      attack: stats.attack,
      matk: stats.matk,
      defense: stats.defense,
      mdef: stats.mdef,
      speed: stats.speed,
      critRate: stats.critRate,
      critDmg: 2,
      level: stats.level,
      quality: stats.quality,
      growthTemplate: stats.growthTemplateId,
      skills: resolveNpcFighterSkills(row.instance_skills_json, row.template_skills_json),
      isAlive: true,
      buffs: createBuffs(),
    } satisfies CombatFighter;
  });

  return [leader, ...companions];
}

/**
 * 读取怪物组并转换为战斗单位；配置损坏直接抛错（fail-closed）。
 *
 * 真源：monster_group_members + npc_instances + npc_templates。
 * 缺少槽位配置时直接失败，不再回退旧的 enemies_json。
 */
export async function loadMonsterGroup(
  db: D1Database,
  monsterGroupId: string,
  memberLevelOverrides?: NpcBattleMemberLevels | null
): Promise<{ group: CombatGroupMeta; enemyTeam: CombatFighter[] }> {
  // 单人遭遇的虚拟战阵直接抛出，避免把 NPC ID 当成 monster_groups.id 查询
  if (!monsterGroupId) {
    throw new Error('未指定战斗配置，无法组装敌方阵容');
  }
  const row = await db
    .prepare('SELECT id, name FROM monster_groups WHERE id = ?')
    .bind(monsterGroupId)
    .first<MonsterGroupRow>();

  if (!row) {
    throw new Error(`未备案的怪物组 [${monsterGroupId}]`);
  }

  const { results } = await db
    .prepare(
      `SELECT m.npc_instance_id, m.slot_index, m.level, m.position, m.is_boss,
              m.quality AS member_quality,
              m.hp_override, m.mp_override, m.attack_override,
              m.defense_override, m.speed_override,
              i.name, i.avatar, t.idle_avatar,
              i.quality AS instance_quality,
              i.growth_template AS instance_growth_template,
              i.realm AS instance_realm,
              i.bonus_json AS instance_bonus_json,
              i.skills_json AS instance_skills_json,
              t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
              t.base_matk, t.base_mdef, t.base_crit,
              t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
              t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
              t.growth_template, t.quality, t.bonus_json,
              t.skills_json AS template_skills_json
       FROM monster_group_members m
       JOIN npc_instances i ON i.npc_id = m.npc_instance_id AND i.status = 'ACTIVE'
       JOIN npc_templates t ON t.id = i.template_id
       WHERE m.group_id = ?
       ORDER BY m.slot_index ASC`
    )
    .bind(monsterGroupId)
    .all<MonsterMemberRow>();
  const memberRows = results || [];

  if (memberRows.length === 0) {
    throw new Error(`战斗配置 [${monsterGroupId}] 未配置任何敌方槽位`);
  }

  const enemyTeam = memberRows.map((m): CombatFighter => {
    if (!m.name) {
      throw new Error(`战斗配置 [${monsterGroupId}] 槽位 ${m.slot_index} 的模板不存在`);
    }
    const levelOverride = memberLevelOverrides?.[String(m.slot_index)];
    const level = Math.max(1, Number(levelOverride ?? m.level) || 1);

    // 统一属性计算：模板成长 + 实例覆盖 + 地图 NPC 专属等级 + 槽位品质/境界 + 战斗配置绝对覆盖值
    const final = calculateNpcAttributesFromRows({
      template: m,
      instance: {
        quality: m.instance_quality,
        growth_template: m.instance_growth_template,
        realm: m.instance_realm,
        bonus_json: m.instance_bonus_json,
      },
      qualityOverride: m.member_quality,
      realm: m.instance_realm,
      level,
      overrides: {
        hp: m.hp_override ?? undefined,
        mp: m.mp_override ?? undefined,
        atk: m.attack_override ?? undefined,
        def: m.defense_override ?? undefined,
        spd: m.speed_override ?? undefined,
      },
    });
    const stats = toNpcCombatStats(final);
    const avatar = m.idle_avatar || m.avatar || '';

    return {
      id: m.npc_instance_id || `enemy_${monsterGroupId}_${m.slot_index}`,
      name: m.name,
      avatar,
      idleAvatar: avatar || undefined,
      camp: 'ENEMY',
      position: m.position === 'BACK' ? 'BACK' : 'FRONT',
      slotIndex: Number(m.slot_index) || 0,
      hp: stats.hp,
      maxHp: stats.maxHp,
      mp: stats.mp,
      maxMp: stats.maxMp,
      rage: 0,
      maxRage: 100,
      attack: stats.attack,
      matk: stats.matk,
      defense: stats.defense,
      mdef: stats.mdef,
      speed: stats.speed,
      critRate: stats.critRate,
      critDmg: 2,
      level: stats.level,
      quality: stats.quality,
      growthTemplate: stats.growthTemplateId,
      skills: resolveNpcFighterSkills(m.instance_skills_json, m.template_skills_json),
      isAlive: true,
      buffs: createBuffs(),
      isActionActive: Number(m.is_boss) === 1,
    } satisfies CombatFighter;
  });

  return { group: { id: row.id, name: row.name }, enemyTeam };
}

/**
 * 地图 NPC 遭遇所需的最小字段。
 * battle_group_id 为空即代表「单人遭遇」：该 NPC 自身模板就是唯一敌人。
 */
export interface EncounterNpcRef {
  id: string;
  name?: string | null;
  type?: string | null;
  template_id?: string | null;
  battle_group_id?: string | null;
  battle_level?: number | null;
  battle_member_levels_json?: string | null;
}

/**
 * 是否为「单人遭遇」：战斗型地图 NPC 未绑定战斗配置。
 * 这类 NPC 不再要求先建 monster_groups，直接以自己的模板生成单体敌方阵容。
 */
export function isSoloEncounter(npc: {
  type?: string | null;
  battle_group_id?: string | null;
}): boolean {
  return npc.type === 'battle' && !npc.battle_group_id;
}

interface SoloEncounterRow extends NpcAttributeTemplateRow {
  npc_instance_id: string;
  name: string;
  avatar: string | null;
  idle_avatar: string | null;
  template_skills_json?: string | null;
  instance_skills_json?: string | null;
  instance_quality: string | null;
  instance_growth_template: string | null;
  instance_realm: string | null;
  instance_bonus_json: string | null;
}

/**
 * 组装单人遭遇的敌方阵容：读取 NPC 实例 + 模板，按实例等级/品质/境界计算属性。
 * 等级优先取 battle_member_levels["0"]（兼容历史数据），否则取 battle_level。
 */
async function loadSoloEncounterEnemy(
  db: D1Database,
  npc: EncounterNpcRef
): Promise<{ group: CombatGroupMeta; enemyTeam: CombatFighter[] }> {
  const row = await db
    .prepare(
      `SELECT i.npc_id AS npc_instance_id, i.name, i.avatar,
              i.quality AS instance_quality,
              i.growth_template AS instance_growth_template,
              i.realm AS instance_realm,
              i.bonus_json AS instance_bonus_json,
              i.skills_json AS instance_skills_json,
              t.idle_avatar,
              t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
              t.base_matk, t.base_mdef, t.base_crit,
              t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
              t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
              t.growth_template, t.quality, t.bonus_json,
              t.skills_json AS template_skills_json
       FROM npc_instances i
       JOIN npc_templates t ON t.id = i.template_id
       WHERE i.npc_id = ? AND i.status = 'ACTIVE'`
    )
    .bind(npc.id)
    .first<SoloEncounterRow>();

  if (!row) {
    throw new Error(`强敌【${npc.name || npc.id}】的模板不存在或已下线，无法迎战`);
  }

  const levelOverrides = normalizeNpcBattleMemberLevels(npc.battle_member_levels_json);
  const level = Math.max(1, Number(levelOverrides['0'] ?? npc.battle_level) || 1);

  const final = calculateNpcAttributesFromRows({
    template: row,
    instance: {
      quality: row.instance_quality,
      growth_template: row.instance_growth_template,
      realm: row.instance_realm,
      bonus_json: row.instance_bonus_json,
    },
    realm: row.instance_realm,
    level,
  });
  const stats = toNpcCombatStats(final);
  const avatar = row.idle_avatar || row.avatar || '';

  const enemyTeam: CombatFighter[] = [
    {
      id: row.npc_instance_id,
      name: row.name,
      avatar,
      idleAvatar: avatar || undefined,
      camp: 'ENEMY',
      position: 'FRONT',
      slotIndex: 0,
      hp: stats.hp,
      maxHp: stats.maxHp,
      mp: stats.mp,
      maxMp: stats.maxMp,
      rage: 0,
      maxRage: 100,
      attack: stats.attack,
      matk: stats.matk,
      defense: stats.defense,
      mdef: stats.mdef,
      speed: stats.speed,
      critRate: stats.critRate,
      critDmg: 2,
      level: stats.level,
      quality: stats.quality,
      growthTemplate: stats.growthTemplateId,
      skills: resolveNpcFighterSkills(row.instance_skills_json, row.template_skills_json),
      isAlive: true,
      buffs: createBuffs(),
      // 单人遭遇只有一名敌人，直接作为战斗焦点（镜头/头领标记）
      isActionActive: true,
    },
  ];

  return { group: { id: npc.id, name: row.name }, enemyTeam };
}

/**
 * 统一读取地图 NPC 的敌方阵容：
 * - 绑定战斗配置 -> 走 monster_group_members 多敌阵容；
 * - 未绑定战斗配置 -> 单人遭遇，NPC 自身模板即唯一敌人。
 */
export async function loadEncounterEnemies(
  db: D1Database,
  npc: EncounterNpcRef,
  memberLevelOverrides?: NpcBattleMemberLevels | null
): Promise<{ group: CombatGroupMeta; enemyTeam: CombatFighter[] }> {
  if (isSoloEncounter(npc)) {
    return loadSoloEncounterEnemy(db, npc);
  }
  if (!npc.battle_group_id) {
    throw new Error(`强敌【${npc.name || npc.id}】尚未配置战斗阵容`);
  }
  return loadMonsterGroup(db, npc.battle_group_id, memberLevelOverrides);
}

/**
 * 组装一场战斗所需的双方阵容
 */
export async function prepareCombat(
  db: D1Database,
  playerId: string,
  monsterGroupId: string,
  memberLevelOverrides?: NpcBattleMemberLevels | null
): Promise<PreparedCombat> {
  const [playerTeam, { group, enemyTeam }, skills] = await Promise.all([
    buildPlayerTeam(db, playerId),
    loadMonsterGroup(db, monsterGroupId, memberLevelOverrides),
    loadCombatSkills(db),
  ]);
  return { group, playerTeam, enemyTeam, skills };
}


/** 战斗单位 -> 服务端结算引擎的战斗者 */
function toEngineFighter(
  f: CombatFighter,
  isAlly: boolean,
  equippedSkills?: string[]
): Fighter {
  return {
    id: f.id,
    name: f.name,
    realm: '',
    hp: f.hp,
    maxHp: f.maxHp,
    mp: f.mp,
    maxMp: f.maxMp,
    outerAttack: f.attack,
    innerAttack: f.matk ?? f.attack,
    outerDefense: f.defense,
    innerDefense: f.mdef ?? f.defense,
    critRate: f.critRate ?? 0.25,
    critDmg: f.critDmg ?? 2,
    speed: f.speed,
    buffs: [],
    // 未显式装配时保持旧行为：我方纯阳剑煞，敌方普攻。
    equippedSkills: equippedSkills ?? (isAlly ? ['skill_pure_yang_sword'] : []),
  };
}

export interface SettleCombatResult {
  result: 'WIN' | 'LOSE';
  group: { id: string; name: string };
  roundsCount: number;
  script: CombatScriptEvent[];
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  winNodeId?: string;
  loseNodeId?: string;
  battleId: string;
  position: { zoneId: string; areaId: string };
}

/**
 * 服务端战斗结算：以数据库中的真实阵容跑一遍队伍对决，
 * 并在同一事务里落库（位置归一化、战报、胜负 Flag）。
 * 前端只负责演出，胜负与奖励资格以本结果为准。
 */
export async function settleCombat(
  db: D1Database,
  playerId: string,
  monsterGroupId: string,
  winNodeId?: string,
  loseNodeId?: string
): Promise<SettleCombatResult> {
  const { group, playerTeam, enemyTeam } = await prepareCombat(db, playerId, monsterGroupId);

  const allies = playerTeam.map((f) => toEngineFighter(f, true));
  const enemies = enemyTeam.map((f) => toEngineFighter(f, false));
  const simulation = new CombatEngine().simulateTeamBattle(allies, enemies);

  const player = await db
    .prepare('SELECT id, zone_id, area_id FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ id: string; zone_id: string; area_id: string }>();

  if (!player) {
    throw new Error('修仙者不存在或尚未建立玉牒');
  }

  // 位置归一化：以玩家当前场景的 scenes.zone_id 为准，避免历史脏数据
  const scene = await db
    .prepare('SELECT id, zone_id FROM scenes WHERE id = ?')
    .bind(player.area_id)
    .first<{ id: string; zone_id: string }>();

  const finalAreaId = scene?.id || player.area_id || 'square';
  const finalZoneId = scene?.zone_id || player.zone_id || 'changle_city';

  const battleId = `combat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // 胜负 Flag 以怪物组为维度，供剧情节点做入口/领奖前置条件
  const flagKey = `flag_${monsterGroupId}_${simulation.result === 'WIN' ? 'win' : 'lose'}`;

  await db.batch([
    db
      .prepare('UPDATE players SET zone_id = ?, area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(finalZoneId, finalAreaId, playerId),
    db
      .prepare(
        `INSERT INTO combat_logs (id, attacker_id, defender_id, winner_id, battle_type, rounds_count, battle_details)
         VALUES (?, ?, ?, ?, 'ARENA', ?, ?)`
      )
      .bind(
        battleId,
        playerId,
        monsterGroupId,
        simulation.result === 'WIN' ? playerId : monsterGroupId,
        simulation.roundsCount,
        JSON.stringify(simulation.logs)
      ),
    db
      .prepare(
        `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, flag_key)
         DO UPDATE SET flag_value = 1, updated_at = excluded.updated_at`
      )
      .bind(playerId, flagKey),
  ]);

  // 战报 -> 前端可逐条播放的演出脚本
  const script: CombatScriptEvent[] = toCombatScriptEvents(simulation.logs);

  return {
    result: simulation.result,
    group,
    roundsCount: simulation.roundsCount,
    script,
    playerTeam,
    enemyTeam,
    winNodeId,
    loseNodeId,
    battleId,
    position: { zoneId: finalZoneId, areaId: finalAreaId },
  };
}

export interface SettleEncounterResult {
  result: 'WIN' | 'LOSE';
  group: CombatGroupMeta;
  roundsCount: number;
  script: CombatScriptEvent[];
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  battleId: string;
  npc: {
    id: string;
    name: string;
    title: string;
    avatar: string;
    sceneId: string;
    battleLevel: number;
  };
  rewards?: {
    exp: number;
    /** 铜钱（沿用既有 ADD_EXP_OR_GOLD 的 gold -> players.copper 约定） */
    gold: number;
    /** 纹银（players.silver） */
    silver: number;
    items: Array<{ id: string; name: string; count: number }>;
  };
  toasts: string[];
}

/**
 * 判断玩家当前所在场景是否可达目标场景。
 * 规则：目标场景等于当前场景，或目标场景是当前场景的祖先（最多回溯 4 层）。
 * 这样既能防止跨场景远程开战，也允许在坊市里与都城级 NPC 交互。
 */
async function isNpcSceneReachable(
  db: D1Database,
  playerAreaId: string,
  npcSceneId: string
): Promise<boolean> {
  const current = (playerAreaId || '').toLowerCase();
  const target = (npcSceneId || '').toLowerCase();
  if (!current || !target) return false;
  if (current === target) return true;

  let cursor = current;
  for (let depth = 0; depth < 4; depth++) {
    const row = await db
      .prepare('SELECT parent_id FROM scenes WHERE id = ?')
      .bind(cursor)
      .first<{ parent_id: string | null }>();
    const parent = (row?.parent_id || '').toLowerCase();
    if (!parent) return false;
    if (parent === target) return true;
    cursor = parent;
  }
  return false;
}

/**
 * 校验玩家与 NPC 的直战资格（位置、类型、CD、首杀一次性标记）
 */
async function validateEncounterEligibility(
  db: D1Database,
  playerId: string,
  npcId: string,
  options?: { ignoreLocation?: boolean; allowStoryBattle?: boolean }
): Promise<{ player: any; npc: any }> {
  const player = await db
    .prepare('SELECT id, zone_id, area_id FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ id: string; zone_id: string; area_id: string }>();

  if (!player) {
    throw new Error('修仙者不存在或尚未建立玉牒');
  }

  const npc = await db
    .prepare(`
      SELECT n.npc_id AS id, n.name, n.title, n.avatar, n.scene_id, n.type,
             n.template_id, n.battle_group_id, n.battle_level,
             n.battle_member_levels_json,
             n.battle_reward_json, n.respawn_seconds, n.once_flag, n.npc_role,
             t.name AS template_name, t.title AS template_title, t.avatar AS template_avatar
      FROM npc_instances n
      LEFT JOIN npc_templates t ON t.id = n.template_id
      WHERE n.npc_id = ?
        AND n.status = 'ACTIVE'
        AND (
          n.npc_role = 'MAP'
          OR (n.npc_role = 'STORY_BATTLE' AND ? = 1)
        )
    `)
    .bind(npcId, options?.allowStoryBattle ? 1 : 0)
    .first<any>();

  if (!npc) {
    throw new Error(`未寻得此江湖强敌 [${npcId}]`);
  }

  const effectiveName = npc.name || npc.template_name || npcId;
  // 战斗型 NPC 允许不绑定战斗配置：此时按「单人遭遇」用自身模板上阵。
  if (npc.type !== 'battle' || (!npc.battle_group_id && !npc.template_id)) {
    throw new Error(`此人物【${effectiveName}】非挑战型强敌或尚未部署战斗阵容`);
  }

  if (
    npc.npc_role !== 'STORY_BATTLE' &&
    !options?.ignoreLocation &&
    !(await isNpcSceneReachable(db, player.area_id, npc.scene_id))
  ) {
    throw new Error(`道友当前不在【${npc.scene_id}】场景，无法凌空拔剑迎战`);
  }

  const now = Date.now();

  // 1. 一次性击败标记校验
  if (npc.once_flag) {
    const flagRow = await db
      .prepare('SELECT flag_value FROM player_dialogue_flags WHERE player_id = ? AND flag_key = ?')
      .bind(playerId, npc.once_flag)
      .first<any>();
    if (flagRow && Number(flagRow.flag_value) === 1) {
      throw new Error(`强敌【${effectiveName}】已被道友诛灭，不可重复挑战`);
    }
  }

  // 2. 重生冷却校验
  if (Number(npc.respawn_seconds) > 0) {
    const encRow = await db
      .prepare('SELECT last_defeat_at FROM player_encounter_state WHERE player_id = ? AND npc_id = ?')
      .bind(playerId, npc.id)
      .first<any>();
    if (encRow && encRow.last_defeat_at) {
      const elapsedSec = Math.floor((now - Number(encRow.last_defeat_at)) / 1000);
      if (elapsedSec < Number(npc.respawn_seconds)) {
        const remaining = Number(npc.respawn_seconds) - elapsedSec;
        throw new Error(`强敌【${effectiveName}】尚在调息疗伤中，重生倒计时还有 ${remaining} 秒`);
      }
    }
  }

  return { player, npc: { ...npc, display_name: effectiveName } };
}

/**
 * 组装地图 NPC 遭遇的双方阵容（多敌战阵 / 单人遭遇共用）。
 */
async function prepareNpcEncounterCombat(
  db: D1Database,
  playerId: string,
  npc: EncounterNpcRef
): Promise<{
  group: CombatGroupMeta;
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  skills: CombatSkillInfo[];
}> {
  const memberLevelOverrides = normalizeNpcBattleMemberLevels(npc.battle_member_levels_json);
  const [playerTeam, { group, enemyTeam }, skills] = await Promise.all([
    buildPlayerTeam(db, playerId),
    loadEncounterEnemies(db, npc, memberLevelOverrides),
    loadCombatSkills(db),
  ]);
  return { group, playerTeam, enemyTeam, skills };
}

/**
 * 野怪/地图 NPC 直战准备：组装双方阵容
 */
export async function prepareEncounterCombat(
  db: D1Database,
  playerId: string,
  npcId: string
): Promise<{
  group: CombatGroupMeta;
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  npc: {
    id: string;
    name: string;
    title: string;
    avatar: string;
    sceneId: string;
    battleLevel: number;
  };
}> {
  const { npc } = await validateEncounterEligibility(db, playerId, npcId);
  const { group, playerTeam, enemyTeam } = await prepareNpcEncounterCombat(db, playerId, npc);

  return {
    group,
    playerTeam,
    enemyTeam,
    npc: {
      id: npc.id,
      name: npc.display_name || npc.template_name || npc.name,
      title: npc.title || npc.template_title || '',
      avatar: npc.avatar || npc.template_avatar || '',
      sceneId: npc.scene_id,
      battleLevel: Number(npc.battle_level) || 1,
    },
  };
}

// ---------------------------------------------------------------------------
// 实时回合制 PvE（剧情战 / 地图 NPC 遭遇）
// 与切磋共用 DuelSession 引擎与操作面板，但只由玩家提交指令，敌方由 AI 自动出招。
// ---------------------------------------------------------------------------

export interface PveEncounterNpcMeta {
  id: string;
  name: string;
  title: string;
  avatar: string;
  sceneId: string;
  battleLevel: number;
  /** 一次性击败标记；为空表示可重复挑战 */
  onceFlag: string | null;
  /** 原始奖励配置（仅服务端落库使用） */
  battleRewardJson: string | null;
}

export interface PveRewardItemInternal {
  id: string;
  name: string;
  count: number;
  type: string;
  quality: string;
}

export interface PveEncounterRewardsInternal {
  exp: number;
  gold: number;
  silver: number;
  items: PveRewardItemInternal[];
}

export interface PveStoryContext {
  packageId: string;
  nodeId: string;
  completeOnFinish: boolean;
}

export interface PveSetup {
  battleId: string;
  battleType: 'DIALOGUE' | 'ENCOUNTER';
  group: CombatGroupMeta;
  skills: CombatSkillInfo[];
  /** 客户端展示阵容 */
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  /** 服务端引擎战斗者 */
  playerFighters: Fighter[];
  enemyFighters: Fighter[];
  winNodeId?: string;
  loseNodeId?: string;
  npc?: PveEncounterNpcMeta;
  rewards?: PveEncounterRewardsInternal;
  storyContext?: PveStoryContext;
}

/** 敌方 AI / 超时托管可自动选择的单体输出技能 */
function autoSkillIdsOf(skills: CombatSkillInfo[]): string[] {
  return skills
    .filter((skill) => skill.targetType === 'SINGLE_ENEMY')
    .map((skill) => skill.id);
}

function buildPveSetup(input: {
  battleId: string;
  battleType: 'DIALOGUE' | 'ENCOUNTER';
  group: CombatGroupMeta;
  skills: CombatSkillInfo[];
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  winNodeId?: string;
  loseNodeId?: string;
  npc?: PveEncounterNpcMeta;
  rewards?: PveEncounterRewardsInternal;
  storyContext?: PveStoryContext;
}): PveSetup {
  const autoSkillIds = autoSkillIdsOf(input.skills);
  return {
    ...input,
    playerFighters: input.playerTeam.map((f) =>
      toEngineFighter(f, true, f.skills && f.skills.length > 0 ? f.skills : autoSkillIds)
    ),
    // PvE 敌方技能：若实例/模板明确配置了技能，则使用已装配技能；否则默认普攻，保证平衡性
    enemyFighters: input.enemyTeam.map((f) =>
      toEngineFighter(
        f,
        false,
        f.skills && f.skills.length > 0 ? f.skills : ['skill_basic_attack']
      )
    ),
  };
}

/**
 * 剧情战准备：只组装阵容与技能，不提前推演胜负。
 * 玩家每回合通过 PVE_ACTION 提交指令，服务端 DuelSession 结算。
 */
export async function preparePveDialogue(
  db: D1Database,
  playerId: string,
  monsterGroupId: string,
  winNodeId?: string,
  loseNodeId?: string,
  storyContext?: PveStoryContext
): Promise<PveSetup> {
  const { group, playerTeam, enemyTeam, skills } = await prepareCombat(
    db,
    playerId,
    monsterGroupId
  );

  return buildPveSetup({
    battleId: `pve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    battleType: 'DIALOGUE',
    group,
    skills,
    playerTeam,
    enemyTeam,
    winNodeId,
    loseNodeId,
    storyContext,
  });
}

/**
 * 地图 NPC 遭遇战准备：校验位置/冷却/一次性标记，解析奖励，但不写任何击败状态。
 * 真正的中奖与击杀记录在战斗结束后的 persistPveEncounterResult 中落库。
 */
export async function preparePveEncounter(
  db: D1Database,
  playerId: string,
  npcId: string,
  options?: {
    winNodeId?: string;
    loseNodeId?: string;
    ignoreLocation?: boolean;
    allowStoryBattle?: boolean;
    storyContext?: PveStoryContext;
  }
): Promise<PveSetup> {
  const { npc } = await validateEncounterEligibility(db, playerId, npcId, {
    ignoreLocation: options?.ignoreLocation,
    allowStoryBattle: options?.allowStoryBattle,
  });
  const { group, playerTeam, enemyTeam, skills } = await prepareNpcEncounterCombat(
    db,
    playerId,
    npc
  );

  // 奖励先解析/校验，配置有误时直接失败，避免玩家打完才看到错误
  const rewardConfig = parseEncounterRewardConfig(npc.battle_reward_json);
  const rewardItems = await resolveEncounterRewardItems(db, rewardConfig.items);

  return buildPveSetup({
    battleId: `pve_encounter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    battleType: 'ENCOUNTER',
    group,
    skills,
    playerTeam,
    enemyTeam,
    winNodeId: options?.winNodeId,
    loseNodeId: options?.loseNodeId,
    storyContext: options?.storyContext,
    npc: {
      id: npc.id,
      name: npc.display_name || npc.template_name || npc.name,
      title: npc.title || npc.template_title || '',
      avatar: npc.avatar || npc.template_avatar || '',
      sceneId: npc.scene_id,
      battleLevel: Number(npc.battle_level) || 1,
      onceFlag: npc.once_flag || null,
      battleRewardJson: npc.battle_reward_json || null,
    },
    rewards: {
      exp: rewardConfig.exp,
      gold: rewardConfig.gold,
      silver: rewardConfig.silver,
      items: rewardItems,
    },
  });
}

export interface PveDialoguePersistInput {
  playerId: string;
  monsterGroupId: string;
  result: 'WIN' | 'LOSE';
  battleId: string;
  roundsCount: number;
  logs: RoundLog[];
  storyContext?: PveStoryContext;
}

export async function completeStoryAfterBattle(
  db: D1Database,
  playerId: string,
  storyContext?: PveStoryContext
): Promise<void> {
  if (!storyContext?.completeOnFinish) return;
  await upsertStoryProgress(
    db,
    playerId,
    storyContext.packageId,
    storyContext.nodeId,
    'COMPLETED'
  );
  await hidePlayerStoryNpcs(db, playerId, storyContext.packageId);
}

/**
 * 剧情战结束落库：位置归一化 + combat_logs + 胜负 Flag。
 * 不重新推演战斗，直接使用实时回合制产生的最终结果。
 */
export async function persistPveDialogueResult(
  db: D1Database,
  input: PveDialoguePersistInput
): Promise<{ position: { zoneId: string; areaId: string } }> {
  const player = await db
    .prepare('SELECT id, zone_id, area_id FROM players WHERE id = ?')
    .bind(input.playerId)
    .first<{ id: string; zone_id: string; area_id: string }>();

  if (!player) {
    throw new Error('修仙者不存在或尚未建立玉牒');
  }

  // 位置归一化：以玩家当前场景的 scenes.zone_id 为准，避免历史脏数据
  const scene = await db
    .prepare('SELECT id, zone_id FROM scenes WHERE id = ?')
    .bind(player.area_id)
    .first<{ id: string; zone_id: string }>();

  const finalAreaId = scene?.id || player.area_id || 'square';
  const finalZoneId = scene?.zone_id || player.zone_id || 'changle_city';
  const flagKey = `flag_${input.monsterGroupId}_${input.result === 'WIN' ? 'win' : 'lose'}`;

  await db.batch([
    db
      .prepare(
        input.result === 'LOSE'
          ? 'UPDATE players SET zone_id = ?, area_id = ?, hp = MAX(1, CAST(max_hp * 0.1 AS INTEGER)), mp = MAX(1, CAST(max_mp * 0.1 AS INTEGER)), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          : 'UPDATE players SET zone_id = ?, area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(finalZoneId, finalAreaId, input.playerId),
    db
      .prepare(
        `INSERT INTO combat_logs (id, attacker_id, defender_id, winner_id, battle_type, rounds_count, battle_details)
         VALUES (?, ?, ?, ?, 'ARENA', ?, ?)`
      )
      .bind(
        input.battleId,
        input.playerId,
        input.monsterGroupId,
        input.result === 'WIN' ? input.playerId : input.monsterGroupId,
        input.roundsCount,
        JSON.stringify(input.logs)
      ),
    db
      .prepare(
        `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, flag_key)
         DO UPDATE SET flag_value = 1, updated_at = excluded.updated_at`
      )
      .bind(input.playerId, flagKey),
  ]);

  await completeStoryAfterBattle(db, input.playerId, input.storyContext);

  return { position: { zoneId: finalZoneId, areaId: finalAreaId } };
}

export interface PveEncounterPersistInput {
  playerId: string;
  battleId: string;
  result: 'WIN' | 'LOSE';
  roundsCount: number;
  logs: RoundLog[];
  npc: PveEncounterNpcMeta;
  rewards?: PveEncounterRewardsInternal;
  storyContext?: PveStoryContext;
}

/**
 * 地图 NPC 遭遇战结束落库。
 * 胜利时写入击杀计数、一次性标记、经验/铜钱/纹银与战利品；
 * 无论胜负都写入 combat_logs。
 */
export async function persistPveEncounterResult(
  db: D1Database,
  input: PveEncounterPersistInput
): Promise<{ toasts: string[]; rewards?: PveEncounterRewardsInternal }> {
  const statements: D1PreparedStatement[] = [];
  const toasts: string[] = [];
  const now = Date.now();

  if (input.result === 'WIN') {
    // 1. 击杀计数 + 时间戳
    statements.push(
      db
        .prepare(
          `INSERT INTO player_encounter_state (player_id, npc_id, defeat_count, last_defeat_at, updated_at)
           VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(player_id, npc_id)
           DO UPDATE SET defeat_count = defeat_count + 1, last_defeat_at = excluded.last_defeat_at, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(input.playerId, input.npc.id, now)
    );

    // 2. 一次性击败标记
    if (input.npc.onceFlag) {
      statements.push(
        db
          .prepare(
            `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
             VALUES (?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(player_id, flag_key)
             DO UPDATE SET flag_value = 1, updated_at = excluded.updated_at`
          )
          .bind(input.playerId, input.npc.onceFlag)
      );
    }

    const rewards = input.rewards;
    if (rewards) {
      if (rewards.gold > 0 || rewards.silver > 0) {
        statements.push(
          db
            .prepare(
              `UPDATE players
               SET copper = copper + ?, silver = silver + ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`
            )
            .bind(rewards.gold, rewards.silver, input.playerId)
        );
        if (rewards.gold > 0) toasts.push(`收获敌方灵囊，铜钱 +${rewards.gold}`);
        if (rewards.silver > 0) toasts.push(`缴获敌手财物，纹银 +${rewards.silver}`);
      }

      if (rewards.exp > 0) {
        try {
          const expResult = await experienceService.addExperience(db, input.playerId, rewards.exp, {
            suppressWsNotification: true,
          });
          toasts.push(...expResult.toasts);
        } catch (err) {
          console.warn('[combatDb] 论道战斗经验增加异常:', err);
        }
      }
    }

    if (rewards) {
      for (const item of rewards.items) {
        const invId = `inv_${input.playerId}_${item.id}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        statements.push(
          db
            .prepare(
              `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
            )
            .bind(
              invId,
              input.playerId,
              item.id,
              item.name,
              item.type,
              item.count,
              item.quality
            )
        );
        toasts.push(`获得战利信物：【${item.name}】x${item.count}`);
      }
    }
  } else if (input.result === 'LOSE') {
    // 遭遇战力战惜败：负伤伤势加重，速回悬壶馆找孙真人调养
    statements.push(
      db
        .prepare(
          `UPDATE players
           SET hp = MAX(1, CAST(max_hp * 0.1 AS INTEGER)), mp = MAX(1, CAST(max_mp * 0.1 AS INTEGER)), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(input.playerId)
    );
  }

  // 3. 战斗日志
  statements.push(
    db
      .prepare(
        `INSERT INTO combat_logs (id, attacker_id, defender_id, winner_id, battle_type, rounds_count, battle_details)
         VALUES (?, ?, ?, ?, 'ENCOUNTER', ?, ?)`
      )
      .bind(
        input.battleId,
        input.playerId,
        input.npc.id,
        input.result === 'WIN' ? input.playerId : input.npc.id,
        input.roundsCount,
        JSON.stringify(input.logs)
      )
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }

  await completeStoryAfterBattle(db, input.playerId, input.storyContext);

  return {
    toasts,
    rewards: input.result === 'WIN' ? input.rewards : undefined,
  };
}

interface EncounterRewardConfig {
  exp: number;
  /** 铜钱 */
  gold: number;
  /** 纹银 */
  silver: number;
  items: Array<{ id: string; count: number }>;
}

interface ResolvedRewardItem {
  id: string;
  name: string;
  count: number;
  type: string;
  quality: string;
}

function parseEncounterRewardConfig(rawJson: string | null | undefined): EncounterRewardConfig {
  const fallback: EncounterRewardConfig = { exp: 0, gold: 0, silver: 0, items: [] };
  if (!rawJson) return fallback;

  try {
    const raw = JSON.parse(rawJson);
    const items = Array.isArray(raw.items)
      ? raw.items
          .map((it: any) => ({
            id: String(it?.id || '').trim(),
            count: Math.max(1, Number(it?.count) || 1),
          }))
          .filter((it: { id: string }) => Boolean(it.id))
      : [];

    return {
      exp: Math.max(0, Number(raw.exp) || 0),
      gold: Math.max(0, Number(raw.gold ?? raw.copper) || 0),
      silver: Math.max(0, Number(raw.silver) || 0),
      items,
    };
  } catch {
    return fallback;
  }
}

/**
 * 奖励道具必须能在 item_templates 中查到；查不到直接抛错，避免把脏数据塞进背包。
 */
async function resolveEncounterRewardItems(
  db: D1Database,
  items: Array<{ id: string; count: number }>
): Promise<ResolvedRewardItem[]> {
  if (items.length === 0) return [];

  const ids = Array.from(new Set(items.map((it) => it.id)));
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT id, name, type, quality FROM item_templates WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: string; name: string; type: string; quality: string }>();

  const templateMap = new Map((results || []).map((row) => [row.id, row]));
  return items.map((it) => {
    const template = templateMap.get(it.id);
    if (!template) {
      throw new Error(`奖励配置包含未备案道具 [${it.id}]，请先在道具库中补录`);
    }
    return {
      id: it.id,
      name: template.name,
      count: it.count,
      type: template.type,
      quality: template.quality,
    };
  });
}

/**
 * 野怪/地图 NPC 直战结算：整场推演 + 落库状态与奖励
 */
export async function settleEncounterCombat(
  db: D1Database,
  playerId: string,
  npcId: string
): Promise<SettleEncounterResult> {
  const { npc } = await validateEncounterEligibility(db, playerId, npcId);
  const { group, playerTeam, enemyTeam } = await prepareNpcEncounterCombat(
    db,
    playerId,
    npc
  );

  // 奖励先解析/校验，配置有误时直接失败，不让玩家白看一场演出
  const rewardConfig = parseEncounterRewardConfig(npc.battle_reward_json);
  const rewardItems = await resolveEncounterRewardItems(db, rewardConfig.items);
  const parsedRewards = {
    exp: rewardConfig.exp,
    gold: rewardConfig.gold,
    silver: rewardConfig.silver,
    items: rewardItems.map((it) => ({ id: it.id, name: it.name, count: it.count })),
  };

  const allies = playerTeam.map((f) => toEngineFighter(f, true));
  const enemies = enemyTeam.map((f) => toEngineFighter(f, false));
  const simulation = new CombatEngine().simulateTeamBattle(allies, enemies);

  const battleId = `encounter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const toasts: string[] = [];

  if (simulation.result === 'WIN') {
    // 1. 写入遭遇战击败状态（击杀计数 + 时间戳）
    statements.push(
      db
        .prepare(
          `INSERT INTO player_encounter_state (player_id, npc_id, defeat_count, last_defeat_at, updated_at)
           VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(player_id, npc_id)
           DO UPDATE SET defeat_count = defeat_count + 1, last_defeat_at = excluded.last_defeat_at, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(playerId, npc.id, now)
    );

    // 2. 一次性击败标记写入
    if (npc.once_flag) {
      statements.push(
        db
          .prepare(
            `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
             VALUES (?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(player_id, flag_key)
             DO UPDATE SET flag_value = 1, updated_at = excluded.updated_at`
          )
          .bind(playerId, npc.once_flag)
      );
    }

    // 3. 胜利战利品发放（经验 + 铜钱 + 纹银）
    if (parsedRewards.gold > 0 || parsedRewards.silver > 0) {
      statements.push(
        db
          .prepare(
            `UPDATE players
             SET copper = copper + ?, silver = silver + ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .bind(parsedRewards.gold, parsedRewards.silver, playerId)
      );
      if (parsedRewards.gold > 0) toasts.push(`收获敌方灵囊，铜钱 +${parsedRewards.gold}`);
      if (parsedRewards.silver > 0) toasts.push(`缴获敌手财物，纹银 +${parsedRewards.silver}`);
    }

    if (parsedRewards.exp > 0) {
      try {
        const expResult = await experienceService.addExperience(db, playerId, parsedRewards.exp);
        toasts.push(...expResult.toasts);
      } catch (err) {
        console.warn('[combatDb] 遭遇战经验发放异常:', err);
      }
    }

    // 4. 战利品道具入库（名称/类型/品阶全部取自 item_templates）
    for (const item of rewardItems) {
      const invId = `inv_${playerId}_${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      statements.push(
        db
          .prepare(
            `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
          )
          .bind(invId, playerId, item.id, item.name, item.type, item.count, item.quality)
      );
      toasts.push(`获得战利信物：【${item.name}】x${item.count}`);
    }
  } else {
    // 遭遇战演武战败：负伤调养
    statements.push(
      db
        .prepare(
          `UPDATE players
           SET hp = MAX(1, CAST(max_hp * 0.1 AS INTEGER)), mp = MAX(1, CAST(max_mp * 0.1 AS INTEGER)), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(playerId)
    );
  }

  // 5. 战斗日志持久化
  statements.push(
    db
      .prepare(
        `INSERT INTO combat_logs (id, attacker_id, defender_id, winner_id, battle_type, rounds_count, battle_details)
         VALUES (?, ?, ?, ?, 'ENCOUNTER', ?, ?)`
      )
      .bind(
        battleId,
        playerId,
        npc.id,
        simulation.result === 'WIN' ? playerId : npc.id,
        simulation.roundsCount,
        JSON.stringify(simulation.logs)
      )
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }

  const script: CombatScriptEvent[] = toCombatScriptEvents(simulation.logs);

  return {
    result: simulation.result,
    group,
    roundsCount: simulation.roundsCount,
    script,
    playerTeam,
    enemyTeam,
    battleId,
    npc: {
      id: npc.id,
      name: npc.display_name || npc.template_name || npc.name,
      title: npc.title || npc.template_title || '',
      avatar: npc.avatar || npc.template_avatar || '',
      sceneId: npc.scene_id,
      battleLevel: Number(npc.battle_level) || 1,
    },
    rewards: simulation.result === 'WIN' ? parsedRewards : undefined,
    toasts,
  };
}

export interface DuelParticipantInfo {
  id: string;
  name: string;
  avatar?: string;
  level: number;
  realm?: string;
  combatPower: number;
}

/** 单侧切磋阵容（引擎战斗者 + 客户端展示阵容） */
export interface DuelSideSetup {
  info: DuelParticipantInfo;
  /** 服务端结算引擎使用的战斗者 */
  fighters: Fighter[];
  /**
   * 下发给客户端的阵容。
   * 发起方视角：camp = PLAYER；应战方视角：需要由 ZoneDO 交换 camp。
   */
  view: CombatFighter[];
}

export interface DuelSetup {
  battleId: string;
  skills: CombatSkillInfo[];
  challenger: DuelSideSetup;
  target: DuelSideSetup;
}

/** 切磋基础血量倍率：以攻击力为基准，保证双方能交手多个回合 */
const DUEL_HP_PER_ATTACK = 10;
/** 切磋基础内力下限，避免伙伴开局就只能平A */
const DUEL_MIN_MP = 900;

function applyDuelStats(
  team: CombatFighter[],
  prefix: 'A' | 'B',
  camp: CombatCamp
): CombatFighter[] {
  return team.map((f, index) => {
    const attack = Math.max(1, Number(f.attack) || 1);
    const maxHp = Math.max(Number(f.maxHp) || 1, Math.round(attack * DUEL_HP_PER_ATTACK));
    const maxMp = Math.max(Number(f.maxMp) || 0, DUEL_MIN_MP);
    return {
      ...f,
      id: `${prefix}:${f.id}`,
      camp,
      slotIndex: index,
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      isAlive: true,
    } satisfies CombatFighter;
  });
}

interface CombatSkillRow {
  skill_key: string;
  name: string;
  description: string | null;
  cost_mp: number;
  target_type: string;
  skill_kind: string;
}

const COMBAT_TARGET_TYPES: CombatSkillTargetType[] = [
  'SINGLE_ENEMY',
  'SINGLE_ALLY',
  'SELF',
  'ALL_ENEMIES',
  'ALL_ALLIES',
];

const COMBAT_SKILL_KINDS: CombatSkillKind[] = ['DAMAGE', 'HEAL', 'BUFF', 'DEBUFF'];

let combatSkillWarningLogged = false;

function normalizeTargetType(value: string | null | undefined): CombatSkillTargetType {
  return COMBAT_TARGET_TYPES.includes(value as CombatSkillTargetType)
    ? (value as CombatSkillTargetType)
    : 'SINGLE_ENEMY';
}

function normalizeSkillKind(value: string | null | undefined): CombatSkillKind {
  return COMBAT_SKILL_KINDS.includes(value as CombatSkillKind)
    ? (value as CombatSkillKind)
    : 'DAMAGE';
}

/**
 * 读取数据库技能表；未迁移/为空时回退到内置 DUEL_SKILLS。
 * 目标类型由 combat_skills.target_type 驱动，新增技能只需加行 + 注册策略。
 */
async function loadCombatSkills(db: D1Database): Promise<CombatSkillInfo[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT skill_key, name, description, cost_mp, target_type, skill_kind
         FROM combat_skills
         WHERE is_enabled = 1
         ORDER BY sort_order ASC, skill_key ASC`
      )
      .bind()
      .all<CombatSkillRow>();

    if (results && results.length > 0) {
      return results.map((row) => ({
        id: row.skill_key,
        name: row.name,
        description: row.description || '',
        costMp: Math.max(0, Number(row.cost_mp) || 0),
        targetType: normalizeTargetType(row.target_type),
        kind: normalizeSkillKind(row.skill_kind),
      }));
    }
  } catch (err) {
    if (!combatSkillWarningLogged) {
      console.warn('[combatDb] combat_skills 查询失败，使用内置技能表:', err);
      combatSkillWarningLogged = true;
    }
  }
  return DUEL_SKILLS.map((skill) => ({ ...skill }));
}

/**
 * 切磋开局准备：构建双方实时战斗单位，不再一次性预演整场。
 * - 双方主角/伙伴的 ID 加 A:/B: 前缀，避免两队使用同一伙伴模板时串台；
 * - 以攻击力为基准抬升切磋气血，保证实时回合制能打出多个回合。
 */
export async function prepareDuel(
  db: D1Database,
  challengerId: string,
  targetPlayerId: string
): Promise<DuelSetup> {
  const [challengerRow, targetRow] = await Promise.all([
    db
      .prepare('SELECT id, nickname, avatar, level, realm, combat_power FROM players WHERE id = ?')
      .bind(challengerId)
      .first<PlayerCombatRow>(),
    db
      .prepare('SELECT id, nickname, avatar, level, realm, combat_power FROM players WHERE id = ?')
      .bind(targetPlayerId)
      .first<PlayerCombatRow>(),
  ]);

  if (!challengerRow || !targetRow) {
    throw new Error('切磋双方修仙者档案不存在或尚未建立玉牒');
  }

  const [challengerTeam, targetTeam, skills] = await Promise.all([
    buildPlayerTeam(db, challengerId),
    buildPlayerTeam(db, targetPlayerId),
    loadCombatSkills(db),
  ]);

  const challengerView = applyDuelStats(challengerTeam, 'A', 'PLAYER');
  const targetView = applyDuelStats(targetTeam, 'B', 'ENEMY');

  // 自动 AI 只装配敌方单体技能；我方目标技能由玩家手动选择，避免 AI 乱治疗
  const autoSkillIds = skills
    .filter((skill) => skill.targetType === 'SINGLE_ENEMY')
    .map((skill) => skill.id);

  const toDuelFighter = (f: CombatFighter): Fighter => ({
    ...toEngineFighter(f, true, f.skills && f.skills.length > 0 ? f.skills : autoSkillIds),
  });

  const infoOf = (row: PlayerCombatRow, view: CombatFighter[]): DuelParticipantInfo => ({
    id: row.id,
    name: row.nickname,
    // 切磋 HUD 也优先使用战斗模型，个人头像只用于社交/邀战卡片
    avatar: view[0]?.avatar || row.avatar || undefined,
    level: row.level,
    realm: row.realm || undefined,
    combatPower: row.combat_power,
  });

  return {
    battleId: `duel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    skills,
    challenger: {
      info: infoOf(challengerRow, challengerView),
      fighters: challengerView.map(toDuelFighter),
      view: challengerView,
    },
    target: {
      info: infoOf(targetRow, targetView),
      fighters: targetView.map(toDuelFighter),
      view: targetView,
    },
  };
}

export interface DuelPersistenceInput {
  battleId: string;
  challengerId: string;
  targetPlayerId: string;
  challengerName: string;
  targetName: string;
  winnerId: string;
  roundsCount: number;
  logs: RoundLog[];
}

/**
 * 切磋结束后落库：combat_logs (battle_type = 'DUEL') + 双方【切磋论道】履历。
 */
export async function persistDuelResult(
  db: D1Database,
  input: DuelPersistenceInput
): Promise<void> {
  const challengerWon = input.winnerId === input.challengerId;
  const challengerOutcomeText = challengerWon ? '以半招之优险胜' : '略逊一筹惜败于';
  const targetOutcomeText = challengerWon ? '略逊一筹惜败于' : '以半招之优险胜';

  const challengerContent = `于九州游历之际，与道友【${input.targetName}】拔剑切磋论道，双方斗法激战${input.roundsCount}回合，${challengerOutcomeText}对方，大有所悟。`;
  const targetContent = `于九州游历之际，与道友【${input.challengerName}】拔剑切磋论道，双方斗法激战${input.roundsCount}回合，${targetOutcomeText}对方，大有所悟。`;

  const challengerChronicleId = `chronicle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const targetChronicleId = `chronicle_${Date.now() + 1}_${Math.random().toString(36).slice(2, 6)}`;

  await db.batch([
    db
      .prepare(
        `INSERT INTO combat_logs (id, attacker_id, defender_id, winner_id, battle_type, rounds_count, battle_details)
         VALUES (?, ?, ?, ?, 'DUEL', ?, ?)`
      )
      .bind(
        input.battleId,
        input.challengerId,
        input.targetPlayerId,
        input.winnerId,
        input.roundsCount,
        JSON.stringify(input.logs)
      ),
    db
      .prepare(
        `INSERT INTO player_chronicles (id, player_id, title, year, content, order_index)
         VALUES (?, ?, '【切磋论道】', '天启元年', ?, 0)`
      )
      .bind(challengerChronicleId, input.challengerId, challengerContent),
    db
      .prepare(
        `INSERT INTO player_chronicles (id, player_id, title, year, content, order_index)
         VALUES (?, ?, '【切磋论道】', '天启元年', ?, 0)`
      )
      .bind(targetChronicleId, input.targetPlayerId, targetContent),
  ]);
}

/** 回合日志 -> 前端逐条播放的演出脚本 */
export function toCombatScriptEvents(logs: RoundLog[]): CombatScriptEvent[] {
  return logs.map((log) => ({
    round: log.round,
    attackerId: log.attackerId,
    attackerName: log.attackerName,
    defenderId: log.defenderId,
    defenderName: log.defenderName,
    skillName: log.skillName,
    damage: log.effect.damage,
    heal: log.effect.heal,
    isCrit: log.effect.isCrit,
    defenderHpRemaining: log.defenderHpRemaining,
    logText: log.effect.logText,
  }));
}

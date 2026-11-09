import { D1Database } from '@cloudflare/workers-types';
import { PartyMemberRecord, PlayerRecord } from '../models/types';
import { calculateNpcAttributesFromRows } from '../services/npc/attributes/npcAttributeService';

/**
 * 出战队伍数据访问模块 (partyDb.ts)
 *
 * 数据模型约定：
 * - 出战队伍 = 主角（队长/阵眼，取自 players 表） + party_members 中该玩家的随同伙伴。
 * - party_members 只存伙伴，不再存主角，避免与 players 表的等级/头像产生双份脏数据。
 * - member_key 现在保存具体 npc_instances.npc_id（同一模板可拥有多个实例）。
 * - 每名伙伴以 (player_id, member_key) 唯一，玩家之间互不影响。
 * - is_active 区分"出战"与"休息"：休息的伙伴仍留在队伍列表，但不占出战席位、不参加战斗。
 */

export type PartyRole = 'LEADER' | 'DPS' | 'HEALER' | 'TANK';

/** 队伍人数上限：队长（阵眼）1 人 + 出战伙伴 3 人 */
export const PARTY_MAX_SIZE = 4;

export interface PartyMemberDto {
  id: string;
  name: string;
  title: string;
  avatar: string;
  role: PartyRole;
  realm: string;
  level: number;
  isLeader: boolean;
  isActive: boolean;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  combatPower?: number;
}

/** 数据库行 -> 前端队伍成员视图 */
const toDto = (row: PartyMemberRecord): PartyMemberDto => ({
  id: row.member_key,
  name: row.member_name,
  title: row.title || '',
  avatar: row.avatar || '',
  role: row.role,
  realm: row.realm || '',
  level: row.level,
  isLeader: false,
  isActive: row.is_active === 1,
});

/** 主角（阵眼）永远出战，由 players 表实时合成，不落 party_members */
export const toLeaderDto = (player: PlayerRecord): PartyMemberDto => ({
  id: player.id,
  name: player.nickname,
  title: player.title || '纯阳剑罡·阵眼',
  avatar: player.avatar || '',
  role: 'LEADER',
  realm: player.realm,
  level: player.level,
  isLeader: true,
  isActive: true,
  hp: player.hp,
  maxHp: player.max_hp,
  mp: player.mp,
  maxMp: player.max_mp,
  combatPower: player.combat_power,
});

export const partyDb = {
  /**
   * 读取玩家拥有的全部伙伴（含休息中的），出战的排在前面
   */
  async listByPlayer(db: D1Database, playerId: string): Promise<PartyMemberDto[]> {
    try {
      const { results } = await db
        .prepare(
          `SELECT p.member_key, p.member_name, p.title, p.avatar, p.role, p.realm, p.level, p.is_active, p.sort_order,
                  t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
                  t.base_matk, t.base_mdef, t.base_crit,
                  t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
                  t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
                  t.growth_template, t.quality, t.bonus_json,
                  i.quality AS instance_quality,
                  i.growth_template AS instance_growth_template,
                  i.realm AS instance_realm,
                  i.bonus_json AS instance_bonus_json
           FROM party_members p
           LEFT JOIN npc_instances i ON i.npc_id = p.member_key
           LEFT JOIN npc_templates t ON (t.id = i.template_id OR t.id = p.member_key)
           WHERE p.player_id = ?
           ORDER BY p.is_active DESC, p.sort_order ASC, p.created_at ASC`
        )
        .bind(playerId)
        .all<any>();

      if (!results || results.length === 0) return [];

      return results.map((row: any) => {
        let hp = 10000;
        let maxHp = 10000;
        let mp = 200;
        let maxMp = 200;
        let combatPower = 1000;

        try {
          const attrs = calculateNpcAttributesFromRows({
            template: {
              base_hp: row.base_hp,
              base_mp: row.base_mp,
              base_attack: row.base_attack,
              base_defense: row.base_defense,
              base_speed: row.base_speed,
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
            level: row.level || 1,
            realm: row.realm || row.instance_realm || '练气期',
          });
          hp = attrs.maxHp;
          maxHp = attrs.maxHp;
          mp = attrs.maxMp;
          maxMp = attrs.maxMp;
          combatPower = attrs.combatPower;
        } catch {
          // 容灾忽略
        }

        return {
          id: row.member_key,
          name: row.member_name,
          title: row.title || '',
          avatar: row.avatar || '',
          role: row.role,
          realm: row.realm || '',
          level: row.level,
          isLeader: false,
          isActive: row.is_active === 1,
          hp,
          maxHp,
          mp,
          maxMp,
          combatPower,
        };
      });
    } catch {
      const { results } = await db
        .prepare(
          `SELECT * FROM party_members
           WHERE player_id = ?
           ORDER BY is_active DESC, sort_order ASC, created_at ASC`
        )
        .bind(playerId)
        .all<PartyMemberRecord>();

      return (results || []).map(toDto);
    }
  },

  /**
   * 完整阵容：队长（阵眼） + 全部伙伴
   */
  async getRoster(db: D1Database, leader: PlayerRecord): Promise<PartyMemberDto[]> {
    const companions = await this.listByPlayer(db, leader.id);
    return [toLeaderDto(leader), ...companions];
  },

  /**
   * 查询单个伙伴（用于出战/休息操作前的归属校验）
   */
  async findMember(
    db: D1Database,
    playerId: string,
    memberKey: string
  ): Promise<PartyMemberDto | null> {
    const row = await db
      .prepare('SELECT * FROM party_members WHERE player_id = ? AND member_key = ?')
      .bind(playerId, memberKey)
      .first<PartyMemberRecord>();

    return row ? toDto(row) : null;
  },

  /**
   * 统计当前处于出战状态的伙伴数量（不含队长）
   */
  async countActive(db: D1Database, playerId: string): Promise<number> {
    const row = await db
      .prepare('SELECT COUNT(*) AS count FROM party_members WHERE player_id = ? AND is_active = 1')
      .bind(playerId)
      .first<{ count: number }>();

    return Number(row?.count) || 0;
  },

  /**
   * 切换单个伙伴的出战 / 休息状态
   */
  async setActive(
    db: D1Database,
    playerId: string,
    memberKey: string,
    isActive: boolean
  ): Promise<void> {
    await db
      .prepare(
        `UPDATE party_members
         SET is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE player_id = ? AND member_key = ?`
      )
      .bind(isActive ? 1 : 0, playerId, memberKey)
      .run();
  },
};

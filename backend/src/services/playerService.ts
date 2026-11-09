import { PlayerRecord } from '../models/types';
import { playerDb } from '../db/playerDb';
import { partyDb, PARTY_MAX_SIZE } from '../db/partyDb';
import { calculateNpcAttributesFromRows } from './npc/attributes/npcAttributeService';
import { getRequiredExpForLevel } from './experience';
import { formatPlayerDto } from '../mappers/playerMapper';

export class PlayerServiceError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export const playerService = {
  /**
   * 获取玩家全息资料
   */
  async getMe(db: D1Database, playerId: string) {
    const player = await playerDb.getPlayerById(db, playerId);
    if (!player) {
      throw new PlayerServiceError('修仙者不存在', 404);
    }
    return { player: formatPlayerDto(player) };
  },

  /**
   * 获取玩家进行中的剧情任务
   */
  async getActiveStory(db: D1Database, playerId: string) {
    const { results } = await db.prepare(
      `SELECT psp.package_id, psp.node_id, psp.status, psp.updated_at,
              pk.name AS package_name, pk.category, pk.description AS package_description,
              dn.chapter_title, dn.content, dn.quote_box, dn.scene_id, dn.npc_id,
              s.name AS scene_name
       FROM player_story_progress psp
       JOIN dialogue_packages pk ON pk.id = psp.package_id
       LEFT JOIN dialogue_nodes dn ON dn.id = psp.node_id
       LEFT JOIN scenes s ON s.id = dn.scene_id
       WHERE psp.player_id = ? AND psp.status = 'ACTIVE'
       ORDER BY psp.updated_at DESC`
    )
      .bind(playerId)
      .all<any>();

    const stories: any[] = [];

    for (const row of results || []) {
      let npc: any = null;

      if (row.npc_id) {
        const instance = await db.prepare(
          `SELECT npc_id AS id, key, name, badge, title, avatar, scene_id
           FROM npc_instances
           WHERE (npc_id = ? OR key = ? OR template_id = ?)
             AND instance_type = 'WORLD' AND status = 'ACTIVE'
             AND (owner_player_id IS NULL OR owner_player_id = ?)
           ORDER BY (owner_player_id = ?) DESC, (scene_id = ?) DESC, npc_id ASC
           LIMIT 1`
        )
          .bind(row.npc_id, row.npc_id, row.npc_id, playerId, playerId, row.scene_id || '')
          .first<any>();

        if (instance) {
          npc = instance;
        } else {
          const template = await db.prepare(
            `SELECT id, key, name, badge, title, avatar
             FROM npc_templates
             WHERE id = ? OR key = ?
             LIMIT 1`
          )
            .bind(row.npc_id, row.npc_id)
            .first<any>();
          if (template) npc = template;
        }
      }

      const sceneId =
        row.scene_id === '__hidden__'
          ? null
          : row.scene_id || npc?.scene_id || null;
      let sceneName = row.scene_name || '';
      if (row.scene_id === '__hidden__') {
        sceneName = '剧情过场';
      }
      if (!sceneName && sceneId) {
        const scene = await db.prepare('SELECT name FROM scenes WHERE id = ?')
          .bind(sceneId)
          .first<{ name: string }>();
        sceneName = scene?.name || '';
      }

      stories.push({
        packageId: row.package_id,
        packageName: row.package_name,
        category: row.category || 'STORY',
        packageDescription: row.package_description || '',
        nodeId: row.node_id,
        chapterTitle: row.chapter_title || '',
        content: row.content || '',
        quoteBox: row.quote_box || '',
        sceneId,
        sceneName,
        npc: npc
          ? {
              id: npc.id || row.npc_id,
              key: npc.key || row.npc_id,
              name: npc.name || '',
              badge: npc.badge || '',
              title: npc.title || '',
              avatar: npc.avatar || '',
            }
          : null,
        updatedAt: row.updated_at,
      });
    }

    return { success: true, data: stories };
  },

  /**
   * 获取同道小队列表
   */
  async getParty(db: D1Database, playerId: string) {
    const leader = await playerDb.getPlayerById(db, playerId);
    if (!leader) {
      throw new PlayerServiceError('修仙者不存在', 404);
    }
    const members = await partyDb.getRoster(db, leader);
    return { members };
  },

  /**
   * 切换同道伙伴出战/休息
   */
  async switchPartyMemberActive(db: D1Database, playerId: string, memberKey: string, isActive: boolean) {
    const leader = await playerDb.getPlayerById(db, playerId);
    if (!leader) {
      throw new PlayerServiceError('修仙者不存在', 404);
    }

    const member = await partyDb.findMember(db, playerId, memberKey);
    if (!member) {
      throw new PlayerServiceError('该伙伴不在你的队伍中', 404);
    }

    if (isActive && !member.isActive) {
      const activeCompanions = await partyDb.countActive(db, playerId);
      if (activeCompanions >= PARTY_MAX_SIZE - 1) {
        throw new PlayerServiceError(
          `出战席位已满（${PARTY_MAX_SIZE}/${PARTY_MAX_SIZE}），请先让其他伙伴休息`,
          400
        );
      }
    }

    await partyDb.setActive(db, playerId, memberKey, isActive);
    const members = await partyDb.getRoster(db, leader);
    return {
      success: true,
      message: isActive ? `${member.name} 已加入出战阵容` : `${member.name} 已下场休息`,
      members,
    };
  },

  /**
   * 获取内容预设 (头像立绘 & 道号取名库)
   */
  async getPresets(db: D1Database) {
    const rows = await playerDb.getPresetAssets(db);
    return {
      avatars: rows
        .filter((r) => r.category === 'AVATAR')
        .map((r) => ({ id: r.id, name: r.label, role: r.sub_label || '', url: r.url || '' })),
      names: rows.filter((r) => r.category === 'NAME').map((r) => r.label),
    };
  },

  /**
   * 修改个人修仙资料
   */
  async updateProfile(
    db: D1Database,
    playerId: string,
    params: { nickname?: string; avatar?: string; signature?: string }
  ) {
    const { nickname, avatar, signature } = params;
    if (nickname !== undefined) {
      if (nickname.length < 2 || nickname.length > 16) {
        throw new PlayerServiceError('道号名称须在 2 至 16 个字符之间', 400);
      }
    }
    if (signature !== undefined && signature.length > 100) {
      throw new PlayerServiceError('个性签名不可超过 100 个字符', 400);
    }

    const existing = await playerDb.getPlayerById(db, playerId);
    if (!existing) {
      throw new PlayerServiceError('修仙者不存在', 404);
    }

    const newNickname = nickname !== undefined && nickname !== '' ? nickname : existing.nickname;
    const newAvatar = avatar !== undefined && avatar !== '' ? avatar : existing.avatar;
    const newSignature = signature !== undefined ? signature : existing.signature;

    await playerDb.updateProfile(db, playerId, newNickname, newAvatar, newSignature);
    const updated = await playerDb.getPlayerById(db, playerId);

    return {
      success: true,
      message: '更新成功',
      player: formatPlayerDto(updated!),
    };
  },

  /**
   * 获取道友全息档案 (含伙伴档案、穿戴神兵、江湖生平与点赞状态)
   */
  async getProfileDetail(db: D1Database, targetId: string, requesterId?: string | null) {
    const player = await playerDb.getPlayerById(db, targetId);

    if (!player) {
      // 尝试作为同道伙伴或 NPC 模板查询，生成伙伴专属侠客档案
      const companionRow = await db.prepare(
        `SELECT p.member_key, p.member_name, p.title, p.avatar, p.role, p.realm, p.level, p.is_active,
                t.name AS template_name, t.title AS template_title, t.avatar AS template_avatar,
                t.description, t.quality,
                t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
                t.base_matk, t.base_mdef, t.base_crit,
                t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
                t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
                t.growth_template, t.bonus_json,
                i.quality AS instance_quality,
                i.growth_template AS instance_growth_template,
                i.realm AS instance_realm,
                i.bonus_json AS instance_bonus_json
         FROM party_members p
         LEFT JOIN npc_instances i ON i.npc_id = p.member_key
         LEFT JOIN npc_templates t ON (t.id = i.template_id OR t.id = p.member_key)
         WHERE (p.player_id = ? AND p.member_key = ?) OR p.member_key = ? OR p.id = ?
         ORDER BY (p.player_id = ?) DESC
         LIMIT 1`
      )
        .bind(requesterId || '', targetId, targetId, targetId, requesterId || '')
        .first<any>();

      let row = companionRow;
      if (!row) {
        row = await db.prepare(
          `SELECT t.id AS member_key, t.name AS member_name, t.title, t.avatar, t.role,
                  '筑基初期' AS realm, 1 AS level, 1 AS is_active,
                  t.name AS template_name, t.title AS template_title, t.avatar AS template_avatar,
                  t.description, t.quality,
                  t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
                  t.base_matk, t.base_mdef, t.base_crit,
                  t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
                  t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
                  t.growth_template, t.bonus_json,
                  NULL AS instance_quality, NULL AS instance_growth_template, NULL AS instance_realm, NULL AS instance_bonus_json
           FROM npc_templates t
           WHERE t.id = ? OR t.key = ?
           LIMIT 1`
        )
          .bind(targetId, targetId)
          .first<any>();
      }

      if (!row) {
        throw new PlayerServiceError('该修仙道友或同道伙伴不存在', 404);
      }

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

      const companionName = row.member_name || row.template_name || '同道修仙者';
      const roleLabel =
        row.role === 'DPS'
          ? '纯阳输出'
          : row.role === 'HEALER'
          ? '妙手治疗'
          : row.role === 'TANK'
          ? '玄甲御气'
          : '随行同道';

      const companionDto = {
        id: row.member_key,
        nickname: companionName,
        level: row.level || 1,
        exp: 0,
        maxExp: getRequiredExpForLevel(row.level || 1),
        hp: attrs.maxHp,
        maxHp: attrs.maxHp,
        mp: attrs.maxMp,
        maxMp: attrs.maxMp,
        combatPower: attrs.combatPower,
        sect: row.title?.split('·')[0]?.trim() || row.title?.split(' ')[0]?.trim() || '同道仙盟',
        sectPosition: `随行伙伴 · ${roleLabel}`,
        realm: row.realm || attrs.realm || '筑基初期',
        vipLevel: 0,
        spiritualRoot: '天品纯阳灵根',
        reputation: '风雨同舟 (同道伙伴)',
        residence: '随同队伍行囊洞府',
        likesCount: 0,
        silver: 0,
        ingot: 0,
        copper: 0,
        signature: row.description || '愿与道友同生共死，扫荡九州妖魔，共问长生天道。',
        avatar: row.avatar || row.template_avatar || '',
        title: row.title || row.template_title || `同道伙伴 · ${roleLabel}`,
        status: 'ONLINE',
      };

      return {
        player: companionDto,
        equippedItems: [],
        chronicles: [
          {
            id: `chro_${row.member_key}_1`,
            title: '仙途相逢',
            year: '结伴',
            content: row.description || `${companionName}与道友相识于九州江湖，志同道合，结为同行伙伴。`,
            orderIndex: 1,
          },
          {
            id: `chro_${row.member_key}_2`,
            title: '队伍整备',
            year: '当前',
            content:
              row.is_active === 1
                ? `【${companionName}】当前处于出战阵容之中，随时听候调遣并肩御敌。`
                : `【${companionName}】当前处于休息调养状态，在队中整备待命。`,
            orderIndex: 2,
          },
        ],
        isSelf: false,
        isCompanion: true,
        hasLiked: false,
      };
    }

    const [equipped, chronicles, hasLiked] = await Promise.all([
      playerDb.getEquippedItems(db, targetId),
      playerDb.getPlayerChronicles(db, targetId),
      requesterId ? playerDb.hasLikedPlayer(db, targetId, requesterId) : Promise.resolve(false),
    ]);

    const isSelf = requesterId === targetId;

    return {
      player: formatPlayerDto(player),
      equippedItems: equipped.map((i) => ({
        id: i.id,
        playerId: i.player_id,
        itemId: i.item_id,
        itemName: i.item_name,
        itemType: i.item_type,
        count: i.count,
        isEquipped: true,
        slot: i.slot,
        quality: i.quality,
        stats: i.stats ? JSON.parse(i.stats) : undefined,
        enhanceLevel: i.enhance_level,
      })),
      chronicles: chronicles.map((ch) => ({
        id: ch.id,
        title: ch.title,
        year: ch.year,
        content: ch.content,
        orderIndex: ch.order_index,
      })),
      isSelf,
      hasLiked,
    };
  },

  /**
   * 为道友点赞
   */
  async likePlayer(db: D1Database, targetId: string, requesterId: string) {
    if (targetId === requesterId) {
      throw new PlayerServiceError('不可赞叹自身道心', 400);
    }

    const targetPlayer = await playerDb.getPlayerById(db, targetId);
    if (!targetPlayer) {
      throw new PlayerServiceError('该修仙道友不存在', 404);
    }

    const likeId = `like_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await playerDb.addLikeRecord(db, likeId, targetId, requesterId);

    const totalLikesCount = await playerDb.countLikes(db, targetId);
    const totalLikes = (targetPlayer.likes_count || 0) + (totalLikesCount || 1);

    await playerDb.updatePlayerLikesCount(db, targetId, totalLikes);

    return {
      success: true,
      likesCount: totalLikes,
      hasLiked: true,
      message: '为道友点燃心灯赞叹 +1',
    };
  },
};

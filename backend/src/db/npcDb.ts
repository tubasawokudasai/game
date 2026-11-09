export interface NpcInstanceRow {
  id: string;
  scene_id: string | null;
  key: string;
  name: string | null;
  badge: string | null;
  title: string | null;
  avatar: string | null;
  type: string | null;
  template_id?: string | null;
  battle_group_id?: string | null;
  battle_level?: number | null;
  battle_reward_json?: string | null;
  battle_member_levels_json?: string | null;
  respawn_seconds?: number | null;
  once_flag?: string | null;
  dialogue_package_id?: string | null;
  dialogue_root_node_id?: string | null;
  npc_role?: string | null;
  owner_player_id?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
  template_name?: string | null;
  template_title?: string | null;
  template_badge?: string | null;
  template_avatar?: string | null;
}

export const npcDb = {
  /**
   * 查询地图常驻 NPC 及指定玩家的剧情 NPC
   * 包含降级基础字段回退逻辑，对上层透明
   */
  async listVisibleNpcs(db: D1Database, playerId: string | null): Promise<NpcInstanceRow[]> {
    try {
      const { results } = await db.prepare(
        `SELECT n.npc_id AS id, n.scene_id, n.key, n.name, n.badge, n.title, n.avatar, n.type,
                n.template_id, n.battle_group_id, n.battle_level, n.battle_reward_json,
                n.battle_member_levels_json, n.respawn_seconds, n.once_flag,
                n.dialogue_package_id, n.dialogue_root_node_id,
                n.npc_role, n.owner_player_id, n.pos_x, n.pos_y,
                t.name AS template_name, t.title AS template_title, t.badge AS template_badge,
                t.avatar AS template_avatar
         FROM npc_instances n
         LEFT JOIN npc_templates t ON t.id = n.template_id
         WHERE n.status = 'ACTIVE'
           AND (
             n.npc_role = 'MAP'
             OR (n.npc_role = 'STORY' AND n.owner_player_id = ?)
           )
         ORDER BY n.npc_id ASC`
      )
        .bind(playerId || '')
        .all<NpcInstanceRow>();

      return results || [];
    } catch (err) {
      console.warn('[npcDb] 读取 npc_instances 失败，回退基础字段:', err);
      const { results } = await db.prepare(
        `SELECT npc_id AS id, scene_id, key, name, badge, title, avatar, type,
                npc_role, owner_player_id, pos_x, pos_y
         FROM npc_instances
         WHERE npc_role = 'MAP'
            OR (npc_role = 'STORY' AND owner_player_id = ?)
         ORDER BY npc_id ASC`
      )
        .bind(playerId || '')
        .all<NpcInstanceRow>();

      return results || [];
    }
  },
};

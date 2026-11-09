export interface PlayerEncounterStateRow {
  npc_id: string;
  defeat_count: number;
  last_defeat_at: number;
}

export interface PlayerDialogueFlagRow {
  flag_key: string;
}

export const playerStateDb = {
  /**
   * 获取玩家对各遭遇 NPC 的击杀记录
   */
  async getEncounterStates(
    db: D1Database,
    playerId: string
  ): Promise<Map<string, { defeat_count: number; last_defeat_at: number }>> {
    const map = new Map<string, { defeat_count: number; last_defeat_at: number }>();
    if (!playerId) return map;

    const { results } = await db.prepare(
      'SELECT npc_id, defeat_count, last_defeat_at FROM player_encounter_state WHERE player_id = ?'
    )
      .bind(playerId)
      .all<PlayerEncounterStateRow>();

    for (const row of results || []) {
      map.set(row.npc_id, {
        defeat_count: Number(row.defeat_count) || 0,
        last_defeat_at: Number(row.last_defeat_at) || 0,
      });
    }

    return map;
  },

  /**
   * 获取玩家已激活的剧情对话 flags (flag_value = 1)
   */
  async getActiveFlags(db: D1Database, playerId: string): Promise<Set<string>> {
    const flags = new Set<string>();
    if (!playerId) return flags;

    const { results } = await db.prepare(
      'SELECT flag_key FROM player_dialogue_flags WHERE player_id = ? AND flag_value = 1'
    )
      .bind(playerId)
      .all<PlayerDialogueFlagRow>();

    for (const f of results || []) {
      if (f.flag_key) {
        flags.add(f.flag_key);
      }
    }

    return flags;
  },
};

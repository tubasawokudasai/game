import { PlayerRecord, InventoryRecord, PlayerChronicleRecord } from '../models/types';

export interface PresetAssetRecord {
  id: string;
  category: string;
  label: string;
  sub_label: string | null;
  url: string | null;
}

export const playerDb = {
  async getPlayerById(db: D1Database, playerId: string): Promise<PlayerRecord | null> {
    return db.prepare('SELECT * FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();
  },

  async updateProfile(
    db: D1Database,
    playerId: string,
    nickname: string,
    avatar: string,
    signature: string
  ): Promise<void> {
    await db.prepare(
      'UPDATE players SET nickname = ?, avatar = ?, signature = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
      .bind(nickname, avatar, signature, playerId)
      .run();
  },

  async getPresetAssets(db: D1Database): Promise<PresetAssetRecord[]> {
    const { results } = await db.prepare(
      'SELECT id, category, label, sub_label, url FROM preset_assets ORDER BY category ASC, sort_order ASC'
    ).all<PresetAssetRecord>();
    return results || [];
  },

  async getEquippedItems(db: D1Database, playerId: string): Promise<InventoryRecord[]> {
    const { results } = await db.prepare(
      'SELECT * FROM inventory WHERE player_id = ? AND is_equipped = 1 ORDER BY created_at ASC'
    )
      .bind(playerId)
      .all<InventoryRecord>();
    return results || [];
  },

  async getPlayerChronicles(db: D1Database, playerId: string): Promise<PlayerChronicleRecord[]> {
    const { results } = await db.prepare(
      'SELECT * FROM player_chronicles WHERE player_id = ? ORDER BY order_index ASC, created_at ASC'
    )
      .bind(playerId)
      .all<PlayerChronicleRecord>();
    return results || [];
  },

  async hasLikedPlayer(db: D1Database, targetId: string, likerId: string): Promise<boolean> {
    const likeRecord = await db.prepare(
      'SELECT id FROM player_likes WHERE player_id = ? AND liker_id = ? LIMIT 1'
    )
      .bind(targetId, likerId)
      .first();
    return !!likeRecord;
  },

  async addLikeRecord(db: D1Database, likeId: string, targetId: string, likerId: string): Promise<void> {
    await db.prepare(
      'INSERT OR IGNORE INTO player_likes (id, player_id, liker_id) VALUES (?, ?, ?)'
    )
      .bind(likeId, targetId, likerId)
      .run();
  },

  async countLikes(db: D1Database, targetId: string): Promise<number> {
    const countRes = await db.prepare(
      'SELECT COUNT(*) as total FROM player_likes WHERE player_id = ?'
    )
      .bind(targetId)
      .first<{ total: number }>();
    return countRes?.total || 0;
  },

  async updatePlayerLikesCount(db: D1Database, targetId: string, likesCount: number): Promise<void> {
    await db.prepare('UPDATE players SET likes_count = ? WHERE id = ?')
      .bind(likesCount, targetId)
      .run();
  },
};

import { PlayerRecord, InventoryRecord } from '../models/types';

export interface TargetSceneRecord {
  id: string;
  zone_id: string;
  name: string;
}

export const travelDb = {
  /**
   * 查找目标场景（先按 scene id 查，再按 zone_id 查）
   */
  async findTargetScene(db: D1Database, targetKey: string): Promise<TargetSceneRecord | null> {
    let targetScene = await db.prepare(
      'SELECT id, zone_id, name FROM scenes WHERE id = ? LIMIT 1'
    )
      .bind(targetKey)
      .first<TargetSceneRecord>();

    if (!targetScene) {
      targetScene = await db.prepare(
        'SELECT id, zone_id, name FROM scenes WHERE zone_id = ? ORDER BY level ASC LIMIT 1'
      )
        .bind(targetKey)
        .first<TargetSceneRecord>();
    }

    return targetScene || null;
  },

  /**
   * 获取玩家传送所需的资产信息
   */
  async getPlayerTravelState(db: D1Database, playerId: string): Promise<PlayerRecord | null> {
    return db.prepare(
      'SELECT id, nickname, silver, zone_id, area_id FROM players WHERE id = ?'
    )
      .bind(playerId)
      .first<PlayerRecord>();
  },

  /**
   * 更新同大区内的子区域位置
   */
  async updatePlayerArea(db: D1Database, playerId: string, areaId: string): Promise<void> {
    await db.prepare(
      'UPDATE players SET area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
      .bind(areaId, playerId)
      .run();
  },

  /**
   * 检查玩家神行符
   */
  async getTeleportRune(db: D1Database, playerId: string): Promise<InventoryRecord | null> {
    return db.prepare(
      'SELECT id, count FROM inventory WHERE player_id = ? AND item_id = ? LIMIT 1'
    )
      .bind(playerId, 'item_teleport_rune')
      .first<InventoryRecord>();
  },

  /**
   * 执行跨区传送批处理事务
   */
  async executeTeleportBatch(
    db: D1Database,
    statements: D1PreparedStatement[]
  ): Promise<void> {
    await db.batch(statements);
  },

  createDeleteRuneStmt(db: D1Database, runeId: string): D1PreparedStatement {
    return db.prepare('DELETE FROM inventory WHERE id = ?').bind(runeId);
  },

  createDecrRuneStmt(db: D1Database, runeId: string): D1PreparedStatement {
    return db.prepare(
      'UPDATE inventory SET count = count - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(runeId);
  },

  createDeductSilverStmt(db: D1Database, playerId: string): D1PreparedStatement {
    return db.prepare(
      'UPDATE players SET silver = silver - 500, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND silver >= 500'
    ).bind(playerId);
  },

  createUpdateLocationStmt(
    db: D1Database,
    playerId: string,
    targetZoneId: string,
    targetAreaId: string
  ): D1PreparedStatement {
    return db.prepare(
      'UPDATE players SET zone_id = ?, area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(targetZoneId, targetAreaId, playerId);
  },
};

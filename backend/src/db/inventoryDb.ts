import { D1Database } from '@cloudflare/workers-types';
import { InventoryRecord, PlayerRecord } from '../models/types';

export interface InventoryItemDetail {
  id: string;
  playerId: string;
  itemId: string;
  itemName: string;
  itemType: string;
  count: number;
  isEquipped: boolean;
  slot?: string;
  quality: string;
  stats?: Record<string, number | string>;
  enhanceLevel: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const inventoryDb = {
  /**
   * 查询玩家所有行囊与佩戴物品，联查道具模版表补充风物志说明
   */
  async getPlayerInventory(
    db: D1Database,
    playerId: string
  ): Promise<InventoryItemDetail[]> {
    const query = `
      SELECT 
        i.id,
        i.player_id,
        i.item_id,
        i.item_name,
        i.item_type,
        i.count,
        i.is_equipped,
        i.slot,
        i.quality,
        i.stats,
        i.enhance_level,
        i.created_at,
        i.updated_at,
        t.description AS template_description
      FROM inventory i
      LEFT JOIN item_templates t ON i.item_id = t.id
      WHERE i.player_id = ?
      ORDER BY i.is_equipped DESC, i.created_at ASC
    `;

    const res = await db.prepare(query).bind(playerId).all<{
      id: string;
      player_id: string;
      item_id: string;
      item_name: string;
      item_type: string;
      count: number;
      is_equipped: number;
      slot: string | null;
      quality: string;
      stats: string | null;
      enhance_level: number;
      created_at: string;
      updated_at: string;
      template_description: string | null;
    }>();

    return (res.results || []).map((row) => {
      let parsedStats: Record<string, number | string> | undefined;
      if (row.stats) {
        try {
          parsedStats = JSON.parse(row.stats);
        } catch {
          parsedStats = undefined;
        }
      }

      return {
        id: row.id,
        playerId: row.player_id,
        itemId: row.item_id,
        itemName: row.item_name,
        itemType: row.item_type,
        count: row.count,
        isEquipped: row.is_equipped === 1,
        slot: row.slot || undefined,
        quality: row.quality || 'COMMON',
        stats: parsedStats,
        enhanceLevel: row.enhance_level || 0,
        description: row.template_description || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  },

  /**
   * 查询指定物品实例
   */
  async getInventoryItem(
    db: D1Database,
    playerId: string,
    inventoryId: string
  ): Promise<InventoryItemDetail | null> {
    const query = `
      SELECT 
        i.id,
        i.player_id,
        i.item_id,
        i.item_name,
        i.item_type,
        i.count,
        i.is_equipped,
        i.slot,
        i.quality,
        i.stats,
        i.enhance_level,
        i.created_at,
        i.updated_at,
        t.description AS template_description
      FROM inventory i
      LEFT JOIN item_templates t ON i.item_id = t.id
      WHERE i.id = ? AND i.player_id = ?
      LIMIT 1
    `;

    const row = await db.prepare(query).bind(inventoryId, playerId).first<{
      id: string;
      player_id: string;
      item_id: string;
      item_name: string;
      item_type: string;
      count: number;
      is_equipped: number;
      slot: string | null;
      quality: string;
      stats: string | null;
      enhance_level: number;
      created_at: string;
      updated_at: string;
      template_description: string | null;
    }>();

    if (!row) return null;

    let parsedStats: Record<string, number | string> | undefined;
    if (row.stats) {
      try {
        parsedStats = JSON.parse(row.stats);
      } catch {
        parsedStats = undefined;
      }
    }

    return {
      id: row.id,
      playerId: row.player_id,
      itemId: row.item_id,
      itemName: row.item_name,
      itemType: row.item_type,
      count: row.count,
      isEquipped: row.is_equipped === 1,
      slot: row.slot || undefined,
      quality: row.quality || 'COMMON',
      stats: parsedStats,
      enhanceLevel: row.enhance_level || 0,
      description: row.template_description || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  /**
   * 穿戴装备事务：
   * 1. 查找同部位原穿戴装备并卸下 (is_equipped = 0)
   * 2. 将目标装备置为已佩戴 (is_equipped = 1)
   */
  async equipItemTx(
    db: D1Database,
    playerId: string,
    targetItem: InventoryItemDetail
  ): Promise<{ replacedItem: InventoryRecord | null }> {
    if (!targetItem.slot) {
      throw new Error('该装备缺少佩戴槽位标识 (slot)');
    }

    // 查找同槽位当前佩戴的装备
    const currentEquipped = await db
      .prepare(
        'SELECT * FROM inventory WHERE player_id = ? AND is_equipped = 1 AND slot = ? LIMIT 1'
      )
      .bind(playerId, targetItem.slot)
      .first<InventoryRecord>();

    const stmts: any[] = [];

    // 若原先有装备，先卸下存回背包
    if (currentEquipped && currentEquipped.id !== targetItem.id) {
      stmts.push(
        db
          .prepare(
            'UPDATE inventory SET is_equipped = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          )
          .bind(currentEquipped.id)
      );
    }

    // 佩戴新装备
    stmts.push(
      db
        .prepare(
          'UPDATE inventory SET is_equipped = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(targetItem.id)
    );

    await db.batch(stmts);

    return { replacedItem: currentEquipped || null };
  },

  /**
   * 卸下装备事务
   */
  async unequipItemTx(
    db: D1Database,
    playerId: string,
    inventoryId: string
  ): Promise<void> {
    await db
      .prepare(
        'UPDATE inventory SET is_equipped = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND player_id = ?'
      )
      .bind(inventoryId, playerId)
      .run();
  },

  /**
   * 扣减或移除物品
   */
  async reduceOrRemoveItem(
    db: D1Database,
    inventoryId: string,
    reduceCount: number,
    currentCount: number
  ): Promise<{ remaining: number }> {
    if (reduceCount >= currentCount) {
      await db
        .prepare('DELETE FROM inventory WHERE id = ?')
        .bind(inventoryId)
        .run();
      return { remaining: 0 };
    } else {
      const remaining = currentCount - reduceCount;
      await db
        .prepare(
          'UPDATE inventory SET count = count - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(reduceCount, inventoryId)
        .run();
      return { remaining };
    }
  },

  /**
   * 整理行囊：合并背包内同模版同品质的非装备可堆叠物品
   */
  async tidyInventoryTx(
    db: D1Database,
    playerId: string
  ): Promise<{ mergedCount: number }> {
    // 找出背包内 (is_equipped = 0) 重复的物品 (按 item_id, quality 分组)
    const duplicates = await db
      .prepare(`
        SELECT item_id, quality, COUNT(*) as cnt, SUM(count) as total_count, MIN(id) as primary_id
        FROM inventory 
        WHERE player_id = ? AND is_equipped = 0
        GROUP BY item_id, quality
        HAVING cnt > 1
      `)
      .bind(playerId)
      .all<{
        item_id: string;
        quality: string;
        cnt: number;
        total_count: number;
        primary_id: string;
      }>();

    const dupRows = duplicates.results || [];
    if (dupRows.length === 0) {
      return { mergedCount: 0 };
    }

    const stmts: any[] = [];
    let mergedTotal = 0;

    for (const dup of dupRows) {
      mergedTotal += dup.cnt - 1;
      // 1. 将总数量更新到 primary_id 记录
      stmts.push(
        db
          .prepare(
            'UPDATE inventory SET count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          )
          .bind(dup.total_count, dup.primary_id)
      );
      // 2. 删除其余多余同类记录
      stmts.push(
        db
          .prepare(
            'DELETE FROM inventory WHERE player_id = ? AND is_equipped = 0 AND item_id = ? AND quality = ? AND id != ?'
          )
          .bind(playerId, dup.item_id, dup.quality, dup.primary_id)
      );
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return { mergedCount: mergedTotal };
  },

  /**
   * 初始新手行囊物资赠予（当玩家背包中未佩戴物品为 0 时自动赠予一次补给礼包）
   */
  async seedStarterBagIfEmpty(
    db: D1Database,
    playerId: string
  ): Promise<boolean> {
    const unequippedCount = await db
      .prepare(
        'SELECT COUNT(*) as cnt FROM inventory WHERE player_id = ? AND is_equipped = 0'
      )
      .bind(playerId)
      .first<{ cnt: number }>();

    if (unequippedCount && unequippedCount.cnt > 0) {
      return false;
    }

    const ts = Date.now();
    const stmts = [
      // 1. 聚气丹 ×5 (药品)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
           VALUES (?, ?, 'item_juqi_dan', '聚气丹', 'CONSUMABLE', 5, 0, 'COMMON')`
        )
        .bind(`inv_bag_jq_${playerId}_${ts}`, playerId),

      // 2. 回春金疮散 ×3 (药品)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
           VALUES (?, ?, 'item_healing_dan', '回春金疮散', 'CONSUMABLE', 3, 0, 'COMMON')`
        )
        .bind(`inv_bag_hc_${playerId}_${ts}`, playerId),

      // 3. 筑基丹 ×1 (药品/丹药)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
           VALUES (?, ?, 'item_zhuji_dan', '筑基丹', 'CONSUMABLE', 1, 0, 'RARE')`
        )
        .bind(`inv_bag_zj_${playerId}_${ts}`, playerId),

      // 4. 备用神兵 · 寒光玄铁剑 (装备)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
           VALUES (?, ?, 'item_sword_steel', '寒光玄铁剑', 'EQUIPMENT', 1, 0, 'WEAPON', 'RARE', '{"outer_attack":85,"crit_rate":0.05}', 2)`
        )
        .bind(`inv_bag_swd_${playerId}_${ts}`, playerId),

      // 5. 下品灵石 ×20 (材料)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
           VALUES (?, ?, 'item_ling_shi', '下品灵石', 'MATERIAL', 20, 0, 'COMMON')`
        )
        .bind(`inv_bag_ls_${playerId}_${ts}`, playerId),

      // 6. 神行符 ×3 (特殊/符箓)
      db
        .prepare(
          `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
           VALUES (?, ?, 'item_teleport_rune', '神行符', 'SPECIAL', 3, 0, 'RARE')`
        )
        .bind(`inv_bag_rn_${playerId}_${ts}`, playerId),
    ];

    await db.batch(stmts);
    return true;
  },
};

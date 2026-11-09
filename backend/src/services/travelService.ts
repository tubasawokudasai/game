import { travelDb, TargetSceneRecord } from '../db/travelDb';

export interface TeleportResult {
  success: boolean;
  message: string;
  zoneId: string;
  areaId: string;
  costSummary: string;
}

export class TravelError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export const travelService = {
  /**
   * 执行跨城/跨州传送业务编排
   */
  async teleport(
    db: D1Database,
    playerId: string,
    targetKey: string,
    targetAreaIdOverride?: string
  ): Promise<TeleportResult> {
    const targetScene = await travelDb.findTargetScene(db, targetKey);
    if (!targetScene) {
      throw new TravelError(`未能在九州灵图中找到目标场景或州域【${targetKey}】`, 404);
    }

    const targetZoneId = targetScene.zone_id;
    const targetAreaId = targetAreaIdOverride || targetScene.id;
    const targetName = targetScene.name;

    const player = await travelDb.getPlayerTravelState(db, playerId);
    if (!player) {
      throw new TravelError('修仙者角色不存在', 404);
    }

    // 若已经身处该大区：仅同步子区域，不扣任何资源
    if (player.zone_id === targetZoneId) {
      const landedAreaId = targetAreaIdOverride || targetAreaId;
      if (landedAreaId && player.area_id !== landedAreaId) {
        await travelDb.updatePlayerArea(db, playerId, landedAreaId);
      }
      return {
        success: true,
        message: `道友已身处【${targetName}】大区内部，无需跨州传送。`,
        zoneId: targetZoneId,
        areaId: landedAreaId || player.area_id,
        costSummary: '无消耗',
      };
    }

    // 检查神行符背包道具
    const runeItem = await travelDb.getTeleportRune(db, playerId);
    const batchStatements: D1PreparedStatement[] = [];
    let costSummary = '';

    if (runeItem && runeItem.count > 0) {
      costSummary = '消耗神行符 ×1';
      if (runeItem.count <= 1) {
        batchStatements.push(travelDb.createDeleteRuneStmt(db, runeItem.id));
      } else {
        batchStatements.push(travelDb.createDecrRuneStmt(db, runeItem.id));
      }
    } else if (player.silver >= 500) {
      costSummary = '消耗盘缠纹银 500 两';
      batchStatements.push(travelDb.createDeductSilverStmt(db, playerId));
    } else {
      throw new TravelError(
        '跨州传送资粮不足！请备妥神行符 ×1 或纹银 500 两方能启动古仙挪移大阵。',
        400
      );
    }

    // 更新 players 表的 zone_id 与 area_id
    batchStatements.push(
      travelDb.createUpdateLocationStmt(db, playerId, targetZoneId, targetAreaId)
    );

    // 原子批处理执行
    try {
      await travelDb.executeTeleportBatch(db, batchStatements);
    } catch (err: unknown) {
      console.error('[Travel API] 跨州传送事务执行异常:', err);
      throw new TravelError(
        '传送大阵灵力紊乱: ' + (err instanceof Error ? err.message : String(err)),
        500
      );
    }

    console.log(
      `[Travel API] 修仙者 [${player.nickname || playerId}] 成功跨州传送至 [${targetZoneId}:${targetAreaId}]，${costSummary}`
    );

    return {
      success: true,
      message: `跨州神行大阵启动！已顺利抵达【${targetName}】！`,
      zoneId: targetZoneId,
      areaId: targetAreaId,
      costSummary,
    };
  },
};

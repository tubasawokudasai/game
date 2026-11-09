import { D1Database } from '@cloudflare/workers-types';
import {
  calculateExperienceGain,
  ExperienceCalculationResult,
  validateExperienceAmount,
} from './experienceCalculator';
import { LEVEL_EXP_CONFIG, getRequiredExpForLevel, getLevelCap } from './expConfig';
import { inventoryService } from '../inventoryService';
import {
  buildLevelUpEventStatements,
  enqueueLevelUpEvents,
  getPendingLevelUpEventIds,
  ProcessedLevelUpNotification,
  retryPendingLevelUpEvents,
} from '../levelUpNotificationService';
import { getRuntimeEnv } from '../../utils/runtimeEnv';

export interface AddExperienceOptions {
  /**
   * 战斗/对话等已有 Toast 返回通道的场景可关闭 WebSocket 推送，
   * 由现有 toasts 展示后台配置的通知文案。
   */
  suppressWsNotification?: boolean;
}

export interface AddExperienceResult extends ExperienceCalculationResult {
  /** 角色唯一标识 */
  characterId: string;
  /** 角色类型 */
  characterType: 'PLAYER' | 'PARTY_MEMBER';
  /** 角色显示名 */
  characterName: string;
  /** 重算后的战力 (若有) */
  combatPower?: number;
  /** 经验获取与升级提示文案列表 */
  toasts: string[];
  /** 本次升级产生的后台配置通知（供调用方在 WS 未送达时兜底展示） */
  levelUpNotifications?: ProcessedLevelUpNotification[];
}

export class ExperienceService {
  /**
   * 统一经验增加服务
   *
   * 支持调用形式：
   * 1. addExperience(db, characterId, amount)
   * 2. addExperience(characterId, amount, db)
   *
   * 要求：
   * 1. 校验经验值必须为正数
   * 2. 增加角色当前经验
   * 3. 连续判断升级条件
   * 4. 满足条件时自动升级，并扣除对应等级经验
   * 5. 达到等级上限后停止升级，溢出经验依策略处理
   * 6. 复用现有属性计算器 (recalculatePlayerCombatPower / NpcAttributeCalculator)，严禁手动叠加 HP/MP/攻防
   * 7. 妥善夹取当前 HP/MP，避免无故满血或状态异常
   * 8. 支持并发乐观锁重试，保证数据一致性
   */
  async addExperience(
    firstArg: D1Database | string,
    secondArg: string | number,
    thirdArg?: number | D1Database,
    fourthArg?: AddExperienceOptions
  ): Promise<AddExperienceResult> {
    let db: D1Database;
    let characterId: string;
    let amount: number;
    const options: AddExperienceOptions = fourthArg || {};

    if (typeof firstArg === 'string') {
      characterId = firstArg;
      amount = Number(secondArg);
      db = thirdArg as D1Database;
    } else {
      db = firstArg;
      characterId = String(secondArg);
      amount = Number(thirdArg);
    }

    if (!db) {
      throw new Error('未提供有效的数据库实例 (D1Database)');
    }

    // 1. 校验经验值必须为正数
    const validAmount = validateExperienceAmount(amount);

    // 最大乐观重试次数，确保并发增加经验时不会丢失升级或数值错乱
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 2. 优先匹配玩家主表 (players)
      const player = await db
        .prepare(
          'SELECT id, nickname, level, exp, hp, max_hp, mp, max_mp, combat_power FROM players WHERE id = ?'
        )
        .bind(characterId)
        .first<any>();

      if (player) {
        const currentLevel = Number(player.level) || 1;
        const currentExp = Number(player.exp) || 0;

        const calc = calculateExperienceGain({
          currentLevel,
          currentExp,
          amount: validAmount,
        });

        const toasts: string[] = [];

        if (calc.levelUpCount > 0) {
          // 升级时遵循属性一致性规则：
          // - 严禁手动叠加 HP/MP/攻击/防御
          // - 当前生命与内力只做 [1, maxHp] / [0, maxMp] 夹取，绝不无故回满
          const maxHp = Math.max(1, Number(player.max_hp) || 3000);
          const maxMp = Math.max(0, Number(player.max_mp) || 1500);
          const safeHp = Math.min(maxHp, Math.max(1, Number(player.hp) || 1));
          const safeMp = Math.min(maxMp, Math.max(0, Number(player.mp) || 0));

          // 乐观并发锁：WHERE id = ? AND level = ? AND exp = ?
          const updateStatement = db
            .prepare(
              `UPDATE players
               SET level = ?, exp = ?, hp = ?, mp = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND level = ? AND exp = ?`
            )
            .bind(
              calc.postLevel,
              calc.remainingExp,
              safeHp,
              safeMp,
              characterId,
              currentLevel,
              currentExp
            );

          // 连续升级时逐级写入 Outbox 事件；事件插入带 players.level/exp 条件，
          // 与升级 UPDATE 在同一 batch 中提交，乐观锁失败时不会产生假事件。
          const { statements: eventStatements, eventIds } = buildLevelUpEventStatements(db, {
            playerId: characterId,
            playerName: player.nickname || '修仙者',
            oldLevel: currentLevel,
            newLevel: calc.postLevel,
            remainingExp: calc.remainingExp,
          });

          let changes = 0;
          let eventsCommitted = false;

          try {
            if (typeof (db as any).batch === 'function') {
              const batchResults = await db.batch([updateStatement, ...eventStatements]);
              changes =
                batchResults?.[0]?.meta?.changes ??
                (batchResults?.[0] as any)?.changes ??
                0;
              eventsCommitted = changes > 0;
            } else {
              // 兼容单元测试/轻量 D1 mock：逐条执行，行为与 batch 保持一致
              const updateRes = await updateStatement.run();
              changes = updateRes?.meta?.changes ?? (updateRes as any)?.changes ?? 0;
              if (changes > 0) {
                for (const statement of eventStatements) {
                  try {
                    await statement.run();
                  } catch (eventErr) {
                    console.warn('[ExperienceService] 升级事件写入失败:', eventErr);
                  }
                }
                eventsCommitted = true;
              }
            }
          } catch (err) {
            // 兼容尚未执行通知迁移的旧库：降级为仅升级，绝不阻塞角色成长
            const message = err instanceof Error ? err.message : String(err);
            if (/level_up_events|notification_configs|no such table/i.test(message)) {
              console.warn(
                '[ExperienceService] 通知事件表尚未迁移，本次升级跳过通知事件:',
                message
              );
              const updateRes = await updateStatement.run();
              changes = updateRes?.meta?.changes ?? (updateRes as any)?.changes ?? 0;
            } else {
              throw err;
            }
          }

          // 若并发修改导致未命中，重试
          if (changes === 0 && attempt < MAX_RETRIES - 1) {
            continue;
          }

          // 升级已提交：尽最大努力处理通知与奖励邮件；失败只记日志，不回滚升级
          let levelUpNotifications: ProcessedLevelUpNotification[] = [];
          if (changes > 0 && eventsCommitted) {
            levelUpNotifications = await this.dispatchLevelUpNotifications(
              db,
              characterId,
              eventIds,
              options
            );
          }

          // 触发既有综合战力重算引擎（依据基础等级+境界基底+穿戴装备词条与强化）
          let newCombatPower = player.combat_power;
          try {
            newCombatPower = await inventoryService.recalculatePlayerCombatPower(db, characterId);
          } catch (err) {
            console.warn('[ExperienceService] 重算战力异常:', err);
          }

          if (calc.levelUpCount === 1) {
            toasts.push(`道基精进，突破晋升至 Lv.${calc.postLevel}！`);
          } else {
            toasts.push(
              `气海滔天，连破 ${calc.levelUpCount} 境！突破晋升至 Lv.${calc.postLevel}！`
            );
          }

          // WebSocket 未在线/推送失败时的兜底：把后台配置的通知文案并入现有战斗/对话 Toast，
          // 已成功投递的即时通知不再重复展示。
          for (const notification of levelUpNotifications) {
            if (!notification.delivered) {
              toasts.push(
                notification.title
                  ? `${notification.title}：${notification.content}`
                  : notification.content
              );
            }
          }

          return {
            characterId,
            characterType: 'PLAYER',
            characterName: player.nickname || '修仙者',
            gainedExp: calc.gainedExp,
            preLevel: calc.preLevel,
            postLevel: calc.postLevel,
            levelUpCount: calc.levelUpCount,
            remainingExp: calc.remainingExp,
            requiredExpForNextLevel: calc.requiredExpForNextLevel,
            isMaxLevel: calc.isMaxLevel,
            combatPower: newCombatPower,
            toasts,
            levelUpNotifications,
          };
        } else {
          // 未升级：仅更新当前等级内累计经验
          const updateRes = await db
            .prepare(
              `UPDATE players
               SET exp = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND level = ? AND exp = ?`
            )
            .bind(calc.remainingExp, characterId, currentLevel, currentExp)
            .run();

          const changes = updateRes?.meta?.changes ?? (updateRes as any)?.changes;
          if (changes === 0 && attempt < MAX_RETRIES - 1) {
            continue;
          }

          toasts.push(`气海翻涌，获得修为 +${validAmount}`);

          return {
            characterId,
            characterType: 'PLAYER',
            characterName: player.nickname || '修仙者',
            gainedExp: calc.gainedExp,
            preLevel: calc.preLevel,
            postLevel: calc.postLevel,
            levelUpCount: 0,
            remainingExp: calc.remainingExp,
            requiredExpForNextLevel: calc.requiredExpForNextLevel,
            isMaxLevel: calc.isMaxLevel,
            combatPower: player.combat_power,
            toasts,
          };
        }
      }

      // 3. 尝试匹配同道伙伴队伍表 (party_members)
      const companion = await db
        .prepare(
          'SELECT id, player_id, member_key, member_name, level FROM party_members WHERE id = ? OR member_key = ?'
        )
        .bind(characterId, characterId)
        .first<any>();

      if (companion) {
        const currentLevel = Number(companion.level) || 1;
        const calc = calculateExperienceGain({
          currentLevel,
          currentExp: 0,
          amount: validAmount,
        });

        const updateRes = await db
          .prepare(
            `UPDATE party_members
             SET level = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND level = ?`
          )
          .bind(calc.postLevel, companion.id, currentLevel)
          .run();

        const changes = updateRes?.meta?.changes ?? (updateRes as any)?.changes;
        if (changes === 0 && attempt < MAX_RETRIES - 1) {
          continue;
        }

        const toasts: string[] = [];
        if (calc.levelUpCount > 0) {
          toasts.push(`同行伙伴【${companion.member_name}】突破晋升至 Lv.${calc.postLevel}！`);
        } else {
          toasts.push(`伙伴【${companion.member_name}】获得历练修为 +${validAmount}`);
        }

        return {
          characterId: companion.id,
          characterType: 'PARTY_MEMBER',
          characterName: companion.member_name,
          gainedExp: calc.gainedExp,
          preLevel: calc.preLevel,
          postLevel: calc.postLevel,
          levelUpCount: calc.levelUpCount,
          remainingExp: calc.remainingExp,
          requiredExpForNextLevel: calc.requiredExpForNextLevel,
          isMaxLevel: calc.isMaxLevel,
          toasts,
        };
      }

      // 既不是玩家也不是伙伴
      throw new Error(`角色档案不存在或尚未建立玉牒: ${characterId}`);
    }

    throw new Error(`经验结算发生高频并发冲突，请稍后重试: ${characterId}`);
  }

  /**
   * 升级提交后的通知分发。
   *
   * - 同步处理一次，保证玩家能立即收到即时通知与奖励邮件；
   * - 若同步处理失败（例如邮件服务异常），事件保留为 PENDING 并投递到队列重试；
   * - 任何异常都不会向调用方抛出，角色升级结果不受影响。
   */
  private async dispatchLevelUpNotifications(
    db: D1Database,
    playerId: string,
    fallbackEventIds: string[],
    options: AddExperienceOptions = {}
  ): Promise<ProcessedLevelUpNotification[]> {
    const env = getRuntimeEnv();

    try {
      const pendingIds = await getPendingLevelUpEventIds(db, playerId);
      const eventIds = Array.from(new Set([...fallbackEventIds, ...pendingIds]));
      if (eventIds.length === 0) return [];

      const result = await retryPendingLevelUpEvents(db, playerId, {
        env,
        deliverToast: !options.suppressWsNotification,
      });

      if (result.failed > 0) {
        const stillPending = await getPendingLevelUpEventIds(db, playerId);
        await enqueueLevelUpEvents(env, stillPending.length > 0 ? stillPending : eventIds);
      }

      return result.notifications;
    } catch (err) {
      console.warn('[ExperienceService] 升级通知分发异常，保留事件等待重试:', err);
      try {
        const stillPending = await getPendingLevelUpEventIds(db, playerId);
        await enqueueLevelUpEvents(
          env,
          stillPending.length > 0 ? stillPending : fallbackEventIds
        );
      } catch (retryErr) {
        console.warn('[ExperienceService] 升级通知入队失败:', retryErr);
      }
      return [];
    }
  }
}

export const experienceService = new ExperienceService();

import { DialogueAction } from '../../models/dialogue';
import { PlayerDialogueContext } from '../../models/dialogueRows';
import { PARTY_MAX_SIZE } from '../../db/partyDb';
import { experienceService } from '../experienceService';

/**
 * 动作计划构建产物 (ActionExecutionPlan)
 * 聚合待批量提交的 D1PreparedStatement 事务队列与副作用
 */
export interface ActionExecutionPlan {
  statements: D1PreparedStatement[];
  toasts: string[];
  triggerCombat?: {
    monsterGroupId: string;
    winNodeId?: string;
    loseNodeId?: string;
  };
  /** 地图 NPC 遭遇战：沿用单人遭遇 / 多人战阵配置 */
  triggerEncounter?: {
    npcId: string;
    winNodeId?: string;
    loseNodeId?: string;
  };
  triggerTeleport?: {
    zoneId: string;
    areaId: string;
    posX?: number;
    posY?: number;
  };
  /** 本次动作是否改动了出战队伍 */
  partyChanged?: boolean;
}

/** 道具模版行（item_templates 表），名称/品阶的唯一真源 */
interface ItemTemplateRow {
  name: string;
  type: string;
  quality: string;
}

/** 委托模版行（quest_templates 表） */
interface QuestTemplateRow {
  title: string;
}

export type ActionByType<T extends DialogueAction['type']> = Extract<DialogueAction, { type: T }>;

export type ActionHandler<T extends DialogueAction['type']> = (
  action: ActionByType<T>,
  ctx: PlayerDialogueContext,
  db: D1Database,
  plan: ActionExecutionPlan
) => Promise<void> | void;

/**
 * 【命令模式 + 策略注册表】动作执行器管理器 (ActionRegistry)
 * 职责：
 * 1. 维护 DialogueAction 策略注册表，符合开闭原则 (OCP)。
 * 2. 收集所有副作用的 D1 预编译语句，交由 D1 Batch 机制一次性原子执行，保障 ACID。
 * 3. 任何模版缺失 / 配置非法都直接抛错，禁止“猜一个默认值”继续执行。
 */
export class ActionRegistry {
  private static handlers = new Map<
    DialogueAction['type'],
    (action: any, ctx: PlayerDialogueContext, db: D1Database, plan: ActionExecutionPlan) => Promise<void> | void
  >();

  public static register<T extends DialogueAction['type']>(
    type: T,
    handler: ActionHandler<T>
  ) {
    this.handlers.set(type, handler);
  }

  public static async buildPlan(
    actions: DialogueAction[],
    ctx: PlayerDialogueContext,
    db: D1Database
  ): Promise<ActionExecutionPlan> {
    const plan: ActionExecutionPlan = { statements: [], toasts: [] };
    for (const action of actions) {
      const handler = this.handlers.get(action.type);
      if (!handler) {
        throw new Error(`未注册的对话动作处理器: ${action.type}`);
      }
      await handler(action, ctx, db, plan);
    }
    return plan;
  }
}

// ------------------------------------------------------------------------------
// 注册核心原子动作处理器
// ------------------------------------------------------------------------------

// 1. 发放道具物品（行囊采用“一物一行”的实例模型，与邮件附件/初始装备一致）
ActionRegistry.register('GIVE_ITEM', async (action, ctx, db, plan) => {
  const item = await db
    .prepare('SELECT name, type, quality FROM item_templates WHERE id = ?')
    .bind(action.itemId)
    .first<ItemTemplateRow>();

  if (!item) {
    throw new Error(`未备案的道具模版 [${action.itemId}]，无法发放`);
  }

  const newInstanceId = `inv_${ctx.player.id}_${action.itemId}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  plan.statements.push(
    db
      .prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .bind(
        newInstanceId,
        ctx.player.id,
        action.itemId,
        item.name,
        item.type,
        action.count,
        item.quality
      )
  );

  // 内存同步：同一事务内后续条件/动作可读到最新数量
  const currentCount = ctx.inventoryMap.get(action.itemId) ?? 0;
  ctx.inventoryMap.set(action.itemId, currentCount + action.count);

  plan.toasts.push(`获得机缘造化：【${item.name}】x${action.count}`);
});

// 2. 扣除道具物品（只扣行囊中未佩戴的堆叠，数量不足直接阻断整笔抉择）
ActionRegistry.register('COST_ITEM', async (action, ctx, db, plan) => {
  const ownedRow = await db
    .prepare(
      `SELECT COALESCE(SUM(count), 0) AS total
       FROM inventory
       WHERE player_id = ? AND item_id = ? AND is_equipped = 0`
    )
    .bind(ctx.player.id, action.itemId)
    .first<{ total: number }>();

  const owned = Number(ownedRow?.total) || 0;
  if (owned < action.count) {
    throw new Error(`囊中羞涩，所需信物 [${action.itemId}] 数量不足`);
  }

  plan.statements.push(
    db
      .prepare(
        `UPDATE inventory
         SET count = count - ?
         WHERE player_id = ? AND item_id = ? AND is_equipped = 0 AND count >= ?`
      )
      .bind(action.count, ctx.player.id, action.itemId, action.count)
  );

  // 清除数量归零的物品行
  plan.statements.push(
    db
      .prepare(
        `DELETE FROM inventory
         WHERE player_id = ? AND item_id = ? AND is_equipped = 0 AND count <= 0`
      )
      .bind(ctx.player.id, action.itemId)
  );

  ctx.inventoryMap.set(action.itemId, (ctx.inventoryMap.get(action.itemId) ?? 0) - action.count);
  plan.toasts.push(`消耗机缘信物：【${action.itemId}】x${action.count}`);
});

// 3. 增减修为经验与铜钱（gold 对应 players.copper）
ActionRegistry.register('ADD_EXP_OR_GOLD', async (action, ctx, db, plan) => {
  const exp = action.exp || 0;
  const copper = action.gold || 0;

  if (copper > 0) {
    plan.statements.push(
      db
        .prepare(
          `UPDATE players
           SET copper = copper + ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(copper, ctx.player.id)
    );
    plan.toasts.push(`灵石入纳戒，获得铜钱 +${copper}`);
  }

  if (exp > 0) {
    try {
      const expRes = await experienceService.addExperience(db, ctx.player.id, exp);
      plan.toasts.push(...expRes.toasts);
    } catch (err) {
      console.warn('[ActionRegistry] 经验增加异常:', err);
    }
  }
});

// 4. 接取天机委托任务（标题取自 quest_templates 表）
ActionRegistry.register('ACCEPT_QUEST', async (action, ctx, db, plan) => {
  const quest = await db
    .prepare('SELECT title FROM quest_templates WHERE id = ?')
    .bind(action.questId)
    .first<QuestTemplateRow>();

  if (!quest) {
    throw new Error(`未备案的委托模版 [${action.questId}]，无法接取`);
  }

  plan.statements.push(
    db
      .prepare(
        `INSERT INTO player_quests (player_id, quest_id, status, progress, updated_at)
         VALUES (?, ?, 'ACTIVE', 0, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, quest_id)
         DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`
      )
      .bind(ctx.player.id, action.questId)
  );

  ctx.questStatusMap.set(action.questId, 'ACTIVE');
  plan.toasts.push(`承接天机委托：【${quest.title}】`);
});

// 5. 交付/达成天机委托（标题取自 quest_templates 表）
ActionRegistry.register('COMPLETE_QUEST', async (action, ctx, db, plan) => {
  const quest = await db
    .prepare('SELECT title FROM quest_templates WHERE id = ?')
    .bind(action.questId)
    .first<QuestTemplateRow>();

  if (!quest) {
    throw new Error(`未备案的委托模版 [${action.questId}]，无法交付`);
  }

  plan.statements.push(
    db
      .prepare(
        `UPDATE player_quests
         SET status = 'DONE', updated_at = CURRENT_TIMESTAMP
         WHERE player_id = ? AND quest_id = ?`
      )
      .bind(ctx.player.id, action.questId)
  );

  ctx.questStatusMap.set(action.questId, 'DONE');
  plan.toasts.push(`圆满交付委托：【${quest.title}】`);
});

// 6. 写入剧情 Flag 状态标记
ActionRegistry.register('SET_FLAG', (action, ctx, db, plan) => {
  plan.statements.push(
    db
      .prepare(
        `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, flag_key)
         DO UPDATE SET flag_value = excluded.flag_value, updated_at = excluded.updated_at`
      )
      .bind(ctx.player.id, action.key, action.value)
  );

  ctx.flagsMap.set(action.key, action.value);
});

// 7. 触发战斗论道（直接指定怪物组）
ActionRegistry.register('START_COMBAT', (action, _ctx, _db, plan) => {
  plan.triggerCombat = {
    monsterGroupId: action.monsterGroupId,
    winNodeId: action.winNodeId,
    loseNodeId: action.loseNodeId,
  };
  plan.toasts.push('战意涌动，神识进入论道秘境！');
});

// 7.1 触发剧情战斗（STORY_BATTLE：单人遭遇 / 多人战阵）
ActionRegistry.register('START_ENCOUNTER', (action, _ctx, _db, plan) => {
  plan.triggerEncounter = {
    npcId: action.npcId,
    winNodeId: action.winNodeId,
    loseNodeId: action.loseNodeId,
  };
  plan.toasts.push('强敌现身，道友小心迎战！');
});

// 8. 空间御剑传送
// 大区不再由配置直接指定：一律按目标场景 scenes.zone_id 推导，
// 避免把场景 id（如 tianheng）误写成大区 id，污染 players.zone_id。
ActionRegistry.register('TELEPORT', async (action, ctx, db, plan) => {
  const scene = await db
    .prepare('SELECT id, name, zone_id FROM scenes WHERE id = ? LIMIT 1')
    .bind(action.areaId)
    .first<{ id: string; name: string; zone_id: string }>();

  if (!scene) {
    throw new Error(`未找到目标场景 [${action.areaId}]，无法传送`);
  }

  if (action.zoneId && action.zoneId !== scene.zone_id) {
    console.warn(
      `[ActionRegistry] 传送配置的大区 [${action.zoneId}] 与场景实际大区 [${scene.zone_id}] 不一致，已按场景为准`
    );
  }

  plan.statements.push(
    db
      .prepare(
        `UPDATE players
         SET zone_id = ?, area_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(scene.zone_id, scene.id, ctx.player.id)
  );

  plan.triggerTeleport = {
    zoneId: scene.zone_id,
    areaId: scene.id,
    posX: action.posX,
    posY: action.posY,
  };
  plan.toasts.push(`神光遁现，御剑移步至【${scene.name}】`);
});

// 9. 伙伴加入出战队伍 (幂等；模版不存在直接报错)
ActionRegistry.register('JOIN_PARTY', async (action, ctx, db, plan) => {
  const key = action.memberKey || action.characterId;
  if (!key) {
    throw new Error('未指定出战伙伴的 memberKey');
  }

  const template = await db
    .prepare(
      `SELECT id, key, name, title, avatar, role, sort_order, skills_json
       FROM npc_templates WHERE id = ? OR key = ? LIMIT 1`
    )
    .bind(key, key)
    .first<{
      id: string;
      key: string;
      name: string;
      title?: string | null;
      avatar?: string | null;
      role: string;
      sort_order: number;
      skills_json?: string | null;
    }>();

  if (!template) {
    throw new Error(`未备案的 NPC 模板 [${key}]`);
  }

  // 同一模板已经以 PLAYER 实例入队时保持幂等，不重复创建实例
  const existing = await db
    .prepare(
      `SELECT p.member_key, i.name
       FROM party_members p
       JOIN npc_instances i ON i.npc_id = p.member_key
       WHERE p.player_id = ? AND i.template_id = ? AND i.instance_type = 'PLAYER' AND i.status = 'ACTIVE'
       LIMIT 1`
    )
    .bind(ctx.player.id, template.id)
    .first<{ member_key: string; name: string }>();

  if (existing) {
    return;
  }

  const now = Date.now();
  const instanceId = `npcinst_dialogue_${ctx.player.id}_${template.id}_${now}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  plan.statements.push(
    db
      .prepare(
        `INSERT INTO npc_instances
           (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
            type, quote, gossip, owner_player_id, created_by, source, source_ref,
            battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag, level, skills_json)
         VALUES (?, ?, 'PLAYER', 'ACTIVE', NULL, NULL, ?, ?, ?, ?,
                 'companion', '', '', ?, 'DIALOGUE', 'DIALOGUE_JOIN', NULL,
                 NULL, 1, '{}', 0, NULL, ?, ?)`
      )
      .bind(
        instanceId,
        template.id,
        template.name,
        '',
        template.title || '',
        template.avatar || '',
        ctx.player.id,
        1,
        template.skills_json || null
      )
  );

  plan.statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO party_members
           (id, player_id, member_key, member_name, title, avatar, role, realm, level, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN (
                   SELECT COUNT(*) FROM party_members
                   WHERE player_id = ? AND is_active = 1
                 ) < ? THEN 1 ELSE 0 END)`
      )
      .bind(
        `${ctx.player.id}:${instanceId}`,
        ctx.player.id,
        instanceId,
        template.name,
        template.title || '',
        template.avatar || '',
        template.role || 'DPS',
        '',
        1,
        template.sort_order || 0,
        ctx.player.id,
        PARTY_MAX_SIZE - 1
      )
  );

  plan.toasts.push(`同道来投：【${template.name}】加入出战队伍`);
  plan.partyChanged = true;
});

import {
  DialogueCondition,
  DialogueConditionSchema,
  DialogueAction,
  DialogueActionSchema,
  DialogueOptionViewModel,
  DialoguePageViewModel,
  DialogueRenderPayload,
  DialogueInteractResult,
} from '../../models/dialogue';
import {
  PlayerDialogueContext,
  NpcRow,
  RouterRow,
  DialogueNodeRow,
  DialogueOptionRow,
  DialogueTriggerAction,
} from '../../models/dialogueRows';
import { Env } from '../../models/env';
import { ConditionEvaluator } from './ConditionEvaluator';
import { ActionRegistry } from './ActionRegistry';
import { sendStoryNodeNotification, sendStoryNotificationById } from '../storyNotificationService';
import { parseNodePages, type DialoguePageRow } from './dialoguePages';
import {
  completeStoryNode,
  ensurePlayerStoryNpcForNode,
  hidePlayerStoryNpcs,
  upsertStoryProgress,
} from './storyNpcStateService';

/** 节点所在位置的校验视图（由 dialogue_nodes JOIN npc_instances JOIN scenes 得到） */
interface NodeLocationRow {
  node_scene_id: string | null;
  node_scene_zone_id: string | null;
  instance_scene_id: string | null;
  instance_scene_zone_id: string | null;
}

/** 配置 JSON 解析结果：ok=false 表示数据损坏，调用方必须按“未满足”处理（fail-closed） */
interface JsonReadResult<T> {
  ok: boolean;
  data: T;
}

/**
 * 【有向图对话树引擎】 (DialogueEngine)
 * 职责：
 * 1. 管理节点与选项拓扑跳转 (Directed Graph)。
 * 2. 入口路由条件裁决 (Routers)，支持任务交接优先于闲聊。
 * 3. 防跳步、跨地图防作弊与防抓包篡改。
 * 4. 驱动 D1 Batch 原子提交动作事务并组装渲染视图。
 *
 * 数据约定：
 * - NPC 所在场景/大区不冗余存储在 npc_instances，统一经 scene_id -> scenes 推导。
 * - 所有 *_json 配置列在读取时都经过 Zod 校验；校验失败一律 fail-closed。
 */
export class DialogueEngine {
  constructor(private db: D1Database, private env?: Env) {}

  /**
   * 阶段一：玩家点击地图上的 NPC，启动对话获取首个契合的对话节点
   */
  async startDialogue(playerId: string, npcIdOrKey: string): Promise<DialogueRenderPayload> {
    const ctx = await this.loadPlayerContext(playerId);

    // 1. 查找目标 NPC 实体，并 JOIN 出所在场景大区
    //    同一剧本的多个 STORY 实例共用 key（story_<pkg>），任务面板「交谈」只传 key，
    //    因此这里必须排序：实例 ID 精确命中 > 玩家当前地图 > 其他已落位场景 > 已隐藏。
    const npc = await this.db
      .prepare(
        `SELECT n.npc_id AS id, n.*, s.zone_id AS scene_zone_id
         FROM npc_instances n
         LEFT JOIN scenes s ON s.id = n.scene_id
         WHERE (n.npc_id = ? OR n.key = ?)
           AND n.status = 'ACTIVE'
           AND (
             n.npc_role = 'MAP'
             OR (n.npc_role = 'STORY' AND n.owner_player_id = ?)
           )
         ORDER BY
           CASE
             WHEN n.npc_id = ? THEN 0
             WHEN n.scene_id = ? THEN 1
             WHEN n.scene_id IS NULL OR n.scene_id = '' THEN 3
             ELSE 2
           END,
           n.npc_id
         LIMIT 1`
      )
      .bind(npcIdOrKey, npcIdOrKey, playerId, npcIdOrKey, ctx.player.area_id ?? null)
      .first<NpcRow>();

    if (!npc) {
      throw new Error(`此地并无该仙长 [${npcIdOrKey}] 的踪迹`);
    }

    // 2. 查询此 NPC 的所有入口路由规则（按 priority 降序匹配）
    // 支持按: 实例ID / 实例Key / 模板ID 多级匹配，并支持限定当前场景或通用场景
    const candidateIds = [npc.id, npc.key, npc.template_id].filter(Boolean) as string[];
    const placeholders = candidateIds.map(() => '?').join(', ');
    const routersResult = await this.db
      .prepare(
        `SELECT * FROM npc_dialogue_routers 
         WHERE npc_id IN (${placeholders})
           AND (scene_id IS NULL OR scene_id = ?)
         ORDER BY priority DESC`
      )
      .bind(...candidateIds, npc.scene_id)
      .all<RouterRow>();

    let targetNodeId: string | null = null;
    const routers = routersResult.results || [];

    for (const router of routers) {
      const conditions = this.readConditions(router.conditions_json);
      // 配置损坏的路由视为不匹配，绝不能因为解析失败而放行
      if (!conditions.ok) {
        console.warn(`[DialogueEngine] 路由 ${router.id} 条件配置损坏，已跳过`);
        continue;
      }

      if (ConditionEvaluator.evaluateAll(conditions.data, ctx).passed) {
        targetNodeId = router.root_node_id;
        break;
      }
    }

    // 3. 若路由表未命中，优先续接玩家在该剧本中的当前剧情节点；
    //    没有进度时再回退到 NPC 指定根节点 / 剧本默认根节点。
    if (!targetNodeId) {
      if (npc.dialogue_package_id) {
        const progress = await this.db
          .prepare(
            `SELECT node_id FROM player_story_progress
             WHERE player_id = ? AND package_id = ? AND status = 'ACTIVE'
             LIMIT 1`
          )
          .bind(ctx.player.id, npc.dialogue_package_id)
          .first<{ node_id: string }>();
        if (progress?.node_id) {
          targetNodeId = progress.node_id;
        }
      }

      if (!targetNodeId && npc.dialogue_root_node_id) {
        targetNodeId = npc.dialogue_root_node_id;
      } else if (!targetNodeId && npc.dialogue_package_id) {
        const pkg = await this.db
          .prepare('SELECT default_root_node_id FROM dialogue_packages WHERE id = ?')
          .bind(npc.dialogue_package_id)
          .first<{ default_root_node_id: string }>();
        if (pkg?.default_root_node_id) {
          targetNodeId = pkg.default_root_node_id;
        }
      }
    }

    // 4. 校验目标节点是否在 dialogue_nodes 中真实存在，并读取该节点配置的地图
    let targetNodeSceneId: string | null = null;
    if (targetNodeId) {
      const nodeCheck = await this.db
        .prepare('SELECT id, scene_id FROM dialogue_nodes WHERE id = ?')
        .bind(targetNodeId)
        .first<{ id: string; scene_id: string | null }>();
      if (!nodeCheck) {
        console.warn(`[DialogueEngine] 目标根节点 [${targetNodeId}] 不存在，降级闲聊`);
        targetNodeId = null;
      } else {
        targetNodeSceneId = nodeCheck.scene_id || null;
      }
    }

    // 5. 地理范围校验：
    // STORY 记录按玩家保存当前位置，scene_id = NULL 表示不在任何地图；
    // MAP 记录仍按“节点场景优先、实例场景兜底”判断。
    if (npc.npc_role === 'STORY') {
      if (!npc.scene_id) {
        throw new Error('此地并无该仙长的踪迹');
      }
      this.assertPlayerAtNpcLocation(ctx, {
        scene_id: npc.scene_id,
        scene_zone_id: npc.scene_zone_id ?? null,
      });
    } else {
      const effectiveSceneId =
        targetNodeSceneId && targetNodeSceneId !== '__hidden__'
          ? targetNodeSceneId
          : npc.scene_id;
      let effectiveZoneId: string | null = npc.scene_zone_id ?? null;
      if (effectiveSceneId && effectiveSceneId !== npc.scene_id) {
        const effectiveScene = await this.db
          .prepare('SELECT zone_id FROM scenes WHERE id = ?')
          .bind(effectiveSceneId)
          .first<{ zone_id: string | null }>();
        effectiveZoneId = effectiveScene?.zone_id ?? null;
      }
      this.assertPlayerAtNpcLocation(ctx, {
        scene_id: effectiveSceneId,
        scene_zone_id: effectiveZoneId,
      });
    }

    // 未命中任何有向图路由或剧本节点：返回一个只含“告辞”的临时节点（不落库、不写档）
    if (!targetNodeId) {
      const idleContent = npc.quote || `“道友请了。”`;
      return {
        nodeId: `idle_${npc.id}`,
        npc: {
          id: npc.id,
          key: npc.key || undefined,
          name: npc.name,
          badge: npc.badge,
          title: npc.title,
          avatar: npc.avatar,
        },
        chapterTitle: '江湖偶遇',
        content: idleContent,
        pages: [
          {
            speakerId: npc.id,
            speakerName: npc.name,
            speakerBadge: npc.badge,
            speakerTitle: npc.title,
            speakerAvatar: npc.avatar,
            content: idleContent,
          },
        ],
        directNextNodeId: null,
        quoteBox: npc.gossip || undefined,
        options: [
          {
            id: 'opt_system_leave',
            text: '告辞离去 · 暂且别过',
            actionLabel: '作罢',
            styleType: 'GRAY',
            disabled: false,
          },
        ],
      };
    }

    return await this.renderNode(targetNodeId, ctx, npc);
  }

  /**
   * 阶段二：玩家在前端点击某个神识应答选项
   */
  async selectOption(
    playerId: string,
    currentNodeId: string,
    optionId: string
  ): Promise<DialogueInteractResult> {
    // 0. 临时节点 / 系统告辞选项：不查库、不写档，直接关闭对话
    if (currentNodeId.startsWith('idle_') || optionId === 'opt_system_leave') {
      return { status: 'CLOSE' };
    }

    const ctx = await this.loadPlayerContext(playerId);

    // 1. 强校验：防止抓包或前端篡改 optionId 跳步执行未开放选项
    const option = await this.db
      .prepare('SELECT * FROM dialogue_options WHERE id = ? AND node_id = ?')
      .bind(optionId, currentNodeId)
      .first<DialogueOptionRow>();

    if (!option) {
      throw new Error('天机紊乱，非法的神识应答选项');
    }

    // 2. 校验该节点所属 NPC 与玩家当前所在地一致，防止绕过 start 直接调用 select。
    // 剧情节点以 d.scene_id 为准（NPC 会跟随剧情节点换地图）；未配置时才回退到实例地图。
    const nodeLocation = await this.loadNodeLocation(currentNodeId, playerId);

    if (!nodeLocation) {
      throw new Error('未找到对话拓扑节点');
    }

    this.assertPlayerAtNodeLocation(ctx, nodeLocation);

    // 3. 服务端二次断言可见性与可用性
    const showConds = this.readConditions(option.show_conditions_json);
    const enableConds = this.readConditions(option.enable_conditions_json);

    if (!showConds.ok || !enableConds.ok) {
      throw new Error('该抉择配置异常，已阻断执行');
    }

    const check = ConditionEvaluator.evaluateAll(
      [...showConds.data, ...enableConds.data],
      ctx
    );
    if (!check.passed) {
      throw new Error(check.reason || '当前道境尚未满足此项抉择要求');
    }

    // 4. 构建原子动作计划并通过 D1 Batch 提交
    const actionsRead = this.readActions(option.actions_json);
    if (!actionsRead.ok) {
      throw new Error('该抉择的动作指令配置异常，已阻断执行');
    }

    const plan = await ActionRegistry.buildPlan(actionsRead.data, ctx, this.db);

    if (plan.statements.length > 0) {
      await this.db.batch(plan.statements);
    }

    // 完成节点触发器：玩家选择任一合法选项离开节点时执行
    const currentNode = await this.db
      .prepare('SELECT * FROM dialogue_nodes WHERE id = ?')
      .bind(currentNodeId)
      .first<DialogueNodeRow>();
    if (currentNode) {
      await this.runNodeTriggers(currentNode, 'COMPLETE', ctx);
    }

    // 5. 分支流转判断：遭遇战 > 剧情战 > 传送 > 拓扑连线至下一节点 > 结束关闭
    const storyContext = currentNode?.package_id
      ? {
          packageId: currentNode.package_id,
          nodeId: currentNode.id,
          completeOnFinish: false,
        }
      : undefined;

    if (plan.triggerEncounter) {
      const hasResultNode = Boolean(
        plan.triggerEncounter.winNodeId || plan.triggerEncounter.loseNodeId
      );
      return {
        status: 'COMBAT',
        combatPayload: {
          battleType: 'ENCOUNTER',
          ...plan.triggerEncounter,
          teleportTarget: plan.triggerTeleport,
          storyContext: storyContext
            ? { ...storyContext, completeOnFinish: !hasResultNode }
            : undefined,
        },
        storyContext: storyContext
          ? { ...storyContext, completeOnFinish: !hasResultNode }
          : undefined,
        teleportTarget: plan.triggerTeleport,
        rewardsToast: plan.toasts,
        partyChanged: plan.partyChanged,
      };
    }

    if (plan.triggerCombat) {
      const hasResultNode = Boolean(
        plan.triggerCombat.winNodeId || plan.triggerCombat.loseNodeId
      );
      return {
        status: 'COMBAT',
        combatPayload: {
          battleType: 'DIALOGUE',
          ...plan.triggerCombat,
          teleportTarget: plan.triggerTeleport,
          storyContext: storyContext
            ? { ...storyContext, completeOnFinish: !hasResultNode }
            : undefined,
        },
        storyContext: storyContext
          ? { ...storyContext, completeOnFinish: !hasResultNode }
          : undefined,
        teleportTarget: plan.triggerTeleport,
        rewardsToast: plan.toasts,
        partyChanged: plan.partyChanged,
      };
    }

    if (plan.triggerTeleport) {
      if (option.next_node_id) {
        const targetNode = await this.loadNode(option.next_node_id);
        if (targetNode) {
          await this.advanceStoryToNode(playerId, targetNode, ctx);
        } else if (currentNode?.package_id) {
          await completeStoryNode(this.db, playerId, currentNode);
        }
      } else if (currentNode?.package_id) {
        await completeStoryNode(this.db, playerId, currentNode);
      }

      return {
        status: 'TELEPORT',
        teleportTarget: plan.triggerTeleport,
        rewardsToast: plan.toasts,
        partyChanged: plan.partyChanged,
      };
    }

    if (option.next_node_id) {
      const targetNode = await this.loadNode(option.next_node_id);
      if (!targetNode) {
        throw new Error(`未找到对话拓扑节点 [${option.next_node_id}]`);
      }

      // 跨场景只关闭对话，不自动传送玩家；剧情 NPC 的位置跟随目标节点。
      if (this.isStorySceneTransition(ctx, targetNode)) {
        await this.advanceStoryToNode(playerId, targetNode, ctx);
        return {
          status: 'CLOSE',
          sceneChanged: true,
          nextNodeId: targetNode.id,
          rewardsToast: plan.toasts,
          partyChanged: plan.partyChanged,
        };
      }

      // 动作执行后（可能发了新物品或更改了任务 Flag），刷新上下文重新渲染下一节点
      const updatedCtx = await this.loadPlayerContext(playerId);
      const nextDialogue = await this.renderNode(targetNode.id, updatedCtx);
      return {
        status: 'CONTINUE',
        nextDialogue,
        rewardsToast: plan.toasts,
        partyChanged: plan.partyChanged,
      };
    }

    if (currentNode?.package_id) {
      await completeStoryNode(this.db, playerId, currentNode);
    }

    return {
      status: 'CLOSE',
      rewardsToast: plan.toasts,
      partyChanged: plan.partyChanged,
    };
  }

  /**
   * 线性直连推进：玩家在本节点最后一页点击「继续」，直接进入 direct_next_node_id。
   * 有分支选项的节点必须走 selectOption，不能被直连绕过。
   */
  async advanceDialogue(
    playerId: string,
    currentNodeId: string
  ): Promise<DialogueInteractResult> {
    const ctx = await this.loadPlayerContext(playerId);

    const node = await this.db
      .prepare('SELECT * FROM dialogue_nodes WHERE id = ?')
      .bind(currentNodeId)
      .first<DialogueNodeRow>();

    if (!node) {
      throw new Error('未找到对话拓扑节点');
    }

    const optionCount = await this.db
      .prepare('SELECT COUNT(*) AS count FROM dialogue_options WHERE node_id = ?')
      .bind(currentNodeId)
      .first<{ count: number }>();

    if ((optionCount?.count || 0) > 0) {
      throw new Error('当前节点需要做出选择，不能直接继续');
    }

    const nodeLocation = await this.loadNodeLocation(currentNodeId, playerId);
    if (!nodeLocation) {
      throw new Error('未找到对话拓扑节点');
    }
    this.assertPlayerAtNodeLocation(ctx, nodeLocation);

    // 离开当前节点（直连继续或结束）时执行完成触发器
    await this.runNodeTriggers(node, 'COMPLETE', ctx);

    // 没有直连目标：本次剧情结束
    if (!node.direct_next_node_id) {
      await completeStoryNode(this.db, playerId, node);
      return { status: 'CLOSE' };
    }

    const target = await this.loadNode(node.direct_next_node_id);

    if (!target) {
      console.warn(
        `[DialogueEngine] 节点 ${node.id} 的直连目标 ${node.direct_next_node_id} 不存在，按结束处理`
      );
      await completeStoryNode(this.db, playerId, node);
      return { status: 'CLOSE' };
    }

    // 直连跨场景同样只关闭对话，不自动传送玩家。
    if (this.isStorySceneTransition(ctx, target)) {
      await this.advanceStoryToNode(playerId, target, ctx);
      return {
        status: 'CLOSE',
        sceneChanged: true,
        nextNodeId: target.id,
      };
    }

    const nextDialogue = await this.renderNode(target.id, ctx);
    return {
      status: 'CONTINUE',
      nextDialogue,
    };
  }

  /**
   * 渲染单个对话节点的展现数据 (ViewModel)
   */
  async renderNode(
    nodeId: string,
    ctx: PlayerDialogueContext,
    preloadedNpc?: NpcRow
  ): Promise<DialogueRenderPayload> {
    const node = await this.db
      .prepare('SELECT * FROM dialogue_nodes WHERE id = ?')
      .bind(nodeId)
      .first<DialogueNodeRow>();

    if (!node) {
      throw new Error(`未找到对话拓扑节点 [${nodeId}]`);
    }

    // 执行“进入节点”触发器
    await this.runNodeTriggers(node, 'ENTER', ctx);

    let npc: NpcRow | null | undefined = preloadedNpc;

    // 剧情节点：按当前玩家维护唯一的 STORY 记录，并直接把位置更新到本节点。
    if (!npc && node.package_id) {
      npc = await ensurePlayerStoryNpcForNode(this.db, ctx.player.id, node);
    }

    // 非剧情节点才回退到地图常驻 NPC。
    if (!npc) {
      npc = await this.db
        .prepare(
          `SELECT n.npc_id AS id, n.* 
           FROM npc_instances n 
           WHERE (n.npc_id = ? OR n.key = ? OR n.template_id = ?) 
             AND n.npc_role = 'MAP' AND n.status = 'ACTIVE' 
           LIMIT 1`
        )
        .bind(node.npc_id, node.npc_id, node.npc_id)
        .first<NpcRow>();
    }

    let speakerName = npc?.name || '';
    let speakerBadge = npc?.badge || '';
    let speakerTitle = npc?.title || '';
    let speakerAvatar = npc?.avatar || '';

    // 若未从实例获取到，尝试从模板获取说话人名片
    if (!speakerName) {
      const tpl = await this.db
        .prepare('SELECT * FROM npc_templates WHERE id = ? OR key = ? LIMIT 1')
        .bind(node.npc_id, node.npc_id)
        .first<any>();
      if (tpl) {
        speakerName = tpl.name;
        speakerBadge = tpl.badge || '';
        speakerTitle = tpl.title || '';
        speakerAvatar = tpl.avatar || '';
      } else {
        speakerName = '仙灵引路使';
      }
    }

    const optionsResult = await this.db
      .prepare('SELECT * FROM dialogue_options WHERE node_id = ? ORDER BY sort_order ASC')
      .bind(nodeId)
      .all<DialogueOptionRow>();

    const rawOptions = optionsResult.results || [];

    // 无分支直连：只有完全没有选项时才生效（与分支选项互斥）
    const directNextNodeId =
      rawOptions.length === 0 && node.direct_next_node_id
        ? node.direct_next_node_id
        : null;

    // 没有任何选项、也没有直连的节点才是剧情终点：标记 COMPLETED，
    // 并把该剧本在当前玩家名下的剧情 NPC 全部移出地图。
    const isTerminalNode = rawOptions.length === 0 && !directNextNodeId;
    if (node.package_id) {
      await upsertStoryProgress(
        this.db,
        ctx.player.id,
        node.package_id,
        node.id,
        isTerminalNode ? 'COMPLETED' : 'ACTIVE'
      );
      if (isTerminalNode) {
        await hidePlayerStoryNpcs(this.db, ctx.player.id, node.package_id);
      }
    }

    const renderedOptions: DialogueOptionViewModel[] = [];

    for (const opt of rawOptions) {
      // 1. 可见条件：配置损坏或未满足都隐藏
      const showConds = this.readConditions(opt.show_conditions_json);
      if (!showConds.ok || !ConditionEvaluator.evaluateAll(showConds.data, ctx).passed) {
        continue;
      }

      // 2. 可用条件：配置损坏或未满足都置灰并给出原因
      const enableConds = this.readConditions(opt.enable_conditions_json);
      const enableCheck = enableConds.ok
        ? ConditionEvaluator.evaluateAll(enableConds.data, ctx)
        : { passed: false, reason: '该抉择配置异常' };

      renderedOptions.push({
        id: opt.id,
        text: opt.text,
        actionLabel: opt.action_label,
        styleType: opt.style_type || 'NORMAL',
        disabled: !enableCheck.passed,
        disabledReason: enableCheck.passed ? undefined : enableCheck.reason,
      });
    }

    const uiMetaRead = this.readJsonObject(node.ui_meta_json);
    const nodePages = parseNodePages(node.pages_json, node.content);
    const pageViewModels = await this.resolvePageViewModels(node, npc, ctx, nodePages);

    return {
      nodeId: node.id,
      npc: {
        id: npc?.id || node.npc_id,
        key: npc?.key || undefined,
        name: speakerName,
        badge: speakerBadge,
        title: speakerTitle,
        avatar: speakerAvatar,
      },
      chapterTitle: node.chapter_title,
      content: pageViewModels[0]?.content || node.content,
      pages: pageViewModels,
      directNextNodeId,
      quoteBox: node.quote_box,
      uiMeta: uiMetaRead,
      options: renderedOptions,
    };
  }

  /**
   * 解析节点内多页台词的发言人名片。
   * 默认继承节点 NPC；player/narrator 使用内置身份；其它 ID 依次查实例、模板。
   */
  private async resolvePageViewModels(
    node: DialogueNodeRow,
    defaultNpc: NpcRow | null | undefined,
    ctx: PlayerDialogueContext,
    pages: DialoguePageRow[]
  ): Promise<DialoguePageViewModel[]> {
    interface SpeakerView {
      name: string;
      badge?: string;
      title?: string;
      avatar?: string;
    }

    const cache = new Map<string, SpeakerView>();
    const defaultSpeakerId = node.npc_id || 'speaker';
    if (defaultNpc) {
      const defaultView: SpeakerView = {
        name: defaultNpc.name,
        badge: defaultNpc.badge,
        title: defaultNpc.title,
        avatar: defaultNpc.avatar,
      };
      cache.set('speaker', defaultView);
      cache.set(defaultSpeakerId, defaultView);
      if (defaultNpc.key) cache.set(defaultNpc.key, defaultView);
      if (defaultNpc.template_id) cache.set(defaultNpc.template_id, defaultView);
    }

    const result: DialoguePageViewModel[] = [];

    for (const page of pages) {
      const speakerId = (page.speaker_id || defaultSpeakerId || 'speaker').trim();
      let view = cache.get(speakerId);

      if (!view) {
        if (speakerId === 'player') {
          view = {
            name: String(ctx.player.nickname || '主角'),
            badge: '',
            title: '',
            avatar:
              typeof ctx.player.avatar === 'string' ? (ctx.player.avatar as string) : '',
          };
        } else if (speakerId === 'narrator') {
          view = { name: '旁白', badge: '', title: '', avatar: '' };
        } else if (speakerId === 'speaker') {
          view = {
            name: defaultNpc?.name || (defaultSpeakerId !== 'speaker' ? defaultSpeakerId : '旁白'),
            badge: defaultNpc?.badge || '',
            title: defaultNpc?.title || '',
            avatar: defaultNpc?.avatar || '',
          };
        } else {
          const instance = await this.db
            .prepare(
              `SELECT name, badge, title, avatar
               FROM npc_instances
               WHERE (npc_id = ? OR key = ?)
                 AND instance_type = 'WORLD' AND status = 'ACTIVE'
               LIMIT 1`
            )
            .bind(speakerId, speakerId)
            .first<SpeakerView>();

          if (instance) {
            view = instance;
          } else {
            const template = await this.db
              .prepare(
                `SELECT name, badge, title, avatar
                 FROM npc_templates
                 WHERE id = ? OR key = ?
                 LIMIT 1`
              )
              .bind(speakerId, speakerId)
              .first<SpeakerView>();

            view = template || { name: speakerId, badge: '', title: '', avatar: '' };
          }
        }

        cache.set(speakerId, view);
      }

      result.push({
        speakerId,
        speakerName: view.name,
        speakerBadge: view.badge || undefined,
        speakerTitle: view.title || undefined,
        speakerAvatar: view.avatar || undefined,
        content: page.content,
      });
    }

    if (result.length === 0) {
      result.push({
        speakerId: defaultSpeakerId,
        speakerName: defaultNpc?.name || '旁白',
        speakerBadge: defaultNpc?.badge || undefined,
        speakerTitle: defaultNpc?.title || undefined,
        speakerAvatar: defaultNpc?.avatar || undefined,
        content: node.content || '',
      });
    }

    return result;
  }

  /**
   * 执行节点触发器。
   * 目前仅支持 SEND_NOTIFICATION：接入「通知管理」的事件配置与 WebSocket 即时通知。
   * once 默认为 true，用 player_dialogue_flags 记录幂等标记，避免重复弹窗。
   */
  private async runNodeTriggers(
    node: DialogueNodeRow,
    event: 'ENTER' | 'COMPLETE',
    ctx: PlayerDialogueContext
  ): Promise<void> {
    const raw = event === 'ENTER'
      ? node.on_enter_actions_json
      : node.on_complete_actions_json;
    const triggers = this.readTriggerActions(raw);
    if (triggers.length === 0) return;

    const packageName = await this.lookupPackageName(node.package_id);

    for (let index = 0; index < triggers.length; index++) {
      const trigger = triggers[index];
      if (trigger.type !== 'SEND_NOTIFICATION') continue;

      const once = trigger.once !== false;
      const flagSuffix = trigger.notificationId
        ? `n_${trigger.notificationId}`
        : `i_${index}`;
      const flagKey = `__story_trigger_${node.id}_${event}_${flagSuffix}`;
      if (once && (ctx.flagsMap.get(flagKey) ?? 0) === 1) continue;

      try {
        const variables = {
          playerName: String(ctx.player.nickname || ctx.player.id),
          chapterTitle: String(node.chapter_title || ''),
          packageName,
          nodeId: node.id,
        };

        // 优先投递节点绑定的独立剧情通知；旧触发器才回退到全局兜底配置
        const delivered = trigger.notificationId
          ? await sendStoryNotificationById(
              this.env || null,
              this.db,
              ctx.player.id,
              trigger.notificationId,
              variables
            )
          : await sendStoryNodeNotification(
              this.env || null,
              this.db,
              ctx.player.id,
              {
                title: trigger.title,
                content: trigger.content,
                grants: trigger.grants,
                rewardKey: `storycfg_${node.id}_${event}_${index}`,
              },
              variables
            );

        // 即使环境缺少 WebSocket 绑定（本地/测试），也记录幂等标记，避免反复尝试
        if (once) {
          await this.db
            .prepare(
              `INSERT INTO player_dialogue_flags (player_id, flag_key, flag_value, updated_at)
               VALUES (?, ?, 1, CURRENT_TIMESTAMP)
               ON CONFLICT(player_id, flag_key) DO UPDATE SET
                 flag_value = 1,
                 updated_at = CURRENT_TIMESTAMP`
            )
            .bind(ctx.player.id, flagKey)
            .run();
          ctx.flagsMap.set(flagKey, 1);
        }

        if (!delivered) {
          console.warn(
            `[DialogueEngine] 节点 ${node.id} 的 ${event} 通知未送达（玩家可能不在线或环境未绑定 DO）`
          );
        }
      } catch (err) {
        console.warn(`[DialogueEngine] 节点 ${node.id} 的 ${event} 触发器执行失败:`, err);
      }
    }
  }

  private readTriggerActions(raw: string | null | undefined): DialogueTriggerAction[] {
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const actions: DialogueTriggerAction[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (String(record.type || '') !== 'SEND_NOTIFICATION') continue;

      actions.push({
        type: 'SEND_NOTIFICATION',
        notificationId: String(record.notificationId || '').trim() || undefined,
        eventCode: String(record.eventCode || '').trim() || undefined,
        title: String(record.title || '').trim() || undefined,
        content: String(record.content || '').trim() || undefined,
        grants: Array.isArray(record.grants)
          ? (record.grants as DialogueTriggerAction['grants'])
          : undefined,
        once: record.once !== false,
      });
    }
    return actions;
  }

  private async lookupPackageName(packageId?: string | null): Promise<string> {
    if (!packageId) return '';
    try {
      const row = await this.db
        .prepare('SELECT name FROM dialogue_packages WHERE id = ?')
        .bind(packageId)
        .first<{ name: string }>();
      return row?.name || '';
    } catch {
      return '';
    }
  }

  /**
   * 聚合加载玩家上下文（玩家数值、背包映射、任务状态、剧情标记）
   * 任一依赖读取失败都直接抛错（fail-closed），避免把“读不到”误判成“没有”。
   */
  async loadPlayerContext(playerId: string): Promise<PlayerDialogueContext> {
    const player = await this.db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerDialogueContext['player']>();

    if (!player) {
      throw new Error('修仙者不存在或尚未建立玉牒');
    }

    try {
      // 1. 背包映射 Map<itemId, count>
      const inventoryMap = new Map<string, number>();
      const invRows = await this.db
        .prepare(
          'SELECT item_id, SUM(count) as total FROM inventory WHERE player_id = ? GROUP BY item_id'
        )
        .bind(player.id)
        .all<{ item_id: string; total: number }>();

      for (const row of invRows.results || []) {
        inventoryMap.set(row.item_id, Number(row.total) || 0);
      }

      // 2. 任务状态映射 Map<questId, status>
      const questStatusMap = new Map<string, 'NONE' | 'ACTIVE' | 'DONE' | 'SUBMITTED'>();
      const questRows = await this.db
        .prepare('SELECT quest_id, status FROM player_quests WHERE player_id = ?')
        .bind(player.id)
        .all<{ quest_id: string; status: 'NONE' | 'ACTIVE' | 'DONE' | 'SUBMITTED' }>();

      for (const row of questRows.results || []) {
        questStatusMap.set(row.quest_id, row.status);
      }

      // 3. 剧情标记映射 Map<flagKey, flagValue>
      const flagsMap = new Map<string, number>();
      const flagRows = await this.db
        .prepare('SELECT flag_key, flag_value FROM player_dialogue_flags WHERE player_id = ?')
        .bind(player.id)
        .all<{ flag_key: string; flag_value: number }>();

      for (const row of flagRows.results || []) {
        flagsMap.set(row.flag_key, Number(row.flag_value) || 0);
      }

      return {
        player,
        inventoryMap,
        questStatusMap,
        flagsMap,
      };
    } catch (err) {
      console.error('[DialogueEngine] 玩家对话上下文加载失败:', err);
      throw new Error('对话上下文加载失败，请稍后重试');
    }
  }

  /**
   * 直接进入某个剧情节点前的准入校验（用于战斗结算后打开 win/lose 节点）：
   * 1. 玩家必须在该节点所属 NPC 的所在地；
   * 2. 节点必须在 dialogue_entry_nodes 白名单内；
   * 3. 若配置了 require_flag，对应剧情 Flag 必须已置 1。
   * 返回已加载的上下文，供调用方直接渲染节点，避免重复查询。
   */
  async assertNodeEntry(playerId: string, nodeId: string): Promise<PlayerDialogueContext> {
    const ctx = await this.loadPlayerContext(playerId);

    const location = await this.loadNodeLocation(nodeId, playerId);

    if (!location) {
      throw new Error('未找到对话拓扑节点');
    }

    const entry = await this.db
      .prepare('SELECT require_flag FROM dialogue_entry_nodes WHERE node_id = ?')
      .bind(nodeId)
      .first<{ require_flag: string | null }>();

    let allowFromActivePackage = false;

    if (!entry) {
      // 战斗/遭遇返回节点通常不在入口白名单里；只要玩家在该剧本中有
      // ACTIVE 进度，就允许从当前剧情继续进入同剧本的胜/败节点。
      const nodePkg = await this.db
        .prepare('SELECT package_id FROM dialogue_nodes WHERE id = ?')
        .bind(nodeId)
        .first<{ package_id: string | null }>();

      const activeProgress = nodePkg?.package_id
        ? await this.db
            .prepare(
              `SELECT 1 FROM player_story_progress
               WHERE player_id = ? AND package_id = ? AND status = 'ACTIVE'
               LIMIT 1`
            )
            .bind(playerId, nodePkg.package_id)
            .first()
        : null;

      if (!activeProgress) {
        throw new Error('该剧情节点不可直接进入');
      }
      allowFromActivePackage = true;
    }

    // 战斗结算后的胜/败节点不再校验玩家是否还站在原地图；
    // 白名单入口节点仍保留严格位置校验。
    if (!allowFromActivePackage) {
      this.assertPlayerAtNodeLocation(ctx, location);
    }

    if (entry?.require_flag) {
      const reached = ctx.flagsMap.get(entry.require_flag) ?? 0;
      if (reached !== 1) {
        throw new Error('尚未达成进入该剧情节点的条件');
      }
    }

    return ctx;
  }

  /**
   * 校验玩家是否与 NPC 处在同一场景（大区 + 子区域）
   */
  /**
   * 读取节点的地图，以及该节点关联的世界 NPC 实例地图。
   * 剧情节点优先关联「挂载同一剧本」的实例；非剧情节点才按实例 ID / key / 模板匹配，
   * 避免同模板的其它 NPC（例如旧地图里的同名角色）抢占位置判断。
   */
  private async loadNode(nodeId: string): Promise<DialogueNodeRow | null> {
    return await this.db
      .prepare('SELECT * FROM dialogue_nodes WHERE id = ?')
      .bind(nodeId)
      .first<DialogueNodeRow>();
  }

  /**
   * 目标节点是否发生了真实地图切换。
   * 过场节点（__hidden__）和未配置场景的节点不算跨图。
   */
  private isStorySceneTransition(ctx: PlayerDialogueContext, node: DialogueNodeRow): boolean {
    const targetScene = node.scene_id;
    return Boolean(
      targetScene &&
        targetScene !== '__hidden__' &&
        targetScene !== ctx.player.area_id
    );
  }

  /**
   * 跨场景推进：只更新剧情进度和 NPC 位置，不移动玩家。
   * 旧位置的剧情 NPC 先全部移出地图，再把目标节点需要的剧情 NPC 放回目标场景。
   */
  private async advanceStoryToNode(
    playerId: string,
    node: DialogueNodeRow,
    _ctx: PlayerDialogueContext
  ): Promise<void> {
    if (!node.package_id) return;
    await upsertStoryProgress(this.db, playerId, node.package_id, node.id, 'ACTIVE');
    await hidePlayerStoryNpcs(this.db, playerId, node.package_id);
    await ensurePlayerStoryNpcForNode(this.db, playerId, node);
  }

  private async loadNodeLocation(
    nodeId: string,
    playerId: string
  ): Promise<NodeLocationRow | null> {
    return await this.db
      .prepare(
        `SELECT d.scene_id AS node_scene_id, ds.zone_id AS node_scene_zone_id,
                n.scene_id AS instance_scene_id, s.zone_id AS instance_scene_zone_id
         FROM dialogue_nodes d
         LEFT JOIN scenes ds ON ds.id = d.scene_id
         LEFT JOIN npc_instances n ON n.npc_id = (
           SELECT i.npc_id
           FROM npc_instances i
           WHERE i.status = 'ACTIVE'
             AND (
               (
                 d.package_id IS NOT NULL
                 AND i.npc_role = 'STORY'
                 AND i.owner_player_id = ?
                 AND i.dialogue_package_id = d.package_id
               )
               OR (
                 d.package_id IS NULL
                 AND i.npc_role = 'MAP'
                 AND (i.npc_id = d.npc_id OR i.key = d.npc_id OR i.template_id = d.npc_id)
               )
             )
           ORDER BY i.created_at ASC
           LIMIT 1
         )
         LEFT JOIN scenes s ON s.id = n.scene_id
         WHERE d.id = ?`
      )
      .bind(playerId, nodeId)
      .first<NodeLocationRow>();
  }

  /**
   * 校验玩家是否在节点允许的位置：
   * - 节点地图与实例地图任一匹配即放行（剧情换图过渡期兼容）；
   * - 过场节点（__hidden__）不做位置校验。
   */
  private assertPlayerAtNodeLocation(
    ctx: PlayerDialogueContext,
    location: NodeLocationRow
  ): void {
    if (location.node_scene_id === '__hidden__') return;

    const candidates: Array<{ scene_id: string | null; scene_zone_id: string | null }> = [];
    if (location.node_scene_id) {
      candidates.push({
        scene_id: location.node_scene_id,
        scene_zone_id: location.node_scene_zone_id,
      });
    }
    if (
      location.instance_scene_id &&
      location.instance_scene_id !== location.node_scene_id
    ) {
      candidates.push({
        scene_id: location.instance_scene_id,
        scene_zone_id: location.instance_scene_zone_id,
      });
    }
    this.assertPlayerAtAnyNpcLocation(ctx, candidates);
  }

  private assertPlayerAtNpcLocation(
    ctx: PlayerDialogueContext,
    location: { scene_id?: string | null; scene_zone_id?: string | null }
  ): void {
    const hasArea = Boolean(location.scene_id && ctx.player.area_id);
    // area_id 是比 zone_id 更细粒度的权威位置；玩家已经站在目标场景时，
    // 不再因历史遗留的 zone_id 冗余字段不一致而误判“相隔两界”。
    const areaMatches = hasArea && location.scene_id === ctx.player.area_id;

    if (
      !areaMatches &&
      location.scene_zone_id &&
      ctx.player.zone_id &&
      location.scene_zone_id !== ctx.player.zone_id
    ) {
      throw new Error('相隔两界，神识无法触及');
    }

    if (hasArea && !areaMatches) {
      throw new Error('仙长不在此地，需先行前往对应场景');
    }
  }

  /**
   * 候选位置任一匹配即放行。
   * 用于剧情节点换图后、玩家尚未离开旧地图的过渡对话。
   */
  private assertPlayerAtAnyNpcLocation(
    ctx: PlayerDialogueContext,
    locations: Array<{ scene_id: string | null; scene_zone_id: string | null }>
  ): void {
    if (locations.length === 0) return;

    let lastError: Error | null = null;
    for (const location of locations) {
      try {
        this.assertPlayerAtNpcLocation(ctx, location);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('仙长不在此地，需先行前往对应场景');
      }
    }

    throw lastError || new Error('仙长不在此地，需先行前往对应场景');
  }

  private readConditions(raw: string | null | undefined): JsonReadResult<DialogueCondition[]> {
    if (!raw) return { ok: true, data: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, data: [] };
    }

    const result = DialogueConditionSchema.array().safeParse(parsed);
    if (!result.success) {
      console.warn('[DialogueEngine] 条件配置校验失败:', result.error.issues);
      return { ok: false, data: [] };
    }
    return { ok: true, data: result.data };
  }

  private readActions(raw: string | null | undefined): JsonReadResult<DialogueAction[]> {
    if (!raw) return { ok: true, data: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, data: [] };
    }

    const result = DialogueActionSchema.array().safeParse(parsed);
    if (!result.success) {
      console.warn('[DialogueEngine] 动作配置校验失败:', result.error.issues);
      return { ok: false, data: [] };
    }
    return { ok: true, data: result.data };
  }

  private readJsonObject(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
}

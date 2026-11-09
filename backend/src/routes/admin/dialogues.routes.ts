import { createAdminRouter, safeParseJson } from './types';
import {
  normalizePagesInput,
  parseNodePages,
  serializePagesJson,
  serializePagesToContent,
} from '../../services/npc/dialoguePages';
import { validateNotificationGrants } from '../../services/notificationGrantService';
import { DialogueActionSchema } from '../../models/dialogue';
import {
  deleteStoryBattleNpcForOption,
  upsertStoryBattleNpcForOption,
  type StoryEncounterConfig,
} from '../../services/npc/storyBattleNpcService';

export const dialoguesRoutes = createAdminRouter();

/**
 * 获取剧本资产列表（含节点数量、绑定地图 NPC 数量统计）
 * GET /api/admin/dialogues/packages
 */
dialoguesRoutes.get('/dialogues/packages', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
         p.id, p.name, p.description, p.category, p.default_root_node_id,
         p.created_at, p.updated_at,
         (SELECT COUNT(*) FROM dialogue_nodes WHERE package_id = p.id) AS node_count,
         (SELECT COUNT(*) FROM npc_instances WHERE dialogue_package_id = p.id AND npc_role = 'STORY_BATTLE') AS npc_count
       FROM dialogue_packages p
       ORDER BY p.updated_at DESC, p.created_at DESC`
    ).all<any>();

    return c.json({ success: true, data: results || [] });
  } catch (err: any) {
    return c.json({ error: err.message || '获取剧本列表失败' }, 500);
  }
});

/**
 * 创建新剧本资产
 * POST /api/admin/dialogues/packages
 */
dialoguesRoutes.post('/dialogues/packages', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: '剧本名称不能为空' }, 400);

  let id = String(body.id || '').trim();
  if (!id) {
    id = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const existing = await c.env.DB.prepare('SELECT id FROM dialogue_packages WHERE id = ?')
    .bind(id)
    .first();
  if (existing) {
    return c.json({ error: `剧本 ID [${id}] 已存在，请更换` }, 400);
  }

  const description = String(body.description || '').trim();
  const category = ['MAIN', 'BRANCH', 'ENCOUNTER', 'FACILITY'].includes(body.category)
    ? body.category
    : 'STORY';
  const defaultRootNodeId = String(body.default_root_node_id || '').trim() || null;

  try {
    await c.env.DB.prepare(
      `INSERT INTO dialogue_packages (id, name, description, category, default_root_node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
      .bind(id, name, description, category, defaultRootNodeId)
      .run();

    return c.json({
      success: true,
      message: `剧本【${name}】创建成功`,
      data: {
        id,
        name,
        description,
        category,
        default_root_node_id: defaultRootNodeId,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || '创建剧本失败' }, 500);
  }
});

/**
 * 获取单个剧本详情及其全部节点与选项有向图
 * GET /api/admin/dialogues/packages/:id
 */
dialoguesRoutes.get('/dialogues/packages/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  const pkg = await c.env.DB.prepare(
    `SELECT
       p.*,
       (SELECT COUNT(*) FROM npc_instances WHERE dialogue_package_id = p.id AND npc_role = 'STORY_BATTLE') AS npc_count
     FROM dialogue_packages p
     WHERE p.id = ?`
  )
    .bind(id)
    .first<any>();

  if (!pkg) return c.json({ error: '未找到指定剧本' }, 404);

  // 获取归属此剧本的全部节点
  const { results: nodeRows } = await c.env.DB.prepare(
    `SELECT * FROM dialogue_nodes WHERE package_id = ? ORDER BY id ASC`
  )
    .bind(id)
    .all<any>();

  const nodes = nodeRows || [];
  const nodeIds = nodes.map((n) => n.id);

  // 获取这些节点对应的选项
  let optionsMap = new Map<string, any[]>();
  if (nodeIds.length > 0) {
    const placeholders = nodeIds.map(() => '?').join(', ');
    const { results: optionRows } = await c.env.DB.prepare(
      `SELECT * FROM dialogue_options WHERE node_id IN (${placeholders}) ORDER BY sort_order ASC`
    )
      .bind(...nodeIds)
      .all<any>();

    for (const opt of optionRows || []) {
      const list = optionsMap.get(opt.node_id) || [];
      list.push({
        ...opt,
        show_conditions: safeParseJson(opt.show_conditions_json, []),
        enable_conditions: safeParseJson(opt.enable_conditions_json, []),
        actions: safeParseJson(opt.actions_json, []),
      });
      optionsMap.set(opt.node_id, list);
    }
  }

  const detailedNodes = nodes.map((n) => ({
    ...n,
    pages: parseNodePages(n.pages_json, n.content),
    direct_next_node_id: n.direct_next_node_id || null,
    ui_meta: safeParseJson(n.ui_meta_json, {}),
    editor_pos: safeParseJson(n.editor_pos_json, {}),
    on_enter_actions: safeParseJson(n.on_enter_actions_json, []),
    on_complete_actions: safeParseJson(n.on_complete_actions_json, []),
    options: optionsMap.get(n.id) || [],
  }));

  return c.json({
    success: true,
    data: {
      package: pkg,
      nodes: detailedNodes,
    },
  });
});

/**
 * 更新剧本元数据
 * PUT /api/admin/dialogues/packages/:id
 */
dialoguesRoutes.put('/dialogues/packages/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT * FROM dialogue_packages WHERE id = ?')
    .bind(id)
    .first<any>();
  if (!existing) return c.json({ error: '未找到指定剧本' }, 404);

  const body = await c.req.json().catch(() => ({}));

  // 支持局部更新：未提交的字段沿用数据库现值。
  // 图谱编辑器「设为起始根节点」只提交 default_root_node_id，不能因此把名称/描述清空。
  const name = body.name !== undefined
    ? String(body.name || '').trim()
    : String(existing.name || '').trim();
  if (!name) return c.json({ error: '剧本名称不能为空' }, 400);

  const description = body.description !== undefined
    ? String(body.description || '').trim()
    : String(existing.description || '').trim();

  const category = body.category !== undefined
    ? (['MAIN', 'BRANCH', 'ENCOUNTER', 'FACILITY'].includes(body.category) ? body.category : 'STORY')
    : (existing.category || 'STORY');

  const defaultRootNodeId = body.default_root_node_id !== undefined
    ? (String(body.default_root_node_id || '').trim() || null)
    : (existing.default_root_node_id || null);

  try {
    await c.env.DB.prepare(
      `UPDATE dialogue_packages
       SET name = ?, description = ?, category = ?, default_root_node_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(name, description, category, defaultRootNodeId, id)
      .run();

    return c.json({
      success: true,
      message: `剧本【${name}】更新成功`,
      data: {
        id,
        name,
        description,
        category,
        default_root_node_id: defaultRootNodeId,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || '更新剧本失败' }, 500);
  }
});

/**
 * 删除剧本资产
 * DELETE /api/admin/dialogues/packages/:id
 */
dialoguesRoutes.delete('/dialogues/packages/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  // 删除剧本即删除其完整拓扑：节点、选项、自动生成的剧情 NPC 与剧情通知；
  // 人工挂载的 NPC 实例只解绑，保留在地图上。
  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM npc_instances WHERE npc_role IN ('STORY', 'STORY_BATTLE') AND dialogue_package_id = ?"
    ).bind(id),
    c.env.DB.prepare('DELETE FROM player_story_progress WHERE package_id = ?').bind(id),
    c.env.DB.prepare('UPDATE npc_templates SET dialogue_package_id = NULL, dialogue_root_node_id = NULL WHERE dialogue_package_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM dialogue_options WHERE node_id IN (SELECT id FROM dialogue_nodes WHERE package_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM dialogue_nodes WHERE package_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM story_notifications WHERE package_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM dialogue_packages WHERE id = ?').bind(id),
  ]);

  return c.json({ success: true, message: '剧本及其节点/选项已安全删除' });
});

/**
 * 新增/更新对话节点
 * POST /api/admin/dialogues/nodes
 */
dialoguesRoutes.post('/dialogues/nodes', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const packageId = String(body.package_id || '').trim();

  let id = String(body.id || '').trim();
  if (!id) {
    id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const npcId = String(body.npc_id || '').trim() || 'speaker';
  const chapterTitle = String(body.chapter_title || '').trim() || null;
  const quoteBox = String(body.quote_box || '').trim() || null;
  const sceneId = String(body.scene_id || '').trim() || null;

  // 多段台词：pages / pages_json 优先，缺省时回退旧 content
  const rawContent = String(body.content || '').trim();
  const pages = normalizePagesInput(body.pages ?? body.pages_json, rawContent);
  const content = serializePagesToContent(pages);
  if (!content) return c.json({ error: '节点至少需要一句非空台词' }, 400);
  const pagesJson = serializePagesJson(pages);

  const directNextNodeId = String(body.direct_next_node_id || '').trim() || null;
  if (directNextNodeId) {
    if (directNextNodeId === id) {
      return c.json({ error: '直连下一节点不能是当前节点自身' }, 400);
    }
    const directTarget = await c.env.DB.prepare('SELECT id FROM dialogue_nodes WHERE id = ?')
      .bind(directNextNodeId)
      .first<{ id: string }>();
    if (!directTarget) {
      return c.json({ error: `直连目标节点 [${directNextNodeId}] 不存在` }, 400);
    }
  }
  const uiMetaJson = typeof body.ui_meta_json === 'string'
    ? body.ui_meta_json
    : JSON.stringify(body.ui_meta || {});
  const editorPosJson = typeof body.editor_pos_json === 'string'
    ? body.editor_pos_json
    : JSON.stringify(body.editor_pos || {});

  // 节点触发器：内联发放内容与通知管理使用同一套服务端校验。
  // 绑定通知资产（notificationId）时，发放内容由通知管理统一维护，不在节点内校验。
  const triggerGroups = [
    { label: '进入节点通知', actions: body.on_enter_actions },
    { label: '完成节点通知', actions: body.on_complete_actions },
  ];
  for (const group of triggerGroups) {
    if (!Array.isArray(group.actions)) continue;
    for (let index = 0; index < group.actions.length; index++) {
      const action = group.actions[index];
      if (!action || action.type !== 'SEND_NOTIFICATION') continue;
      if (String(action.notificationId || '').trim()) continue;
      if (action.grants === undefined) continue;

      try {
        await validateNotificationGrants(c.env.DB, action.grants);
      } catch (err) {
        return c.json(
          {
            error: `${group.label} 第 ${index + 1} 项：${
              err instanceof Error ? err.message : '发放内容不合法'
            }`,
          },
          400
        );
      }
    }
  }

  const onEnterActionsJson = Array.isArray(body.on_enter_actions)
    ? JSON.stringify(body.on_enter_actions)
    : (typeof body.on_enter_actions_json === 'string' ? body.on_enter_actions_json : '[]');
  const onCompleteActionsJson = Array.isArray(body.on_complete_actions)
    ? JSON.stringify(body.on_complete_actions)
    : (typeof body.on_complete_actions_json === 'string' ? body.on_complete_actions_json : '[]');

  try {
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO dialogue_nodes
           (id, npc_id, chapter_title, content, pages_json, direct_next_node_id, quote_box,
            ui_meta_json, editor_pos_json, package_id, scene_id,
            on_enter_actions_json, on_complete_actions_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           npc_id = excluded.npc_id,
           chapter_title = excluded.chapter_title,
           content = excluded.content,
           pages_json = excluded.pages_json,
           direct_next_node_id = excluded.direct_next_node_id,
           quote_box = excluded.quote_box,
           ui_meta_json = excluded.ui_meta_json,
           editor_pos_json = excluded.editor_pos_json,
           package_id = excluded.package_id,
           scene_id = excluded.scene_id,
           on_enter_actions_json = excluded.on_enter_actions_json,
           on_complete_actions_json = excluded.on_complete_actions_json`
      ).bind(
        id,
        npcId,
        chapterTitle,
        content,
        pagesJson,
        directNextNodeId,
        quoteBox,
        uiMetaJson,
        editorPosJson,
        packageId || null,
        sceneId,
        onEnterActionsJson,
        onCompleteActionsJson
      ),
    ];

    // 线性直连与分支选项互斥：直连节点保存时清空旧 options
    if (directNextNodeId) {
      statements.push(c.env.DB.prepare('DELETE FROM dialogue_options WHERE node_id = ?').bind(id));
    }

    await c.env.DB.batch(statements);

    // 若所属剧本尚无默认根节点，自动设为该新建节点
    if (packageId) {
      const pkg = await c.env.DB.prepare('SELECT default_root_node_id FROM dialogue_packages WHERE id = ?')
        .bind(packageId)
        .first<any>();
      if (pkg && !pkg.default_root_node_id) {
        await c.env.DB.prepare('UPDATE dialogue_packages SET default_root_node_id = ? WHERE id = ?')
          .bind(id, packageId)
          .run();
      }
    }

    return c.json({
      success: true,
      message: '对话节点已保存',
      data: {
        id,
        package_id: packageId,
        npc_id: npcId,
        chapter_title: chapterTitle,
        content,
        pages,
        pages_json: pagesJson,
        direct_next_node_id: directNextNodeId,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || '保存对话节点失败' }, 500);
  }
});

/**
 * 删除对话节点及其选项
 * DELETE /api/admin/dialogues/nodes/:id
 */
dialoguesRoutes.delete('/dialogues/nodes/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  try {
    // 删除的是剧本根节点时，连带清理该剧本自动生成的剧情 NPC，
    // 避免根节点被删后地图上残留一个没有剧本的世界 NPC。
    const rootOwner = await c.env.DB.prepare(
      'SELECT id FROM dialogue_packages WHERE default_root_node_id = ?'
    )
      .bind(id)
      .first<{ id: string }>();

    const statements = [
      c.env.DB.prepare(
        `DELETE FROM npc_instances
         WHERE npc_role = 'STORY_BATTLE'
           AND source_ref IN (SELECT id FROM dialogue_options WHERE node_id = ?)`
      ).bind(id),
      c.env.DB.prepare('DELETE FROM dialogue_options WHERE node_id = ?').bind(id),
      c.env.DB.prepare('UPDATE dialogue_packages SET default_root_node_id = NULL WHERE default_root_node_id = ?').bind(id),
      c.env.DB.prepare('UPDATE npc_instances SET dialogue_root_node_id = NULL WHERE dialogue_root_node_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM dialogue_nodes WHERE id = ?').bind(id),
    ];

    if (rootOwner?.id) {
      statements.unshift(
        c.env.DB.prepare(
          "DELETE FROM npc_instances WHERE npc_role = 'STORY' AND dialogue_package_id = ?"
        ).bind(rootOwner.id),
        c.env.DB.prepare('DELETE FROM player_story_progress WHERE package_id = ?').bind(rootOwner.id)
      );
    }

    await c.env.DB.batch(statements);

    return c.json({ success: true, message: '对话节点已删除' });
  } catch (err: any) {
    return c.json({ error: err.message || '删除节点失败' }, 500);
  }
});

/**
 * 新增/更新对话分支选项
 * POST /api/admin/dialogues/options
 */
dialoguesRoutes.post('/dialogues/options', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const nodeId = String(body.node_id || '').trim();
  const text = String(body.text || '').trim();
  if (!nodeId) return c.json({ error: '所属节点 node_id 不能为空' }, 400);
  if (!text) return c.json({ error: '选项文本不能为空' }, 400);

  let id = String(body.id || '').trim();
  if (!id) {
    id = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const sortOrder = Number(body.sort_order) || 1;
  const actionLabel = String(body.action_label || '').trim() || null;
  const styleType = ['GOLD', 'RED', 'GRAY', 'NORMAL'].includes(body.style_type)
    ? body.style_type
    : 'NORMAL';
  const nextNodeId = String(body.next_node_id || '').trim() || null;

  const node = await c.env.DB.prepare(
    'SELECT id, package_id, scene_id FROM dialogue_nodes WHERE id = ?'
  )
    .bind(nodeId)
    .first<{ id: string; package_id: string | null; scene_id: string | null }>();
  if (!node) {
    return c.json({ error: `所属节点 [${nodeId}] 不存在` }, 400);
  }

  const showConditionsJson = typeof body.show_conditions === 'object'
    ? JSON.stringify(body.show_conditions)
    : (body.show_conditions_json || '[]');
  const enableConditionsJson = typeof body.enable_conditions === 'object'
    ? JSON.stringify(body.enable_conditions)
    : (body.enable_conditions_json || '[]');

  let actions: any[] = [];
  if (Array.isArray(body.actions)) {
    actions = body.actions.map((action: any) => ({ ...action }));
  } else if (typeof body.actions_json === 'string' && body.actions_json.trim()) {
    try {
      const parsed = JSON.parse(body.actions_json);
      actions = Array.isArray(parsed) ? parsed : [];
    } catch {
      return c.json({ error: '选项动作 JSON 格式错误' }, 400);
    }
  }

  // 选项动作必须能被运行时解析：与 DialogueEngine 使用同一份 Zod 契约，
  // 避免把 TELEPORT 误写成 sceneId、或把节点触发器 SEND_NOTIFICATION 塞进选项，
  // 直到玩家点击时才报「动作指令配置异常」。
  // 注意：这里只做校验，落库仍写回原始 actions（保留 encounter 等扩展字段）。
  const actionCheck = DialogueActionSchema.array().safeParse(actions);
  if (!actionCheck.success) {
    const issue = actionCheck.error.issues[0];
    const index = typeof issue.path[0] === 'number' ? issue.path[0] : 0;
    const field = issue.path.slice(1).join('.');
    const badAction = (actions[index] || {}) as Record<string, unknown>;
    const badType = String(badAction.type || '');

    let hint = '';
    let fieldPart = field ? `字段 ${field} ` : '';
    if (badType === 'TELEPORT' && 'sceneId' in badAction) {
      hint = '（TELEPORT 请使用 areaId 传场景 ID，如 {"type":"TELEPORT","areaId":"square"}）';
    } else if (badType === 'SEND_NOTIFICATION') {
      hint = '（SEND_NOTIFICATION 只能配置在节点的进入/完成触发器，不能放在选项动作里）';
      fieldPart = '';
    } else if (!badType) {
      hint = `（${issue.message}）`;
    }

    return c.json(
      {
        error: `选项动作第 ${index + 1} 项（${badType || '未指定类型'}）${fieldPart}配置不合法${hint}`,
      },
      400
    );
  }

  const battleActions = actions.filter((action) => action?.type === 'START_ENCOUNTER');
  if (battleActions.length > 1) {
    return c.json({ error: '一个选项只能配置一个战斗动作' }, 400);
  }
  if (battleActions.length > 0 && nextNodeId) {
    return c.json({ error: '战斗选项不能同时设置 next_node_id，请用胜/败节点接管' }, 400);
  }

  let storyBattleNpcId: string | null = null;
  try {
    if (battleActions.length > 0) {
      const action = battleActions[0];
      const encounter = action.encounter as StoryEncounterConfig | undefined;
      if (!encounter) {
        return c.json({ error: '剧情战斗选项缺少 encounter 配置' }, 400);
      }
      if (!node.package_id) {
        return c.json({ error: '剧情战斗选项必须属于一个剧本节点' }, 400);
      }

      for (const actionItem of battleActions) {
        for (const resultNodeId of [actionItem.winNodeId, actionItem.loseNodeId]) {
          const target = String(resultNodeId || '').trim();
          if (!target) continue;
          const targetNode = await c.env.DB.prepare(
            'SELECT package_id FROM dialogue_nodes WHERE id = ?'
          )
            .bind(target)
            .first<{ package_id: string | null }>();
          if (!targetNode) {
            return c.json({ error: `战斗结果节点 [${target}] 不存在` }, 400);
          }
          if ((targetNode.package_id || null) !== (node.package_id || null)) {
            return c.json({ error: `战斗结果节点 [${target}] 不属于当前剧本` }, 400);
          }
        }
      }

      storyBattleNpcId = await upsertStoryBattleNpcForOption(c.env.DB, {
        optionId: id,
        packageId: node.package_id,
        nodeSceneId: node.scene_id,
        config: encounter,
      });
      action.npcId = storyBattleNpcId;
    } else {
      await deleteStoryBattleNpcForOption(c.env.DB, id);
    }
  } catch (err: any) {
    return c.json({ error: err?.message || '剧情战斗配置校验失败' }, 400);
  }

  const actionsJson = JSON.stringify(actions);

  try {
    await c.env.DB.prepare(
      `INSERT INTO dialogue_options
         (id, node_id, sort_order, text, action_label, style_type, next_node_id,
          show_conditions_json, enable_conditions_json, actions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         node_id = excluded.node_id,
         sort_order = excluded.sort_order,
         text = excluded.text,
         action_label = excluded.action_label,
         style_type = excluded.style_type,
         next_node_id = excluded.next_node_id,
         show_conditions_json = excluded.show_conditions_json,
         enable_conditions_json = excluded.enable_conditions_json,
         actions_json = excluded.actions_json`
    )
      .bind(
        id,
        nodeId,
        sortOrder,
        text,
        actionLabel,
        styleType,
        nextNodeId,
        showConditionsJson,
        enableConditionsJson,
        actionsJson
      )
      .run();

    return c.json({
      success: true,
      message: '对话选项已保存',
      data: {
        id,
        node_id: nodeId,
        text,
        action_label: actionLabel,
        next_node_id: nextNodeId,
        story_battle_npc_id: storyBattleNpcId,
      },
    });
  } catch (err: any) {
    if (storyBattleNpcId) {
      await deleteStoryBattleNpcForOption(c.env.DB, id).catch(() => undefined);
    }
    return c.json({ error: err.message || '保存选项失败' }, 500);
  }
});

/**
 * 删除对话选项
 * DELETE /api/admin/dialogues/options/:id
 */
dialoguesRoutes.delete('/dialogues/options/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM npc_instances WHERE npc_role = 'STORY_BATTLE' AND source_ref = ?`
      ).bind(id),
      c.env.DB.prepare('DELETE FROM dialogue_options WHERE id = ?').bind(id),
    ]);
    return c.json({ success: true, message: '选项已删除' });
  } catch (err: any) {
    return c.json({ error: err.message || '删除选项失败' }, 500);
  }
});

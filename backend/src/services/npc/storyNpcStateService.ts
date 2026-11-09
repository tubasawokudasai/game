import type { DialogueNodeRow, NpcRow } from '../../models/dialogueRows';

/**
 * 玩家剧情 NPC 状态。
 *
 * 设计：
 * - npc_instances 是唯一 NPC 表，不额外建 player_story_npcs；
 * - npc_role='STORY' 的行按“玩家 + 剧本 + 模板”唯一，代表该玩家看到的剧情 NPC；
 * - scene_id 为 NULL 表示不在地图上，非空表示显示在该场景；
 * - 剧情推进只更新 scene_id / pos_x / pos_y，不重复创建 NPC。
 */

interface StorySpeakerTemplate {
  id: string;
  name: string;
  badge: string | null;
  title: string | null;
  avatar: string | null;
  quote: string | null;
  gossip: string | null;
}

function sanitizeIdPart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, '_')
    .slice(0, 96);
}

function readNodePosition(node: DialogueNodeRow): { x: number | null; y: number | null } {
  if (!node.ui_meta_json) return { x: null, y: null };
  try {
    const meta = JSON.parse(node.ui_meta_json) as Record<string, unknown>;
    const x = Number(meta.npcPosX ?? meta.posX ?? meta.npc_x ?? meta.x);
    const y = Number(meta.npcPosY ?? meta.posY ?? meta.npc_y ?? meta.y);
    return {
      x: Number.isFinite(x) ? Math.round(x) : null,
      y: Number.isFinite(y) ? Math.round(y) : null,
    };
  } catch {
    return { x: null, y: null };
  }
}

async function loadPackageRootNodeId(
  db: D1Database,
  packageId: string
): Promise<string | null> {
  const pkg = await db
    .prepare('SELECT default_root_node_id FROM dialogue_packages WHERE id = ?')
    .bind(packageId)
    .first<{ default_root_node_id: string | null }>();
  return pkg?.default_root_node_id || null;
}

async function resolveSpeakerTemplate(
  db: D1Database,
  node: DialogueNodeRow,
  packageId: string
): Promise<StorySpeakerTemplate | null> {
  let speaker = String(node.npc_id || '').trim();

  if (!speaker || speaker === 'speaker' || speaker === 'player' || speaker === 'narrator') {
    const rootNodeId = await loadPackageRootNodeId(db, packageId);
    if (rootNodeId) {
      const rootNode = await db
        .prepare('SELECT npc_id FROM dialogue_nodes WHERE id = ?')
        .bind(rootNodeId)
        .first<{ npc_id: string | null }>();
      speaker = String(rootNode?.npc_id || '').trim();
    }
  }

  if (!speaker || speaker === 'speaker' || speaker === 'player' || speaker === 'narrator') {
    return null;
  }

  return await db
    .prepare(
      `SELECT id, name, badge, title, avatar, quote, gossip
       FROM npc_templates
       WHERE id = ? OR key = ?
       LIMIT 1`
    )
    .bind(speaker, speaker)
    .first<StorySpeakerTemplate>();
}

async function loadStoryNpcRow(db: D1Database, npcId: string): Promise<NpcRow | null> {
  return await db
    .prepare(
      `SELECT n.npc_id AS id, n.*, s.zone_id AS scene_zone_id
       FROM npc_instances n
       LEFT JOIN scenes s ON s.id = n.scene_id
       WHERE n.npc_id = ?
       LIMIT 1`
    )
    .bind(npcId)
    .first<NpcRow>();
}

/**
 * 按节点确保当前玩家存在唯一的剧情 NPC 记录，并把位置更新到该节点。
 * 返回可直接用于对话渲染的 NPC 行。
 */
export async function ensurePlayerStoryNpcForNode(
  db: D1Database,
  playerId: string,
  node: DialogueNodeRow
): Promise<NpcRow | null> {
  const packageId = String(node.package_id || '').trim();
  if (!packageId) return null;

  const template = await resolveSpeakerTemplate(db, node, packageId);
  if (!template) return null;

  const existing = await db
    .prepare(
      `SELECT npc_id, scene_id
       FROM npc_instances
       WHERE npc_role = 'STORY'
         AND owner_player_id = ?
         AND dialogue_package_id = ?
         AND template_id = ?
       LIMIT 1`
    )
    .bind(playerId, packageId, template.id)
    .first<{ npc_id: string; scene_id: string | null }>();

  const isHiddenNode = node.scene_id === '__hidden__';
  const nodeScene = isHiddenNode ? null : (node.scene_id || null);
  // __hidden__ 是显式隐藏；scene_id 为空才沿用旧位置（跟随实例地图）
  const sceneId = isHiddenNode ? null : (nodeScene ?? existing?.scene_id ?? null);
  const { x, y } = readNodePosition(node);

  if (existing) {
    await db
      .prepare(
        `UPDATE npc_instances
         SET scene_id = ?, pos_x = ?, pos_y = ?, name = ?, badge = ?, title = ?, avatar = ?,
             status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
         WHERE npc_id = ?`
      )
      .bind(
        sceneId,
        x,
        y,
        template.name,
        template.badge || '',
        template.title || '江湖中人',
        template.avatar || '',
        existing.npc_id
      )
      .run();
    return await loadStoryNpcRow(db, existing.npc_id);
  }

  const rootNodeId = await loadPackageRootNodeId(db, packageId);
  const npcId = `npcinst_story_${sanitizeIdPart(playerId)}_${sanitizeIdPart(packageId)}_${sanitizeIdPart(template.id)}`;

  await db
    .prepare(
      `INSERT INTO npc_instances
         (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
          type, quote, gossip, dialogue_package_id, dialogue_root_node_id, npc_role, pos_x, pos_y,
          owner_player_id, created_by, source, source_ref, level)
       VALUES (?, ?, 'WORLD', 'ACTIVE', ?, ?, ?, ?, ?, ?,
               'dialogue', ?, ?, ?, ?, 'STORY', ?, ?,
               ?, 'DIALOGUE', 'DIALOGUE', ?, 1)`
    )
    .bind(
      npcId,
      template.id,
      sceneId,
      `story_${packageId}`,
      template.name,
      template.badge || '',
      template.title || '江湖中人',
      template.avatar || '',
      template.quote || '',
      template.gossip || '',
      packageId,
      rootNodeId,
      x,
      y,
      playerId,
      packageId
    )
    .run();

  return await loadStoryNpcRow(db, npcId);
}

/** 把玩家在当前剧本中的全部剧情 NPC 从地图上移除（scene_id = NULL）。 */
export async function hidePlayerStoryNpcs(
  db: D1Database,
  playerId: string,
  packageId: string
): Promise<void> {
  if (!packageId) return;
  await db
    .prepare(
      `UPDATE npc_instances
       SET scene_id = NULL, pos_x = NULL, pos_y = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE npc_role = 'STORY'
         AND owner_player_id = ?
         AND dialogue_package_id = ?`
    )
    .bind(playerId, packageId)
    .run();
}

/** 把单条剧情 NPC 从地图上移除（scene_id = NULL）。 */
async function hideStoryNpcInstance(db: D1Database, npcId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE npc_instances
       SET scene_id = NULL, pos_x = NULL, pos_y = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE npc_id = ? AND npc_role = 'STORY'`
    )
    .bind(npcId)
    .run();
}

/** 写入玩家剧情进度；不涉及 NPC 位置。 */
export async function upsertStoryProgress(
  db: D1Database,
  playerId: string,
  packageId: string,
  nodeId: string,
  status: 'ACTIVE' | 'COMPLETED'
): Promise<void> {
  if (!packageId || !nodeId) return;
  await db
    .prepare(
      `INSERT INTO player_story_progress (player_id, package_id, node_id, status, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(player_id, package_id) DO UPDATE SET
         node_id = excluded.node_id,
         status = excluded.status,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(playerId, packageId, nodeId, status)
    .run();
}

/** 完成当前剧情节点：进度标记 COMPLETED，并把该剧本剧情 NPC 全部移出地图。 */
export async function completeStoryNode(
  db: D1Database,
  playerId: string,
  node: DialogueNodeRow
): Promise<void> {
  if (!node.package_id) return;
  await upsertStoryProgress(db, playerId, node.package_id, node.id, 'COMPLETED');
  await hidePlayerStoryNpcs(db, playerId, node.package_id);
}

/**
 * 玩家进入地图时，按剧本根节点 / 当前剧情节点补齐 STORY 记录。
 * 只 upsert 位置，不创建新的 NPC 定义。
 *
 * 多个剧本可能在同一个场景用同一个 NPC 模板做入口（例如前后两章都由
 * 「长乐统领」引出）。此时同一位角色会出现多条 STORY 记录，地图上看起来
 * 就是两个一模一样的人。这里按「进行中的剧本优先，其次最早创建的剧本」
 * 只保留一个可见入口；其余记录仍然保留，等当前剧本完成后自动接上。
 */
export async function bootstrapPlayerStoryNpcs(
  db: D1Database,
  playerId: string
): Promise<void> {
  const { results: packages } = await db
    .prepare(
      `SELECT id, default_root_node_id, created_at
       FROM dialogue_packages
       WHERE default_root_node_id IS NOT NULL
       ORDER BY created_at ASC, id ASC`
    )
    .all<{ id: string; default_root_node_id: string; created_at: string | null }>();

  if (!packages || packages.length === 0) return;

  const { results: progressRows } = await db
    .prepare(
      `SELECT package_id, node_id, status, updated_at
       FROM player_story_progress
       WHERE player_id = ?`
    )
    .bind(playerId)
    .all<{
      package_id: string;
      node_id: string;
      status: string;
      updated_at: string | null;
    }>();

  const progressMap = new Map(
    (progressRows || []).map((row) => [row.package_id, row])
  );

  // 已完成的剧本先统一收起，避免它们占用下面的可见入口槽位。
  for (const pkg of packages) {
    if (progressMap.get(pkg.id)?.status === 'COMPLETED') {
      await hidePlayerStoryNpcs(db, playerId, pkg.id);
    }
  }

  const activePackages = packages
    .filter((pkg) => progressMap.get(pkg.id)?.status === 'ACTIVE')
    .sort((a, b) => {
      const aAt = progressMap.get(a.id)?.updated_at || '';
      const bAt = progressMap.get(b.id)?.updated_at || '';
      return bAt.localeCompare(aAt);
    });
  const pendingPackages = packages.filter(
    (pkg) => progressMap.get(pkg.id)?.status !== 'ACTIVE'
  );

  // 可见槽位 = 场景 + NPC 模板；同一槽位只能站一位剧情角色。
  const occupiedSlots = new Set<string>();

  for (const pkg of [...activePackages, ...pendingPackages]) {
    const progress = progressMap.get(pkg.id);
    if (progress?.status === 'COMPLETED') continue;

    const nodeId = progress?.node_id || pkg.default_root_node_id;
    if (!nodeId) continue;

    const node = await db
      .prepare('SELECT * FROM dialogue_nodes WHERE id = ?')
      .bind(nodeId)
      .first<DialogueNodeRow>();
    if (!node) continue;

    const npc = await ensurePlayerStoryNpcForNode(db, playerId, node);
    if (!npc?.scene_id) continue;

    const identity = npc.template_id || npc.name;
    const slot = identity ? `${npc.scene_id}::${identity}` : null;
    if (!slot) continue;

    if (progress?.status === 'ACTIVE') {
      // 玩家正在进行的剧情永远展示。
      occupiedSlots.add(slot);
      continue;
    }

    // 尚未开始的剧本入口：如果该位置已经被进行中/更早的剧本占用，
    // 先收起，等前一个剧本结束后下一次进入地图时会自动出现。
    if (occupiedSlots.has(slot)) {
      await hideStoryNpcInstance(db, npc.id);
    } else {
      occupiedSlots.add(slot);
    }
  }
}

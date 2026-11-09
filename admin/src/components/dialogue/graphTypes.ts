import { DialogueNodeItem, DialoguePage } from '../../types';

export interface NodePosition {
  x: number;
  y: number;
}

export interface GraphNodeState extends DialogueNodeItem {
  position: NodePosition;
}

export interface GraphEdgeData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceOptionId: string;
  optionIndex: number;
  optionText: string;
  actionLabel?: string | null;
  styleType: 'GOLD' | 'RED' | 'GRAY' | 'NORMAL';
  /** 无分支直连线：虚线 + “继续 →”徽标 */
  isDirect?: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pathD: string;
  midX: number;
  midY: number;
}

export const NODE_WIDTH = 290;
export const NODE_HEADER_HEIGHT = 44;
export const OPTION_ROW_HEIGHT = 36;
/** 直连线从卡片右侧固定锚点出发的 Y 偏移 */
export const DIRECT_EDGE_START_Y = 72;

/**
 * 将后端/编辑器的多段台词统一成 DialoguePage[]。
 * 双向兼容：
 * - node.pages 非空 -> 直接使用；
 * - 否则解析 node.content：JSON 数组字符串、\n---\n 分隔、普通文本。
 */
export function getNodePages(node: DialogueNodeItem): DialoguePage[] {
  const rawPages = Array.isArray(node.pages) ? node.pages : [];
  if (rawPages.length > 0) {
    const normalized = rawPages
      .map((page) => ({
        speaker_id:
          typeof page?.speaker_id === 'string' && page.speaker_id.trim()
            ? page.speaker_id.trim()
            : undefined,
        content: typeof page?.content === 'string' ? page.content : String(page?.content ?? ''),
      }))
      .filter((page) => page.content.trim().length > 0);
    if (normalized.length > 0) return normalized;
  }

  return parsePagesFromContent(node.content);
}

/**
 * 从旧字段 content 解析多页台词。
 */
export function parsePagesFromContent(content?: string | null): DialoguePage[] {
  const text = typeof content === 'string' ? content : '';
  const trimmed = text.trim();
  if (!trimmed) return [{ speaker_id: undefined, content: '' }];

  // 1. JSON 数组字符串（可能是纯字符串数组或对象数组）
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const pages: DialoguePage[] = [];
        for (const item of parsed) {
          if (typeof item === 'string') {
            pages.push({ content: item });
          } else if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            const pageContent = typeof record.content === 'string' ? record.content : '';
            const speakerId =
              typeof record.speaker_id === 'string' && record.speaker_id.trim()
                ? record.speaker_id.trim()
                : undefined;
            if (pageContent.trim()) pages.push({ speaker_id: speakerId, content: pageContent });
          }
        }
        if (pages.length > 0) return pages;
      }
    } catch {
      // 非 JSON，按普通文本处理
    }
  }

  // 2. \n---\n 分隔符
  const sections = text
    .split(/\n\s*---\s*\n/g)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
  if (sections.length > 1) {
    return sections.map((section) => ({ content: section }));
  }

  // 3. 普通文本
  return [{ speaker_id: undefined, content: text }];
}

/**
 * 保存时把多页台词同步回 content 字段：
 * 用 \n---\n 合并，旧接口/旧数据读取时仍可还原多页。
 */
export function serializePagesToContent(pages: DialoguePage[]): string {
  return pages
    .map((page) => (typeof page.content === 'string' ? page.content : ''))
    .map((content) => content.trim())
    .filter((content) => content.length > 0)
    .join('\n---\n');
}

/**
 * 计算贝塞尔连线 SVG 路径与中点
 */
export function calculateBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { pathD: string; midX: number; midY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // 水平距离控制点弯曲程度
  let curvature = Math.max(60, Math.abs(dx) * 0.45);
  
  // 如果连线往左回绕（形成循环或回溯对话分支）
  if (dx < 0) {
    curvature = Math.max(100, Math.abs(dy) * 0.4 + Math.abs(dx) * 0.2);
  }

  const cx1 = x1 + curvature;
  const cy1 = y1;
  const cx2 = x2 - curvature;
  const cy2 = y2;

  const pathD = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

  // 计算贝塞尔曲线 t=0.5 处的精确中点，用于放置分支标签徽章
  const t = 0.5;
  const midX = (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * cx1 + 3 * (1 - t) * t ** 2 * cx2 + t ** 3 * x2;
  const midY = (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * cy1 + 3 * (1 - t) * t ** 2 * cy2 + t ** 3 * y2;

  return { pathD, midX, midY };
}

/**
 * 拓扑层级自动整理排版算法 (DAG Auto-Layout)
 */
export function autoLayoutNodes(
  nodes: DialogueNodeItem[],
  rootNodeId?: string | null
): Record<string, NodePosition> {
  if (nodes.length === 0) return {};

  const nodeMap = new Map<string, DialogueNodeItem>();
  const childrenMap = new Map<string, string[]>();
  const parentsCount = new Map<string, number>();

  nodes.forEach((n) => {
    nodeMap.set(n.id, n);
    childrenMap.set(n.id, []);
    parentsCount.set(n.id, 0);
  });

  // 构建邻接表（分支选项 + 无分支直连）
  nodes.forEach((n) => {
    const children = childrenMap.get(n.id);
    if (!children) return;

    const seen = new Set<string>();
    const addChild = (targetId?: string | null) => {
      if (!targetId || !nodeMap.has(targetId) || seen.has(targetId)) return;
      seen.add(targetId);
      children.push(targetId);
      parentsCount.set(targetId, (parentsCount.get(targetId) || 0) + 1);
    };

    if (n.options) {
      n.options.forEach((opt) => {
        addChild(opt.next_node_id);
        (opt.actions || []).forEach((act: any) => {
          if (act.type === 'START_ENCOUNTER') {
            if (act.winNodeId) addChild(act.winNodeId);
            if (act.loseNodeId) addChild(act.loseNodeId);
          }
        });
      });
    }
    addChild(n.direct_next_node_id);
  });

  // 确定起始层根节点
  let startingIds: string[] = [];
  if (rootNodeId && nodeMap.has(rootNodeId)) {
    startingIds = [rootNodeId];
  } else {
    // 找出所有入度为 0 的节点
    startingIds = nodes.filter((n) => (parentsCount.get(n.id) || 0) === 0).map((n) => n.id);
    if (startingIds.length === 0 && nodes.length > 0) {
      startingIds = [nodes[0].id];
    }
  }

  // BFS 分层
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = [];

  startingIds.forEach((id) => {
    queue.push({ id, level: 0 });
    levels.set(id, 0);
    visited.add(id);
  });

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      const nextLevel = level + 1;
      const currentLevel = levels.get(childId);
      if (currentLevel === undefined || nextLevel > currentLevel) {
        levels.set(childId, nextLevel);
      }
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, level: nextLevel });
      }
    }
  }

  // 处理孤立未连通节点
  let orphanLevel = 0;
  nodes.forEach((n) => {
    if (!levels.has(n.id)) {
      levels.set(n.id, orphanLevel);
      orphanLevel++;
    }
  });

  // 按层分组
  const levelGroups = new Map<number, string[]>();
  levels.forEach((level, id) => {
    const list = levelGroups.get(level) || [];
    list.push(id);
    levelGroups.set(level, list);
  });

  const positions: Record<string, NodePosition> = {};
  const HORIZONTAL_SPACING = 380;
  const VERTICAL_SPACING = 240;
  const START_X = 80;
  const START_Y = 100;

  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
  sortedLevels.forEach((level) => {
    const idsInLevel = levelGroups.get(level) || [];
    const totalHeight = idsInLevel.length * VERTICAL_SPACING;
    const startY = START_Y + Math.max(0, (VERTICAL_SPACING * 3 - totalHeight) / 2);

    idsInLevel.forEach((id, index) => {
      positions[id] = {
        x: START_X + level * HORIZONTAL_SPACING,
        y: startY + index * VERTICAL_SPACING,
      };
    });
  });

  return positions;
}

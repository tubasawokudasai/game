import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  Compass,
  ArrowRight,
  Info,
  Check,
  LayoutGrid,
} from 'lucide-react';
import {
  DialoguePackageDetail,
  DialogueNodeItem,
  DialogueOptionItem,
  NpcTemplateItem,
  NpcItem,
  MonsterGroupItem,
  SceneItem,
  StoryNotificationItem,
} from '../types';
import { adminApi } from '../services/api';
import {
  GraphEdgeData,
  NodePosition,
  NODE_WIDTH,
  DIRECT_EDGE_START_Y,
  calculateBezierPath,
  autoLayoutNodes,
} from './dialogue/graphTypes';
import { DialogueNodeCard } from './dialogue/DialogueNodeCard';
import { DialogueNodeModal } from './dialogue/DialogueNodeModal';
import type { GrantCatalogData } from './GrantContentEditor';

interface DialogueGraphEditorProps {
  packageDetail: DialoguePackageDetail;
  npcTemplates?: NpcTemplateItem[];
  npcInstances?: NpcItem[];
  monsterGroups?: MonsterGroupItem[];
  scenes?: SceneItem[];
  storyNotifications?: StoryNotificationItem[];
  grantCatalog?: GrantCatalogData;
  onRefresh: () => Promise<void> | void;
}

export const DialogueGraphEditor: React.FC<DialogueGraphEditorProps> = ({
  packageDetail,
  npcTemplates = [],
  npcInstances = [],
  monsterGroups = [],
  scenes = [],
  storyNotifications = [],
  grantCatalog = { items: [], companions: [] },
  onRefresh,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 画布平移与缩放
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 60 });
  const [zoom, setZoom] = useState<number>(1.0);

  // 节点位置本地缓存 (nodeId -> {x, y})
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});

  // 节点端口在卡片内部的真实相对 Y 偏移量 (nodeId -> { options: Record<optId, offsetY>, direct?: offsetY })
  const [nodePortOffsets, setNodePortOffsets] = useState<
    Record<string, { options: Record<string, number>; direct?: number }>
  >({});

  // 交互选中状态
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // 双击编辑弹窗状态
  const [editingNode, setEditingNode] = useState<DialogueNodeItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 保存提示与状态
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 正在连线状态：记录起点节点 ID、选项 ID（若从选项引出）或直连端口
  const [connectingState, setConnectingState] = useState<{
    sourceNodeId: string;
    sourceOptionId?: string; // 如果是从具体选项右侧圆圈连出
    startX: number;
    startY: number;
    currentMouseX: number;
    currentMouseY: number;
  } | null>(null);

  // 拖拽节点状态引用
  const dragNodeRef = useRef<{
    nodeId: string;
    startMouseX: number;
    startMouseY: number;
    initialX: number;
    initialY: number;
    currentX: number;
    currentY: number;
    moved: boolean;
  } | null>(null);

  // 画布平移状态引用
  const panCanvasRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 2400);
  }, []);

  const nodes = packageDetail.nodes || [];
  const rootNodeId = packageDetail.package.default_root_node_id;

  // 初始化或当后端数据加载时，从 editor_pos_json 读取坐标
  useEffect(() => {
    const newPos: Record<string, NodePosition> = {};
    let needsAutoLayout = false;

    nodes.forEach((n) => {
      const pos = n.editor_pos;
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        newPos[n.id] = { x: pos.x, y: pos.y };
      } else {
        needsAutoLayout = true;
      }
    });

    // 如果部分或全部节点未设定坐标，自动进行初始排版计算
    if (needsAutoLayout && nodes.length > 0) {
      const layoutPositions = autoLayoutNodes(nodes, rootNodeId);
      nodes.forEach((n) => {
        if (!newPos[n.id]) {
          newPos[n.id] = layoutPositions[n.id] || { x: 100, y: 100 };
        }
      });
    }

    setPositions(newPos);
  }, [packageDetail, rootNodeId]);

  // 计算所有有向连线数据
  const edges: GraphEdgeData[] = useMemo(() => {
    const list: GraphEdgeData[] = [];
    const nodeMap = new Map<string, DialogueNodeItem>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    nodes.forEach((sourceNode) => {
      const sourcePos = positions[sourceNode.id];
      if (!sourcePos) return;

      const offsets = nodePortOffsets[sourceNode.id];
      const options = sourceNode.options || [];
      options.forEach((opt, optIdx) => {
        // 起始端口：位于源卡片右侧对应选项行，优先使用真实实测的相对偏移
        const startX = sourcePos.x + NODE_WIDTH;
        const optKey = opt.id || String(optIdx);
        const measuredOffset = offsets?.options?.[optKey];
        const startY =
          typeof measuredOffset === 'number'
            ? sourcePos.y + measuredOffset
            : sourcePos.y + 115 + optIdx * 34;

        const pushEdge = (
          targetNodeId: string,
          edgeSuffix: string,
          labelText?: string,
          styleOverride?: DialogueOptionItem['style_type']
        ) => {
          const targetNode = nodeMap.get(targetNodeId);
          const targetPos = targetNode ? positions[targetNode.id] : null;
          if (!targetNode || !targetPos) return;

          const endX = targetPos.x;
          const endY = targetPos.y + 28;
          const { pathD, midX, midY } = calculateBezierPath(startX, startY, endX, endY);

          list.push({
            id: `edge_${sourceNode.id}_${opt.id || optIdx}_${edgeSuffix}_${targetNode.id}`,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            sourceOptionId: opt.id,
            optionIndex: optIdx,
            optionText: opt.text,
            actionLabel: labelText ?? opt.action_label,
            styleType: styleOverride || opt.style_type || 'NORMAL',
            startX,
            startY,
            endX,
            endY,
            pathD,
            midX,
            midY,
          });
        };

        // 1. 常规 next_node_id 跳转
        if (opt.next_node_id) {
          pushEdge(opt.next_node_id, 'next');
        }

        // 2. 战斗动作 START_ENCOUNTER 的胜负节点跳转
        const actions = opt.actions || [];
        actions.forEach((act: any, actIdx: number) => {
          if (act.type === 'START_ENCOUNTER') {
            if (act.winNodeId) {
              pushEdge(
                act.winNodeId,
                `win_${actIdx}`,
                `${opt.action_label || '战斗'} · 胜`,
                'GOLD'
              );
            }
            if (act.loseNodeId) {
              pushEdge(
                act.loseNodeId,
                `lose_${actIdx}`,
                `${opt.action_label || '战斗'} · 败`,
                'GRAY'
              );
            }
          }
        });
      });

      // 无分支直连：源节点没有选项时，direct_next_node_id 生成一条虚线“继续 →”边
      if (options.length === 0 && sourceNode.direct_next_node_id) {
        const targetNode = nodeMap.get(sourceNode.direct_next_node_id);
        const targetPos = targetNode ? positions[targetNode.id] : null;

        if (targetNode && targetPos) {
          const startX = sourcePos.x + NODE_WIDTH;
          const directOffset = offsets?.direct;
          const startY =
            typeof directOffset === 'number'
              ? sourcePos.y + directOffset
              : sourcePos.y + DIRECT_EDGE_START_Y;
          const endX = targetPos.x;
          const endY = targetPos.y + 28;

          const { pathD, midX, midY } = calculateBezierPath(startX, startY, endX, endY);

          list.push({
            id: `edge_direct_${sourceNode.id}_${targetNode.id}`,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            sourceOptionId: '',
            optionIndex: -1,
            optionText: '继续',
            actionLabel: '继续 →',
            styleType: 'NORMAL',
            isDirect: true,
            startX,
            startY,
            endX,
            endY,
            pathD,
            midX,
            midY,
          });
        }
      }
    });

    return list;
  }, [nodes, positions, nodePortOffsets]);

  // 拖拽与鼠标全局事件监听
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. 拖动连线跟随（减去画布容器视口 rect 偏移，消除 zoom 与外层布局影响）
      if (connectingState) {
        const rect = containerRef.current?.getBoundingClientRect();
        const worldX = (e.clientX - (rect?.left ?? 0) - pan.x) / zoom;
        const worldY = (e.clientY - (rect?.top ?? 0) - pan.y) / zoom;
        setConnectingState((prev) =>
          prev ? { ...prev, currentMouseX: worldX, currentMouseY: worldY } : null
        );
      }

      // 2. 节点拖拽移动中
      if (dragNodeRef.current) {
        const { nodeId, startMouseX, startMouseY, initialX, initialY } = dragNodeRef.current;
        const dx = (e.clientX - startMouseX) / zoom;
        const dy = (e.clientY - startMouseY) / zoom;

        const currentX = Math.round(initialX + dx);
        const currentY = Math.round(initialY + dy);

        dragNodeRef.current.currentX = currentX;
        dragNodeRef.current.currentY = currentY;
        if (Math.hypot(dx, dy) > 4) {
          dragNodeRef.current.moved = true;
        }

        setPositions((prev) => ({
          ...prev,
          [nodeId]: { x: currentX, y: currentY },
        }));
      }

      // 3. 画布平移中
      if (panCanvasRef.current) {
        const { startMouseX, startMouseY, initialPanX, initialPanY } = panCanvasRef.current;
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        setPan({
          x: Math.round(initialPanX + dx),
          y: Math.round(initialPanY + dy),
        });
      }
    };

    const handleMouseUp = async () => {
      // 释放连线状态（若未落在入度锚点上则取消）
      if (connectingState) {
        setConnectingState(null);
      }

      // 结束节点拖拽并持久化至后端
      if (dragNodeRef.current) {
        const { nodeId, initialX, initialY, currentX, currentY, moved } = dragNodeRef.current;
        dragNodeRef.current = null;

        if (moved && (initialX !== currentX || initialY !== currentY)) {
          const targetNode = nodes.find((n) => n.id === nodeId);
          if (targetNode) {
            try {
              await adminApi.saveDialogueNode({
                ...targetNode,
                package_id: packageDetail.package.id,
                editor_pos: { x: currentX, y: currentY },
              });
              showToast(`节点【${nodeId}】坐标已同步`);
            } catch (err: any) {
              console.error('保存节点坐标异常:', err);
              showToast('同步坐标失败');
            }
          }
        }
      }

      // 结束画布平移
      if (panCanvasRef.current) {
        panCanvasRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, pan, connectingState, nodes, packageDetail.package.id, showToast]);

  // 滚轮缩放与平移：使用原生 passive: false 监听器，确保 e.preventDefault() 生效，阻止 macOS 触控板滑动返回手势
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // passive: false 才有效
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prev) => Math.min(2.0, Math.max(0.35, prev * zoomFactor)));
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX * 0.8,
          y: prev.y - e.deltaY * 0.8,
        }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 画布空白处按下拖动视口
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setSelectedNodeId(null);
      panCanvasRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        initialPanX: pan.x,
        initialPanY: pan.y,
      };
    }
  };

  // 卡片按下开始拖拽节点
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    const curPos = positions[nodeId] || { x: 0, y: 0 };
    dragNodeRef.current = {
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialX: curPos.x,
      initialY: curPos.y,
      currentX: curPos.x,
      currentY: curPos.y,
      moved: false,
    };
  };

  // 双击卡片打开编辑弹窗
  const handleNodeDoubleClick = (node: DialogueNodeItem) => {
    setEditingNode(node);
    setIsModalOpen(true);
  };

  // 自动重新整理布局并持久化全部节点
  const handleAutoLayout = async () => {
    const newPositions = autoLayoutNodes(nodes, rootNodeId);
    setPositions(newPositions);

    // 逐个批量异步同步保存各节点坐标
    try {
      showToast('正在重新整理连线拓扑布局...');
      const promises = nodes.map((n) => {
        const pos = newPositions[n.id];
        if (!pos) return Promise.resolve();
        return adminApi.saveDialogueNode({
          ...n,
          package_id: packageDetail.package.id,
          editor_pos: pos,
        });
      });
      await Promise.all(promises);
      showToast('拓扑排版已应用并保存！');
    } catch (err: any) {
      showToast('自动排版保存失败');
    }
  };

  // 适应并重置视口
  const handleFitView = () => {
    if (nodes.length === 0) {
      setPan({ x: 80, y: 60 });
      setZoom(1.0);
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    nodes.forEach((n) => {
      const p = positions[n.id];
      if (p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
      }
    });

    if (minX !== Infinity && minY !== Infinity) {
      setPan({ x: Math.max(40, 100 - minX), y: Math.max(40, 100 - minY) });
      setZoom(0.9);
    }
  };

  // 点击新建节点
  const handleCreateNode = async () => {
    const newId = `node_${packageDetail.package.id.replace('pkg_', '')}_${Date.now().toString(36).slice(-4)}`;
    const centerPos = {
      x: Math.round((-pan.x + 400) / zoom),
      y: Math.round((-pan.y + 240) / zoom),
    };

    const defaultPage = {
      speaker_id: 'speaker',
      content: '“少侠留步，前路凶险，且听老夫一言。”',
    };

    const newNode: DialogueNodeItem = {
      id: newId,
      package_id: packageDetail.package.id,
      npc_id: 'speaker',
      chapter_title: `${packageDetail.package.name} · 分支`,
      content: defaultPage.content,
      pages: [defaultPage],
      direct_next_node_id: null,
      quote_box: null,
      editor_pos: centerPos,
      options: [],
    };

    try {
      await adminApi.saveDialogueNode(newNode);
      showToast(`已新建节点【${newId}】`);
      await onRefresh();
      // 自动开启编辑
      setEditingNode(newNode);
      setIsModalOpen(true);
    } catch (err: any) {
      showToast(err.message || '新建节点失败');
    }
  };

  // 保存节点及选项
  const handleSaveNodeAndOptions = async (
    updatedNode: DialogueNodeItem,
    optionsToSave: DialogueOptionItem[],
    optionsToDelete: string[],
    makeRoot: boolean
  ) => {
    // 1. 保存节点本身
    const currentPos = positions[updatedNode.id] || { x: 100, y: 100 };
    await adminApi.saveDialogueNode({
      ...updatedNode,
      package_id: packageDetail.package.id,
      editor_pos: currentPos,
    });

    // 2. 删除需删除的选项
    for (const optId of optionsToDelete) {
      await adminApi.deleteDialogueOption(optId);
    }

    // 3. 逐个保存选项
    for (const opt of optionsToSave) {
      await adminApi.saveDialogueOption({
        ...opt,
        node_id: updatedNode.id,
      });
    }

    // 4. 若设为根节点
    if (makeRoot && packageDetail.package.default_root_node_id !== updatedNode.id) {
      await adminApi.updateDialoguePackage(packageDetail.package.id, {
        default_root_node_id: updatedNode.id,
      });
    }

    showToast(`节点【${updatedNode.id}】与流向已保存！`);
    await onRefresh();
  };

  // 删除节点
  const handleDeleteNode = async (nodeId: string) => {
    await adminApi.deleteDialogueNode(nodeId);
    showToast(`节点【${nodeId}】已删除`);
    await onRefresh();
  };

  // NPC 模板字典辅助查找展示名
  const templateMap = useMemo(() => {
    const map = new Map<string, string>();
    npcTemplates.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [npcTemplates]);

  // 处理卡片上报的各端口实际 DOM 偏移量
  const handlePortsMeasured = useCallback(
    (nodeId: string, ports: { options: Record<string, number>; direct?: number }) => {
      setNodePortOffsets((prev) => {
        const cur = prev[nodeId];
        // 简单浅比较防止无意义的状态更新
        const curOptKeys = Object.keys(cur?.options || {});
        const nextOptKeys = Object.keys(ports.options);
        if (
          cur &&
          cur.direct === ports.direct &&
          curOptKeys.length === nextOptKeys.length &&
          nextOptKeys.every((k) => cur.options[k] === ports.options[k])
        ) {
          return prev;
        }
        return {
          ...prev,
          [nodeId]: ports,
        };
      });
    },
    []
  );

  // 处理端点连线建立并持久化
  const handleConnectNodes = async (sourceId: string, targetId: string, optionId?: string) => {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return;

    try {
      if (optionId) {
        // 1. 如果是从已有选项连线：更新该 option 的 next_node_id
        const targetOpt = sourceNode.options?.find((o) => o.id === optionId);
        if (targetOpt) {
          await adminApi.saveDialogueOption({
            ...targetOpt,
            node_id: sourceNode.id,
            next_node_id: targetId,
          });
        }
      } else {
        // 2. 如果是从卡片右侧直连锚点连线：设置 direct_next_node_id
        await adminApi.saveDialogueNode({
          ...sourceNode,
          package_id: packageDetail.package.id,
          direct_next_node_id: targetId,
        });
      }

      showToast(`已成功连接至【${targetId}】`);
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || '连接节点失败');
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-[#080c14] border border-slate-800 rounded-2xl overflow-hidden select-none flex flex-col">
      {/* 顶部工具栏 */}
      <div className="px-4 py-2.5 bg-[#0d1320]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>{packageDetail.package.name}</span>
              <span className="text-xs font-mono font-normal text-slate-500">
                ({packageDetail.package.id})
              </span>
            </h4>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 pl-3 border-l border-slate-800">
            <span>节点: <strong className="text-sky-300">{nodes.length}</strong></span>
            <span>·</span>
            <span>有向连线: <strong className="text-amber-300">{edges.length}</strong></span>
          </div>
        </div>

        {/* 快捷操作与缩放控制 */}
        <div className="flex items-center gap-2">
          {/* 新增节点按钮 */}
          <button
            type="button"
            onClick={handleCreateNode}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>新建节点</span>
          </button>

          {/* 自动拓扑排版 */}
          <button
            type="button"
            onClick={handleAutoLayout}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition"
            title="根据有向连接拓扑自动重排节点位置"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">自动整理</span>
          </button>

          {/* 缩放控制组 */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}
              className="p-1 hover:text-white text-slate-400 rounded transition"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 px-1.5 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
              className="p-1 hover:text-white text-slate-400 rounded transition"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 适应视口 */}
          <button
            type="button"
            onClick={handleFitView}
            className="p-1.5 bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg transition"
            title="居中适应全部节点"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setPan({ x: 80, y: 60 });
              setZoom(1.0);
            }}
            className="p-1.5 bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg transition"
            title="还原 100% 缩放"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 状态与提示 Toast */}
      {toastMsg && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-amber-300 text-xs border border-amber-500/40 shadow-xl backdrop-blur-md flex items-center gap-1.5 animate-fadeIn">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 主画布视口 (Pannable & Zoomable Canvas) */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        className="relative flex-1 overflow-hidden cursor-crosshair bg-[#080c14]"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px, 96px 96px, 96px 96px',
        }}
      >
        {/* 缩放/平移矩阵容器 */}
        <div
          className="absolute origin-top-left will-change-transform"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          {/* SVG 有向连线底层 (SVG Directed Edges Layer) */}
          <svg
            className="absolute top-0 left-0 pointer-events-none overflow-visible"
            style={{ width: 1, height: 1 }}
          >
            <defs>
              {/* 箭头标记定义 */}
              <marker
                id="edge-arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
              </marker>

              <marker
                id="edge-arrow-gold"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
              </marker>

              <marker
                id="edge-arrow-red"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#fb7185" />
              </marker>

              <marker
                id="edge-arrow-direct"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#22d3ee" />
              </marker>

              <marker
                id="edge-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
              </marker>
            </defs>

            {/* 绘制所有有向连线 */}
            {edges.map((edge) => {
              const isHovered = hoveredEdgeId === edge.id;
              const isConnectedToSelected =
                selectedNodeId === edge.sourceNodeId || selectedNodeId === edge.targetNodeId;

              let strokeColor = '#38bdf8'; // sky
              let markerId = 'edge-arrow-default';

              if (edge.isDirect) {
                strokeColor = '#22d3ee';
                markerId = 'edge-arrow-direct';
              } else if (edge.styleType === 'GOLD') {
                strokeColor = '#fbbf24';
                markerId = 'edge-arrow-gold';
              } else if (edge.styleType === 'RED') {
                strokeColor = '#fb7185';
                markerId = 'edge-arrow-red';
              } else if (edge.styleType === 'GRAY') {
                strokeColor = '#64748b';
              }

              if (isHovered || isConnectedToSelected) {
                strokeColor = '#f59e0b';
                markerId = 'edge-arrow-active';
              }

              return (
                <g key={edge.id} className="pointer-events-auto">
                  {/* 加粗透明命中区域便于鼠标悬浮 */}
                  <path
                    d={edge.pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                  />

                  {/* 实际渲染的曲线 */}
                  <path
                    d={edge.pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isHovered || isConnectedToSelected ? 2.8 : 1.8}
                    strokeDasharray={
                      edge.isDirect ? '6,4' : edge.styleType === 'GRAY' ? '4,4' : undefined
                    }
                    markerEnd={`url(#${markerId})`}
                    className="transition-all duration-150"
                  />

                  {/* 曲线中点徽标：展示选项动作简标 */}
                  {edge.actionLabel && (
                    <foreignObject
                      x={edge.midX - 35}
                      y={edge.midY - 12}
                      width="70"
                      height="24"
                      className="pointer-events-none overflow-visible"
                    >
                      <div className="flex items-center justify-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shadow-md backdrop-blur-sm ${
                            isHovered || isConnectedToSelected
                              ? 'bg-amber-500/90 text-slate-950 border-amber-300 font-bold'
                              : edge.isDirect
                                ? 'bg-cyan-950/85 text-cyan-200 border-cyan-700/70'
                                : 'bg-slate-900/85 text-slate-300 border-slate-700'
                          }`}
                        >
                          {edge.actionLabel}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}

            {/* 拖动/点击连线中的实时预览线条 */}
            {connectingState && (
              <g className="pointer-events-none">
                {(() => {
                  const { pathD } = calculateBezierPath(
                    connectingState.startX,
                    connectingState.startY,
                    connectingState.currentMouseX,
                    connectingState.currentMouseY
                  );
                  return (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                      className="animate-pulse"
                    />
                  );
                })()}
              </g>
            )}
          </svg>

          {/* 节点卡片层 (Dialogue Node Cards Layer) */}
          {nodes.map((node) => {
            const pos = positions[node.id] || { x: 100, y: 100 };
            return (
              <DialogueNodeCard
                key={node.id}
                node={node}
                position={pos}
                isRoot={node.id === rootNodeId}
                isSelected={selectedNodeId === node.id}
                isHovered={hoveredNodeId === node.id}
                speakerName={templateMap.get(node.npc_id)}
                speakerNameMap={templateMap}
                onSelect={(id) => setSelectedNodeId(id)}
                onDoubleClick={handleNodeDoubleClick}
                onMouseDown={handleNodeMouseDown}
                onPortsMeasured={handlePortsMeasured}
                onStartConnect={(nodeId, optionId, startX, startY) => {
                  const defaultStartX = pos.x + NODE_WIDTH;
                  const defaultStartY = pos.y + 28;
                  const actualStartX = startX ?? defaultStartX;
                  const actualStartY = startY ?? defaultStartY;
                  setConnectingState({
                    sourceNodeId: nodeId,
                    sourceOptionId: optionId,
                    startX: actualStartX,
                    startY: actualStartY,
                    currentMouseX: actualStartX,
                    currentMouseY: actualStartY,
                  });
                }}
                onTargetPortMouseUp={(targetNodeId) => {
                  if (!connectingState) return;
                  if (connectingState.sourceNodeId === targetNodeId) {
                    showToast('不能连接节点自身');
                    setConnectingState(null);
                    return;
                  }
                  handleConnectNodes(
                    connectingState.sourceNodeId,
                    targetNodeId,
                    connectingState.sourceOptionId
                  );
                  setConnectingState(null);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 底部操作图例与提示 */}
      <div className="px-4 py-2 bg-[#0d1320] border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-400" />
            <span>剧本起点</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-sky-500/20 border border-sky-400" />
            <span>普通分支</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-400" />
            <span>重点分支</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-400" />
            <span>战斗/危险分支</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-dashed border-cyan-400/80" />
            <span>直连继续</span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-500">
          <span>💡 提示：按住鼠标左键拖动画布或节点 | 双击卡片编辑多段台词、流向模式与选项</span>
        </div>
      </div>

      {/* 双击编辑节点弹窗 */}
      <DialogueNodeModal
        isOpen={isModalOpen}
        node={editingNode}
        allNodes={nodes}
        npcTemplates={npcTemplates}
        monsterGroups={monsterGroups}
        scenes={scenes}
        storyNotifications={storyNotifications}
        grantCatalog={grantCatalog}
        isRootNode={editingNode ? editingNode.id === rootNodeId : false}
        onClose={() => {
          setIsModalOpen(false);
          setEditingNode(null);
        }}
        onSaveNode={handleSaveNodeAndOptions}
        onDeleteNode={handleDeleteNode}
      />
    </div>
  );
};

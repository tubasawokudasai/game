import React, { useLayoutEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowRight,
  GripHorizontal,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { DialogueNodeItem, DialoguePage } from '../../types';
import { DIRECT_EDGE_START_Y, NODE_WIDTH, getNodePages } from './graphTypes';

interface DialogueNodeCardProps {
  node: DialogueNodeItem;
  position: { x: number; y: number };
  isRoot: boolean;
  isSelected: boolean;
  isHovered: boolean;
  speakerName?: string;
  speakerNameMap?: Map<string, string>;
  onSelect: (nodeId: string) => void;
  onDoubleClick: (node: DialogueNodeItem) => void;
  onMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  onStartConnect?: (nodeId: string, optionId?: string, startX?: number, startY?: number) => void;
  onTargetPortMouseUp?: (targetNodeId: string) => void;
  onPortsMeasured?: (nodeId: string, ports: { options: Record<string, number>; direct?: number }) => void;
}

const STYLE_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  GOLD: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  RED: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
  GRAY: { bg: 'bg-slate-700/30', text: 'text-slate-400', border: 'border-slate-600/30' },
  NORMAL: { bg: 'bg-sky-500/10', text: 'text-sky-300', border: 'border-sky-500/30' },
};

export const DialogueNodeCard: React.FC<DialogueNodeCardProps> = ({
  node,
  position,
  isRoot,
  isSelected,
  isHovered,
  speakerName,
  speakerNameMap,
  onSelect,
  onDoubleClick,
  onMouseDown,
  onStartConnect,
  onTargetPortMouseUp,
  onPortsMeasured,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const directAnchorRef = useRef<HTMLDivElement>(null);
  const optionRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const pages = getNodePages(node);
  const firstPage = pages[0];
  const secondPage = pages[1];
  const options = node.options || [];
  const isDirect = options.length === 0 && Boolean(node.direct_next_node_id);

  // 测量并向父组件上报各端口在卡片内部的真实相对 Y 偏移量（不受 zoom/pan 影响）
  useLayoutEffect(() => {
    if (!onPortsMeasured || !cardRef.current) return;
    const optionPorts: Record<string, number> = {};

    options.forEach((opt, idx) => {
      const key = opt.id || String(idx);
      const rowEl = optionRowRefs.current.get(key);
      if (rowEl) {
        // offsetTop 是相对于 cardRef (最近的 relative 祖先)
        optionPorts[key] = rowEl.offsetTop + rowEl.offsetHeight / 2;
      }
    });

    let directY: number | undefined;
    if (isDirect && directAnchorRef.current) {
      directY = directAnchorRef.current.offsetTop + directAnchorRef.current.offsetHeight / 2;
    }

    onPortsMeasured(node.id, { options: optionPorts, direct: directY });
  });

  const resolveSpeakerLabel = (page?: DialoguePage) => {
    const speakerId = page?.speaker_id || node.npc_id;
    if (!speakerId || speakerId === 'speaker') {
      return speakerName || (node.npc_id !== 'speaker' ? node.npc_id : '旁白');
    }
    if (speakerId === 'player') return '主角';
    if (speakerId === 'narrator') return '旁白';
    if (speakerId === node.npc_id && speakerName) return speakerName;
    return speakerNameMap?.get(speakerId) || speakerId;
  };

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${NODE_WIDTH}px`,
      }}
      className={`absolute top-0 left-0 select-none cursor-grab active:cursor-grabbing rounded-xl border transition-shadow duration-150 backdrop-blur-md shadow-xl ${
        isSelected
          ? 'bg-[#151c2e]/95 border-amber-400 ring-2 ring-amber-400/30 shadow-amber-500/20 z-30'
          : isHovered
          ? 'bg-[#131929]/95 border-sky-400/70 shadow-sky-500/20 z-20'
          : isRoot
          ? 'bg-[#101726]/90 border-emerald-500/60 shadow-emerald-500/10 z-10'
          : 'bg-[#0f1422]/90 border-slate-700/80 hover:border-slate-500 shadow-black/40 z-10'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(node);
      }}
      onMouseDown={(e) => {
        // 允许卡片拖动，阻止冒泡以避免同时触发画布平移
        if (e.button === 0) {
          e.stopPropagation();
          onMouseDown(node.id, e);
        }
      }}
    >
      {/* 节点入度锚点 (Target Input Port) */}
      <div
        className="absolute -left-2 top-7 w-4 h-4 rounded-full bg-[#0a0e1a] border-2 border-sky-400 shadow-md flex items-center justify-center z-20 group cursor-crosshair hover:scale-125 transition-transform"
        title={`入度连接点：流入当前节点 (${node.id})`}
        onMouseUp={(e) => {
          e.stopPropagation();
          onTargetPortMouseUp?.(node.id);
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-sky-300 pointer-events-none" />
      </div>

      {/* 直连模式的右侧固定输出锚点：与 GraphEditor 的 startY 对齐 */}
      {isDirect && (
        <div
          ref={directAnchorRef}
          style={{ top: DIRECT_EDGE_START_Y - 8 }}
          className="absolute -right-2 w-4 h-4 rounded-full bg-[#0a0e1a] border-2 border-cyan-400 shadow-md flex items-center justify-center z-20 group cursor-crosshair hover:scale-125 transition-transform"
          title={`直连输出锚点 -> 拖拽连接至下一节点`}
          onMouseDown={(e) => {
            if (e.button === 0) {
              e.stopPropagation();
              const directY = directAnchorRef.current
                ? position.y + directAnchorRef.current.offsetTop + directAnchorRef.current.offsetHeight / 2
                : position.y + DIRECT_EDGE_START_Y;
              onStartConnect?.(
                node.id,
                undefined,
                position.x + NODE_WIDTH,
                directY
              );
            }
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 pointer-events-none" />
        </div>
      )}

      {/* 头部：标题、角色名、根节点标记与拖拽把手 */}
      <div className="p-3 border-b border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0 cursor-grab" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-slate-200 truncate" title={node.id}>
                {node.id}
              </span>
              {isRoot && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-0.5 shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>起点</span>
                </span>
              )}
            </div>
            {node.chapter_title && (
              <p className="text-[11px] text-amber-300/80 truncate flex items-center gap-1 mt-0.5">
                <Bookmark className="w-3 h-3 shrink-0" />
                <span>{node.chapter_title}</span>
              </p>
            )}
          </div>
        </div>

        {/* 说话人标识 + 多页徽标 */}
        <div className="shrink-0 text-right flex flex-col items-end gap-1">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-sky-300 border border-slate-700">
            {resolveSpeakerLabel(firstPage)}
          </span>
          {pages.length > 1 && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5"
              title={`节点内共 ${pages.length} 页线性台词`}
            >
              <BookOpen className="w-2.5 h-2.5" />
              <span>{pages.length} 页对话</span>
            </span>
          )}
        </div>
      </div>

      {/* 身体：第 1 页台词 + 第 2 页预览 */}
      <div className="p-3 space-y-2">
        <div
          className="text-xs text-slate-300 leading-relaxed max-h-20 overflow-hidden line-clamp-3 font-normal whitespace-pre-wrap"
          title={firstPage?.content || ''}
        >
          {firstPage?.content || '（空白台词）'}
        </div>

        {pages.length > 1 && (
          <div className="text-[10px] text-cyan-300/60 leading-relaxed line-clamp-1 border-l-2 border-cyan-500/20 pl-1.5">
            下一页：{secondPage?.content || '…'}
            <span className="text-slate-500"> · 其余 {pages.length - 1} 句</span>
          </div>
        )}

        {node.quote_box && (
          <div className="p-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400 italic line-clamp-1">
            “{node.quote_box}”
          </div>
        )}
      </div>

      {/* 底部：分支选项 / 线性直连 / 结束 */}
      <div className="px-3 pb-3 space-y-1.5 border-t border-slate-800/60 pt-2">
        {isDirect ? (
          <>
            <div className="flex items-center justify-between text-[10px] text-cyan-300/80 font-medium pb-1">
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                <span>线性直连</span>
              </span>
              <span className="text-slate-500">双击卡片编辑</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded bg-cyan-500/5 border border-dashed border-cyan-500/30 text-[11px] text-cyan-200">
              <span className="flex items-center gap-1 min-w-0">
                <span>直连下一幕</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="font-mono truncate" title={node.direct_next_node_id || ''}>
                  {node.direct_next_node_id}
                </span>
              </span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shrink-0">
                继续
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pb-1">
              <span>分支选项 ({options.length})</span>
              <span className="text-slate-500">双击卡片编辑</span>
            </div>

            {options.length === 0 ? (
              <div className="text-[11px] text-slate-500 py-1.5 text-center italic border border-dashed border-slate-800 rounded">
                (无分支选项 · 对话默认在此结束)
              </div>
            ) : (
              options.map((opt, idx) => {
                const badge = STYLE_BADGES[opt.style_type] || STYLE_BADGES.NORMAL;
                const hasNext = Boolean(opt.next_node_id);

                const optKey = opt.id || String(idx);
                return (
                  <div
                    key={optKey}
                    ref={(el) => {
                      if (el) optionRowRefs.current.set(optKey, el);
                      else optionRowRefs.current.delete(optKey);
                    }}
                    className="relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded bg-[#090d16] border border-slate-800 text-xs text-slate-300 group hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-mono text-slate-500 w-3 shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="truncate text-[11px]" title={opt.text}>
                        {opt.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {opt.action_label && (
                        <span
                          className={`px-1 rounded text-[9px] font-medium border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {opt.action_label}
                        </span>
                      )}
                      {hasNext ? (
                        <span
                          className="text-[10px] font-mono text-sky-400/90 flex items-center gap-0.5"
                          title={`指向: ${opt.next_node_id}`}
                        >
                          <ArrowRight className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[65px]">{opt.next_node_id}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>终结</span>
                        </span>
                      )}
                    </div>

                    {/* 选项出度锚点 (Source Output Port) */}
                    <div
                      className={`absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 shadow-sm flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-all ${
                        hasNext
                          ? 'bg-[#0a0e1a] border-amber-400'
                          : 'bg-[#0a0e1a] border-slate-600'
                      }`}
                      title={hasNext ? `分支指向 -> ${opt.next_node_id} (按住拖拽或点击连线)` : '点击/按住拖拽连线至目标节点'}
                      onMouseDown={(e) => {
                        if (e.button === 0) {
                          e.stopPropagation();
                          const row = e.currentTarget.parentElement as HTMLElement;
                          const optStartY = row
                            ? position.y + row.offsetTop + row.offsetHeight / 2
                            : position.y + 115 + idx * 34;
                          onStartConnect?.(
                            node.id,
                            opt.id,
                            position.x + NODE_WIDTH,
                            optStartY
                          );
                        }
                      }}
                    >
                      <div
                        className={`w-1 h-1 rounded-full pointer-events-none ${
                          hasNext ? 'bg-amber-300' : 'bg-slate-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
};

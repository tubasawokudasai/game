import React, { useEffect, useState } from 'react';
import { useDialogueStore } from '../store/useDialogueStore';
import { OptionStyleType } from '../types/dialogue';

interface DialogueModalProps {
  onClose?: () => void;
  onShowNotice?: (msg: string) => void;
  onCombat?: (payload: any) => void;
  onTeleport?: (target: { zoneId: string; areaId: string; posX?: number; posY?: number }) => void;
  onPartyChanged?: () => void;
  onNodeChanged?: () => void | Promise<void>;
  onDialogueEnd?: () => void | Promise<void>;
}

/**
 * 【有向图对话树模态窗】(DialogueModal)
 * 完美还原《万象录》“墨芳·天机使”古风交互界面
 * 
 * 布局特色：
 * 1. 顶部：NPC姓名 + 赤红印章(如【司星】) + 尊荣称号(如【天机使】) + 章节卷轴标识(如【长乐古井篇 · 卷一】)
 * 2. 中部：古风立绘头像 + 主对话正文 + 幽蓝阵法暗语高亮框 (quoteBox)
 * 3. 底部：“仙缘抉择 · 神识应答” 风格化选项卡片 (GOLD / RED / GRAY)，带右侧知悉/奉诏/作罢标签及条件置灰提示
 */
export const DialogueModal: React.FC<DialogueModalProps> = ({
  onClose,
  onShowNotice,
  onCombat,
  onTeleport,
  onPartyChanged,
  onNodeChanged,
  onDialogueEnd,
}) => {
  const {
    isOpen,
    isLoading,
    currentDialogue,
    error,
    selectOption,
    advanceDialogue,
    closeDialogue,
  } = useDialogueStore();

  const [pageIndex, setPageIndex] = useState(0);
  const currentNodeId = currentDialogue?.nodeId;

  // 进入新节点时回到第一页
  useEffect(() => {
    setPageIndex(0);
  }, [currentNodeId]);

  if (!isOpen) return null;

  const pages =
    currentDialogue?.pages && currentDialogue.pages.length > 0
      ? currentDialogue.pages
      : currentDialogue
        ? [
            {
              speakerId: currentDialogue.npc?.id || 'speaker',
              speakerName: currentDialogue.npc?.name || '旁白',
              speakerBadge: currentDialogue.npc?.badge,
              speakerTitle: currentDialogue.npc?.title,
              speakerAvatar: currentDialogue.npc?.avatar,
              content: currentDialogue.content,
            },
          ]
        : [];

  const safePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safePageIndex];
  const isLastPage = safePageIndex >= pages.length - 1;
  const hasOptions = Boolean(currentDialogue?.options && currentDialogue.options.length > 0);
  const hasDirectNext = Boolean(currentDialogue?.directNextNodeId);

  // 判断是否为关联剧情的对话（拥有真实章节标识，且非纯偶遇闲谈）
  const isStoryDialogue = Boolean(
    currentDialogue?.chapterTitle && currentDialogue.chapterTitle !== '江湖偶遇'
  );

  const handleClose = () => {
    closeDialogue();
    // 剧本终点节点没有选项，前端直接关闭时也刷新地图，
    // 让后端已标记完成的剧情 NPC 立刻从江湖人物中消失。
    onDialogueEnd?.();
    onClose?.();
  };

  const handleOptionClick = (optionId: string, disabled: boolean) => {
    if (disabled || isLoading) return;
    selectOption(optionId, {
      onNotice: onShowNotice,
      onCombat,
      onTeleport,
      onPartyChanged,
      onNodeChanged,
      onDialogueEnd,
    }).then((res) => {
      if (res?.status === 'CLOSE' || res?.status === 'COMBAT' || res?.status === 'TELEPORT') {
        onClose?.();
      }
    });
  };

  const handleAdvance = () => {
    if (isLoading) return;
    advanceDialogue({
      onNotice: onShowNotice,
      onCombat,
      onTeleport,
      onPartyChanged,
      onNodeChanged,
      onDialogueEnd,
    }).then((res) => {
      if (res?.status === 'CLOSE' || res?.status === 'COMBAT' || res?.status === 'TELEPORT') {
        onClose?.();
      }
    });
  };

  const getStyleClasses = (styleType: OptionStyleType, disabled: boolean) => {
    if (disabled) {
      return 'border-outline-variant/30 bg-surface-container-lowest/50 text-on-surface-variant/40 opacity-55 cursor-not-allowed';
    }

    switch (styleType) {
      case 'GOLD':
        return 'border-amber-600/50 bg-gradient-to-r from-amber-950/50 via-amber-900/25 to-surface-container-high hover:from-amber-900/60 hover:to-surface-container-highest text-amber-200 shadow-[0_0_10px_rgba(217,119,6,0.12)] hover:border-amber-400';
      case 'RED':
        return 'border-red-600/50 bg-gradient-to-r from-red-950/50 via-red-900/25 to-surface-container-high hover:from-red-900/60 hover:to-surface-container-highest text-red-200 shadow-[0_0_10px_rgba(220,38,38,0.12)] hover:border-red-400';
      case 'GRAY':
        return 'border-outline-variant/50 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface';
      case 'NORMAL':
      default:
        return 'border-primary-container/40 bg-surface-container-high hover:bg-surface-container-highest text-primary hover:border-primary';
    }
  };

  const getTagClasses = (styleType: OptionStyleType, disabled: boolean) => {
    if (disabled) {
      return 'bg-surface-container text-on-surface-variant/50 border-outline-variant/20';
    }

    switch (styleType) {
      case 'GOLD':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'RED':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'GRAY':
        return 'bg-surface-container-highest text-on-surface-variant border-outline-variant/40';
      case 'NORMAL':
      default:
        return 'bg-primary-container/30 text-primary border-primary/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-space-sm sm:p-space-md select-none animate-fadeIn">
      <div className="w-full max-w-md sm:max-w-lg rounded-lg bg-gradient-to-b from-[#1c1d24] via-[#16171f] to-[#121319] p-space-md shadow-2xl relative border border-amber-900/40 text-on-surface overflow-hidden">
        {/* 背景金纹装饰线 */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/60 to-transparent pointer-events-none" />

        {/* 1. 顶部标题栏 */}
        <div className="flex items-center justify-between pb-2.5 border-b border-surface-container-highest/60">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 是否关联剧情图标区分：如果是主线剧情，展示金色 auto_stories，普通闲谈展示 temple_buddhist */}
            {isStoryDialogue ? (
              <div
                className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/50 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse"
                title="主线剧情"
              >
                <span className="material-symbols-outlined text-amber-300 text-[18px]">
                  auto_stories
                </span>
              </div>
            ) : (
              <span className="material-symbols-outlined text-amber-400 text-[20px]">
                temple_buddhist
              </span>
            )}

            {/* NPC 姓名 */}
            <span className="text-amber-200 font-headline-md text-[16px] font-bold tracking-wider font-serif">
              {currentPage?.speakerName || currentDialogue?.npc?.name || '神游感应中...'}
            </span>

            {/* 剧情标识徽章 */}
            {isStoryDialogue && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm font-serif">
                <span className="material-symbols-outlined text-[10px]">auto_stories</span>
                <span>剧情</span>
              </span>
            )}

            {/* 印章头衔 (如: 司星) */}
            {(currentPage?.speakerBadge || currentDialogue?.npc?.badge) && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-950/80 text-red-400 border border-red-700/60 shadow-inner font-serif tracking-widest">
                {currentPage?.speakerBadge || currentDialogue?.npc?.badge}
              </span>
            )}

            {/* 称号 (如: 天机使) */}
            {(currentPage?.speakerTitle || currentDialogue?.npc?.title) && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-600/40 font-serif">
                {currentPage?.speakerTitle || currentDialogue?.npc?.title}
              </span>
            )}

            {/* 节点内多页台词的翻页指示 */}
            {pages.length > 1 }

            {/* 章节标识 (如: 长乐古井篇 · 卷一) */}
            {currentDialogue?.chapterTitle && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] text-cyan-300/90 bg-cyan-950/50 border border-cyan-800/40 font-serif tracking-wider">
                {currentDialogue.chapterTitle}
              </span>
            )}
          </div>

          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-amber-300 active:scale-95 transition-all flex-shrink-0"
            title="暂别离开"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* 2. 主体对话区域 */}
        {isLoading && !currentDialogue ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
            <span>正在与仙长神识相通...</span>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-error text-xs font-serif leading-relaxed px-4">
              「{error}」
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1 rounded bg-surface-container-high text-xs text-on-surface hover:text-primary"
            >
              收敛神识退出
            </button>
          </div>
        ) : (
          <>
            {/* NPC 立绘 + 主对话文本 */}
            <div className="py-3 flex gap-3 items-start mt-1">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-surface-container-highest shadow-inner flex-shrink-0 border-2 border-amber-600/50 p-0.5">
                {currentPage?.speakerAvatar || currentDialogue?.npc?.avatar ? (
                  <img
                    className="w-full h-full object-cover rounded-full"
                    alt={currentPage?.speakerName || currentDialogue?.npc?.name || 'NPC'}
                    src={currentPage?.speakerAvatar || currentDialogue?.npc?.avatar}
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-amber-900/60 to-surface-container-lowest flex items-center justify-center text-amber-300 text-sm font-serif font-bold">
                    {currentPage?.speakerName?.slice(0, 1) || '仙'}
                  </div>
                )}
              </div>

              {/* 主对话正文 */}
              <div className="flex-1 p-3 rounded bg-surface-container-lowest/80 text-[12px] sm:text-[13px] font-serif text-slate-200 leading-relaxed shadow-inner border border-outline-variant/20">
                {currentPage?.content || currentDialogue?.content}
              </div>
            </div>

            {/* 3. 蓝框强调暗语段落 (quoteBox) */}
            {isLastPage && currentDialogue?.quoteBox && (
              <div className="mb-3 px-3 py-2.5 rounded border border-cyan-600/50 bg-gradient-to-r from-cyan-950/60 via-[#0d1f2d] to-cyan-950/60 text-cyan-200 text-[11px] sm:text-[12px] font-serif leading-relaxed shadow-[inset_0_0_12px_rgba(6,182,212,0.15)] flex items-start gap-2">
                <span className="material-symbols-outlined text-cyan-400 text-[16px] flex-shrink-0 mt-0.5">
                  auto_awesome
                </span>
                <span className="flex-1">{currentDialogue.quoteBox}</span>
              </div>
            )}

            {/* 4. 节点内多页台词翻页 */}
            {pages.length > 1 && (
              <div className="flex items-center justify-between my-2 px-1 text-[11px] font-serif text-cyan-300/80">
                <span>
                </span>
                {!isLastPage ? (
                  <button
                    type="button"
                    onClick={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))}
                    className="px-3 py-1 rounded bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 border border-cyan-700/40 flex items-center gap-1 active:scale-95 transition"
                  >
                    <span>继续</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                ) : (
                  <span className="text-slate-500">本节点台词已读完</span>
                )}
              </div>
            )}

            {/* 5. 最后一页：分支选项 / 直连继续 / 结束 */}
            {isLastPage && (
              <>
                <div className="flex items-center gap-2 my-2 text-[11px] font-serif text-amber-400/80 tracking-widest">
                  <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                  <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                </div>

                <div className="space-y-1.5 mt-2">
                  {hasOptions ? (
                    currentDialogue?.options?.map((opt) => {
                      const styleClasses = getStyleClasses(opt.styleType, opt.disabled);
                      const tagClasses = getTagClasses(opt.styleType, opt.disabled);

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={opt.disabled || isLoading}
                          onClick={() => handleOptionClick(opt.id, opt.disabled)}
                          className={`w-full py-2 px-3 rounded text-left font-serif text-[12px] sm:text-[13px] flex items-center justify-between transition-all border ${styleClasses} active:scale-[0.99] group`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                            <span className="material-symbols-outlined text-[14px] flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
                              navigate_next
                            </span>
                            <span className="truncate">{opt.text}</span>
                            {opt.disabled && opt.disabledReason && (
                              <span className="text-[10px] text-error/80 flex-shrink-0">
                                ({opt.disabledReason})
                              </span>
                            )}
                          </div>

                          {opt.actionLabel && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider flex-shrink-0 ${tagClasses}`}
                            >
                              {opt.actionLabel}
                            </span>
                          )}
                        </button>
                      );
                    })
                  ) : hasDirectNext ? (
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={isLoading}
                      className="w-full py-2 px-3 rounded text-left font-serif text-[12px] sm:text-[13px] flex items-center justify-between transition-all border border-cyan-600/50 bg-gradient-to-r from-cyan-950/50 via-cyan-900/20 to-surface-container-high hover:from-cyan-900/60 hover:to-surface-container-highest text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.12)] hover:border-cyan-400 active:scale-[0.99] group disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">
                          arrow_forward
                        </span>
                        <span>继续前行 · 进入下一幕</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                        继续
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full py-1.5 px-3 rounded bg-surface-container-high hover:bg-surface-container-highest text-left text-on-surface-variant font-serif text-[11px] flex items-center justify-between border border-outline-variant/30"
                    >
                      <span>告辞离去 · 暂且别过</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-container text-on-surface-variant border border-outline-variant/30">
                        作罢
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

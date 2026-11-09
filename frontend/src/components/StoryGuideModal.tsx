import React from 'react';
import { ActiveStoryItem } from '../types/game';

interface StoryGuideModalProps {
  isOpen: boolean;
  stories: ActiveStoryItem[];
  loading: boolean;
  currentSceneId?: string | null;
  onClose: () => void;
  onGoToScene: (sceneId?: string | null) => void;
  onTalk: (npcKey: string) => void;
}

/**
 * 「任务」指引弹窗。
 * 展示玩家当前进行中的任务、当前节点、所在场景与任务人物，
 * 点击「前往所在场景」跳到御剑地图并预选目标地点；
 * 若玩家已身处目标场景，可直接与任务人物交谈继续任务。
 */
export const StoryGuideModal: React.FC<StoryGuideModalProps> = ({
  isOpen,
  stories,
  loading,
  currentSceneId,
  onClose,
  onGoToScene,
  onTalk,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] rounded-2xl bg-[#0f1622] border border-[#2a3646] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-4 py-3.5 border-b border-[#232f3c] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#ffe2a5]/10 border border-[#ffe2a5]/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] text-[#ffe2a5]">
                assignment
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e8eefb]">任务</h3>
              <p className="text-[10px] text-[#8b9bb0] mt-0.5">
                进行中的任务与当前目标
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[#8b9bb0] hover:text-white hover:bg-[#1d2936] flex items-center justify-center transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-3.5 overflow-y-auto space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#8b9bb0]">
              <span className="material-symbols-outlined text-[28px] text-[#ffe2a5] animate-pulse block mb-2">
                hourglass_top
              </span>
              正在查阅任务簿...
            </div>
          ) : stories.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8b9bb0] px-6 leading-relaxed">
              <span className="material-symbols-outlined text-[30px] text-[#4b5a6e] block mb-2">
                explore
              </span>
              暂无进行中的任务。
              <br />
              去地图上与各位仙长交谈，新的任务自会显现。
            </div>
          ) : (
            stories.map((story) => (
              <div
                key={`${story.packageId}_${story.nodeId}`}
                className="rounded-xl bg-[#17212b] border border-[#273444] p-3 space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  {story.npc?.avatar ? (
                    <img
                      src={story.npc.avatar}
                      alt={story.npc.name}
                      className="w-11 h-11 rounded-full object-cover border border-[#ffe2a5]/40 bg-[#0b1119] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full border border-[#ffe2a5]/40 bg-[#ffe2a5]/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#ffe2a5]">person</span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-[#e8eefb] truncate">
                        {story.npc?.name || '任务人物'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ffe2a5]/10 text-[#ffe2a5] border border-[#ffe2a5]/30">
                        {story.category === 'MAIN'
                          ? '主线'
                          : story.category === 'BRANCH'
                          ? '支线'
                          : story.category === 'ENCOUNTER'
                          ? '奇遇'
                          : '剧情'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#8b9bb0] mt-0.5 truncate">
                      {story.packageName}
                      {story.chapterTitle ? ` · ${story.chapterTitle}` : ''}
                    </div>
                  </div>
                </div>

                {story.content && (
                  <p className="text-[11px] leading-relaxed text-[#b9c6d8] line-clamp-3">
                    {story.content}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-[#8b9bb0] flex items-center gap-1 min-w-0">
                    <span className="material-symbols-outlined text-[13px] text-[#b3e4c6]">
                      location_on
                    </span>
                    <span className="truncate">{story.sceneName || '场景未定'}</span>
                  </span>

                  {story.npc?.key && story.sceneId === currentSceneId ? (
                    <button
                      type="button"
                      onClick={() => onTalk(story.npc!.key)}
                      className="px-3 py-1.5 rounded-lg bg-[#b3e4c6]/15 hover:bg-[#b3e4c6]/25 text-[#b3e4c6] border border-[#b3e4c6]/40 text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                      交谈
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!story.sceneId}
                      onClick={() => onGoToScene(story.sceneId)}
                      className="px-3 py-1.5 rounded-lg bg-[#ffe2a5]/10 hover:bg-[#ffe2a5]/20 disabled:opacity-40 disabled:cursor-not-allowed text-[#ffe2a5] border border-[#ffe2a5]/40 text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <span className="material-symbols-outlined text-[14px]">near_me</span>
                      前往所在场景
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-[#232f3c] text-[10px] text-[#6f8098] leading-relaxed">
          任务目标会随剧情节点推进而移动；抵达目标场景后，与任务人物交谈即可继续。
        </div>
      </div>
    </div>
  );
};

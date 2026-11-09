import React, { useEffect, useState, useMemo } from 'react';
import { TopSceneHeader } from '../components/TopSceneHeader';
import { MainTabNavigation } from '../components/MainTabNavigation';
import { PartyStatusBar } from '../components/PartyStatusBar';
import { GlobalChatSection } from '../components/GlobalChatSection';
import { CharacterPanel } from '../components/CharacterPanel';
import { usePlayerStore } from '../store/usePlayerStore';
import { useMapStore } from '../store/useMapStore';
import { NpcEntity } from '../types/game';
import { getNpcTypeMeta, DEFAULT_NPC_TYPE } from '../constants/npcTypes';
import { EncounterModal } from '../features/combat';

interface MainPersonScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenNpc: (key: string) => void;
  onOpenPlayerModal: (playerId?: string) => void;
  onOpenAccountModal?: () => void;
}

/**
 * 屏幕1：人物主屏 (MainPersonScreen)
 * 纯动态数据驱动：完全去除所有静态写死的假数值、假货币与假NPC列表
 * 江湖人物支持类型分类筛选（当前：对话、战斗，未来易于拓展）
 */
export const MainPersonScreen: React.FC<MainPersonScreenProps> = ({
  onShowNotice,
  onOpenNpc,
  onOpenPlayerModal,
  onOpenAccountModal,
}) => {
  const player = usePlayerStore((s) => s.player);
  const fetchProfile = usePlayerStore((s) => s.fetchProfile);
  const fetchInventory = usePlayerStore((s) => s.fetchInventory);
  const fetchParty = usePlayerStore((s) => s.fetchParty);

  const npcs = useMapStore((s) => s.npcs);
  const fetchMap = useMapStore((s) => s.fetchMap);

  // 当前选中的 NPC 分类 Tab (默认全部 'all')
  const [activeTypeTab, setActiveTypeTab] = useState<string>('all');

  // 战斗遭遇挑战弹窗 NPC 目标
  const [encounterNpc, setEncounterNpc] = useState<NpcEntity | null>(null);

  // 初始化加载当前玩家数据与所在场景 NPC 列表
  useEffect(() => {
    if (!player) {
      fetchProfile();
      fetchInventory();
      fetchParty();
    }
  }, [player, fetchProfile, fetchInventory, fetchParty]);

  useEffect(() => {
    if (player?.currentMap) {
      fetchMap(player.currentMap);
    }
  }, [player?.currentMap, fetchMap]);

  // 动态提取当前场景 NPC 包含的全部类型，并统计各分类数量（可动态拓展）
  const typeTabs = useMemo(() => {
    const counts: Record<string, number> = { all: npcs.length, story: 0, dialogue: 0, battle: 0 };
    npcs.forEach((npc) => {
      const isStory = Boolean(npc.isStoryNpc || npc.storyPackageId || npc.npcRole === 'STORY');
      if (isStory) {
        counts.story = (counts.story || 0) + 1;
      }
      const type = (npc.type || DEFAULT_NPC_TYPE).toLowerCase();
      counts[type] = (counts[type] || 0) + 1;
    });

    const tabs: Array<{ key: string; label: string; count: number; icon: string }> = [
      { key: 'all', label: '全部', count: counts.all, icon: 'apps' },
    ];

    // 如果场景中存在关联剧情的 NPC，优先展示剧情分类
    if (counts.story > 0) {
      tabs.push({ key: 'story', label: '剧情', count: counts.story, icon: 'auto_stories' });
    }

    tabs.push(
      { key: 'dialogue', label: '对话', count: counts.dialogue || 0, icon: 'chat_bubble' },
      { key: 'battle', label: '战斗', count: counts.battle || 0, icon: 'swords' }
    );

    // 动态兼容后续可能新增的未知 NPC 类型
    Object.keys(counts).forEach((key) => {
      if (key !== 'all' && key !== 'story' && key !== 'dialogue' && key !== 'battle' && counts[key] > 0) {
        const meta = getNpcTypeMeta(key);
        tabs.push({
          key,
          label: meta.label,
          count: counts[key],
          icon: meta.icon,
        });
      }
    });

    return tabs;
  }, [npcs]);

  // 根据当前选中的类型过滤 NPC
  const filteredNpcs = useMemo(() => {
    if (activeTypeTab === 'all') return npcs;
    if (activeTypeTab === 'story') {
      return npcs.filter(
        (npc) => Boolean(npc.isStoryNpc || npc.storyPackageId || npc.npcRole === 'STORY')
      );
    }
    return npcs.filter(
      (npc) => (npc.type || DEFAULT_NPC_TYPE).toLowerCase() === activeTypeTab.toLowerCase()
    );
  }, [npcs, activeTypeTab]);

  // 处理人物交互动作（区分对话与战斗）
  const handleNpcAction = (npc: NpcEntity) => {
    const npcType = (npc.type || DEFAULT_NPC_TYPE).toLowerCase();
    if (npcType === 'battle') {
      setEncounterNpc(npc);
      return;
    }
    onOpenNpc(npc.key);
  };

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-2">
      <TopSceneHeader
        onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')}
        onAccountClick={onOpenAccountModal}
      />

      {/* 主屏核心双栏布局：统一固定高度，防止Tab切换抖动 */}
      <section className="grid grid-cols-12 gap-space-xs mx-space-md mt-space-xs h-[325px] sm:h-[345px] min-h-0">
        {/* 左侧栏 (5列): 角色修仙面板 (原型样式) */}
        <CharacterPanel
          onOpenPlayerModal={onOpenPlayerModal}
          onShowNotice={onShowNotice}
        />

        {/* 右侧栏 (7列): 江湖人物 NPC */}
        <div className="col-span-7 h-full min-h-0 flex flex-col rounded bg-surface-container-low p-space-xs shadow-md justify-between border border-outline-variant/30">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-space-xs pb-1 border-b border-surface-container-highest">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-[14px]">group</span>
              <span className="text-primary font-headline-sm text-[12px] tracking-widest font-bold">
                江 湖 人 物
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-label-sm text-tertiary">
              <span>当前驻留场景</span>
            </div>
          </div>

          {/* 类型分类切换 Tab 栏 (对话、战斗，可拓展) */}
          <div className="flex items-center gap-1 px-1 py-1 bg-surface-container/60 rounded border border-outline-variant/20 mt-1">
            {typeTabs.map((tab) => {
              const isActive = activeTypeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTypeTab(tab.key)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-headline-sm transition-all active:scale-95 ${
                    isActive
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[9px] px-1 rounded-full ${
                      isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* NPC 人物列表 */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5 my-1">
            {filteredNpcs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-on-surface-variant/60">
                <span className="material-symbols-outlined text-[20px] mb-1 opacity-40">person_off</span>
                <span className="text-[10px]">
                  {activeTypeTab === 'all'
                    ? '「当前场景四顾空旷，未见往来仙家」'
                    : getNpcTypeMeta(activeTypeTab).emptyDesc}
                </span>
              </div>
            ) : (
              filteredNpcs.map((npc) => {
                const isStory = Boolean(npc.isStoryNpc || npc.storyPackageId || npc.npcRole === 'STORY');
                const meta = getNpcTypeMeta(npc.type, isStory);
                return (
                  <div
                    key={npc.key}
                    onClick={() => handleNpcAction(npc)}
                    className={`flex items-center justify-between p-1.5 rounded transition-all cursor-pointer group shadow-sm bg-surface-container hover:bg-surface-container-high border ${
                      isStory
                        ? 'border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-r from-amber-950/20 via-surface-container to-surface-container'
                        : 'border-outline-variant/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest flex-shrink-0 shadow-inner">
                        {npc.avatar ? (
                          <img className="w-full h-full object-cover" alt={npc.name} src={npc.avatar} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary text-xs">
                            {npc.name.slice(0, 1)}
                          </div>
                        )}
                        {/* 关联剧情 NPC 专属书卷角标 */}
                        {isStory && (
                          <div
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center shadow"
                            title="主线剧情"
                          >
                            <span className="material-symbols-outlined text-[10px] font-bold">auto_stories</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[12px] font-headline-sm font-semibold truncate transition-colors ${
                              isStory
                                ? 'text-amber-200 group-hover:text-amber-300'
                                : 'text-on-surface group-hover:text-primary'
                            }`}
                          >
                            {npc.name}
                          </span>
                          {/* 人物类型标识徽章 */}
                          <span
                            className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-mono leading-none border ${meta.badgeClass}`}
                          >
                            <span className="material-symbols-outlined text-[10px] leading-none">{meta.icon}</span>
                            <span>{meta.label}</span>
                          </span>
                        </div>
                        <span className="text-[9px] font-label-sm text-on-surface-variant truncate">
                          {npc.title}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNpcAction(npc);
                        }}
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-headline-sm text-[9px] active:scale-95 transition-transform ${meta.btnClass}`}
                      >
                        {isStory && (
                          <span className="material-symbols-outlined text-[11px] leading-none">auto_stories</span>
                        )}
                        <span>{meta.actionText}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* 底部导航、队伍状态、全服聊天 */}
      <MainTabNavigation activeTab="person" />
      <PartyStatusBar onShowNotice={onShowNotice} onOpenProfile={onOpenPlayerModal} />
      <GlobalChatSection onShowNotice={onShowNotice} />

      {/* 地图 NPC 多敌人战斗遭遇挑战模态窗 */}
      <EncounterModal
        npc={encounterNpc}
        onClose={() => setEncounterNpc(null)}
        onShowNotice={onShowNotice}
      />
    </div>
  );
};

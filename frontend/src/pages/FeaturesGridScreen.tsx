import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {TopSceneHeader} from '../components/TopSceneHeader';
import {MainTabNavigation} from '../components/MainTabNavigation';
import {PartyStatusBar} from '../components/PartyStatusBar';
import {GlobalChatSection} from '../components/GlobalChatSection';
import {StoryGuideModal} from '../components/StoryGuideModal';
import {usePlayerStore} from '../store/usePlayerStore';
import {useDialogueStore} from '../store/useDialogueStore';
import {gameApi} from '../services/api';
import type {ActiveStoryItem} from '../types/game';
import type {AccountModalTab} from '../hooks/useAuth';

interface FeaturesGridScreenProps {
    onShowNotice: (msg: string) => void;
    onOpenProfileModal: (playerId?: string) => void;
    /** 打开账号弹窗：'upgrade' 注册转正，'login' 登录已有账号 */
    onOpenAccountModal?: (tab?: AccountModalTab) => void;
    /** 退出登录并返回登录通行证门庭 */
    onLogout?: () => Promise<void> | void;
}

type ThemeKey = 'gold' | 'mint' | 'coral' | 'silver';

interface FeatureItem {
    id: string;
    name: string;
    icon: string;
    theme: ThemeKey;
    dot?: 'coral' | 'amber';
    badge?: string | number;
    badgeType?: 'mintPill' | 'coralPill' | 'redSquare';
}

const themeStyles: Record<
    ThemeKey,
    {
        ringBorder: string;
        ringBg: string;
        iconColor: string;
    }
> = {
    gold: {
        ringBorder: 'border-[#ffe2a5]/40',
        ringBg: 'bg-[#ffe2a5]/[0.08]',
        iconColor: 'text-[#ffe2a5]',
    },
    mint: {
        ringBorder: 'border-[#b3e4c6]/40',
        ringBg: 'bg-[#b3e4c6]/[0.08]',
        iconColor: 'text-[#b3e4c6]',
    },
    coral: {
        ringBorder: 'border-[#ffb3ae]/40',
        ringBg: 'bg-[#ffb3ae]/[0.08]',
        iconColor: 'text-[#ffb3ae]',
    },
    silver: {
        ringBorder: 'border-[#dcd6d2]/40',
        ringBg: 'bg-[#dcd6d2]/[0.08]',
        iconColor: 'text-[#dcd6d2]',
    },
};

export const FeaturesGridScreen: React.FC<FeaturesGridScreenProps> = ({
                                                                          onShowNotice,
                                                                          onOpenProfileModal,
                                                                          onOpenAccountModal,
                                                                          onLogout,
                                                                      }) => {
    const navigate = useNavigate();
    const unreadMailCount = usePlayerStore((s) => s.unreadMailCount);
    const friendRequests = usePlayerStore((s) => s.friendRequests);
    const currentSceneId = usePlayerStore(
        (s) => s.player?.areaId || s.player?.currentMap || null
    );

    const [isStoryOpen, setIsStoryOpen] = useState(false);
    const [stories, setStories] = useState<ActiveStoryItem[]>([]);
    const [storyLoading, setStoryLoading] = useState(false);

    const loadStories = async () => {
        setStoryLoading(true);
        try {
            const data = await gameApi.getActiveStory();
            setStories(data);
        } catch {
            setStories([]);
        } finally {
            setStoryLoading(false);
        }
    };

    useEffect(() => {
        usePlayerStore.getState().fetchFriendRequests().catch(() => {
        });
        void loadStories();
    }, []);

    const pendingRequestsCount = friendRequests.length;

    const featureItems: FeatureItem[] = [
        {id: 'profile', name: '人物信息', icon: 'person', theme: 'gold'},
        {
            id: 'story',
            name: '任务',
            icon: 'assignment',
            theme: 'gold',
            badge: stories.length > 0 ? stories.length : undefined,
            badgeType: 'mintPill',
        },
        {
            id: 'mail',
            name: '飞鸽传书',
            icon: 'mail',
            theme: 'mint',
            badge: unreadMailCount > 0 ? unreadMailCount : undefined,
            badgeType: 'coralPill',
        },
        {id: 'bag', name: '乾坤行囊', icon: 'work', theme: 'gold'},
        {
            id: 'friends',
            name: '好友',
            icon: 'diversity_1',
            theme: 'mint',
            badge: pendingRequestsCount > 0 ? `+${pendingRequestsCount}` : undefined,
            badgeType: 'mintPill',
        },
        {id: 'equip', name: '神兵法宝', icon: 'shield', theme: 'gold', dot: 'coral'},
        {id: 'skill', name: '心法招式', icon: 'menu_book', theme: 'gold'},
        {id: 'mount', name: '坐骑灵宠', icon: 'pets', theme: 'gold'},
        {id: 'talent', name: '天道命格', icon: 'psychology', theme: 'gold'},
        {id: 'guild', name: '沧浪宗门', icon: 'temple_buddhist', theme: 'mint'},
        // { id: 'achieve', name: '仙途历练', icon: 'military_tech', theme: 'coral', dot: 'amber' },
        {id: 'rank', name: '问鼎九州', icon: 'leaderboard', theme: 'coral'},
        {id: 'exchange', name: '天宝灵券', icon: 'currency_exchange', theme: 'gold'},
        {id: 'settings', name: '视听乾坤', icon: 'settings', theme: 'silver'},
        {id: 'help', name: '修真宝典', icon: 'quiz', theme: 'mint'},
        {id: 'logout', name: '退出登录', icon: 'logout', theme: 'coral'},
    ];

    const handleItemClick = async (item: FeatureItem) => {
        if (item.id === 'profile') {
            navigate('/profile');
        } else if (item.id === 'story') {
            setIsStoryOpen(true);
            void loadStories();
        } else if (item.id === 'mail') {
            usePlayerStore.getState().setMailModalOpen(true);
        } else if (item.id === 'friends') {
            usePlayerStore.getState().setFriendsModalOpen(true);
        } else if (item.id === 'bag') {
            usePlayerStore.getState().setBagModalOpen(true);
        } else if (item.id === 'account') {
            // 打开账号弹窗：默认「原地转正」，弹窗内可切换到「已有号登录 / 合并老账号」
            onOpenAccountModal?.('upgrade');
        } else if (item.id === 'logout') {
            onShowNotice('道友已退隐仙途，正在返回通行证门庭...');
            if (onLogout) {
                await onLogout();
            } else {
                localStorage.removeItem('game_token');
                usePlayerStore.getState().setPlayer(null);
            }
            navigate('/login');
        } else {
            onShowNotice(`正在开启【${item.name}】道统秘录...`);
        }
    };

    return (
        <div className="flex flex-col w-full text-on-surface select-none pb-2">
            <TopSceneHeader onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')}/>

            {/* 主屏核心区域：采用统一高度规范 */}
            <section
                className="mx-space-md mt-space-xs h-[325px] sm:h-[345px] rounded bg-surface-container-low p-space-xs shadow-md border border-outline-variant/30 flex flex-col min-h-0">
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1 min-h-0 overflow-y-auto pr-0.5">
                    {featureItems.map((item) => {
                        const style = themeStyles[item.theme];

                        return (
                            <div
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="cursor-pointer rounded-xl bg-[#17212b] hover:bg-[#1d2936] border border-[#232f3c]/70 shadow-sm transition-all duration-150 flex flex-col items-center justify-center text-center relative py-1.5 px-0.5 active:scale-95 group"
                            >
                                {/* 1. 红点：缩至 2x2 并贴角 */}
                                {item.dot === 'coral' && (
                                    <span
                                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#fca5a5] pointer-events-none"/>
                                )}

                                {/* 2. 金棕点 */}
                                {item.dot === 'amber' && (
                                    <span
                                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#b89562] pointer-events-none"/>
                                )}

                                {/* 3. 仙友胶囊：紧凑高度 */}
                                {item.badgeType === 'mintPill' && item.badge !== undefined && (
                                    <span
                                        className="absolute top-1 right-1 px-1 py-[1px] rounded-full bg-[#a7f3d0] text-[#064e3b] text-[9px] font-bold leading-none pointer-events-none scale-90">
                    {item.badge}
                  </span>
                                )}

                                {/* 4. 传书未读数 */}
                                {item.badgeType === 'coralPill' && item.badge !== undefined && (
                                    <span
                                        className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[#fca5a5] text-[#4c0519] text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none scale-90">
                    {item.badge}
                  </span>
                                )}

                                {/* 5. 悬赏微方块 */}
                                {item.badgeType === 'redSquare' && item.badge && (
                                    <span
                                        className="absolute top-1 right-1 w-3.5 h-3.5 rounded-[3px] bg-[#8e1d23] text-[#ffe4bb] text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none scale-95">
                    {item.badge}
                  </span>
                                )}

                                {/* 图标圈：从 w-11 h-11 缩小为 w-8.5 h-8.5 */}
                                <div
                                    className={`w-[34px] h-[34px] rounded-full flex items-center justify-center border ${style.ringBorder} ${style.ringBg} transition-transform duration-150 group-hover:scale-105 shrink-0`}
                                >
                  <span
                      className={`material-symbols-outlined text-[19px] ${style.iconColor}`}
                      style={{
                          fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20",
                      }}
                  >
                    {item.icon}
                  </span>
                                </div>

                                {/* 标题字号从 13px 调为 11px，间距缩减至 mt-1 */}
                                <span
                                    className="mt-1 font-normal text-[11px] tracking-tight text-[#dbe3f1] group-hover:text-primary transition-colors leading-none truncate max-w-full">
                  {item.name}
                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <MainTabNavigation activeTab="menu"/>
            <PartyStatusBar onShowNotice={onShowNotice} onOpenProfile={onOpenProfileModal}/>
            <GlobalChatSection onShowNotice={onShowNotice}/>

            <StoryGuideModal
                isOpen={isStoryOpen}
                stories={stories}
                loading={storyLoading}
                currentSceneId={currentSceneId}
                onClose={() => setIsStoryOpen(false)}
                onGoToScene={(sceneId) => {
                    if (!sceneId) return;
                    setIsStoryOpen(false);
                    navigate(`/travel?target=${encodeURIComponent(sceneId)}`);
                }}
                onTalk={(npcKey) => {
                    setIsStoryOpen(false);
                    useDialogueStore.getState().openDialogue(npcKey);
                }}
            />
        </div>
    );
};
import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// 公共组件与弹窗层导入
import { Toast } from './components/Toast';
import { ModalsContainer } from './components/ModalsContainer';
import { AccountModal } from './components/AccountModal';
import { SystemNoticeBanner } from './components/SystemNoticeBanner';
import { CombatFloatingDamage } from './components/CombatFloatingDamage';
import { MailModal } from './components/MailModal';
import { QiankunBagModal } from './components/QiankunBagModal';
import { FriendsModal } from './components/FriendsModal';

// 页面级组件导入
import { MainPersonScreen } from './pages/MainPersonScreen';
import { HeroProfileScreen } from './pages/HeroProfileScreen';
import { CityFacilitiesScreen } from './pages/CityFacilitiesScreen';
import { TravelMapScreen } from './pages/TravelMapScreen';
import { FeaturesGridScreen } from './pages/FeaturesGridScreen';
import { ChangleSquareScreen } from './pages/ChangleSquareScreen';
import { PartyEditScreen } from './pages/PartyEditScreen';
import { LoginScreen } from './pages/LoginScreen';

// 状态管理与 WebSocket & 免登录 Hook
import { usePlayerStore } from './store/usePlayerStore';
import { useMapStore } from './store/useMapStore';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuth } from './hooks/useAuth';

// 设施交互数据类型
export interface FacilityItem {
  name: string;
  sub: string;
  desc: string;
  action: string;
  icon: string;
  color: string;
  isSquare?: boolean;
}

/**
 * 游戏根组件与全局路由调度器
 *
 * 职责：
 * 1. 挂载 React Router v6 路由表，提供移动端沉浸式单页视口。
 * 2. 依托 useAuth 实现免登录静默鉴权、账号升级与跨账号强事务合并。
 * 3. 启动全局数据加载器与 WebSocket 长连接（直连 Cloudflare MapDO）。
 * 4. 纯动态数据：完全去除所有静态假数据，所有状态均由 Zustand Store 与后端真实同步。
 */
export const App: React.FC = () => {
  const location = useLocation();

  // --- 免登录与账号合并 Hook ---
  const {
    isInitializing,
    isModalOpen: isAccountModalOpen,
    modalTab: accountModalTab,
    openModal: openAccountModal,
    closeModal: closeAccountModal,
    upgradeToFormal,
    mergeAccount,
    loginFormal,
    logout,
  } = useAuth();

  // --- 全局交互提示状态 (Toast) ---
  // 连续升级会连续产生多条通知，这里用队列逐条展示，避免后一条覆盖前一条
  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastTitle, setToastTitle] = useState<string | undefined>(undefined);
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastQueueRef = useRef<Array<{ message: string; duration: number; title?: string }>>([]);
  const toastShowingRef = useRef<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastGapTimerRef = useRef<number | null>(null);

  // --- 全局模态窗挂载状态 (Modals) ---
  const [activeNpcKey, setActiveNpcKey] = useState<string | null>(null);
  const [activeFacility, setActiveFacility] = useState<FacilityItem | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState<boolean>(false);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);

  const handleOpenPlayerModal = (playerId?: string) => {
    setViewingPlayerId(playerId || null);
    setShowPlayerModal(true);
  };

  const player = usePlayerStore((s) => s.player);
  const isMailModalOpen = usePlayerStore((s) => s.isMailModalOpen);
  const setMailModalOpen = usePlayerStore((s) => s.setMailModalOpen);
  const isBagModalOpen = usePlayerStore((s) => s.isBagModalOpen);
  const setBagModalOpen = usePlayerStore((s) => s.setBagModalOpen);
  const isFriendsModalOpen = usePlayerStore((s) => s.isFriendsModalOpen);
  const setFriendsModalOpen = usePlayerStore((s) => s.setFriendsModalOpen);

  // 全局同步修仙道友当前驻留场景元数据（完全基于 D1 数据库，无静态假数据）
  useEffect(() => {
    const targetMap = player?.currentMap || player?.areaId || 'square';
    useMapStore.getState().fetchMap(targetMap);
  }, [player?.currentMap, player?.areaId]);

  // 挂载 WebSocket 实时同步长连接 (对接大区 ZoneDO 与子区域)
  useWebSocket({
    zoneId: player?.zoneId || 'changle_city',
    areaId: player?.areaId || player?.currentMap || 'square',
    enabled: !!player,
  });

  /**
   * 依次展示队列中的下一条 Toast
   */
  const showNextToast = () => {
    const next = toastQueueRef.current.shift();
    if (!next) {
      toastShowingRef.current = false;
      return;
    }

    toastShowingRef.current = true;
    setToastTitle(next.title);
    setToastMsg(next.message);
    setToastVisible(true);

    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
      // 留出淡出动画时间，再展示下一条
      toastGapTimerRef.current = window.setTimeout(() => showNextToast(), 220);
    }, Math.max(1200, next.duration));
  };

  /**
   * 触发道友全局提示框 (Toast 通知)
   * @param message 通知正文
   * @param duration 展示时长（毫秒）
   * @param title 可选标题（玩家升级通知使用后台配置的标题）
   */
  const triggerNotice = (message: string, duration: number = 2400, title?: string) => {
    if (!message) return;
    toastQueueRef.current.push({ message, duration, title });
    if (!toastShowingRef.current) {
      showNextToast();
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastGapTimerRef.current) window.clearTimeout(toastGapTimerRef.current);
    };
  }, []);

  const isLoginPage = location.pathname === '/login';

  return (
    <div className="flex flex-col relative w-full min-h-screen bg-surface font-body-md text-body-md text-on-surface selection:bg-primary selection:text-on-primary">
      {/* 限制最大宽度（适配移动端竖屏及桌面居中仙侠HUD体验） */}
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 relative bg-surface pb-safe pt-safe shadow-2xl">
        {/* 全局道韵通知 Toast 与 独立解耦的跑马灯公告 / 战斗飘字 */}
        <Toast message={toastMsg} title={toastTitle} visible={toastVisible} />
        {!isLoginPage && <SystemNoticeBanner />}
        {!isLoginPage && <CombatFloatingDamage />}

        {/* 初次免登录静默初始化中指示条 */}
        {isInitializing && !isLoginPage && (
          <div className="absolute top-0 inset-x-0 z-50 py-1 bg-primary/20 backdrop-blur text-primary text-[10px] text-center font-mono">
            神游入界 · 正在建立九州仙鉴连接...
          </div>
        )}

        {/* 核心页面路由配置 */}
        <Routes location={location} key={location.pathname}>
          {/* 1. 主页 (人物与当前场景NPC交互) */}
          <Route
            path="/"
            element={
              <MainPersonScreen
                onShowNotice={triggerNotice}
                onOpenNpc={(npcKey: string) => setActiveNpcKey(npcKey)}
                onOpenPlayerModal={handleOpenPlayerModal}
                onOpenAccountModal={openAccountModal}
              />
            }
          />

          {/* 2. 侠客全息档案 (道友档案、极品神装、五行属性、江湖大事纪) */}
          <Route
            path="/profile"
            element={
              <HeroProfileScreen
                onShowNotice={triggerNotice}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            }
          />

          {/* 3. 城内设施 (钱庄、四方驿、万商集、演武场等城防建筑) */}
          <Route
            path="/facility"
            element={
              <CityFacilitiesScreen
                onShowNotice={triggerNotice}
                onOpenFacility={(fac: FacilityItem) => setActiveFacility(fac)}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            }
          />

          {/* 4. 九州地图与御剑移动 (坊市 -> 都城 -> 州域多层级画卷) */}
          <Route
            path="/travel"
            element={
              <TravelMapScreen
                onShowNotice={triggerNotice}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            }
          />

          {/* 5. 功能菜单总览 (行囊背包、心法功法、飞鸽传书、宗门势力等) */}
          <Route
            path="/features"
            element={
              <FeaturesGridScreen
                onShowNotice={triggerNotice}
                onOpenProfileModal={handleOpenPlayerModal}
                onOpenAccountModal={openAccountModal}
                onLogout={logout}
              />
            }
          />

          {/* 6. 长乐广场社交大厅 (灵泉论道、玲珑坊游艺、听雨茶楼江湖传闻) */}
          <Route
            path="/square"
            element={
              <ChangleSquareScreen
                onShowNotice={triggerNotice}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            }
          />

          {/* 7. 队伍整备 (查看全部伙伴，安排出战 / 休息) */}
          <Route
            path="/party"
            element={
              <PartyEditScreen
                onShowNotice={triggerNotice}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            }
          />

          {/* 8. 《万象录》通行证登录与账号绑定 */}
          <Route
            path="/login"
            element={<LoginScreen onShowNotice={triggerNotice} />}
          />

          {/* 默认兜底重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* 全局模态窗集合 (NPC对话、城防设施交互、侠客玉牒档案) */}
        {!isLoginPage && (
          <>
            <ModalsContainer
              npcModal={activeNpcKey}
              onCloseNpc={() => setActiveNpcKey(null)}
              facilityModal={activeFacility}
              onCloseFacility={() => setActiveFacility(null)}
              playerModal={showPlayerModal}
              viewingPlayerId={viewingPlayerId}
              onClosePlayer={() => {
                setShowPlayerModal(false);
                setViewingPlayerId(null);
              }}
              onShowNotice={triggerNotice}
            />

            {/* 账号管理模态窗 (免登录游客转正、已有账号强事务合并、账号登录/登出) */}
            <AccountModal
              isOpen={isAccountModalOpen}
              initialTab={accountModalTab}
              onClose={closeAccountModal}
              onUpgrade={upgradeToFormal}
              onMerge={mergeAccount}
              onLogin={loginFormal}
              onLogout={logout}
            />

            {/* 飞鸽传书全息书斋模态窗 */}
            <MailModal
              isOpen={isMailModalOpen}
              onClose={() => setMailModalOpen(false)}
              onShowNotice={triggerNotice}
            />

            {/* 乾坤行囊全息秘录模态窗 */}
            <QiankunBagModal
              isOpen={isBagModalOpen}
              onClose={() => setBagModalOpen(false)}
              onShowNotice={triggerNotice}
            />

            {/* 仙友录与社交名册模态窗 */}
            <FriendsModal
              isOpen={isFriendsModalOpen}
              onClose={() => setFriendsModalOpen(false)}
              onShowNotice={triggerNotice}
              onOpenPlayerModal={handleOpenPlayerModal}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default App;

import { useState, useEffect, useCallback } from 'react';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { useMapStore } from '../store/useMapStore';

const TOKEN_KEY = 'game_token';
const DEVICE_KEY = 'game_device_id';

/** 账号弹窗的三个入口 Tab：原地转正 / 合并老账号 / 直接登录 */
export type AccountModalTab = 'upgrade' | 'merge' | 'login';

/**
 * 获取或自动生成设备与玩家唯一标识 (6 位数字 UUID: 100000 - 999999)
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_placeholder';
  let deviceId = localStorage.getItem(DEVICE_KEY);
  // 若未生成或不符合 6 位纯数字规则，重新生成 6 位纯数字 UUID
  if (!deviceId || !/^\d{6}$/.test(deviceId)) {
    deviceId = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

/**
 * 账号与认证管理 Hook (useAuth)
 * 核心特性：
 * 1. 静默免登录：启动时若无 Token，自动通过 deviceId 换取匿名 JWT Token，无缝进入游戏
 * 2. 账号转正升级：将游客账号在 D1 原地升级为正式账号
 * 3. 账号合并：将当前试玩产生的装备资产与已有老账号合并
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  });
  const [deviceId] = useState<string>(getOrCreateDeviceId);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<AccountModalTab>('upgrade');

  const { player, fetchProfile, fetchInventory, fetchParty, setPlayer } = usePlayerStore();

  /**
   * 静默游客登录
   */
  const performGuestLogin = useCallback(async () => {
    try {
      const res = await gameApi.guestLogin(deviceId);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPlayer(res.player);

      // 并行拉取行囊、队伍与当前场景元数据
      const currentMap = res.player.currentMap || res.player.areaId || 'square';
      await Promise.allSettled([
        fetchInventory(),
        fetchParty(),
        useMapStore.getState().fetchMap(currentMap),
      ]);
    } catch (err: unknown) {
      console.error('[useAuth] 游客免登录失败:', err);
      setAuthError(err instanceof Error ? err.message : '免登录鉴权失败');
    }
  }, [deviceId, fetchInventory, fetchParty, setPlayer]);

  /**
   * 初始化认证状态：
   * 检查本地是否已有 Token，若有效则同步档案，失效或不存在则发起静默免登录
   */
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsInitializing(true);
      setAuthError(null);

      const existingToken = localStorage.getItem(TOKEN_KEY);
      if (existingToken) {
        try {
          // 校验并拉取已有 Token 对应的玩家资料
          await fetchProfile();
          const p = usePlayerStore.getState().player;
          const currentMap = p?.currentMap || p?.areaId || 'square';
          await Promise.allSettled([
            fetchInventory(),
            fetchParty(),
            useMapStore.getState().fetchMap(currentMap),
          ]);
        } catch {
          // Token 无效或过期，清空并重新走游客免登录
          console.warn('[useAuth] 现有凭证已失效，重新静默进入');
          localStorage.removeItem(TOKEN_KEY);
          if (isMounted) {
            await performGuestLogin();
          }
        }
      } else {
        // 无 Token：若当前在登录界面则不自动游客登录，否则初次进入游戏静默创建或认领游客
        const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
        if (isMounted && !isLoginPage) {
          await performGuestLogin();
        }
      }

      if (isMounted) {
        setIsInitializing(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [fetchProfile, fetchInventory, fetchParty, performGuestLogin]);

  /**
   * 账号升级 (原地转正)
   */
  const upgradeToFormal = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const res = await gameApi.registerFormal(username, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPlayer(res.player);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '账号转正失败';
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  /**
   * 现有账号合并：将当前游客资产与神兵合并入正式号
   */
  const mergeAccount = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const res = await gameApi.mergeAccount(username, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPlayer(res.player);

      // 合并完成后重新刷新背包与队伍数据
      await Promise.allSettled([fetchInventory(), fetchParty()]);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '账号合并失败';
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  /**
   * 直接登录已有正式账号
   */
  const loginFormal = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const res = await gameApi.loginFormal(username, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPlayer(res.player);

      await Promise.allSettled([fetchInventory(), fetchParty()]);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  /**
   * 退出登录：清空 Token 与当前玩家状态
   */
  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
  };

  return {
    token,
    deviceId,
    isGuest: Boolean(player?.isGuest),
    isInitializing,
    authError,
    isModalOpen,
    modalTab,
    openModal: (tab: AccountModalTab = 'upgrade') => {
      setModalTab(tab);
      setIsModalOpen(true);
    },
    closeModal: () => setIsModalOpen(false),
    upgradeToFormal,
    mergeAccount,
    loginFormal,
    logout,
  };
}

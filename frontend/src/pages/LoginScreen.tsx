import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { useMapStore } from '../store/useMapStore';
import { getOrCreateDeviceId } from '../hooks/useAuth';

interface LoginScreenProps {
  onShowNotice?: (msg: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onShowNotice }) => {
  const navigate = useNavigate();
  const [currentMode, setCurrentMode] = useState<'login' | 'register'>('login');
  const [account, setAccount] = useState<string>(() => {
    return localStorage.getItem('remembered_account') || '';
  });
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberAccount, setRememberAccount] = useState<boolean>(true);
  const [agreeTerms, setAgreeTerms] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  // 轻量浮动 Toast 状态
  const [toastMsg, setToastMsg] = useState<string>('欢迎归来，正在御剑进入九州...');
  const [toastVisible, setToastVisible] = useState<boolean>(false);

  const showToast = (msg: string, duration: number = 2400) => {
    setToastMsg(msg);
    setToastVisible(true);
    onShowNotice?.(msg);
    setTimeout(() => {
      setToastVisible(false);
    }, duration);
  };

  const switchAuthMode = (mode: 'login' | 'register') => {
    setCurrentMode(mode);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAccount = account.trim();
    const cleanPwd = password.trim();

    if (!cleanAccount || !cleanPwd) {
      showToast('道号与密令皆不可为空！');
      return;
    }

    if (currentMode === 'login') {
      setLoading(true);
      try {
        const res = await gameApi.loginFormal(cleanAccount, cleanPwd);
        localStorage.setItem('game_token', res.token);
        if (rememberAccount) {
          localStorage.setItem('remembered_account', cleanAccount);
        } else {
          localStorage.removeItem('remembered_account');
        }

        usePlayerStore.getState().setPlayer(res.player);

        // 同步背包、队伍与地图场景
        const currentMap = res.player.currentMap || res.player.areaId || 'square';
        Promise.allSettled([
          usePlayerStore.getState().fetchInventory(),
          usePlayerStore.getState().fetchParty(),
          useMapStore.getState().fetchMap(currentMap),
        ]).catch(() => {});

        showToast('仙符核验成功，正在连接青龙服 · 长乐城...');
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : '仙籍核验失败，请重试');
      } finally {
        setLoading(false);
      }
    } else {
      // 缔结仙籍 (注册)
      if (!agreeTerms) {
        showToast('请先立誓恪守《九州仙盟契约》！');
        return;
      }
      if (cleanAccount.length < 3) {
        showToast('仙盟道号至少需 3 个字元！');
        return;
      }
      if (cleanPwd.length < 6) {
        showToast('通关密令至少需 6 位字符！');
        return;
      }

      setLoading(true);
      try {
        const res = await gameApi.registerFormal(cleanAccount, cleanPwd);
        showToast(`天道生辉，道号「${cleanAccount}」已录入仙籍！`);

        if (rememberAccount) {
          localStorage.setItem('remembered_account', cleanAccount);
        }

        // 注册成功后直接带凭证入道或引导登录
        if (res.token && res.player) {
          localStorage.setItem('game_token', res.token);
          usePlayerStore.getState().setPlayer(res.player);

          const currentMap = res.player.currentMap || res.player.areaId || 'square';
          Promise.allSettled([
            usePlayerStore.getState().fetchInventory(),
            usePlayerStore.getState().fetchParty(),
            useMapStore.getState().fetchMap(currentMap),
          ]).catch(() => {});

          setTimeout(() => {
            navigate('/');
          }, 1200);
        } else {
          setTimeout(() => {
            switchAuthMode('login');
          }, 1200);
        }
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : '缔结仙籍失败，请更换账号名');
      } finally {
        setLoading(false);
      }
    }
  };

  // 散修快速神游入界（游客体验）
  const handleGuestQuickEnter = async () => {
    setLoading(true);
    try {
      const devId = getOrCreateDeviceId();
      const res = await gameApi.guestLogin(devId);
      localStorage.setItem('game_token', res.token);
      usePlayerStore.getState().setPlayer(res.player);

      const currentMap = res.player.currentMap || res.player.areaId || 'square';
      Promise.allSettled([
        usePlayerStore.getState().fetchInventory(),
        usePlayerStore.getState().fetchParty(),
        useMapStore.getState().fetchMap(currentMap),
      ]).catch(() => {});

      showToast('神游入界，正以散修之躯踏入长乐城...');
      setTimeout(() => {
        navigate('/');
      }, 900);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '神游入界受阻');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-slate-200 min-h-screen flex flex-col items-center justify-between p-0 cinematic-bg relative overflow-x-hidden selection:bg-[#dfb76c]/30 selection:text-[#f7e2a9] font-serif">
      {/* 背景仙侠装饰光晕与墨韵效果 */}
      <div className="fixed inset-0 pointer-events-none cloud-pattern z-0 opacity-40" />
      <div className="fixed -top-40 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-[#dfb76c]/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#04080e] via-[#070f18]/80 to-transparent pointer-events-none z-0" />

      {/* 主体容器 (保持移动端客户端/微端网页适屏 390px-440px 规整排布) */}
      <main className="w-full max-w-sm sm:max-w-md min-h-screen relative z-10 flex flex-col justify-between px-4 py-3 select-none mx-auto">
        {/* 顶部区域与表单 */}
        <div>
          {/* 游戏标题与主视觉 Logo */}
          <section className="text-center my-3 flex flex-col items-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1d2d42] to-[#0c141e] gold-border-glow mb-2.5 relative group shadow-lg">
              <span className="text-2xl font-black gold-gradient-text tracking-widest">万</span>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#dfb76c] opacity-50" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#dfb76c]" />
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-widest gold-gradient-text drop-shadow mb-1">
              万象录
            </h1>
            <p className="text-[11px] text-slate-400 tracking-wider">
              万界皆可入卷 · 万象由你书写
            </p>
          </section>

          {/* 移动端全触控卡片主体 */}
          <div className="w-full bg-[#0d1724]/95 rounded-2xl border gold-border-glow backdrop-blur-md p-5 shadow-2xl relative mt-2">
            {/* 四角祥云古典金边角标 */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#dfb76c]/60 pointer-events-none" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#dfb76c]/60 pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#dfb76c]/60 pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#dfb76c]/60 pointer-events-none" />

            {/* Tab 切换：移动端大热区 */}
            <nav aria-label="认证选项" className="flex border-b border-amber-500/20 mb-4">
              <button
                type="button"
                className={`flex-1 py-3 text-sm tracking-widest transition-all duration-200 focus:outline-none active:bg-amber-400/5 ${
                  currentMode === 'login'
                    ? 'font-semibold text-amber-200 border-b-2 border-[#dfb76c]'
                    : 'font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
                }`}
                onClick={() => switchAuthMode('login')}
              >
                登入仙途
              </button>
              <button
                type="button"
                className={`flex-1 py-3 text-sm tracking-widest transition-all duration-200 focus:outline-none active:bg-amber-400/5 ${
                  currentMode === 'register'
                    ? 'font-semibold text-amber-200 border-b-2 border-[#dfb76c]'
                    : 'font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
                }`}
                onClick={() => switchAuthMode('register')}
              >
                缔结仙籍
              </button>
            </nav>

            {/* 提示条目 */}
            <div
              className="text-xs text-amber-200/80 mb-4 flex items-center space-x-1.5 bg-[#142234]/70 px-3 py-2 rounded-lg border border-amber-500/15"
              id="auth-hint"
            >
              <svg
                className="w-3.5 h-3.5 text-[#dfb76c] shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  clipRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  fillRule="evenodd"
                />
              </svg>
              <span className="tracking-wide">
                {currentMode === 'login'
                  ? '道友请报上仙盟通关文牒（账号密码）'
                  : '初入九州，请自定修仙道号与通关密令'}
              </span>
            </div>

            {/* 表单区域（账号和密码） */}
            <form className="space-y-4" onSubmit={handleAuthSubmit}>
              {/* 账号输入 */}
              <div>
                <label
                  className="text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between"
                  htmlFor="account-input"
                >
                  <span className="flex items-center space-x-1.5">
                    <span className="w-1 h-3.5 bg-[#dfb76c] rounded-full inline-block" />
                    <span className="tracking-wider">
                      {currentMode === 'login' ? '道号 / 账号' : '设定道号 (账号)'}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {currentMode === 'login' ? '支持字母、数字或道号' : '自定4-16位仙盟账号'}
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-200/60">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                  <input
                    id="account-input"
                    className="w-full pl-9 pr-3 py-3 bg-[#08101a] border border-[#22364e] focus:border-[#dfb76c] focus:ring-1 focus:ring-[#dfb76c] rounded-xl text-sm text-amber-100 placeholder-slate-600 focus:outline-none transition-all shadow-inner"
                    placeholder={
                      currentMode === 'login' ? '请输入您的仙盟账号' : '自定4-16位仙盟账号'
                    }
                    required
                    type="text"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  />
                </div>
              </div>

              {/* 密码输入 */}
              <div>
                <label
                  className="text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between"
                  htmlFor="password-input"
                >
                  <span className="flex items-center space-x-1.5">
                    <span className="w-1 h-3.5 bg-[#dfb76c] rounded-full inline-block" />
                    <span className="tracking-wider">通关密令 (密码)</span>
                  </span>
                  <span className="text-[10px] text-slate-500">6位以上字符</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-200/60">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                  <input
                    id="password-input"
                    className="w-full pl-9 pr-10 py-3 bg-[#08101a] border border-[#22364e] focus:border-[#dfb76c] focus:ring-1 focus:ring-[#dfb76c] rounded-xl text-sm text-amber-100 placeholder-slate-600 focus:outline-none transition-all shadow-inner"
                    placeholder="请输入通关密令"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-amber-200/70 transition-colors focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                    title="切换密码显隐"
                  >
                    <svg
                      className={`w-4 h-4 ${showPassword ? 'text-amber-300' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                      <path
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 移动端勾选与忘记密码选项 (仅登录展示) */}
              {currentMode === 'login' && (
                <div className="flex items-center justify-between text-xs pt-1 text-slate-400 py-1">
                  <label className="flex items-center space-x-2 cursor-pointer hover:text-slate-300 py-1">
                    <input
                      checked={rememberAccount}
                      onChange={(e) => setRememberAccount(e.target.checked)}
                      className="w-4 h-4 rounded bg-[#08101a] border-[#25394f] text-[#dfb76c] focus:ring-0"
                      type="checkbox"
                    />
                    <span className="text-[11px] tracking-wide">铭记本命法牒 (记住账号)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      showToast('若忘失密令，可凭本命道号联系宗门执事弟子寻回。')
                    }
                    className="text-[11px] text-amber-300/90 hover:text-amber-300 hover:underline py-1 tracking-wide"
                  >
                    遗忘密令？
                  </button>
                </div>
              )}

              {/* 注册协议勾选 (仅注册展示) */}
              {currentMode === 'register' && (
                <div className="text-[11px] pt-1 text-slate-400">
                  <label className="flex items-start space-x-2 cursor-pointer py-1">
                    <input
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded bg-[#08101a] border-[#25394f] text-[#dfb76c] focus:ring-0"
                      type="checkbox"
                    />
                    <span className="text-slate-400 leading-tight text-[11px]">
                      已阅并立誓遵守{' '}
                      <span className="text-amber-300/80">《九州仙盟契约》</span> 与{' '}
                      <span className="text-amber-300/80">《天道隐私禁令》</span>
                    </span>
                  </label>
                </div>
              )}

              {/* 提交大按键（朱红/金辉大触控高度） */}
              <button
                className="w-full mt-3 py-3.5 px-4 bg-gradient-to-r from-[#9e2a2b] via-[#bd3a3b] to-[#9e2a2b] hover:from-[#b83234] hover:to-[#b83234] active:scale-[0.98] text-amber-100 font-bold tracking-widest text-base rounded-xl border border-amber-400/40 shadow-lg hover:shadow-red-900/40 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                <span>
                  {loading
                    ? '神念引渡中...'
                    : currentMode === 'login'
                    ? '登 入 仙 途'
                    : '立 誓 入 籍 (立即注册)'}
                </span>
                <svg
                  className="w-4 h-4 text-amber-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </form>

            {/* 散修一键快速试玩入口 */}
            <div className="mt-4 pt-3 border-t border-amber-500/10 text-center">
              <button
                type="button"
                onClick={handleGuestQuickEnter}
                disabled={loading}
                className="text-xs text-amber-200/70 hover:text-amber-300 tracking-wider flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-lg hover:bg-amber-400/5 transition-all"
              >
                <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                <span>散修试玩 · 神游初入九州</span>
              </button>
            </div>
          </div>
        </div>

        {/* 底部版权与游戏适龄提示 (适配移动端竖屏底端吸附与沉浸感) */}
        <footer className="mt-6 mb-2 text-center text-[10px] text-slate-500/80 space-y-1.5">
          <p className="leading-relaxed">
            健康游戏忠告：抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。
          </p>
          <p className="text-slate-600">《万象录》研发运营团队 · 通行证系统</p>
        </footer>

        {/* 反馈提示浮层 (轻量 Toast) */}
        <div
          className={`fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1a2b3d] text-amber-200 text-xs rounded-lg border border-amber-500/40 shadow-xl pointer-events-none transition-opacity duration-300 flex items-center space-x-2 ${
            toastVisible ? 'opacity-100' : 'opacity-0'
          }`}
          id="toast"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMsg}</span>
        </div>
      </main>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import type { AccountModalTab } from '../hooks/useAuth';

interface AccountModalProps {
  isOpen: boolean;
  /** 打开时默认选中的 Tab（由入口决定：注册→upgrade，登录→login） */
  initialTab?: AccountModalTab;
  onClose: () => void;
  onUpgrade: (username: string, password: string) => Promise<any>;
  onMerge: (username: string, password: string) => Promise<any>;
  onLogin: (username: string, password: string) => Promise<any>;
  onLogout: () => Promise<void>;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  initialTab = 'upgrade',
  onClose,
  onUpgrade,
  onMerge,
  onLogin,
  onLogout,
}) => {
  const { player } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<AccountModalTab>(initialTab);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 每次打开弹窗时，按入口来源切换到对应 Tab，并清空上一次的输入与提示
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setUsername('');
    setPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const isGuest = Boolean(player?.isGuest);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!username.trim() || !password.trim()) {
      setErrorMsg('请完整填写账号名与登录密码');
      return;
    }

    setLoading(true);
    try {
      if (activeTab === 'upgrade') {
        const res = await onUpgrade(username.trim(), password.trim());
        setSuccessMsg(res.message || '转正升级成功！');
      } else if (activeTab === 'merge') {
        const res = await onMerge(username.trim(), password.trim());
        const summary = res.mergeSummary;
        setSuccessMsg(
          `合并成功！已将试玩的 ${summary.movedItemCount} 件神兵道具及 ${summary.mergedSilver} 纹银全部合入正式账号！`
        );
      } else if (activeTab === 'login') {
        await onLogin(username.trim(), password.trim());
        setSuccessMsg('登录成功！已成功载入正式账号档案。');
      }

      setUsername('');
      setPassword('');
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-container-high border border-outline-variant/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">account_circle</span>
            <h3 className="text-base font-bold text-on-surface">修仙道友仙籍档案</h3>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Current Identity Banner */}
        <div className="px-6 py-3.5 bg-surface-container-lowest/50 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">当前仙籍：</span>
              {isGuest ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  匿名游客试玩
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  正统正式仙籍
                </span>
              )}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              道号：<strong className="text-on-surface">{player?.nickname || '未知散修'}</strong> (ID: {player?.id})
            </p>
          </div>

          {!isGuest && (
            <button
              onClick={async () => {
                await onLogout();
                onClose();
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors border border-error/30"
            >
              退出账号
            </button>
          )}
        </div>

        {/* Guest Mode Tabs */}
        {isGuest ? (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-1 bg-surface-container-lowest p-1 rounded-xl mb-5 border border-outline-variant/20">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('upgrade');
                  setErrorMsg(null);
                }}
                className={`text-xs py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'upgrade'
                    ? 'bg-primary text-on-primary shadow'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                直接转正
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('merge');
                  setErrorMsg(null);
                }}
                className={`text-xs py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'merge'
                    ? 'bg-primary text-on-primary shadow'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                合并老账号
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setErrorMsg(null);
                }}
                className={`text-xs py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'login'
                    ? 'bg-primary text-on-primary shadow'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                已有号登录
              </button>
            </div>

            {/* Instruction description */}
            <div className="mb-4 text-xs text-on-surface-variant/80 bg-surface-container/60 p-3 rounded-lg border border-outline-variant/20">
              {activeTab === 'upgrade' && (
                <p>
                  💡 <strong className="text-primary">原地转正：</strong>将当前的试玩进度永久固化为您的正式账号，所有当前等级、背包装备与资产全数保留。
                </p>
              )}
              {activeTab === 'merge' && (
                <p>
                  ⚔️ <strong className="text-secondary">数据合并 (D1事务)：</strong>将刚才试玩期间积累的全部神兵道具、邮件、元宝与纹银，原子合并注入您之前注册的老账号中！
                </p>
              )}
              {activeTab === 'login' && (
                <p>
                  🔑 <strong className="text-on-surface">直接登录：</strong>直接载入已有正式账号，当前游客档案将被替换。
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="mb-4 text-xs p-3 rounded-lg bg-error/10 border border-error/30 text-error flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 text-xs p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  {activeTab === 'upgrade' ? '设定新账号名 (登录账号)' : '已有正式账号名'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={activeTab === 'upgrade' ? '如: my_xian_001' : '输入已注册的账号名'}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  {activeTab === 'upgrade' ? '设定登录密码 (至少6位)' : '正式账号登录密码'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="******"
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary text-xs font-bold shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading
                    ? '仙法运转中...'
                    : activeTab === 'upgrade'
                    ? '确认原地转正'
                    : activeTab === 'merge'
                    ? '一键强事务合并数据'
                    : '登录正式账号'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="p-6 text-center">
            <span className="material-symbols-outlined text-4xl text-emerald-400 mb-2">verified_user</span>
            <h4 className="text-sm font-bold text-on-surface mb-1">已登入万仙正统名册</h4>
            <p className="text-xs text-on-surface-variant mb-4">
              您当前使用的是正统正式仙籍，所有修为战力、神兵灵材均已安全云端同步。
            </p>
            <button
              onClick={onClose}
              className="py-2 px-6 rounded-xl bg-surface-container-highest text-on-surface text-xs font-medium hover:bg-surface-variant transition-colors"
            >
              返回长乐仙城
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

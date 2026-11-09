import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminApi } from '../services/api';
import { ShieldCheck, User, KeyRound, Sparkles, AlertCircle } from 'lucide-react';
import { AdminUser } from '../types';

interface LoginProps {
  onLoginSuccess: (user: AdminUser) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password.trim()) {
      setErrorMsg('请输入管理员账号和密码');
      return;
    }

    setLoading(true);
    try {
      const res = await adminApi.login(username.trim(), password.trim());
      onLoginSuccess(res.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-4 bg-[#080b10] relative overflow-y-auto">
      {/* 背景光影效果 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-[#121722]/90 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* 头部标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-slate-100 flex items-center justify-center gap-2">
            万象录
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-normal">
              ADMIN GM
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-2">万界总枢 · 内容管理控制台</p>
        </div>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">管理员账号</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理员账号"
                className="w-full pl-10 pr-4 py-2.5 bg-[#090d14] border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/50 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">管理密钥 / 密码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full pl-10 pr-4 py-2.5 bg-[#090d14] border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/50 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-medium text-slate-900 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] transition shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>登入总控台</span>
              </>
            )}
          </button>
        </form>

        {/* 提示信息 */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-xs text-slate-400 text-center">
          <p>默认初始化口令：<span className="font-mono text-amber-300">admin</span> / <span className="font-mono text-amber-300">admin123</span></p>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AdminUser } from '../types';
import {
  Compass,
  Users,
  LayoutDashboard,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Swords,
  ContactRound,
  Gift,
  Boxes,
  Bell,
  ScrollText,
  Pill as Pills,
  type LucideIcon,
} from 'lucide-react';

interface AdminLayoutProps {
  user: AdminUser;
  onLogout: () => void;
}

interface AdminNavChild {
  to: string;
  name: string;
}

interface AdminNavItem {
  to: string;
  name: string;
  icon: LucideIcon;
  desc: string;
  children?: AdminNavChild[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ user, onLogout }) => {
  const location = useLocation();

  const navItems: AdminNavItem[] = [
    {
      to: '/dashboard',
      name: '仪表总览',
      icon: LayoutDashboard,
      desc: '全服概览与统计',
    },
    {
      to: '/maps',
      name: '地图场景管理',
      icon: Compass,
      desc: '512×512 空间网格编辑',
    },
    {
      to: '/npc-templates',
      name: 'NPC 模板库',
      icon: ContactRound,
      desc: '模板属性与立绘',
    },
    {
      to: '/dialogues',
      name: '剧情剧本资产',
      icon: ScrollText,
      desc: '有向图对话连线与分支',
    },
    {
      to: '/monsters',
      name: '战斗配置',
      icon: Swords,
      desc: '模板实例与多敌人阵容',
    },
    {
      to: '/players',
      name: '玩家档案运维',
      icon: Users,
      desc: '修仙道册与数值调整',
    },
    {
      to: '/npc-instances',
      name: 'NPC 实例管理',
      icon: Boxes,
      desc: '模板实例 / 归属 / 发放者',
    },
    {
      to: '/medicines',
      name: '悬壶馆药品',
      icon: Pills,
      desc: '丹药名品与炼丹配方管理',
    },
    {
      to: '/skills',
      name: '技能法诀管理',
      icon: Sparkles,
      desc: '战斗技能、内力消耗与目标类型',
    },
    {
      to: '/grants',
      name: '系统发放',
      icon: Gift,
      desc: '邮件发放道具 / 角色',
    },
    {
      to: '/notifications',
      name: '通知管理',
      icon: Bell,
      desc: '通知事件列表与配置',
      children: [
        {
          to: '/notifications/player-level-up',
          name: '玩家升级通知',
        },
        {
          to: '/notifications/story-trigger',
          name: '剧情通知',
        },
      ],
    },
  ];

  const currentNav = navItems.find((item) =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );
  const currentChild = currentNav?.children?.find(
    (child) =>
      location.pathname === child.to || location.pathname.startsWith(child.to + '/')
  );

  return (
    <div className="h-screen flex bg-[#080b10] text-slate-100 overflow-hidden">
      {/* 侧边导航栏 */}
      <aside className="w-64 bg-[#0e131d] border-r border-slate-800 flex flex-col flex-shrink-0 z-20 h-full overflow-hidden">
        {/* Logo 与主标题 */}
        <div className="p-6 border-b border-slate-800/80 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-slate-100 text-sm tracking-wide">
                  万象录
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-amber-300/80 font-mono font-medium">
                    ADMIN GM SYSTEM
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 导航菜单列表 */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-0">
            <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1">
              核心运维功能
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <React.Fragment key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-5 h-5 flex-shrink-0 transition-colors ${
                            isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs">{item.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                        </div>
                      </>
                    )}
                  </NavLink>

                  {item.children &&
                    item.children.length > 0 &&
                    (location.pathname === item.to ||
                      location.pathname.startsWith(item.to + '/')) && (
                    <div className="ml-5 pl-4 border-l border-slate-800/90 space-y-1 py-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `block px-3 py-1.5 rounded-lg text-[11px] transition ${
                              isActive
                                ? 'bg-slate-800/70 text-amber-300 border border-slate-700/80'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
                            }`
                          }
                        >
                          {child.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

        {/* 底部管理员身份与登出 */}
        <div className="p-4 border-t border-slate-800/80 bg-[#0a0e16] flex-shrink-0">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-slate-200">{user.username}</div>
                <div className="text-[10px] text-amber-400/80 font-mono">天道监察使 (GM)</div>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/60 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 text-slate-400 border border-slate-700/60 text-xs flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>注销退出</span>
          </button>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* 顶栏 */}
        <header className="h-16 bg-[#0e131d]/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-slate-500">控制台</span>
            <span>/</span>
            <span className="text-amber-300 font-semibold">
              {currentNav?.name || '工作台'}
            </span>
            {currentChild && (
              <>
                <span>/</span>
                <span className="text-slate-300 font-semibold">{currentChild.name}</span>
              </>
            )}
            <span className="font-mono text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {location.pathname}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* 快捷跳转游戏客户端 */}
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1.5 transition py-1.5 px-3 rounded-lg hover:bg-slate-800"
            >
              <span>前往游戏前台</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="h-4 w-[1px] bg-slate-800" />

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <span className="font-mono text-[11px] text-slate-300">D1 Edge Running</span>
            </div>
          </div>
        </header>

        {/* 核心页面容器：由 React Router Outlet 渲染对应 URL 子页面 */}
        <main className="flex-1 p-6 overflow-y-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

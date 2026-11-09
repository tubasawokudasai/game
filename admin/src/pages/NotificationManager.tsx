import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../services/api';
import { NotificationEventItem } from '../types';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gift,
  Info,
  RefreshCw,
  Settings,
  Zap,
} from 'lucide-react';

/**
 * 后台「通知管理」一级页面。
 *
 * 按通知事件维度展示列表；当前版本只注册了 PLAYER_LEVEL_UP，
 * 点击「配置」进入二级页面「玩家升级通知」。
 */
export const NotificationManager: React.FC = () => {
  const [events, setEvents] = useState<NotificationEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3600);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getNotificationEvents();
      setEvents(res.data || []);
    } catch (err: any) {
      showToast(err?.message || '加载通知事件列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const enabledCount = events.filter((event) => event.enabled).length;
  const configuredCount = events.filter(
    (event) => event.grantCount > 0 || (event.notificationCount || 0) > 0
  ).length;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : 'bg-red-950/90 text-red-200 border-red-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 页头 */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              通知管理
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <BellRing className="w-5 h-5 text-amber-400" />
              <span>通知事件列表</span>
              <span className="text-[10px] font-mono text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-0.5">
                {events.length} 个事件
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              按通知事件统一管理游戏内即时通知与发放内容规则。已接入
              <span className="text-amber-300 font-semibold"> 玩家升级通知 </span>
              与
              <span className="text-violet-300 font-semibold"> 剧情节点触发器通知 </span>
              ，其他事件可按同一模式扩展。
            </p>
          </div>

          <button
            onClick={() => void load()}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新列表</span>
          </button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: '已接入通知',
            value: events.length,
            suffix: '个事件',
            icon: Bell,
            color: 'text-sky-300',
            bg: 'bg-sky-500/10',
            border: 'border-sky-500/20',
          },
          {
            label: '已启用',
            value: enabledCount,
            suffix: '个事件',
            icon: Zap,
            color: 'text-emerald-300',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
          },
          {
            label: '已配置内容',
            value: configuredCount,
            suffix: '个事件',
            icon: Gift,
            color: 'text-violet-300',
            bg: 'bg-violet-500/10',
            border: 'border-violet-500/20',
          },
          {
            label: '即时通知',
            value: events.filter((event) => event.action === '即时通知').length,
            suffix: '个事件',
            icon: BellRing,
            color: 'text-amber-300',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-2xl p-4 border ${card.bg} ${card.border}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{card.label}</span>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
                <span className="text-[10px] text-slate-500">{card.suffix}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 事件列表 */}
      <section className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            通知事件
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">NOTIFICATION EVENTS</span>
        </div>

        {loading ? (
          <div className="px-5 py-14 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
            正在读取通知事件...
          </div>
        ) : events.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <BellRing className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <div className="text-xs text-slate-400">暂无已接入的通知事件</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="text-[10px] text-slate-500 bg-[#0d121b] border-b border-slate-800">
                  <th className="px-5 py-3 font-medium">通知事件</th>
                  <th className="px-4 py-3 font-medium">触发条件</th>
                  <th className="px-4 py-3 font-medium">执行动作</th>
                  <th className="px-4 py-3 font-medium">通知对象</th>
                  <th className="px-4 py-3 font-medium">配置内容</th>
                  <th className="px-4 py-3 font-medium">启用状态</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.eventCode}
                    className="border-b border-slate-800/70 last:border-b-0 hover:bg-slate-800/20 transition"
                  >
                    <td className="px-5 py-4">
                      <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                        {event.eventName}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                          {event.eventCode}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500 truncate max-w-[260px]">
                        当前文案：{event.title || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-300">{event.triggerCondition}</td>
                    <td className="px-4 py-4 text-xs text-slate-300">{event.action}</td>
                    <td className="px-4 py-4 text-xs text-slate-300">{event.target}</td>
                    <td className="px-4 py-4">
                      {event.eventCode === 'STORY_NODE_TRIGGER' ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-violet-200">
                            <BellRing className="w-3.5 h-3.5 text-violet-400" />
                            {event.notificationCount || 0} 条独立通知
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
                            <Gift className="w-3.5 h-3.5 text-amber-400" />
                            {(event.grantCount || 0) > 0
                              ? `${event.grantCount} 项发放内容`
                              : '未配置发放内容'}
                          </span>
                        </div>
                      ) : event.grantCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-violet-200">
                          <Gift className="w-3.5 h-3.5 text-violet-400" />
                          {event.grantCount} 项发放内容
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Gift className="w-3.5 h-3.5 text-slate-600" />
                          未配置
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] border ${
                          event.enabled
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            event.enabled ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        {event.enabled ? '已启用' : '已关闭'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />
                        {event.updatedAt
                          ? String(event.updatedAt).replace('T', ' ').replace(/\.\d+Z?$/, '')
                          : '—'}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {event.updatedBy ? `修改人：${event.updatedBy}` : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={event.configPath}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] transition"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        配置
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-2xl bg-sky-500/5 border border-sky-500/20 p-4 text-[11px] text-sky-200/80 leading-relaxed flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 text-sky-300 flex-shrink-0" />
        <div>
          通知管理按「事件」维度组织，每个事件拥有独立配置页。当前已接入
          <span className="text-sky-200 font-semibold"> PLAYER_LEVEL_UP（玩家升级通知）</span>
          与
          <span className="text-violet-200 font-semibold"> STORY_NODE_TRIGGER（剧情节点触发器通知）</span>
          ；后续新增事件会自动出现在此列表，并按相同模式进入二级配置页。
        </div>
      </div>
    </div>
  );
};

export default NotificationManager;

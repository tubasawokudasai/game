import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../services/api';
import type { GrantCatalogData } from '../components/GrantContentEditor';
import {
  NotificationConfigEditor,
  NotificationPreviewPanel,
  validateNotificationGrants,
} from '../components/NotificationConfigEditor';
import {
  LevelUpNotificationConfig,
  LevelUpNotificationFixedRules,
  LevelUpNotificationResponse,
  LevelUpNotificationVariable,
} from '../types';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';

/**
 * 后台「通知管理 · 玩家升级通知」页面。
 *
 * 业务链路：
 * 1. 读取 notification_configs 中的 PLAYER_LEVEL_UP 配置；
 * 2. 管理员编辑启用状态、通知标题/内容、发放内容（道具 / 角色 / 货币）；
 * 3. 保存后由后端重新校验道具、角色模版、数量与重复项；
 * 4. 玩家升级时由经验服务写入 Outbox，通知服务读取配置：
 *    - 启用 + 空发放内容：只发即时通知；
 *    - 启用 + 有发放内容：即时通知 + 通过现有系统邮件服务创建奖励邮件；
 *    - 关闭：不发通知、不发奖、不建邮件。
 *
 * 页面内容区由通用 NotificationConfigEditor 渲染；剧情通知等其它事件复用同一组件。
 */

interface ToastState {
  type: 'success' | 'error';
  text: string;
}

const FALLBACK_DEFAULT_CONFIG: LevelUpNotificationConfig = {
  enabled: true,
  eventCode: 'PLAYER_LEVEL_UP',
  title: '恭喜升级！',
  content: '恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！',
  grants: [],
};

const EMPTY_CATALOG: GrantCatalogData = { items: [], companions: [] };

export const PlayerLevelUpNotification: React.FC = () => {
  const [config, setConfig] = useState<LevelUpNotificationConfig | null>(null);
  const [defaults, setDefaults] = useState<LevelUpNotificationConfig>(FALLBACK_DEFAULT_CONFIG);
  const [variables, setVariables] = useState<LevelUpNotificationVariable[]>([]);
  const [fixedRules, setFixedRules] = useState<LevelUpNotificationFixedRules | null>(null);
  const [catalog, setCatalog] = useState<GrantCatalogData>(EMPTY_CATALOG);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3800);
  };

  const applyResponse = (res: LevelUpNotificationResponse) => {
    setConfig(res.data);
    if (res.defaults) setDefaults(res.defaults);
    if (res.variables) setVariables(res.variables);
    if (res.fixedRules) setFixedRules(res.fixedRules);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [configRes, catalogRes] = await Promise.all([
        adminApi.getPlayerLevelUpNotification(),
        adminApi.getGrantCatalog(),
      ]);
      applyResponse(configRes);
      setCatalog({
        items: catalogRes.items || [],
        companions: catalogRes.companions || [],
      });
    } catch (err: any) {
      showToast(err?.message || '加载玩家升级通知配置失败', 'error');
      setConfig((prev) => prev || FALLBACK_DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateConfig = (patch: Partial<LevelUpNotificationConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const validate = (): string | null => {
    if (!config) return '配置尚未加载完成';
    if (!config.title.trim()) return '通知标题不能为空';
    if (!config.content.trim()) return '通知内容不能为空';
    return validateNotificationGrants(config.grants, catalog);
  };

  const handleSave = async () => {
    if (!config) return;
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await adminApi.savePlayerLevelUpNotification({
        enabled: config.enabled,
        title: config.title,
        content: config.content,
        grants: config.grants,
      });
      applyResponse(res);
      showToast('玩家升级通知配置已保存', 'success');
    } catch (err: any) {
      showToast(err?.message || '保存玩家升级通知配置失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('确定恢复默认配置吗？将恢复为「启用」状态、默认文案与空发放内容。')) {
      return;
    }

    setResetting(true);
    try {
      const res = await adminApi.resetPlayerLevelUpNotification();
      applyResponse(res);
      showToast('已恢复默认配置', 'success');
    } catch (err: any) {
      showToast(err?.message || '恢复默认配置失败', 'error');
    } finally {
      setResetting(false);
    }
  };

  const rules = fixedRules || {
    eventName: '玩家升级通知',
    eventCode: 'PLAYER_LEVEL_UP',
    triggerCondition: '每次升级',
    action: '即时通知',
    target: '当前升级玩家',
  };

  const grantCount = config?.grants.length || 0;

  return (
    <div className="space-y-6">
      {/* 二级页面面包屑 / 返回通知事件列表 */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link
          to="/notifications"
          className="inline-flex items-center gap-1 hover:text-amber-300 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          通知管理
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">玩家升级通知</span>
      </div>

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
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>玩家升级通知</span>
              <span className="text-[10px] font-mono text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-0.5">
                PLAYER_LEVEL_UP
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              配置玩家每次升级时是否发送即时通知，以及是否通过现有系统邮件服务附带发放内容
              （道具 / 角色 / 货币）。发放内容可为空；玩家在邮箱中点击「领取」后，
              道具进入背包、角色进入同道名册、货币进入钱庄。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-2 whitespace-nowrap transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
            <button
              onClick={handleReset}
              disabled={resetting || saving}
              className="px-4 py-2 bg-slate-800/60 hover:bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-xl text-xs flex items-center gap-2 whitespace-nowrap transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              <span>恢复默认</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !config}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? '保存中...' : '保存配置'}</span>
            </button>
          </div>
        </div>
      </div>

      {loading && !config ? (
        <div className="bg-[#121722] border border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
          正在读取升级通知配置...
        </div>
      ) : config ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <NotificationConfigEditor
              value={config}
              onChange={updateConfig}
              catalog={catalog}
              variables={variables}
              defaults={{ title: defaults.title, content: defaults.content }}
              fixedRules={rules}
            />
          </div>

          {/* 右侧：预览与保存状态 */}
          <div className="space-y-6">
            <NotificationPreviewPanel
              title={config.title}
              content={config.content}
              variables={variables}
              grants={config.grants}
              catalog={catalog}
              enabled={config.enabled}
              updatedAt={config.updatedAt}
              updatedBy={config.updatedBy}
              mailSummaryPrefix="升级成功后创建"
              className="sticky top-20"
              footer={
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        正在保存...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        保存配置
                      </>
                    )}
                  </button>

                  <div className="text-[10px] text-slate-600 leading-relaxed">
                    保存后立即生效。配置持久化于 notification_configs 表，刷新页面或重新登录后台不会丢失。
                    当前发放内容 {grantCount} 项。
                  </div>
                </>
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PlayerLevelUpNotification;

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock3,
  Edit3,
  Gift,
  Info,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { adminApi } from '../services/api';
import type { GrantCatalogData } from '../components/GrantContentEditor';
import {
  NotificationConfigEditor,
  NotificationPreviewPanel,
  STORY_NOTIFICATION_DEFAULTS,
  STORY_NOTIFICATION_VARIABLES,
  validateNotificationGrants,
} from '../components/NotificationConfigEditor';
import {
  DialogueNodeItem,
  DialoguePackageItem,
  LevelUpNotificationFixedRules,
  LevelUpNotificationVariable,
  StoryNotificationItem,
} from '../types';

const EVENT_LABELS: Record<string, string> = {
  ANY: '任意时机',
  ENTER: '进入节点',
  COMPLETE: '完成节点',
};

const FALLBACK_VARIABLES = STORY_NOTIFICATION_VARIABLES;
const FALLBACK_DEFAULTS = STORY_NOTIFICATION_DEFAULTS;

const EMPTY_CATALOG: GrantCatalogData = { items: [], companions: [] };

const emptyDraft = (packageId: string): Partial<StoryNotificationItem> => ({
  package_id: packageId,
  node_id: null,
  trigger_event: 'ANY',
  name: '',
  title: '',
  content: '',
  grants: [],
  enabled: true,
});

/**
 * 后台「通知管理 · 剧情通知」资产列表。
 *
 * 一套剧本可以配置多条独立通知；通知可绑定具体节点与触发时机。
 * 每条通知与玩家升级通知使用同一套配置逻辑（通用 NotificationConfigEditor）：
 * - 通知内容配置：标题 / 正文 / 已注册变量；
 * - 发放内容：道具 / 角色 / 货币，触发后通过系统邮件发放。
 * 剧情节点编辑器的「系统通知」触发器通过 notificationId 引用这里的通知。
 */
export const StoryNodeNotification: React.FC = () => {
  const [items, setItems] = useState<StoryNotificationItem[]>([]);
  const [packages, setPackages] = useState<DialoguePackageItem[]>([]);
  const [packageFilter, setPackageFilter] = useState('');
  const [catalog, setCatalog] = useState<GrantCatalogData>(EMPTY_CATALOG);
  const [variables, setVariables] = useState<LevelUpNotificationVariable[]>(FALLBACK_VARIABLES);
  const [defaults, setDefaults] = useState(FALLBACK_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<StoryNotificationItem> | null>(null);
  const [draftNodes, setDraftNodes] = useState<DialogueNodeItem[]>([]);
  const [saving, setSaving] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3600);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [listRes, pkgRes, catalogRes, storyConfigRes] = await Promise.all([
        adminApi.getStoryNotifications(),
        adminApi.getDialoguePackages(),
        adminApi.getGrantCatalog(),
        // 通知文案变量 / 默认值仅用于编辑器提示；接口异常不阻断通知列表
        adminApi.getStoryNotification().catch(() => null),
      ]);
      setItems(listRes.data || []);
      setPackages(pkgRes.data || []);
      setCatalog({
        items: catalogRes.items || [],
        companions: catalogRes.companions || [],
      });
      if (storyConfigRes?.variables?.length) setVariables(storyConfigRes.variables);
      if (storyConfigRes?.defaults) {
        setDefaults({
          title: storyConfigRes.defaults.title || FALLBACK_DEFAULTS.title,
          content: storyConfigRes.defaults.content || FALLBACK_DEFAULTS.content,
        });
      }
    } catch (err: any) {
      showToast(err?.message || '加载剧情通知失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(
    () =>
      packageFilter
        ? items.filter((item) => item.package_id === packageFilter)
        : items,
    [items, packageFilter]
  );

  const packageName = (id?: string | null) =>
    packages.find((p) => p.id === id)?.name || id || '—';

  // 打开编辑时加载该剧本的节点，供「绑定节点」下拉选择
  useEffect(() => {
    const packageId = draft?.package_id;
    if (!isModalOpen || !packageId) {
      setDraftNodes([]);
      return;
    }

    let cancelled = false;
    adminApi
      .getDialoguePackage(packageId)
      .then((res) => {
        if (!cancelled) setDraftNodes(res.data?.nodes || []);
      })
      .catch(() => {
        if (!cancelled) setDraftNodes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [draft?.package_id, isModalOpen]);

  const openCreate = () => {
    setDraft(emptyDraft(packageFilter || packages[0]?.id || ''));
    setIsModalOpen(true);
  };

  const openEdit = (item: StoryNotificationItem) => {
    setDraft({ ...item, grants: item.grants || [] });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setDraft(null);
  };

  const updateDraft = (patch: Partial<StoryNotificationItem>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;

    if (!draft.package_id) {
      showToast('请选择所属剧本', 'error');
      return;
    }
    if (!draft.name?.trim()) {
      showToast('通知名称不能为空', 'error');
      return;
    }
    if (!draft.title?.trim()) {
      showToast('通知标题不能为空', 'error');
      return;
    }
    if (!draft.content?.trim()) {
      showToast('通知正文不能为空', 'error');
      return;
    }

    const grantsError = validateNotificationGrants(draft.grants || [], catalog);
    if (grantsError) {
      showToast(grantsError, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<StoryNotificationItem> = {
        package_id: draft.package_id,
        node_id: draft.node_id || null,
        trigger_event: draft.trigger_event || 'ANY',
        name: draft.name.trim(),
        title: draft.title.trim(),
        content: draft.content.trim(),
        grants: draft.grants || [],
        enabled: draft.enabled !== false,
      };

      if (draft.id) {
        await adminApi.updateStoryNotification(draft.id, payload);
        showToast('剧情通知已保存');
      } else {
        await adminApi.createStoryNotification(payload);
        showToast('剧情通知已创建');
      }

      setIsModalOpen(false);
      setDraft(null);
      await load();
    } catch (err: any) {
      showToast(err?.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: StoryNotificationItem) => {
    if (!window.confirm(`确定删除通知【${item.name}】吗？引用它的节点触发器将回退到全局默认通知。`)) {
      return;
    }
    try {
      await adminApi.deleteStoryNotification(item.id);
      showToast('剧情通知已删除');
      await load();
    } catch (err: any) {
      showToast(err?.message || '删除失败', 'error');
    }
  };

  const storyRules = useMemo<LevelUpNotificationFixedRules>(() => {
    const nodeLabel = draft?.node_id
      ? draftNodes.find((node) => node.id === draft.node_id)?.chapter_title || draft.node_id
      : '整段剧本通用';
    return {
      eventName: draft?.name?.trim() || '剧情通知',
      eventCode: 'STORY_NODE_TRIGGER',
      triggerCondition: `${packageName(draft?.package_id)} · ${nodeLabel} · ${
        EVENT_LABELS[draft?.trigger_event || 'ANY'] || '任意时机'
      }`,
      action: '即时通知',
      target: '当前触发玩家',
    };
  }, [draft?.name, draft?.package_id, draft?.node_id, draft?.trigger_event, draftNodes, packages]);

  return (
    <div className="space-y-5">
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            to="/notifications"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回通知事件列表
          </Link>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BellRing className="w-5 h-5 text-violet-400" />
            剧情通知管理
            <span className="text-[10px] font-mono text-violet-300/80 bg-violet-500/10 border border-violet-500/30 rounded-md px-2 py-0.5">
              {items.length} 条
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            一套剧本 / 一个节点可配置多条独立通知；每条通知与玩家升级通知使用同一套逻辑：
            通知内容配置 + 发放内容（道具 / 角色 / 货币），触发后通过系统邮件发放。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={packages.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-violet-500/20 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            新建通知
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">按剧本筛选</span>
        <select
          value={packageFilter}
          onChange={(e) => setPackageFilter(e.target.value)}
          className="px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-400"
        >
          <option value="">全部剧本</option>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name}
            </option>
          ))}
        </select>
      </div>

      <section className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-14 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-400" />
            正在读取剧情通知...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-5 py-14 text-center text-xs text-slate-400">
            <BellRing className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            当前剧本还没有独立通知，点击右上角「新建通知」创建。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left">
              <thead>
                <tr className="text-[10px] text-slate-500 bg-[#0d121b] border-b border-slate-800">
                  <th className="px-5 py-3 font-medium">通知名称</th>
                  <th className="px-4 py-3 font-medium">所属剧本</th>
                  <th className="px-4 py-3 font-medium">绑定节点 / 时机</th>
                  <th className="px-4 py-3 font-medium">通知文案</th>
                  <th className="px-4 py-3 font-medium">发放内容</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800/70 last:border-b-0 hover:bg-slate-800/20 transition"
                  >
                    <td className="px-5 py-4">
                      <div className="text-xs font-semibold text-slate-100">{item.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.id}</div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-300">
                      {item.package_name || packageName(item.package_id)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[11px] text-slate-300">
                        {item.node_chapter || (item.node_id ? item.node_id : '整段剧本通用')}
                      </div>
                      <div className="text-[10px] text-violet-300 mt-0.5">
                        {EVENT_LABELS[item.trigger_event] || item.trigger_event}
                      </div>
                    </td>
                    <td className="px-4 py-4 max-w-[280px]">
                      <div className="text-[11px] text-slate-200 truncate">{item.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.content}</div>
                    </td>
                    <td className="px-4 py-4">
                      {(item.grants?.length || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <Gift className="w-3 h-3" />
                          {item.grants.length} 项
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] bg-slate-800/60 text-slate-400 border border-slate-700">
                          <Gift className="w-3 h-3 text-slate-500" />
                          未配置
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] border ${
                          item.enabled
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.enabled ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        {item.enabled ? '已启用' : '已关闭'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />
                        {item.updated_at
                          ? String(item.updated_at).replace('T', ' ').replace(/\.\d+Z?$/, '')
                          : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px] flex items-center gap-1 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          className="px-2 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-2xl bg-violet-500/5 border border-violet-500/20 p-4 text-[11px] text-violet-200/80 leading-relaxed flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 text-violet-300 flex-shrink-0" />
        <div>
          节点触发器引用通知后，会按本页配置的标题/正文发送即时通知，并按发放内容创建奖励邮件；
          删除通知后，引用它的旧触发器会回退到全局默认通知。
        </div>
      </div>

      {/* 编辑弹窗 */}
      {isModalOpen && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#0e1422] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/80 overflow-hidden">
            <div className="px-5 py-4 bg-[#141b2e] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {draft.id ? '编辑剧情通知' : '新建剧情通知'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    该通知可被任意剧情节点的「系统通知」触发器引用，逻辑与玩家升级通知一致
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">所属剧本</label>
                  <select
                    value={draft.package_id || ''}
                    onChange={(e) =>
                      updateDraft({ package_id: e.target.value, node_id: null })
                    }
                    className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-violet-400"
                  >
                    <option value="">-- 选择剧本 --</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    绑定节点（可选）
                  </label>
                  <select
                    value={draft.node_id || ''}
                    onChange={(e) => updateDraft({ node_id: e.target.value || null })}
                    className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-violet-400"
                  >
                    <option value="">-- 整段剧本通用 --</option>
                    {draftNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.chapter_title ? `${node.chapter_title} · ` : ''}
                        {node.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">触发时机</label>
                  <select
                    value={draft.trigger_event || 'ANY'}
                    onChange={(e) =>
                      updateDraft({
                        trigger_event: e.target.value as StoryNotificationItem['trigger_event'],
                      })
                    }
                    className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-violet-400"
                  >
                    <option value="ANY">任意时机（由触发器决定）</option>
                    <option value="ENTER">进入节点时</option>
                    <option value="COMPLETE">完成节点时</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">通知名称</label>
                  <input
                    type="text"
                    value={draft.name || ''}
                    onChange={(e) => updateDraft({ name: e.target.value })}
                    maxLength={64}
                    placeholder="如：洛清寒初识 · 完成通知"
                    className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>

              {/* 通知内容配置 + 发放内容：与玩家升级通知共用同一个组件 */}
              <NotificationConfigEditor
                value={{
                  enabled: draft.enabled !== false,
                  title: draft.title || '',
                  content: draft.content || '',
                  grants: draft.grants || [],
                }}
                onChange={updateDraft}
                catalog={catalog}
                variables={variables}
                defaults={defaults}
                fixedRules={storyRules}
                grantEmptyText="当前发放内容为空，剧情触发后只发送即时通知"
                grantFooterNote={
                  <div className="text-[10px] text-slate-600 leading-relaxed">
                    未选择道具 / 角色或货币全为 0 的空白发放项不会被保存；
                    发放内容只在玩家于邮箱点击「领取」后生效。
                  </div>
                }
              />

              <NotificationPreviewPanel
                title={draft.title || ''}
                content={draft.content || ''}
                variables={variables}
                grants={draft.grants || []}
                catalog={catalog}
                enabled={draft.enabled !== false}
                showMeta={false}
                mailSummaryPrefix="触发成功后创建"
              />
            </div>

            <div className="px-5 py-3.5 bg-[#141b2e] border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存通知'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryNodeNotification;

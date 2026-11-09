import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Plus,
  BookOpen,
  Edit3,
  Trash2,
  ExternalLink,
  Layers,
  Sparkles,
  Tag,
  Search,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import {
  DialoguePackageItem,
  DialoguePackageDetail,
  NpcTemplateItem,
  NpcItem,
  MonsterGroupItem,
  SceneItem,
  StoryNotificationItem,
} from '../types';
import { adminApi } from '../services/api';
import { DialogueGraphEditor } from '../components/DialogueGraphEditor';
import type { GrantCatalogData } from '../components/GrantContentEditor';

const EMPTY_GRANT_CATALOG: GrantCatalogData = { items: [], companions: [] };

const CATEGORY_NAMES: Record<string, { label: string; color: string }> = {
  MAIN: { label: '主线剧情', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  BRANCH: { label: '分支任务', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  ENCOUNTER: { label: '奇遇机缘', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  FACILITY: { label: '设施交互', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  STORY: { label: '剧情剧本', color: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
};

export const DialogueManager: React.FC = () => {
  const [packages, setPackages] = useState<DialoguePackageItem[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string>('');
  const [packageDetail, setPackageDetail] = useState<DialoguePackageDetail | null>(null);
  const [npcTemplates, setNpcTemplates] = useState<NpcTemplateItem[]>([]);
  const [npcInstances, setNpcInstances] = useState<NpcItem[]>([]);
  const [monsterGroups, setMonsterGroups] = useState<MonsterGroupItem[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [storyNotifications, setStoryNotifications] = useState<StoryNotificationItem[]>([]);
  const [grantCatalog, setGrantCatalog] = useState<GrantCatalogData>(EMPTY_GRANT_CATALOG);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [isPkgModalOpen, setIsPkgModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Partial<DialoguePackageItem> | null>(null);

  // 加载剧本列表
  const loadPackages = useCallback(async (selectIdAfterLoad?: string) => {
    try {
      setLoading(true);
      const [pkgsRes, tplsRes, scenesRes, notificationsRes, npcsRes, monsterGroupsRes, grantCatalogRes] =
        await Promise.all([
          adminApi.getDialoguePackages(),
          adminApi.getNpcTemplates().catch(() => ({ success: false, data: [] as NpcTemplateItem[] })),
          adminApi.getScenes().catch(() => ({ scenes: [] as SceneItem[] })),
          adminApi.getStoryNotifications().catch(() => ({ success: false, data: [] as StoryNotificationItem[] })),
          adminApi.getNpcs().catch(() => ({ success: false, data: [] as NpcItem[] })),
          adminApi.getMonsterGroups().catch(() => ({ success: false, data: [] as MonsterGroupItem[] })),
          adminApi.getGrantCatalog().catch(() => ({ items: [], companions: [] })),
        ]);

      if (pkgsRes.success) {
        setPackages(pkgsRes.data || []);
        if (tplsRes.success) {
          setNpcTemplates(tplsRes.data || []);
        }
        setScenes(scenesRes.scenes || []);
        setStoryNotifications(notificationsRes.data || []);
        setNpcInstances(npcsRes.data || []);
        if (monsterGroupsRes.success) setMonsterGroups(monsterGroupsRes.data || []);
        setGrantCatalog({
          items: grantCatalogRes.items || [],
          companions: grantCatalogRes.companions || [],
        });

        const targetId =
          selectIdAfterLoad ||
          selectedPkgId ||
          (pkgsRes.data.length > 0 ? pkgsRes.data[0].id : '');

        if (targetId) {
          setSelectedPkgId(targetId);
        }
      }
    } catch (err) {
      console.error('加载剧本列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPkgId]);

  useEffect(() => {
    loadPackages();
  }, []);

  // 加载选定剧本详情及其全部节点
  const loadPackageDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setLoadingDetail(true);
      const res = await adminApi.getDialoguePackage(id);
      if (res.success && res.data) {
        setPackageDetail(res.data);
      }
    } catch (err) {
      console.error('加载剧本详情失败:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPkgId) {
      loadPackageDetail(selectedPkgId);
    } else {
      setPackageDetail(null);
    }
  }, [selectedPkgId, loadPackageDetail]);

  // 过滤后的剧本列表
  const filteredPackages = packages.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 保存新建/编辑剧本资产
  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPkg || !editingPkg.name?.trim()) return;

    try {
      if (editingPkg.id && packages.some((p) => p.id === editingPkg.id)) {
        // 更新
        await adminApi.updateDialoguePackage(editingPkg.id, editingPkg);
        await loadPackages(editingPkg.id);
      } else {
        // 新建
        const res = await adminApi.createDialoguePackage(editingPkg);
        const newId = res.data?.id || editingPkg.id;
        await loadPackages(newId);
      }
      setIsPkgModalOpen(false);
      setEditingPkg(null);
    } catch (err: any) {
      alert(err.message || '保存剧本失败');
    }
  };

  // 删除剧本
  const handleDeletePackage = async (pkg: DialoguePackageItem) => {
    if (
      window.confirm(
        `确定要删除剧本【${pkg.name}】(${pkg.id}) 吗？\n将自动解绑正在关联的 NPC，已有节点也将解绑所属关系。`
      )
    ) {
      try {
        await adminApi.deleteDialoguePackage(pkg.id);
        const remaining = packages.filter((p) => p.id !== pkg.id);
        setPackages(remaining);
        if (remaining.length > 0) {
          setSelectedPkgId(remaining[0].id);
        } else {
          setSelectedPkgId('');
          setPackageDetail(null);
        }
      } catch (err: any) {
        alert(err.message || '删除剧本失败');
      }
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 主工作区：左侧剧本列表，右侧有向图编辑器 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-1 min-h-0">
        {/* 左侧：剧本列表与选择器 (3 cols) */}
        <div className="lg:col-span-3 bg-[#0d121c] border border-slate-800 rounded-2xl p-3.5 flex flex-col min-h-0 h-full">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-sky-400" />
              <span>剧本列表 ({packages.length})</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setEditingPkg({
                    id: `pkg_${Date.now()}`,
                    name: '',
                    category: 'MAIN',
                    description: '',
                  });
                  setIsPkgModalOpen(true);
                }}
                className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg text-xs font-medium transition"
                title="新建剧本"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建</span>
              </button>
              <button
                onClick={() => loadPackages()}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition"
                title="刷新列表"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索剧本名称/ID..."
              className="w-full pl-8 pr-2.5 py-1.5 bg-[#080b12] border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* 剧本列表 */}
          <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0 pr-1">
            {filteredPackages.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                暂无匹配的剧情剧本
              </div>
            ) : (
              filteredPackages.map((pkg) => {
                const isSelected = pkg.id === selectedPkgId;
                const catInfo = CATEGORY_NAMES[pkg.category] || CATEGORY_NAMES.STORY;

                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPkgId(pkg.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'bg-[#151c2d] border-amber-400 shadow-md shadow-amber-500/10'
                        : 'bg-[#0a0e17] border-slate-800 hover:border-slate-700 hover:bg-[#0f1422]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <h4
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-amber-300' : 'text-slate-200'
                        }`}
                        title={pkg.name}
                      >
                        {pkg.name}
                      </h4>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border shrink-0 ${catInfo.color}`}
                      >
                        {catInfo.label}
                      </span>
                    </div>

                    <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                      {pkg.id}
                    </p>

                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                      <span>节点: {pkg.node_count ?? 0}</span>
                      <span>挂载 NPC: {pkg.npc_count ?? 0}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPkg({ ...pkg });
                            setIsPkgModalOpen(true);
                          }}
                          className="p-1 hover:text-sky-300 rounded"
                          title="编辑剧本信息"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePackage(pkg);
                          }}
                          className="p-1 hover:text-rose-400 rounded"
                          title="删除剧本"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：有向图连线编辑器主体 (9 cols) */}
        <div className="lg:col-span-9 flex flex-col min-h-0 h-full">
          {loadingDetail ? (
            <div className="w-full h-full min-h-[500px] bg-[#080c14] border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>正在加载剧本拓扑连线...</span>
            </div>
          ) : packageDetail ? (
            <DialogueGraphEditor
              packageDetail={packageDetail}
              npcTemplates={npcTemplates}
              npcInstances={npcInstances}
              monsterGroups={monsterGroups}
              scenes={scenes}
              storyNotifications={storyNotifications}
              grantCatalog={grantCatalog}
              onRefresh={() => loadPackageDetail(selectedPkgId)}
            />
          ) : (
            <div className="w-full h-full min-h-[500px] bg-[#080c14] border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center space-y-3">
              <ScrollText className="w-10 h-10 text-slate-700" />
              <p>请在左侧选择或新建一个剧情剧本资产以开启有向图连线编辑</p>
            </div>
          )}
        </div>
      </div>

      {/* 新建/编辑剧本资产元数据弹窗 */}
      {isPkgModalOpen && editingPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <form
            onSubmit={handleSavePackage}
            className="bg-[#0e1422] border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-amber-400" />
                <span>
                  {packages.some((p) => p.id === editingPkg.id) ? '编辑剧本资产' : '新建剧情剧本'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPkgModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 剧本标识 ID */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                剧本唯一 ID (如: pkg_mofang_gujing)
              </label>
              <input
                type="text"
                value={editingPkg.id || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, id: e.target.value })}
                disabled={packages.some((p) => p.id === editingPkg.id)}
                required
                className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-100 disabled:opacity-50"
              />
            </div>

            {/* 剧本名称 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                剧本名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={editingPkg.name || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, name: e.target.value })}
                placeholder="如: 长乐古井篇 · 幽冥探秘"
                required
                className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 剧情分类 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                剧本分类
              </label>
              <select
                value={editingPkg.category || 'MAIN'}
                onChange={(e) => setEditingPkg({ ...editingPkg, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-200"
              >
                <option value="MAIN">主线剧情 (MAIN)</option>
                <option value="BRANCH">支线任务 (BRANCH)</option>
                <option value="ENCOUNTER">奇遇机缘 (ENCOUNTER)</option>
                <option value="FACILITY">设施交互 (FACILITY)</option>
              </select>
            </div>

            {/* 剧本描述 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                剧情梗概 / 策划背景设定
              </label>
              <textarea
                rows={3}
                value={editingPkg.description || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, description: e.target.value })}
                placeholder="为文案策划与剧情逻辑记录背景设定..."
                className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 底部按钮 */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPkgModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20"
              >
                保存资产
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

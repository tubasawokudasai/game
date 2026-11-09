import React, { useEffect, useState, useMemo } from 'react';
import { adminApi } from '../services/api';
import { SceneItem, NpcItem } from '../types';
import { MapVisualEditor } from '../components/MapVisualEditor';
import { SceneEditModal } from '../components/SceneEditModal';
import { NpcEditModal } from '../components/NpcEditModal';
import {
  MapPin,
  Plus,
  Search,
  LayoutList,
  Compass,
  Edit2,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Save,
  Swords,
  MessageSquare,
  Users,
} from 'lucide-react';

export const MapManager: React.FC = () => {
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState<number | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'visual' | 'table'>('visual');

  // 场景增删改弹窗
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewScene, setIsNewScene] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneItem | null>(null);

  // 删除确认弹窗
  const [deletingScene, setDeletingScene] = useState<SceneItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 画布选中项
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // 场景 NPC 驻留状态
  const [sceneNpcs, setSceneNpcs] = useState<NpcItem[]>([]);
  const [loadingNpcs, setLoadingNpcs] = useState(false);
  const [isNpcModalOpen, setIsNpcModalOpen] = useState(false);
  const [editingNpc, setEditingNpc] = useState<NpcItem | null>(null);

  const loadSceneNpcs = async (sceneId: string) => {
    setLoadingNpcs(true);
    try {
      const res = await adminApi.getNpcs(sceneId);
      setSceneNpcs(res.data || []);
    } catch {
      setSceneNpcs([]);
    } finally {
      setLoadingNpcs(false);
    }
  };

  useEffect(() => {
    if (selectedSceneId) {
      loadSceneNpcs(selectedSceneId);
    } else {
      setSceneNpcs([]);
    }
  }, [selectedSceneId]);

  const handleOpenCreateNpc = () => {
    setEditingNpc(null);
    setIsNpcModalOpen(true);
  };

  const handleOpenEditNpc = (npc: NpcItem) => {
    setEditingNpc(npc);
    setIsNpcModalOpen(true);
  };

  const handleDeleteNpc = async (npc: NpcItem) => {
    if (!window.confirm(`确定删除场景人物【${npc.name}】吗？`)) return;
    try {
      await adminApi.deleteNpc(npc.id);
      showToast(`已成功删除人物【${npc.name}】`);
      if (selectedSceneId) {
        await loadSceneNpcs(selectedSceneId);
      }
    } catch (err: any) {
      showToast(err.message || '删除 NPC 失败', 'error');
    }
  };

  // 侧边栏微调坐标输入状态
  const [quickCoordX, setQuickCoordX] = useState<number>(128);
  const [quickCoordY, setQuickCoordY] = useState<number>(256);
  const [quickCoordSaving, setQuickCoordSaving] = useState(false);

  // 操作提示
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadScenes = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getScenes();
      setScenes(data.scenes || []);
      if (data.scenes?.length) {
        if (!selectedSceneId || !data.scenes.some((s) => s.id === selectedSceneId)) {
          setSelectedSceneId(data.scenes[0].id);
          setQuickCoordX(data.scenes[0].coord_x);
          setQuickCoordY(data.scenes[0].coord_y);
        }
      }
    } catch (err: any) {
      showToast(err.message || '获取场景列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScenes();
  }, []);

  // 切换选定场景时同步侧边栏微调坐标
  useEffect(() => {
    if (selectedSceneId) {
      const current = scenes.find((s) => s.id === selectedSceneId);
      if (current) {
        setQuickCoordX(current.coord_x);
        setQuickCoordY(current.coord_y);
      }
    }
  }, [selectedSceneId, scenes]);

  // 提取州域列表
  const regions = useMemo(() => {
    const set = new Set<string>();
    scenes.forEach((s) => {
      if (s.region) set.add(s.region);
    });
    return Array.from(set);
  }, [scenes]);

  // 过滤后的场景
  const filteredScenes = useMemo(() => {
    return scenes.filter((s) => {
      if (selectedRegion !== 'ALL' && s.region !== selectedRegion) return false;
      if (selectedLevel !== 'ALL' && s.level !== selectedLevel) return false;
      if (searchKey.trim()) {
        const query = searchKey.trim().toLowerCase();
        const matchName = s.name.toLowerCase().includes(query);
        const matchId = s.id.toLowerCase().includes(query);
        const matchTag = (s.tag || '').toLowerCase().includes(query);
        const matchRegion = (s.region || '').toLowerCase().includes(query);
        const matchSubtitle = (s.subtitle || '').toLowerCase().includes(query);
        return matchName || matchId || matchTag || matchRegion || matchSubtitle;
      }
      return true;
    });
  }, [scenes, selectedRegion, selectedLevel, searchKey]);

  // 增：新建场景
  const handleOpenCreate = () => {
    setIsNewScene(true);
    setEditingScene({
      coord_x: 128,
      coord_y: 256,
      region: selectedRegion !== 'ALL' ? selectedRegion : '天衡州',
      level: selectedLevel !== 'ALL' ? selectedLevel : 3,
    } as any);
    setIsModalOpen(true);
  };

  // 增：直接点击地图区域新建场景（预填点击坐标）
  const handleCreateAtCoords = (coordX: number, coordY: number) => {
    setIsNewScene(true);
    setEditingScene({
      coord_x: coordX,
      coord_y: coordY,
      region: selectedRegion !== 'ALL' ? selectedRegion : '天衡州',
      level: selectedLevel !== 'ALL' ? selectedLevel : 3,
      status_desc: '繁盛市井 · 安全区',
      tag: '仙城坊市',
      btn_text: '前往',
      cost_desc: '行步耗时：无',
    } as any);
    setIsModalOpen(true);
  };

  // 改：编辑场景
  const handleOpenEdit = (scene: SceneItem) => {
    setIsNewScene(false);
    setEditingScene(scene);
    setIsModalOpen(true);
  };

  // 增/改：保存场景提交
  const handleSaveScene = async (data: Partial<SceneItem>) => {
    if (isNewScene) {
      await adminApi.createScene(data);
      showToast(`场景 [${data.name}] 新建成功`);
      if (data.id) setSelectedSceneId(data.id);
    } else if (editingScene) {
      await adminApi.updateScene(editingScene.id, data);
      showToast(`场景 [${editingScene.name}] 信息更新成功`);
    }
    await loadScenes();
  };

  // 删：确认删除场景
  const handleConfirmDelete = async () => {
    if (!deletingScene) return;

    if (['square', 'manor'].includes(deletingScene.id)) {
      showToast('系统保留的核心主城场景不可删除！', 'error');
      setDeletingScene(null);
      return;
    }

    setIsDeleting(true);
    try {
      await adminApi.deleteScene(deletingScene.id);
      showToast(`场景 [${deletingScene.name}] 已成功删除`);
      if (selectedSceneId === deletingScene.id) {
        setSelectedSceneId(null);
      }
      setDeletingScene(null);
      await loadScenes();
    } catch (err: any) {
      showToast(err.message || '删除场景失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // 改：通过画布点击更新坐标
  const handleUpdateCoordinates = async (id: string, coordX: number, coordY: number) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, coord_x: coordX, coord_y: coordY } : s))
    );
    setQuickCoordX(coordX);
    setQuickCoordY(coordY);

    try {
      await adminApi.updateScene(id, { coord_x: coordX, coord_y: coordY });
      const target = scenes.find((s) => s.id === id);
      showToast(`已更新 [${target?.name || id}] 坐标为 [${coordX}, ${coordY}]`);
    } catch (err: any) {
      showToast(err.message || '更新坐标失败', 'error');
      await loadScenes();
    }
  };

  // 改：通过侧边栏手动输入保存坐标微调
  const handleSaveQuickCoords = async () => {
    if (!selectedSceneId) return;
    setQuickCoordSaving(true);
    try {
      await adminApi.updateScene(selectedSceneId, {
        coord_x: quickCoordX,
        coord_y: quickCoordY,
      });
      setScenes((prev) =>
        prev.map((s) =>
          s.id === selectedSceneId
            ? { ...s, coord_x: quickCoordX, coord_y: quickCoordY }
            : s
        )
      );
      showToast(`坐标微调已生效: [${quickCoordX}, ${quickCoordY}]`);
    } catch (err: any) {
      showToast(err.message || '保存微调坐标失败', 'error');
    } finally {
      setQuickCoordSaving(false);
    }
  };

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 1:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
            1级 州域
          </span>
        );
      case 2:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
            2级 都城
          </span>
        );
      case 3:
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
            3级 坊市
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部 Toast 提示 */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : 'bg-red-950/90 text-red-200 border-red-500/40'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* 头部控制栏：查（检索与筛选）与增（新建场景） */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400" />
              <span>九州地图场景管理与编辑器</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              提供完整的地图场景增、删、改、查管理及 512×512 空间网格点位坐标直观拾取。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 视图切换 */}
            <div className="p-1 rounded-xl bg-[#090d14] border border-slate-800 flex items-center text-xs">
              <button
                onClick={() => setActiveTab('visual')}
                className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                  activeTab === 'visual'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>网格画布</span>
              </button>
              <button
                onClick={() => setActiveTab('table')}
                className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                  activeTab === 'table'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutList className="w-4 h-4" />
                <span>明细列表</span>
              </button>
            </div>

            <button
              onClick={loadScenes}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition"
              title="刷新场景数据"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* 增：新建场景按钮 */}
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>新建场景</span>
            </button>
          </div>
        </div>

        {/* 查：搜索与多维度筛选 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-slate-800/80">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder="搜索场景名称、ID、州域或标签..."
              className="w-full pl-9 pr-4 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="ALL">全部州域</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={selectedLevel}
              onChange={(e) =>
                setSelectedLevel(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="ALL">全部层级</option>
              <option value={1}>1级 州域</option>
              <option value={2}>2级 都城</option>
              <option value={3}>3级 坊市</option>
            </select>
          </div>
        </div>
      </div>

      {/* 视图内容区 */}
      {activeTab === 'visual' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MapVisualEditor
              scenes={filteredScenes}
              selectedSceneId={selectedSceneId}
              onSelectScene={(sc) => setSelectedSceneId(sc.id)}
              onDoubleClickScene={(sc) => handleOpenEdit(sc)}
              onUpdateCoordinates={handleUpdateCoordinates}
              onCreateAtCoordinates={handleCreateAtCoords}
            />
          </div>

          {/* 选中的场景侧边卡片（含快速坐标微调、全量编辑与删除入口） */}
          <div className="space-y-4">
            {selectedSceneId && scenes.find((s) => s.id === selectedSceneId) ? (
              (() => {
                const cur = scenes.find((s) => s.id === selectedSceneId)!;
                return (
                  <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                          <span className="material-symbols-outlined text-[22px]">
                            {cur.icon || (cur.level === 1 ? 'fort' : cur.level === 2 ? 'castle' : 'flag')}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-100">{cur.name}</h3>
                            {getLevelBadge(cur.level)}
                          </div>
                          <p className="text-xs font-mono text-slate-400 mt-0.5">ID: {cur.id}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenEdit(cur)}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs flex items-center gap-1.5 transition font-medium"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>编辑全量</span>
                      </button>
                    </div>

                    {/* 缩略图 */}
                    {cur.thumb && (
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 bg-[#090d14]">
                        <img
                          src={cur.thumb}
                          alt={cur.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as any).style.display = 'none')}
                        />
                      </div>
                    )}

                    {/* 快速微调坐标面板 */}
                    <div className="p-3 bg-[#0a0e16] border border-slate-800 rounded-xl space-y-2">
                      <div className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                        <span>坐标微调 (0~512)</span>
                        <span className="text-[10px] text-slate-500">免开弹窗直接修正</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-slate-400 font-mono">X:</span>
                          <input
                            type="number"
                            min="0"
                            max="512"
                            value={quickCoordX}
                            onChange={(e) => setQuickCoordX(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-[#121722] border border-slate-700 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-slate-400 font-mono">Y:</span>
                          <input
                            type="number"
                            min="0"
                            max="512"
                            value={quickCoordY}
                            onChange={(e) => setQuickCoordY(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-[#121722] border border-slate-700 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={quickCoordSaving}
                          onClick={handleSaveQuickCoords}
                          className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium flex items-center gap-1 transition disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          <span>微调保存</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300">
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">所属区域 / 州域:</span>
                        <span className="font-medium text-slate-200">{cur.region}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">所属 ZoneDO:</span>
                        <span className="font-mono text-slate-300">{cur.zone_id}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">地貌标签:</span>
                        <span className="text-slate-200">{cur.tag || '--'}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">状态说明:</span>
                        <span className="text-slate-200">{cur.status_desc || '--'}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-400">行动耗时/消耗:</span>
                        <span className="text-slate-200">{cur.cost_desc || '--'}</span>
                      </div>
                    </div>

                    {cur.description && (
                      <div className="p-3 bg-[#090d14] border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed">
                        {cur.description}
                      </div>
                    )}

                    {/* 场景 NPC 驻留列表与管理 */}
                    <div className="p-3 bg-[#0a0e16] border border-slate-800 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Users className="w-3.5 h-3.5 text-amber-400" />
                          <span>场景驻留人物 ({sceneNpcs.length})</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenCreateNpc}
                          className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
                        >
                          <Plus className="w-3 h-3" />
                          <span>添加 NPC</span>
                        </button>
                      </div>

                      {loadingNpcs ? (
                        <div className="py-3 text-center text-slate-500 text-[11px] flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>读取 NPC 列表中...</span>
                        </div>
                      ) : sceneNpcs.length === 0 ? (
                        <div className="py-2.5 text-center text-slate-500 text-[11px]">
                          该场景暂未配置常驻人物或野怪
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {sceneNpcs.map((npc) => (
                            <div
                              key={npc.id}
                              className="p-2 bg-[#121722] border border-slate-800/90 rounded-lg flex items-center justify-between gap-2 group/npc hover:border-slate-700 transition"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {npc.avatar ? (
                                  <img
                                    src={npc.avatar}
                                    alt={npc.name}
                                    className="w-7 h-7 rounded-lg object-cover border border-slate-700 shrink-0"
                                    onError={(e) => ((e.target as any).style.display = 'none')}
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 text-xs">
                                    {npc.type === 'battle' ? <Swords className="w-3.5 h-3.5 text-amber-400" /> : <MessageSquare className="w-3.5 h-3.5 text-sky-400" />}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-slate-200 truncate">{npc.name}</span>
                                    {npc.type === 'battle' ? (
                                      npc.battle_group_id ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                                          <Swords className="w-2.5 h-2.5" />
                                          <span>战阵 · {npc.battle_group_name || npc.battle_group_id}</span>
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center gap-0.5 shrink-0">
                                          <Swords className="w-2.5 h-2.5" />
                                          <span>单人强敌 · Lv.{npc.battle_level || 1}</span>
                                        </span>
                                      )
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center gap-0.5 shrink-0" title={npc.dialogue_package_name ? `挂载剧本: ${npc.dialogue_package_name}` : '未挂载剧本（默认闲聊）'}>
                                        <MessageSquare className="w-2.5 h-2.5" />
                                        <span>对话 · {npc.dialogue_package_name || '默认闲聊'}</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate">{npc.title || npc.key}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditNpc(npc)}
                                  className="p-1 rounded text-slate-400 hover:text-amber-300 transition"
                                  title="编辑 NPC"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNpc(npc)}
                                  className="p-1 rounded text-slate-400 hover:text-red-400 transition"
                                  title="删除 NPC"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 删：删除场景按钮 */}
                    <div className="pt-2 flex items-center justify-between">
                      <button
                        onClick={() => setDeletingScene(cur)}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 transition py-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除此场景</span>
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="bg-[#121722] border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
                在左侧网格视盘上点击任意场景点位，查看与配置详细元数据。
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 表格列表视图（查、改、删一体） */
        <div className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0e131c] text-slate-400 border-b border-slate-800 uppercase text-[11px] font-semibold">
                <tr>
                  <th className="px-4 py-3">场景名称 / ID</th>
                  <th className="px-4 py-3">州域 / 大区</th>
                  <th className="px-4 py-3">层级</th>
                  <th className="px-4 py-3">世界坐标</th>
                  <th className="px-4 py-3">地貌标签与状态</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredScenes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      未匹配到任何地图场景记录
                    </td>
                  </tr>
                ) : (
                  filteredScenes.map((sc) => (
                    <tr
                      key={sc.id}
                      className="hover:bg-slate-800/30 transition group cursor-pointer"
                      onClick={() => handleOpenEdit(sc)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {sc.thumb ? (
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-slate-700 flex-shrink-0 group">
                              <img
                                src={sc.thumb}
                                alt={sc.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-amber-300">
                                <span className="material-symbols-outlined text-[16px]">
                                  {sc.icon || (sc.level === 1 ? 'fort' : sc.level === 2 ? 'castle' : 'flag')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                              <span className="material-symbols-outlined text-[18px]">
                                {sc.icon || (sc.level === 1 ? 'fort' : sc.level === 2 ? 'castle' : 'flag')}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{sc.name}</span>
                              {sc.icon && (
                                <span className="text-[10px] text-amber-400/80 font-mono px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                                  {sc.icon}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-500">{sc.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-200 font-medium">{sc.region}</div>
                        <div className="font-mono text-[10px] text-slate-500">{sc.zone_id}</div>
                      </td>

                      <td className="px-4 py-3">{getLevelBadge(sc.level)}</td>

                      <td className="px-4 py-3">
                        <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          [{sc.coord_x}, {sc.coord_y}]
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-200">{sc.tag || '--'}</div>
                        <div className="text-[10px] text-slate-400">{sc.status_desc || '--'}</div>
                      </td>

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(sc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                            title="编辑场景 (改)"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingScene(sc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
                            title="删除场景 (删)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 场景编辑/新建弹窗 (增、改) */}
      <SceneEditModal
        isOpen={isModalOpen}
        isNew={isNewScene}
        initialData={editingScene}
        allScenes={scenes}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveScene}
      />

      {/* 场景 NPC 编辑/新建弹窗 */}
      <NpcEditModal
        isOpen={isNpcModalOpen}
        onClose={() => setIsNpcModalOpen(false)}
        sceneId={selectedSceneId || 'square'}
        scenes={scenes}
        npc={editingNpc}
        onSaved={() => {
          if (selectedSceneId) {
            loadSceneNpcs(selectedSceneId);
          }
        }}
      />

      {/* 场景删除确认对话框 (删) */}
      {deletingScene && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#121722] border border-red-500/30 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">确认删除场景</h3>
                <p className="text-xs text-slate-400 mt-0.5">此操作不可恢复，请谨慎执行</p>
              </div>
            </div>

            <div className="p-3 bg-[#0a0e16] border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
              <div>
                场景名称：<span className="font-bold text-slate-100">{deletingScene.name}</span>
              </div>
              <div>
                场景唯一 ID：<span className="font-mono text-amber-300">{deletingScene.id}</span>
              </div>
              <div>
                所属州域：<span className="text-slate-200">{deletingScene.region}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingScene(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-red-500/20"
              >
                {isDeleting ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>确认彻底删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

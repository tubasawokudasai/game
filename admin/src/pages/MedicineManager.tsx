import React, { useEffect, useState } from 'react';
import { adminApi } from '../services/api';
import { PharmacyGood, AlchemyRecipe, MedicineQuality } from '../types';
import { 
  Pill as Pills, 
  Scroll, 
  Plus, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  CheckCircle,
  X,
  Coins,
  Sparkles,
  Layers,
  FileText
} from 'lucide-react';

type TabType = 'MEDICINE' | 'RECIPE';

export const MedicineManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('MEDICINE');
  const [goods, setGoods] = useState<PharmacyGood[]>([]);
  const [recipes, setRecipes] = useState<AlchemyRecipe[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [keyword, setKeyword] = useState<string>('');

  // 药品弹窗状态
  const [isGoodModalOpen, setIsGoodModalOpen] = useState<boolean>(false);
  const [editingGood, setEditingGood] = useState<PharmacyGood | null>(null);
  const [goodForm, setGoodForm] = useState<{
    itemId: string;
    name: string;
    quality: MedicineQuality;
    priceCopper: number;
    effectDesc: string;
    description: string;
    icon: string;
    hpRestore: number;
    mpRestore: number;
    expRestore: number;
    maxHpBonus: number;
    maxMpBonus: number;
  }>({
    itemId: '',
    name: '',
    quality: 'COMMON',
    priceCopper: 100,
    effectDesc: '',
    description: '',
    icon: 'medication',
    hpRestore: 0,
    mpRestore: 0,
    expRestore: 0,
    maxHpBonus: 0,
    maxMpBonus: 0,
  });

  // 配方弹窗状态
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<boolean>(false);
  const [editingRecipe, setEditingRecipe] = useState<AlchemyRecipe | null>(null);
  const [recipeForm, setRecipeForm] = useState<{
    id: string;
    name: string;
    quality: MedicineQuality;
    costCopper: number;
    costExp: number;
    outputItemId: string;
    outputCount: number;
    description: string;
    icon: string;
  }>({
    id: '',
    name: '',
    quality: 'COMMON',
    costCopper: 100,
    costExp: 0,
    outputItemId: '',
    outputCount: 1,
    description: '',
    icon: 'science'
  });

  const [modalError, setModalError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [goodsRes, recipesRes] = await Promise.all([
        adminApi.getPharmacyGoods(),
        adminApi.getAlchemyRecipes()
      ]);

      const rawGoods: any[] = goodsRes.data || [];
      const normalizedGoods: PharmacyGood[] = rawGoods.map((g) => ({
        ...g,
        id: g.id || g.itemId,
        itemId: g.itemId || g.id,
        name: g.name,
        quality: g.quality || 'COMMON',
        priceCopper: g.priceCopper ?? g.price_copper ?? 0,
        effectDesc: g.effectDesc || g.effect_desc || '',
        description: g.description || '',
        icon: g.icon || 'medication',
        hp_restore: g.hp_restore ?? g.hpRestore ?? 0,
        mp_restore: g.mp_restore ?? g.mpRestore ?? 0,
        exp_restore: g.exp_restore ?? g.expRestore ?? 0,
        max_hp_bonus: g.max_hp_bonus ?? g.maxHpBonus ?? 0,
        max_mp_bonus: g.max_mp_bonus ?? g.maxMpBonus ?? 0,
      }));
      setGoods(normalizedGoods);

      const rawRecipes: any[] = recipesRes.data || [];
      const normalizedRecipes: AlchemyRecipe[] = rawRecipes.map((r) => ({
        ...r,
        id: r.id,
        name: r.name,
        quality: r.quality || 'COMMON',
        costCopper: r.costCopper ?? r.cost_copper ?? 0,
        costExp: r.costExp ?? r.cost_exp ?? 0,
        outputItemId: r.outputItemId || r.output_item_id || '',
        outputCount: r.outputCount ?? r.output_count ?? 1,
        description: r.description || '',
        icon: r.icon || 'science',
      }));
      setRecipes(normalizedRecipes);
    } catch (err: any) {
      showToast(err.message || '加载悬壶馆资产失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 搜索过滤
  const filteredGoods = goods.filter(g => 
    (g.name || '').toLowerCase().includes(keyword.toLowerCase()) || 
    (g.itemId || '').toLowerCase().includes(keyword.toLowerCase())
  );

  const filteredRecipes = recipes.filter(r => 
    (r.name || '').toLowerCase().includes(keyword.toLowerCase()) || 
    (r.id || '').toLowerCase().includes(keyword.toLowerCase())
  );

  // 药品 CRUD
  const handleOpenGoodCreate = () => {
    setEditingGood(null);
    setGoodForm({
      itemId: `item_healing_${Date.now().toString().slice(-4)}`,
      name: '',
      quality: 'COMMON',
      priceCopper: 100,
      effectDesc: '',
      description: '',
      icon: 'medication',
      hpRestore: 0,
      mpRestore: 0,
      expRestore: 0,
      maxHpBonus: 0,
      maxMpBonus: 0,
    });
    setModalError('');
    setIsGoodModalOpen(true);
  };

  const handleOpenGoodEdit = (good: PharmacyGood) => {
    setEditingGood(good);
    setGoodForm({
      itemId: good.itemId,
      name: good.name,
      quality: (good.quality as MedicineQuality) || 'COMMON',
      priceCopper: good.priceCopper,
      effectDesc: good.effectDesc || '',
      description: good.description || '',
      icon: good.icon || 'medication',
      hpRestore: good.hp_restore ?? good.hpRestore ?? 0,
      mpRestore: good.mp_restore ?? good.mpRestore ?? 0,
      expRestore: good.exp_restore ?? good.expRestore ?? 0,
      maxHpBonus: good.max_hp_bonus ?? good.maxHpBonus ?? 0,
      maxMpBonus: good.max_mp_bonus ?? good.maxMpBonus ?? 0,
    });
    setModalError('');
    setIsGoodModalOpen(true);
  };

  const handleGoodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodForm.name.trim() || !goodForm.itemId.trim()) {
      setModalError('药品ID与名称不能为空');
      return;
    }
    setSubmitting(true);
    setModalError('');
    try {
      const payload = {
        ...goodForm,
        id: goodForm.itemId,
        price_copper: goodForm.priceCopper,
        effect_desc: goodForm.effectDesc,
        hp_restore: goodForm.hpRestore,
        mp_restore: goodForm.mpRestore,
        exp_restore: goodForm.expRestore,
        max_hp_bonus: goodForm.maxHpBonus,
        max_mp_bonus: goodForm.maxMpBonus,
      };
      await adminApi.savePharmacyGood(payload, Boolean(editingGood));
      showToast(`丹药资产【${goodForm.name}】已成功保存`);
      setIsGoodModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || '保存丹药资产失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoodDelete = async (itemId: string, name: string) => {
    if (!window.confirm(`确定要移除丹药资产【${name}】吗？这将同步下架医馆货架。`)) return;
    try {
      await adminApi.deletePharmacyGood(itemId);
      showToast(`丹药资产【${name}】已成功下架`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || '下架失败', 'error');
    }
  };

  // 配方 CRUD
  const handleOpenRecipeCreate = () => {
    setEditingRecipe(null);
    setRecipeForm({
      id: `recipe_${Date.now().toString().slice(-4)}`,
      name: '',
      quality: 'COMMON',
      costCopper: 100,
      costExp: 0,
      outputItemId: '',
      outputCount: 1,
      description: '',
      icon: 'science'
    });
    setModalError('');
    setIsRecipeModalOpen(true);
  };

  const handleOpenRecipeEdit = (recipe: AlchemyRecipe) => {
    setEditingRecipe(recipe);
    setRecipeForm({
      id: recipe.id,
      name: recipe.name,
      quality: (recipe.quality as MedicineQuality) || 'COMMON',
      costCopper: recipe.costCopper,
      costExp: recipe.costExp || 0,
      outputItemId: recipe.outputItemId,
      outputCount: recipe.outputCount || 1,
      description: recipe.description || '',
      icon: recipe.icon || 'science'
    });
    setModalError('');
    setIsRecipeModalOpen(true);
  };

  const handleRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeForm.name.trim() || !recipeForm.id.trim() || !recipeForm.outputItemId.trim()) {
      setModalError('配方ID、名称及产出物品ID均不能为空');
      return;
    }
    setSubmitting(true);
    setModalError('');
    try {
      const payload = {
        ...recipeForm,
        cost_copper: recipeForm.costCopper,
        cost_exp: recipeForm.costExp,
        output_item_id: recipeForm.outputItemId,
        output_count: recipeForm.outputCount,
      };
      await adminApi.saveAlchemyRecipe(payload, Boolean(editingRecipe));
      showToast(`丹方【${recipeForm.name}】已成功保存`);
      setIsRecipeModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || '保存丹方失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecipeDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要销毁丹方【${name}】吗？`)) return;
    try {
      await adminApi.deleteAlchemyRecipe(id);
      showToast(`丹方【${name}】已销毁`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || '销毁丹方失败', 'error');
    }
  };

  const getQualityStyle = (quality?: string) => {
    switch (quality) {
      case 'LEGENDARY': return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'EPIC': return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'RARE': return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      default: return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    }
  };

  const getQualityLabel = (quality?: string) => {
    switch (quality) {
      case 'LEGENDARY': return '绝品';
      case 'EPIC': return '极品';
      case 'RARE': return '灵品';
      default: return '凡品';
    }
  };

  return (
    <div className="space-y-6">
      {/* 全局 Toast 通知 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md ${
          toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' : 'bg-red-950/90 border-red-500/40 text-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 顶部标题横幅 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#121722] border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Pills className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">悬壶馆药品资产管理</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              维护全服百草医馆上架的实体名品、内服特效丹药属性，并统一配置八卦鼎三昧真火九转炼制配方
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 rounded-xl transition border border-slate-700"
            title="刷新数据"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={activeTab === 'MEDICINE' ? handleOpenGoodCreate : handleOpenRecipeCreate}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{activeTab === 'MEDICINE' ? '新建丹药资产' : '注录新炼丹方'}</span>
          </button>
        </div>
      </div>

      {/* 标签卡与检索过滤器 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#121722] border border-slate-800 rounded-xl p-3 text-xs">
        <div className="flex border-b border-slate-800 bg-[#0a0e16] p-1 rounded-lg">
          <button
            onClick={() => { setActiveTab('MEDICINE'); setKeyword(''); }}
            className={`px-4 py-1.5 rounded-md font-bold transition flex items-center gap-2 ${
              activeTab === 'MEDICINE' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Pills className="w-3.5 h-3.5" />
            <span>丹药资产库 ({goods.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('RECIPE'); setKeyword(''); }}
            className={`px-4 py-1.5 rounded-md font-bold transition flex items-center gap-2 ${
              activeTab === 'RECIPE' ? 'bg-purple-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scroll className="w-3.5 h-3.5" />
            <span>炼丹方管理 ({recipes.length})</span>
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={activeTab === 'MEDICINE' ? "检索资产名称、物品ID..." : "检索配方名、配方ID..."}
            className="w-full pl-9 pr-3 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-400"
          />
        </div>
      </div>

      {/* 核心数据展板 */}
      {loading ? (
        <div className="bg-[#121722] border border-slate-800 rounded-2xl p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm">神农正在核校百草名录与火候...</p>
        </div>
      ) : activeTab === 'MEDICINE' ? (
        <div className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0a0e16] text-slate-400 font-medium border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">物品标识 / 丹药ID</th>
                  <th className="px-5 py-3.5">丹药名称</th>
                  <th className="px-5 py-3.5">馆藏品质</th>
                  <th className="px-5 py-3.5">单价诊费 (铜钱)</th>
                  <th className="px-5 py-3.5">真实生效属性数值</th>
                  <th className="px-5 py-3.5">实效说明文本</th>
                  <th className="px-5 py-3.5 text-right">操作枢纽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredGoods.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      百草药库空无一物，请先点击右上角新增丹药记录
                    </td>
                  </tr>
                ) : (
                  filteredGoods.map((good) => (
                    <tr key={good.itemId || good.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 font-mono text-amber-300 font-medium">
                        {good.itemId || good.id}
                      </td>
                      <td className="px-5 py-3 font-bold text-slate-100">
                        {good.name}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getQualityStyle(good.quality)}`}>
                          {getQualityLabel(good.quality)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-amber-400">
                        🪙 {(good.priceCopper ?? good.price_copper ?? 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {(good.hp_restore ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-400 font-mono">
                              气血+{Number(good.hp_restore).toLocaleString()}
                            </span>
                          )}
                          {(good.mp_restore ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-[10px] text-sky-400 font-mono">
                              真气+{Number(good.mp_restore).toLocaleString()}
                            </span>
                          )}
                          {(good.exp_restore ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-[10px] text-purple-400 font-mono">
                              修为+{Number(good.exp_restore).toLocaleString()}
                            </span>
                          )}
                          {(good.max_hp_bonus ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-400 font-mono">
                              气血上限+{Number(good.max_hp_bonus).toLocaleString()}
                            </span>
                          )}
                          {(good.max_mp_bonus ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-400 font-mono">
                              内力上限+{Number(good.max_mp_bonus).toLocaleString()}
                            </span>
                          )}
                          {!(good.hp_restore || good.mp_restore || good.exp_restore || good.max_hp_bonus || good.max_mp_bonus) && (
                            <span className="text-slate-500 text-[11px]">未配置基础属性</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-300 max-w-xs truncate" title={good.effectDesc || good.effect_desc}>
                        {good.effectDesc || good.effect_desc || '未配置效果描述'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenGoodEdit(good)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition"
                            title="修改丹药资产"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleGoodDelete(good.itemId || good.id, good.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="下架丹药"
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
      ) : (
        <div className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0a0e16] text-slate-400 font-medium border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">配方编码 / 丹方ID</th>
                  <th className="px-5 py-3.5">配方名称</th>
                  <th className="px-5 py-3.5">炉火品质</th>
                  <th className="px-5 py-3.5">引火需耗铜钱</th>
                  <th className="px-5 py-3.5">淬炼需耗修为</th>
                  <th className="px-5 py-3.5">开炉确定产出成果</th>
                  <th className="px-5 py-3.5 text-right">操作枢纽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecipes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      未曾在此录入任何古炉遗珍配方
                    </td>
                  </tr>
                ) : (
                  filteredRecipes.map((recipe) => (
                    <tr key={recipe.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 font-mono text-purple-400 font-medium">
                        {recipe.id}
                      </td>
                      <td className="px-5 py-3 font-bold text-slate-100">
                        {recipe.name}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getQualityStyle(recipe.quality)}`}>
                          {getQualityLabel(recipe.quality)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-amber-400">
                        🪙 {(recipe.costCopper ?? recipe.cost_copper ?? 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 font-mono text-sky-400">
                        {(recipe.costExp || recipe.cost_exp) ? `✨ ${(recipe.costExp ?? recipe.cost_exp ?? 0).toLocaleString()}` : '无'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-amber-300 font-medium">
                          {recipe.outputItemId || recipe.output_item_id || '未配置'}
                        </span>
                        <span className="text-slate-500 ml-1">
                          × {recipe.outputCount ?? recipe.output_count ?? 1}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenRecipeEdit(recipe)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition"
                            title="修改丹方"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRecipeDelete(recipe.id, recipe.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="销毁丹方"
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

      {/* 丹药资产编辑表单弹窗 */}
      {isGoodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121722] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0a0e16]">
              <div className="flex items-center gap-2">
                <Pills className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100">
                  {editingGood ? `修改丹药资产 · ${editingGood.name}` : '录入新丹药资产'}
                </h3>
              </div>
              <button
                onClick={() => setIsGoodModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="m-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleGoodSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">物品专属 ID (itemId) *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingGood)}
                  value={goodForm.itemId}
                  onChange={(e) => setGoodForm({ ...goodForm, itemId: e.target.value })}
                  placeholder="如: item_healing_dan"
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono disabled:opacity-50 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">丹药通用名称 *</label>
                  <input
                    type="text"
                    required
                    value={goodForm.name}
                    onChange={(e) => setGoodForm({ ...goodForm, name: e.target.value })}
                    placeholder="如: 九转还魂丹"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">品质划分</label>
                  <select
                    value={goodForm.quality}
                    onChange={(e) => setGoodForm({ ...goodForm, quality: e.target.value as MedicineQuality })}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="COMMON">凡品 (COMMON)</option>
                    <option value="RARE">灵品 (RARE)</option>
                    <option value="EPIC">极品 (EPIC)</option>
                    <option value="LEGENDARY">绝品 (LEGENDARY)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">基础选购资费 (铜钱) *</label>
                <div className="relative">
                  <Coins className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    required
                    value={goodForm.priceCopper}
                    onChange={(e) => setGoodForm({ ...goodForm, priceCopper: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full pl-9 pr-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* 真实生效属性设定 */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>真实生效属性数值配置（服用直接生效）</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">留空或填 0 则不附加对应属性</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">瞬回气血 (HP)</label>
                    <input
                      type="number"
                      min="0"
                      value={goodForm.hpRestore || ''}
                      onChange={(e) => setGoodForm({ ...goodForm, hpRestore: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">瞬回真气 (MP)</label>
                    <input
                      type="number"
                      min="0"
                      value={goodForm.mpRestore || ''}
                      onChange={(e) => setGoodForm({ ...goodForm, mpRestore: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-sky-400 font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">直增修为 (EXP)</label>
                    <input
                      type="number"
                      min="0"
                      value={goodForm.expRestore || ''}
                      onChange={(e) => setGoodForm({ ...goodForm, expRestore: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-purple-400 font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/60">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">永久气血上限提升</label>
                    <input
                      type="number"
                      min="0"
                      value={goodForm.maxHpBonus || ''}
                      onChange={(e) => setGoodForm({ ...goodForm, maxHpBonus: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-rose-400 font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">永久内力上限提升</label>
                    <input
                      type="number"
                      min="0"
                      value={goodForm.maxMpBonus || ''}
                      onChange={(e) => setGoodForm({ ...goodForm, maxMpBonus: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-cyan-400 font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">服用即时增益属性说明 *</label>
                <input
                  type="text"
                  required
                  value={goodForm.effectDesc}
                  onChange={(e) => setGoodForm({ ...goodForm, effectDesc: e.target.value })}
                  placeholder="如: 气血恢复 +5000, 气血上限微幅提升 (若留空可依据上述数值自动推算)"
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">上架详细古籍描述</label>
                <textarea
                  value={goodForm.description}
                  onChange={(e) => setGoodForm({ ...goodForm, description: e.target.value })}
                  rows={3}
                  placeholder="注入显示在行囊与购买页面的长篇说明..."
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-300 font-sans focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGoodModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>确 认</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 丹方炼制编辑表单弹窗 */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121722] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0a0e16]">
              <div className="flex items-center gap-2">
                <Scroll className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-slate-100">
                  {editingRecipe ? `修改上古丹方 · ${editingRecipe.name}` : '刻录传世新丹方'}
                </h3>
              </div>
              <button
                onClick={() => setIsRecipeModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="m-4 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleRecipeSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">配方唯一编码 (id) *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingRecipe)}
                    value={recipeForm.id}
                    onChange={(e) => setRecipeForm({ ...recipeForm, id: e.target.value })}
                    placeholder="如: recipe_healing_dan"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-purple-400 font-mono disabled:opacity-50 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">炉火品质</label>
                  <select
                    value={recipeForm.quality}
                    onChange={(e) => setRecipeForm({ ...recipeForm, quality: e.target.value as MedicineQuality })}
                    className="w-full px-2.5 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-purple-400"
                  >
                    <option value="COMMON">凡品 (COMMON)</option>
                    <option value="RARE">灵品 (RARE)</option>
                    <option value="EPIC">极品 (EPIC)</option>
                    <option value="LEGENDARY">绝品 (LEGENDARY)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">配方谱名 *</label>
                <input
                  type="text"
                  required
                  value={recipeForm.name}
                  onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                  placeholder="如: 洗髓灵丹炼制方"
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">耗用铜钱 *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={recipeForm.costCopper}
                    onChange={(e) => setRecipeForm({ ...recipeForm, costCopper: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">耗用天道修为</label>
                  <input
                    type="number"
                    min="0"
                    value={recipeForm.costExp}
                    onChange={(e) => setRecipeForm({ ...recipeForm, costExp: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-sky-400 font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1 font-medium">开炉最终产出物品 ID *</label>
                  <input
                    type="text"
                    required
                    value={recipeForm.outputItemId}
                    onChange={(e) => setRecipeForm({ ...recipeForm, outputItemId: e.target.value })}
                    placeholder="如: item_healing_jinchuang"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-400 font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">单次产出数量 *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={recipeForm.outputCount}
                    onChange={(e) => setRecipeForm({ ...recipeForm, outputCount: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">丹方流转药理诀要</label>
                <textarea
                  value={recipeForm.description}
                  onChange={(e) => setRecipeForm({ ...recipeForm, description: e.target.value })}
                  rows={2}
                  placeholder="输入显示在炼丹界面的配方背景或前置配料提示..."
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-300 font-sans focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRecipeModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>保存配方</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

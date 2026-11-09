import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../services/api';
import {
  CombatSkillItem,
  CombatSkillTargetType,
  CombatSkillKind,
} from '../types';
import {
  Swords,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  AlertTriangle,
  Zap,
  Shield,
  Heart,
  Sparkles,
  Flame,
  Activity,
  Layers,
  ArrowUpDown,
  Power,
} from 'lucide-react';

const TARGET_TYPE_MAP: Record<CombatSkillTargetType, { label: string; color: string; desc: string }> = {
  SINGLE_ENEMY: { label: '敌方单体', color: 'border-rose-500/30 text-rose-300 bg-rose-500/10', desc: '针对敌方单个目标' },
  ALL_ENEMIES: { label: '敌方全体', color: 'border-red-500/30 text-red-300 bg-red-500/10', desc: '同时打击敌方所有存活目标' },
  SINGLE_ALLY: { label: '我方单体', color: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10', desc: '对我方单体生效（含自身）' },
  ALL_ALLIES: { label: '我方全体', color: 'border-teal-500/30 text-teal-300 bg-teal-500/10', desc: '为我方全队提供增益或回春' },
  SELF: { label: '自身', color: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10', desc: '仅对自己生效的护体/蓄力' },
};

const SKILL_KIND_MAP: Record<CombatSkillKind, { label: string; color: string; icon: any }> = {
  DAMAGE: { label: '伤害攻击', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: Flame },
  HEAL: { label: '回春疗伤', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: Heart },
  BUFF: { label: '灵气增益', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: Sparkles },
  DEBUFF: { label: '减益禁制', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30', icon: Zap },
};

const EMPTY_SKILL: Partial<CombatSkillItem> = {
  skill_key: '',
  name: '',
  description: '',
  cost_mp: 0,
  target_type: 'SINGLE_ENEMY',
  skill_kind: 'DAMAGE',
  power: 1.0,
  icon: 'swords',
  sort_order: 10,
  is_enabled: 1,
};

export const SkillManager: React.FC = () => {
  const [skills, setSkills] = useState<CombatSkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('ALL');
  const [skillKindFilter, setSkillKindFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 弹窗表单状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [formData, setFormData] = useState<Partial<CombatSkillItem>>(EMPTY_SKILL);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getSkills({
        search: keyword,
        targetType: targetTypeFilter,
        skillKind: skillKindFilter,
        status: statusFilter,
        pageSize: 100,
      });
      if (res && res.success) {
        setSkills(res.data || []);
      }
    } catch (err: any) {
      showToast(err.message || '获取技能列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, [targetTypeFilter, skillKindFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSkills();
  };

  const handleOpenCreate = () => {
    setIsEdit(false);
    setFormData({
      ...EMPTY_SKILL,
      sort_order: (skills.length + 1) * 10,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (skill: CombatSkillItem) => {
    setIsEdit(true);
    setFormData({ ...skill });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (skill: CombatSkillItem) => {
    const nextStatus = skill.is_enabled === 1 ? 0 : 1;
    try {
      await adminApi.toggleSkillStatus(skill.skill_key, nextStatus);
      showToast(`技能【${skill.name}】已${nextStatus === 1 ? '启用' : '禁用'}`);
      setSkills((prev) =>
        prev.map((item) =>
          item.skill_key === skill.skill_key ? { ...item, is_enabled: nextStatus } : item
        )
      );
    } catch (err: any) {
      showToast(err.message || '切换状态失败', 'error');
    }
  };

  const handleDelete = async (skill: CombatSkillItem) => {
    if (!window.confirm(`确定要彻底删除技能【${skill.name}】(${skill.skill_key}) 吗？此操作不可逆！`)) {
      return;
    }
    try {
      await adminApi.deleteSkill(skill.skill_key);
      showToast(`技能【${skill.name}】已删除`);
      setSkills((prev) => prev.filter((item) => item.skill_key !== skill.skill_key));
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setFormError('请输入技能名称');
      return;
    }
    if (!isEdit && !formData.skill_key?.trim()) {
      setFormError('请输入技能标识键（如 skill_xyz）');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      if (isEdit) {
        await adminApi.updateSkill(formData.skill_key!, formData);
        showToast(`技能【${formData.name}】更新成功`);
      } else {
        await adminApi.createSkill(formData);
        showToast(`技能【${formData.name}】创建成功`);
      }
      setIsModalOpen(false);
      fetchSkills();
    } catch (err: any) {
      setFormError(err.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 统计指标
  const stats = useMemo(() => {
    const total = skills.length;
    const enabled = skills.filter((s) => s.is_enabled === 1).length;
    const damageCount = skills.filter((s) => s.skill_kind === 'DAMAGE').length;
    const healCount = skills.filter((s) => s.skill_kind === 'HEAL').length;
    return { total, enabled, damageCount, healCount };
  }, [skills]);

  return (
    <div className="space-y-6">
      {/* 顶部提示 Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md animate-fade-in transition-all">
          <div
            className={`flex items-center gap-2 text-sm font-medium ${
              toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
                : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* 标题 & 概览卡片 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Swords className="w-7 h-7 text-amber-400" />
            <span>战斗技能总括</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            维护切磋论道与 PVE 战局的核心法诀、内力消耗、作用目标类型与基础倍率
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSkills}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-sm font-medium transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-sm shadow-lg shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>新增法诀技能</span>
          </button>
        </div>
      </div>

      {/* 统计指标行 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">总注册法诀</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">当前生效中</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.enabled}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Power className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">攻击攻伐法</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{stats.damageCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">疗伤回春法</div>
            <div className="text-2xl font-bold text-teal-400 mt-1">{stats.healCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <Heart className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 搜索与筛选控制栏 */}
      <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="搜索技能名称、标识键、描述..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-amber-500/50"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 目标筛选 */}
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="ALL">全部目标类型</option>
            <option value="SINGLE_ENEMY">敌方单体</option>
            <option value="ALL_ENEMIES">敌方全体</option>
            <option value="SINGLE_ALLY">我方单体</option>
            <option value="ALL_ALLIES">我方全体</option>
            <option value="SELF">自身</option>
          </select>

          {/* 类别筛选 */}
          <select
            value={skillKindFilter}
            onChange={(e) => setSkillKindFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="ALL">全部技能类型</option>
            <option value="DAMAGE">伤害攻击</option>
            <option value="HEAL">回春疗伤</option>
            <option value="BUFF">灵气增益</option>
            <option value="DEBUFF">减益禁制</option>
          </select>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="ALL">全部状态</option>
            <option value="1">已启用</option>
            <option value="0">已禁用</option>
          </select>
        </div>
      </div>

      {/* 技能列表表格 */}
      <div className="bg-[#121722] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 font-medium text-xs border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">技能信息</th>
                <th className="py-3.5 px-4">技能类型</th>
                <th className="py-3.5 px-4">作用目标</th>
                <th className="py-3.5 px-4">内力消耗</th>
                <th className="py-3.5 px-4">预留倍率</th>
                <th className="py-3.5 px-4">排序</th>
                <th className="py-3.5 px-4">启用状态</th>
                <th className="py-3.5 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {skills.map((skill) => {
                const targetInfo = TARGET_TYPE_MAP[skill.target_type] || {
                  label: skill.target_type,
                  color: 'border-slate-700 text-slate-400 bg-slate-800',
                  desc: '',
                };
                const kindInfo = SKILL_KIND_MAP[skill.skill_kind] || {
                  label: skill.skill_kind,
                  color: 'bg-slate-800 text-slate-400 border-slate-700',
                  icon: Activity,
                };
                const KindIcon = kindInfo.icon;

                return (
                  <tr
                    key={skill.skill_key}
                    className={`hover:bg-slate-800/30 transition ${
                      skill.is_enabled === 0 ? 'opacity-50' : ''
                    }`}
                  >
                    {/* 技能信息 */}
                    <td className="py-4 px-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center shrink-0 text-amber-400 font-bold">
                          <KindIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100">{skill.name}</span>
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">
                              {skill.skill_key}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 max-w-md line-clamp-2 leading-relaxed">
                            {skill.description || '暂无描述'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* 类型 */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${kindInfo.color}`}
                      >
                        <KindIcon className="w-3.5 h-3.5" />
                        <span>{kindInfo.label}</span>
                      </span>
                    </td>

                    {/* 作用目标 */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${targetInfo.color}`}
                        title={targetInfo.desc}
                      >
                        {targetInfo.label}
                      </span>
                    </td>

                    {/* 内力消耗 */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1 font-mono text-sky-400 font-semibold">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{skill.cost_mp} 点真气</span>
                      </div>
                    </td>

                    {/* 预留倍率 */}
                    <td className="py-4 px-4 font-mono text-slate-300">
                      {skill.power !== null && skill.power !== undefined ? `${skill.power}x` : '--'}
                    </td>

                    {/* 排序 */}
                    <td className="py-4 px-4 font-mono text-slate-400 text-xs">
                      {skill.sort_order}
                    </td>

                    {/* 状态 */}
                    <td className="py-4 px-4">
                      <button
                        onClick={() => handleToggleStatus(skill)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition border ${
                          skill.is_enabled === 1
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            skill.is_enabled === 1 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        <span>{skill.is_enabled === 1 ? '启用' : '禁用'}</span>
                      </button>
                    </td>

                    {/* 操作 */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(skill)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                          title="编辑技能"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(skill)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="删除技能"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && skills.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Swords className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-50" />
                    <span>暂无匹配的战斗技能配置</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增 / 编辑技能弹窗 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#151a26] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-lg">
                  {isEdit ? '编辑法诀技能' : '新增法诀技能'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 技能标识键 */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    技能标识键 (skill_key) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    placeholder="例如: skill_pure_yang_sword"
                    value={formData.skill_key || ''}
                    onChange={(e) => setFormData({ ...formData, skill_key: e.target.value })}
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60 ${
                      isEdit ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    系统内置或策略代码对应的唯一索引，一旦创建建议不再更改
                  </p>
                </div>

                {/* 技能名称 */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    技能名称 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如: 纯阳剑煞"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* 技能类别 & 作用目标 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    技能分类 (skill_kind)
                  </label>
                  <select
                    value={formData.skill_kind || 'DAMAGE'}
                    onChange={(e) =>
                      setFormData({ ...formData, skill_kind: e.target.value as CombatSkillKind })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="DAMAGE">伤害攻击 (DAMAGE)</option>
                    <option value="HEAL">回春疗伤 (HEAL)</option>
                    <option value="BUFF">灵气增益 (BUFF)</option>
                    <option value="DEBUFF">减益禁制 (DEBUFF)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    作用目标类型 (target_type)
                  </label>
                  <select
                    value={formData.target_type || 'SINGLE_ENEMY'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        target_type: e.target.value as CombatSkillTargetType,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="SINGLE_ENEMY">敌方单体 (SINGLE_ENEMY)</option>
                    <option value="ALL_ENEMIES">敌方全体 (ALL_ENEMIES)</option>
                    <option value="SINGLE_ALLY">我方单体 (SINGLE_ALLY)</option>
                    <option value="ALL_ALLIES">我方全体 (ALL_ALLIES)</option>
                    <option value="SELF">自身 (SELF)</option>
                  </select>
                </div>
              </div>

              {/* 真气消耗、倍率、排序 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    真气消耗 (cost_mp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.cost_mp ?? 0}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_mp: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    预留倍率系数 (power)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    placeholder="如 1.5"
                    value={formData.power ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        power: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    展示排序 (sort_order)
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) =>
                      setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* 技能描述 */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  技能招式心诀描述
                </label>
                <textarea
                  rows={3}
                  placeholder="请输入该技能的伤害机制、特技与修仙意境描述..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              {/* 启用开关 */}
              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs font-medium text-slate-300">是否立即启用此技能：</label>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, is_enabled: formData.is_enabled === 1 ? 0 : 1 })
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.is_enabled === 1 ? 'bg-amber-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
                      formData.is_enabled === 1 ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs text-slate-400">
                  {formData.is_enabled === 1 ? '已启用 (可在战斗中作为选招下发)' : '已禁用'}
                </span>
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {submitting ? '保存中...' : isEdit ? '保存修改' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillManager;

import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../services/api';
import {
  NpcTemplateItem,
  NpcAttributeConfigResponse,
  NpcAttributePreviewResponse,
  DialoguePackageItem,
  DialogueNodeItem,
  CombatSkillItem,
} from '../types';
import { CharacterSpritePicker } from '../components/CharacterSpritePicker';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Heart,
  Zap,
  Shield,
  Activity,
  Layers,
  AlertTriangle,
  CheckCircle,
  X,
  TrendingUp,
  Eye,
  Sparkles,
  ScrollText,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

const EMPTY_TEMPLATE: Partial<NpcTemplateItem> = {
  id: '',
  key: '',
  name: '',
  title: '',
  badge: '',
  avatar: '',
  idle_avatar: '',
  attack_avatar: '',
  base_hp: 13000,
  base_mp: 350,
  base_attack: 1700,
  base_matk: 1700,
  base_defense: 1300,
  base_mdef: 1100,
  base_speed: 110,
  base_crit: 0.07,
  growth_template: 'balanced',
  quality: 'COMMON',
  role: 'DPS',
  bonus_json: '{}',
  skills_json: '[]',
  description: '',
  dialogue_package_id: null,
  dialogue_root_node_id: null,
  quote: '',
  gossip: '',
};

export const NpcTemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<NpcTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const [dialoguePackages, setDialoguePackages] = useState<DialoguePackageItem[]>([]);
  const [packageNodes, setPackageNodes] = useState<DialogueNodeItem[]>([]);
  const [loadingPackageNodes, setLoadingPackageNodes] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<CombatSkillItem[]>([]);

  const [editing, setEditing] = useState<NpcTemplateItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<NpcTemplateItem>>(EMPTY_TEMPLATE);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<NpcTemplateItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [attributeConfig, setAttributeConfig] = useState<NpcAttributeConfigResponse | null>(null);

  // 成长预览
  const [previewTemplate, setPreviewTemplate] = useState<NpcTemplateItem | null>(null);
  const [previewLevels, setPreviewLevels] = useState('1,10,20,50,100');
  const [previewQuality, setPreviewQuality] = useState('COMMON');
  const [previewRealm, setPreviewRealm] = useState('');
  const [previewData, setPreviewData] = useState<NpcAttributePreviewResponse['data'] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const [tplRes, pkgRes, skillRes] = await Promise.all([
        adminApi.getNpcTemplates(),
        adminApi.getDialoguePackages().catch(() => ({ success: false, data: [] as DialoguePackageItem[] })),
        adminApi.getSkills({ pageSize: 100 }).catch(() => ({ success: false, data: [] as CombatSkillItem[] })),
      ]);
      setTemplates(tplRes.data || []);
      if (pkgRes.success) setDialoguePackages(pkgRes.data || []);
      if (skillRes.success && skillRes.data) {
        setAvailableSkills(Array.isArray(skillRes.data) ? skillRes.data : ((skillRes.data as any).list || []));
      }
    } catch (err: any) {
      showToast(err.message || '加载 NPC 模板失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    adminApi
      .getNpcAttributeConfig()
      .then((res) => setAttributeConfig(res.data))
      .catch(() => setAttributeConfig(null));
  }, []);

  // 当选择的剧本改变时，异步加载该剧本下的全部节点以供选择起始根节点
  useEffect(() => {
    if (!form.dialogue_package_id) {
      setPackageNodes([]);
      return;
    }
    let cancelled = false;
    setLoadingPackageNodes(true);
    adminApi
      .getDialoguePackage(form.dialogue_package_id)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setPackageNodes(res.data.nodes || []);
        }
      })
      .catch(() => {
        if (!cancelled) setPackageNodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPackageNodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.dialogue_package_id]);

  const selectedPackage = useMemo(
    () => dialoguePackages.find((p) => p.id === form.dialogue_package_id) || null,
    [dialoguePackages, form.dialogue_package_id]
  );

  const openPreview = async (template: NpcTemplateItem) => {
    const quality = template.quality || 'COMMON';
    setPreviewTemplate(template);
    setPreviewQuality(quality);
    setPreviewRealm('');
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const res = await adminApi.previewNpcAttributes({
        templateId: template.id,
        levels: [1, 10, 20, 50, 100],
        quality,
        realm: '',
      });
      setPreviewData(res.data);
    } catch (err: any) {
      showToast(err.message || '读取成长属性失败', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const refreshPreview = async () => {
    if (!previewTemplate) return;
    const levels = previewLevels
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 1);
    setPreviewLoading(true);
    try {
      const res = await adminApi.previewNpcAttributes({
        templateId: previewTemplate.id,
        levels: levels.length > 0 ? levels : [1, 10, 20, 50, 100],
        quality: previewQuality,
        realm: previewRealm,
      });
      setPreviewData(res.data);
    } catch (err: any) {
      showToast(err.message || '读取成长属性失败', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGrowthTemplateChange = (value: string) => {
    setForm((prev) => {
      const next: Partial<NpcTemplateItem> = { ...prev, growth_template: value || null };
      // 新建模板时，选择成长模板即预填 1 级基础值；已有模板不强行覆盖运营数据
      if (!editing && value && attributeConfig) {
        const profile = attributeConfig.growthTemplates.find((item) => item.id === value);
        if (profile) {
          next.base_hp = profile.base.hp;
          next.base_mp = profile.base.mp;
          next.base_attack = profile.base.atk;
          next.base_matk = profile.base.matk;
          next.base_defense = profile.base.def;
          next.base_mdef = profile.base.mdef;
          next.base_speed = profile.base.spd;
          next.base_crit = profile.base.crit;
        }
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return templates.filter((t) => {
      if (!kw) return true;
      return (
        t.name.toLowerCase().includes(kw) ||
        t.key.toLowerCase().includes(kw) ||
        t.id.toLowerCase().includes(kw) ||
        (t.title || '').toLowerCase().includes(kw)
      );
    });
  }, [templates, keyword]);

  const handleOpenCreate = () => {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setEditing(null);
    setForm({ ...EMPTY_TEMPLATE, id, key: id });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (template: NpcTemplateItem) => {
    setEditing(template);
    setForm({
      ...EMPTY_TEMPLATE,
      ...template,
      skills_json: template.skills_json || '[]',
      dialogue_package_id: template.dialogue_package_id || null,
      dialogue_root_node_id: template.dialogue_root_node_id || null,
      quote: template.quote || '',
      gossip: template.gossip || '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const setField = (field: keyof NpcTemplateItem, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(form.name || '').trim()) {
      setFormError('模板名称不能为空');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      // 更新时不要把列表回显的“实际生效成长值”误当成显式覆盖写回；
      // 留空才能继续使用数据库中的成长值；选择新预设时由后端重写 growth_*。
      const {
        growth_hp,
        growth_mp,
        growth_attack,
        growth_matk,
        growth_defense,
        growth_mdef,
        growth_speed,
        growth_crit,
        ...editableForm
      } = form;
      if (editing) {
        await adminApi.updateNpcTemplate(editing.id, editableForm);
        showToast(`模板【${form.name}】已更新`);
      } else {
        await adminApi.createNpcTemplate(form);
        showToast(`模板【${form.name}】已创建`);
      }
      setIsModalOpen(false);
      await loadTemplates();
    } catch (err: any) {
      setFormError(err.message || '保存模板失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await adminApi.deleteNpcTemplate(deleting.id);
      showToast(`模板【${deleting.name}】已删除`);
      setDeleting(null);
      await loadTemplates();
    } catch (err: any) {
      showToast(err.message || '删除模板失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border-red-500/40 text-red-200'
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

      {/* 顶部标题 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#121722] border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">NPC 模板库</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              模板定义基础属性与立绘；地图实例和战斗配置都从模板生成，可单独覆盖等级/血量
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadTemplates}
            disabled={loading}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 rounded-xl transition border border-slate-700 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition shadow-lg shadow-sky-500/20 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>新建模板</span>
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121722] border border-slate-800 rounded-xl p-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模板名称、key、ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
          />
        </div>

      </div>

      {/* 模板卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400/60" />
            <span>正在读取模板库...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-[#121722] border border-slate-800 rounded-2xl">
            暂无匹配的 NPC 模板
          </div>
        ) : (
          filtered.map((template) => (
            <div
              key={template.id}
              className="bg-[#121722] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col gap-3 transition shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {template.avatar ? (
                    <div className="relative w-16 h-20 rounded-xl overflow-hidden border border-slate-700 bg-gradient-to-b from-slate-800/70 to-[#060a10] shrink-0 flex items-center justify-center">
                      <Users className="w-5 h-5 text-slate-600 absolute" />
                      <img
                        src={template.avatar}
                        alt={`${template.name}头像`}
                        title={template.avatar}
                        loading="lazy"
                        decoding="async"
                        className="relative w-full h-full object-contain p-0.5"
                        onError={(e) => ((e.target as any).style.display = 'none')}
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-20 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-100 truncate">{template.name}</h3>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        {template.quality_label || template.quality || '普通'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {template.title || '无称号'} · {template.id}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                      成长预设:{' '}
                      {template.growth_template
                        ? attributeConfig?.growthTemplates.find((g) => g.id === template.growth_template)?.label ||
                          template.growth_template
                        : '自定义（数据库成长值）'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openPreview(template)}
                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition"
                    title="查看等级成长属性"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenEdit(template)}
                    className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition"
                    title="编辑模板"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleting(template)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                    title="删除模板"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                <div className="p-1.5 rounded-lg bg-[#0a0e16] border border-slate-800">
                  <div className="text-slate-500 flex items-center justify-center gap-0.5">
                    <Heart className="w-2.5 h-2.5" /> 气血
                  </div>
                  <div className="text-rose-300 font-mono mt-0.5">{template.base_hp.toLocaleString()}</div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#0a0e16] border border-slate-800">
                  <div className="text-slate-500 flex items-center justify-center gap-0.5">
                    <Zap className="w-2.5 h-2.5" /> 攻击
                  </div>
                  <div className="text-amber-300 font-mono mt-0.5">{template.base_attack.toLocaleString()}</div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#0a0e16] border border-slate-800">
                  <div className="text-slate-500 flex items-center justify-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> 防御
                  </div>
                  <div className="text-emerald-300 font-mono mt-0.5">{template.base_defense.toLocaleString()}</div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#0a0e16] border border-slate-800">
                  <div className="text-slate-500 flex items-center justify-center gap-0.5">
                    <Activity className="w-2.5 h-2.5" /> 速度
                  </div>
                  <div className="text-purple-300 font-mono mt-0.5">{template.base_speed}</div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#0a0e16] border border-slate-800">
                  <div className="text-slate-500 flex items-center justify-center gap-0.5">
                    <Layers className="w-2.5 h-2.5" /> 引用
                  </div>
                  <div className="text-sky-300 font-mono mt-0.5">
                    {template.usage?.configs || 0}/{template.usage?.npcs || 0}
                  </div>
                </div>
              </div>

              {/* 剧本资产与默认台词 */}
              {template.dialogue_package_id ? (
                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-950/30 border border-sky-800/40 text-sky-200">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ScrollText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-medium truncate">
                      {template.dialogue_package_name ||
                        dialoguePackages.find((p) => p.id === template.dialogue_package_id)?.name ||
                        template.dialogue_package_id}
                    </span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0 ml-1.5">
                    剧本挂载
                  </span>
                </div>
              ) : template.quote ? (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-2.5 py-1 rounded-lg bg-[#0a0e16] border border-slate-800/60 truncate">
                  <MessageSquare className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">台词: {template.quote}</span>
                </div>
              ) : null}

              {/* 技能配置展示 */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> 默认技能:
                </span>
                {(() => {
                  try {
                    const skillKeys = template.skills_json ? JSON.parse(template.skills_json) : [];
                    if (!Array.isArray(skillKeys) || skillKeys.length === 0) {
                      return <span className="text-slate-600">默认普攻</span>;
                    }
                    return skillKeys.map((key: string) => {
                      const skill = availableSkills.find((s) => s.skill_key === key);
                      return (
                        <span
                          key={key}
                          className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium"
                        >
                          {skill?.name || key}
                        </span>
                      );
                    });
                  } catch {
                    return <span className="text-slate-600">默认普攻</span>;
                  }
                })()}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
                <span className="font-mono">key: {template.key}</span>
                <span>配置 {template.usage?.configs || 0} · 地图 {template.usage?.npcs || 0}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#10151f] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f17]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    {editing ? `编辑 NPC 模板 · ${editing.name}` : '新建 NPC 模板'}
                  </h2>
                  <p className="text-xs text-slate-400">模板属性为 1 级基础值，战斗配置里会按等级缩放</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-200">
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">模板 ID *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editing)}
                    value={form.id || ''}
                    onChange={(e) => setField('id', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono disabled:opacity-50 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">业务 key *</label>
                  <input
                    type="text"
                    required
                    value={form.key || ''}
                    onChange={(e) => setField('key', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-sky-300 font-mono focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">名称 *</label>
                  <input
                    type="text"
                    required
                    value={form.name || ''}
                    onChange={(e) => setField('name', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">称号</label>
                  <input
                    type="text"
                    value={form.title || ''}
                    onChange={(e) => setField('title', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">头衔印章</label>
                  <input
                    type="text"
                    value={form.badge || ''}
                    onChange={(e) => setField('badge', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <CharacterSpritePicker
                title="头像 / 立绘"
                value={form.avatar || ''}
                onChange={(url) => setField('avatar', url)}
                hint="从下方基础立绘库点选透明底角色图，或手填图片 URL；保存后会写入模板 avatar 字段"
              />

              <div className="p-4 bg-[#0a0e16] border border-amber-500/30 rounded-xl space-y-3">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>成长与品质</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">成长预设</label>
                    <select
                      value={form.growth_template || ''}
                      onChange={(e) => handleGrowthTemplateChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    >
                      <option value="">自定义（保留数据库成长值）</option>
                      {attributeConfig?.growthTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">品质</label>
                    <select
                      value={form.quality || 'COMMON'}
                      onChange={(e) => setField('quality', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    >
                      {attributeConfig?.qualities.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} ×{item.statMultiplier}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  {form.growth_template
                    ? attributeConfig?.growthTemplates.find((g) => g.id === form.growth_template)?.description
                    : '自定义模式：直接使用数据库 growth_* 列，不再做旧版推导。'}
                  {' '}选择预设并保存时，会把预设成长值写入当前模板的 growth_* 列。
                </p>
              </div>

              <div className="p-4 bg-[#0a0e16] border border-sky-500/30 rounded-xl space-y-3">
                <div className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  <span>1 级基础属性</span>
                  <span className="text-[10px] font-normal text-slate-500">
                    （最终值 = 基础值 + (等级-1) × 成长值，再乘品质/境界/加成）
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'base_hp', label: '气血 HP', min: 1, step: 1 },
                    { key: 'base_mp', label: '内力 MP', min: 0, step: 1 },
                    { key: 'base_attack', label: '物攻 ATK', min: 1, step: 1 },
                    { key: 'base_matk', label: '法攻 MATK', min: 0, step: 1 },
                    { key: 'base_defense', label: '物防 DEF', min: 0, step: 1 },
                    { key: 'base_mdef', label: '法防 MDEF', min: 0, step: 1 },
                    { key: 'base_speed', label: '速度 SPD', min: 1, step: 1 },
                    { key: 'base_crit', label: '暴击 CRIT (0~1)', min: 0, max: 1, step: 0.01 },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-[11px] text-slate-400 mb-1">{field.label}</label>
                      <input
                        type="number"
                        min={field.min}
                        max={(field as any).max}
                        step={field.step}
                        value={(form as any)[field.key] ?? 0}
                        onChange={(e) => setField(field.key as keyof NpcTemplateItem, Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-sky-300 font-mono text-xs focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 默认技能配置 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>战斗技能配置 (skills_json)</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    创建出 NPC 实例时将默认继承此处选中的技能招式
                  </span>
                </div>

                <div className="bg-[#0a0e16] border border-slate-700 rounded-xl p-3">
                  {availableSkills.length === 0 ? (
                    <div className="text-xs text-slate-500 py-2 text-center">
                      暂无已注册技能，请先在【技能管理】中配置
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                      {availableSkills.map((skill) => {
                        let selectedKeys: string[] = [];
                        try {
                          selectedKeys = JSON.parse(form.skills_json || '[]');
                        } catch {}
                        const isChecked = selectedKeys.includes(skill.skill_key);

                        return (
                          <label
                            key={skill.skill_key}
                            className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                              isChecked
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const newKeys = checked
                                  ? [...selectedKeys, skill.skill_key]
                                  : selectedKeys.filter((k) => k !== skill.skill_key);
                                setField('skills_json', JSON.stringify(newKeys));
                              }}
                              className="rounded bg-slate-800 border-slate-700 text-amber-500 mt-0.5 focus:ring-0"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{skill.name}</div>
                              <div className="text-[10px] text-slate-500 truncate">
                                消耗: {skill.cost_mp} 灵力 · {skill.target_type === 'ALL_ENEMIES' ? '全敌' : skill.target_type === 'SELF' ? '自身' : '单体'}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  装备 / 永久属性加成 JSON
                </label>
                <textarea
                  rows={3}
                  value={form.bonus_json || '{}'}
                  onChange={(e) => setField('bonus_json', e.target.value)}
                  placeholder='{"equipment":[{"flat":{"atk":120}}],"permanent":[{"percent":{"hp":0.05}}]}'
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-sky-400"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  支持 equipment / permanent 两层；flat 为固定值，percent 为百分比（0.05 = +5%）。
                  留空或 {'{}'} 表示无额外加成。
                </p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">描述</label>
                <textarea
                  rows={2}
                  value={form.description || ''}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-lg shadow-sky-500/20 disabled:opacity-50"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editing ? '保存修改' : '确认创建'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 成长属性预览 */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#10151f] border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f17]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    成长属性预览 · {previewTemplate.name}
                  </h2>
                  <p className="text-xs text-slate-400">
                    属性由后端统一计算服务生成，与战斗内实际数值一致
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">等级列表（逗号分隔）</label>
                  <input
                    value={previewLevels}
                    onChange={(e) => setPreviewLevels(e.target.value)}
                    placeholder="1,10,20,50,100"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">品质覆盖</label>
                  <select
                    value={previewQuality}
                    onChange={(e) => setPreviewQuality(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    {attributeConfig?.qualities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">境界覆盖</label>
                  <input
                    value={previewRealm}
                    onChange={(e) => setPreviewRealm(e.target.value)}
                    placeholder="如: 金丹中期，留空无加成"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={refreshPreview}
                    disabled={previewLoading}
                    className="w-full px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {previewLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    <span>重新计算</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  成长来源: {previewData?.growthTemplate || previewTemplate.growth_template || '自定义（数据库值）'}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  品质: {previewData?.quality || previewQuality}
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300">
                  境界: {previewData?.realm || previewRealm || '无'}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-center text-[11px]">
                  <thead className="bg-[#0b0f17] text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">等级</th>
                      <th className="px-3 py-2 font-medium">气血</th>
                      <th className="px-3 py-2 font-medium">内力</th>
                      <th className="px-3 py-2 font-medium">物攻</th>
                      <th className="px-3 py-2 font-medium">法攻</th>
                      <th className="px-3 py-2 font-medium">物防</th>
                      <th className="px-3 py-2 font-medium">法防</th>
                      <th className="px-3 py-2 font-medium">速度</th>
                      <th className="px-3 py-2 font-medium">暴击</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLoading ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-slate-500">
                          正在计算成长属性...
                        </td>
                      </tr>
                    ) : previewData?.levels?.length ? (
                      previewData.levels.map((row) => (
                        <tr key={row.level} className="border-t border-slate-800/80 text-slate-300">
                          <td className="px-3 py-2 font-mono text-emerald-300">Lv.{row.level}</td>
                          <td className="px-3 py-2 font-mono text-rose-300">{row.maxHp.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-sky-300">{row.maxMp.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono">{row.atk.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-purple-300">{row.matk.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono">{row.def.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-cyan-300">{row.mdef.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono">{row.spd}</td>
                          <td className="px-3 py-2 font-mono text-amber-300">
                            {(row.crit * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-slate-500">
                          暂无预览数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121722] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">确认删除模板？</h3>
                <p className="text-xs text-slate-400 mt-0.5">被地图 NPC 或战斗配置引用时会拒绝删除</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-[#0a0e16] p-3 rounded-xl border border-slate-800">
              确定要删除【<span className="text-amber-300 font-bold">{deleting.name}</span>】
              (key: {deleting.key}) 吗？
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleting(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { SceneItem } from '../types';
import { X, Save, MapPin, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

export const generateSceneId = (): string => {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `scene_${timestamp}_${rand}`;
};

/**
 * 原型与仙侠 RPG 常用地标图标预设库 (Material Symbols)
 */
export const SCENE_ICON_PRESETS = [
  // 1. 都城与府衙
  { name: 'castle', label: '都城/城府', category: '都城' },
  { name: 'fort', label: '要塞/帝都', category: '都城' },
  { name: 'temple_buddhist', label: '城主府/宗庙', category: '都城' },
  { name: 'church', label: '仙门道观', category: '都城' },
  // 2. 市井与设施
  { name: 'flag', label: '长乐广场', category: '市井' },
  { name: 'storefront', label: '通宝钱庄/商会', category: '市井' },
  { name: 'local_pharmacy', label: '悬壶药馆', category: '市井' },
  { name: 'theater_comedy', label: '听雨梨园', category: '市井' },
  { name: 'share_location', label: '四方神行驿', category: '市井' },
  // 3. 历练与决斗
  { name: 'swords', label: '万剑冢/论剑', category: '历练' },
  { name: 'sports_martial_arts', label: '演武校场', category: '历练' },
  { name: 'shield', label: '天罡阵法', category: '历练' },
  { name: 'local_fire_department', label: '地火剑庐', category: '历练' },
  // 4. 山川与水秀
  { name: 'landscape', label: '青云灵山', category: '山川' },
  { name: 'sailing', label: '沧澜水乡', category: '山川' },
  { name: 'rowing', label: '临安古渡', category: '山川' },
  { name: 'nature', label: '密林药谷', category: '山川' },
  { name: 'ac_unit', label: '极寒雪原', category: '山川' },
  { name: 'cloud', label: '东海极境/迷雾', category: '山川' },
  { name: 'water_drop', label: '蓬莱灵泉', category: '山川' },
  // 5. 道路与方位
  { name: 'conversion_path', label: '十里古驿道', category: '道路' },
  { name: 'explore', label: '风水罗盘', category: '道路' },
  { name: 'pin_drop', label: '地标定点', category: '道路' },
  { name: 'near_me', label: '传送阵眼', category: '道路' },
];

interface SceneEditModalProps {
  isOpen: boolean;
  isNew: boolean;
  initialData?: SceneItem | null;
  allScenes: SceneItem[];
  onClose: () => void;
  onSave: (data: Partial<SceneItem>) => Promise<void>;
}

export const SceneEditModal: React.FC<SceneEditModalProps> = ({
  isOpen,
  isNew,
  initialData,
  allScenes,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<SceneItem>>({
    id: '',
    name: '',
    region: '天衡州',
    zone_id: 'changle_city',
    level: 3,
    parent_id: '',
    icon: 'flag',
    coord_x: 128,
    coord_y: 256,
    status_desc: '繁盛市井 · 安全区',
    tag: '',
    subtitle: '',
    thumb: '',
    background_url: '',
    description: '',
    feature: '',
    cost_desc: '行步耗时：无',
    btn_text: '前往',
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialData && !isNew) {
      setFormData({
        ...initialData,
        icon: initialData.icon || (initialData.level === 1 ? 'fort' : initialData.level === 2 ? 'castle' : 'flag'),
        parent_id: initialData.parent_id || '',
      });
    } else {
      setFormData({
        id: initialData?.id || generateSceneId(),
        name: initialData?.name || '',
        region: initialData?.region || '天衡州',
        zone_id: initialData?.zone_id || 'changle_city',
        level: initialData?.level || 3,
        parent_id: initialData?.parent_id || '',
        icon: initialData?.icon || (initialData?.level === 1 ? 'fort' : initialData?.level === 2 ? 'castle' : 'flag'),
        coord_x: initialData?.coord_x !== undefined ? initialData.coord_x : 128,
        coord_y: initialData?.coord_y !== undefined ? initialData.coord_y : 256,
        status_desc: initialData?.status_desc || '繁盛市井 · 安全区',
        tag: initialData?.tag || '仙城坊市',
        subtitle: initialData?.subtitle || '',
        thumb: initialData?.thumb || '',
        description: initialData?.description || '',
        feature: initialData?.feature || '',
        cost_desc: initialData?.cost_desc || '行步耗时：无',
        btn_text: initialData?.btn_text || '前往',
      });
    }
    setErrorMsg('');
  }, [initialData, isNew, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof SceneItem, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 应用快速预设模板
  const applyPreset = (type: 'region' | 'city' | 'market' | 'arena' | 'sacred') => {
    switch (type) {
      case 'region':
        setFormData((prev) => ({
          ...prev,
          level: 1,
          icon: 'fort',
          tag: '中原文脉',
          status_desc: '广袤州域 · 天地灵脉',
          btn_text: '查看州域',
          cost_desc: '跨州神行',
        }));
        break;
      case 'city':
        setFormData((prev) => ({
          ...prev,
          level: 2,
          icon: 'castle',
          tag: '九州都城',
          status_desc: '九州总都 · 太平盛世',
          btn_text: '进入城内',
          cost_desc: '直达都城',
        }));
        break;
      case 'market':
        setFormData((prev) => ({
          ...prev,
          level: 3,
          icon: 'flag',
          tag: '繁盛市井',
          status_desc: '繁盛市井 · 安全区',
          btn_text: '在此寻访',
          cost_desc: '行步耗时：无',
        }));
        break;
      case 'arena':
        setFormData((prev) => ({
          ...prev,
          level: 3,
          icon: 'sports_martial_arts',
          tag: '论剑禁地',
          status_desc: '论剑禁地 · 决斗区',
          btn_text: '前往校场',
          cost_desc: '行步耗时：20息',
        }));
        break;
      case 'sacred':
        setFormData((prev) => ({
          ...prev,
          level: 3,
          icon: 'landscape',
          tag: '洞天福地',
          status_desc: '清修圣境 · 仙云缭绕',
          btn_text: '御剑前往',
          cost_desc: '御剑耗时：2分15秒',
        }));
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const finalId = (formData.id || '').trim() || generateSceneId();
    if (!formData.name?.trim()) {
      setErrorMsg('场景名称不能为空');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        id: finalId,
        name: formData.name.trim(),
        icon: formData.icon?.trim() || (Number(formData.level) === 1 ? 'fort' : Number(formData.level) === 2 ? 'castle' : 'flag'),
        parent_id: formData.parent_id?.trim() || null,
        coord_x: Math.max(0, Math.min(512, Number(formData.coord_x) || 0)),
        coord_y: Math.max(0, Math.min(512, Number(formData.coord_y) || 0)),
        level: Number(formData.level) || 3,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#121722] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0e131c]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">
                {formData.icon || (formData.level === 1 ? 'fort' : formData.level === 2 ? 'castle' : 'flag')}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <span>{isNew ? '新建九州地图场景' : `编辑场景: ${formData.name}`}</span>
                {isNew && (
                  <span className="font-mono text-[11px] text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                    坐标 [{formData.coord_x}, {formData.coord_y}]
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-400">
                {isNew ? '向九州地理大千网格增添全新地标' : `场景唯一 ID: ${formData.id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 快捷模板填充 (仅新增或辅助快捷填写) */}
        {isNew && (
          <div className="px-6 pt-4 pb-1 border-b border-slate-800/60 bg-[#0a0e16]/60 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-amber-400/90 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>快速套用模板:</span>
            </span>
            <button
              type="button"
              onClick={() => applyPreset('market')}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-700 transition"
            >
              市井坊市 (flag)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('city')}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-700 transition"
            >
              都城中枢 (castle)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('arena')}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-700 transition"
            >
              演武校场 (sports)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('sacred')}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-700 transition"
            >
              仙山洞天 (landscape)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('region')}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-700 transition"
            >
              1级 州域大千 (fort)
            </button>
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* 重点新模块：地图图标选择与编辑 */}
          <div className="p-3.5 bg-[#0a0e16] border border-amber-500/30 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">interests</span>
                <span>地图场景点位图标 (Material Icon)</span>
              </label>

              {/* 即时图标预览徽章 */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">当前图标效果:</span>
                <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg ring-2 ring-amber-400/50">
                  <span className="material-symbols-outlined text-[18px]">
                    {formData.icon || (formData.level === 1 ? 'fort' : formData.level === 2 ? 'castle' : 'flag')}
                  </span>
                </div>
              </div>
            </div>

            {/* 输入框与当前键值 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.icon || ''}
                onChange={(e) => handleChange('icon', e.target.value)}
                placeholder="例如: temple_buddhist, swords, castle..."
                className="flex-1 px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-amber-400"
              />
              <span className="text-[11px] text-slate-500 font-mono">
                标准 Material Symbols 标识
              </span>
            </div>

            {/* 原型预设图标快速点选网格 */}
            <div>
              <span className="text-[10px] text-slate-400 block mb-1.5">
                常用地标与修仙建筑图标库（点击直接套用）：
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-[#121722] rounded-xl border border-slate-800">
                {SCENE_ICON_PRESETS.map((ico) => {
                  const isPicked = (formData.icon || '') === ico.name;
                  return (
                    <button
                      key={ico.name}
                      type="button"
                      onClick={() => handleChange('icon', ico.name)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 transition ${
                        isPicked
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-1 ring-amber-300'
                          : 'bg-[#090d14] text-slate-300 hover:text-amber-300 hover:bg-slate-800 border border-slate-800/80'
                      }`}
                      title={`${ico.label} (${ico.name})`}
                    >
                      <span className="material-symbols-outlined text-[15px] flex-shrink-0">
                        {ico.name}
                      </span>
                      <span className="truncate">{ico.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 场景 ID */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                <span>场景唯一标识 ID</span>
                <span className="text-[10px] text-amber-300/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 font-mono">
                  {isNew ? '系统自动生成' : '全局唯一标识'}
                </span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  disabled={!isNew}
                  value={formData.id || ''}
                  onChange={(e) => handleChange('id', e.target.value)}
                  placeholder="系统自动生成..."
                  className="flex-1 px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-amber-400 disabled:opacity-60 disabled:bg-slate-900"
                />
                {isNew && (
                  <button
                    type="button"
                    onClick={() => handleChange('id', generateSceneId())}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs flex items-center gap-1 transition"
                    title="重新生成唯一 ID"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>重换</span>
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {isNew ? '系统已自动生成唯一 ID，无需手动填写（亦可按需修改）' : '创建后全局唯一不可修改'}
              </span>
            </div>

            {/* 场景名称 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                场景名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="例如: 灵剑峰, 四海商会"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 所属区域 / 州域 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">所属州域</label>
              <input
                type="text"
                value={formData.region || ''}
                onChange={(e) => handleChange('region', e.target.value)}
                placeholder="例如: 天衡州, 沧澜州, 昆吾州"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 所属大区 zone_id */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">所属 ZoneDO (大区)</label>
              <input
                type="text"
                value={formData.zone_id || ''}
                onChange={(e) => handleChange('zone_id', e.target.value)}
                placeholder="例如: changle_city, canglan_state"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 场景层级 level */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">场景层级 (Level)</label>
              <select
                value={formData.level || 3}
                onChange={(e) => handleChange('level', Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              >
                <option value={1}>1 - 州域 (Region)</option>
                <option value={2}>2 - 都城/名胜 (City)</option>
                <option value={3}>3 - 坊市/设施 (Venue/Area)</option>
              </select>
            </div>

            {/* 上级场景 parent_id */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">上级场景 (Parent)</label>
              <select
                value={formData.parent_id || ''}
                onChange={(e) => handleChange('parent_id', e.target.value)}
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              >
                <option value="">(无上级 / 顶级场景)</option>
                {allScenes
                  .filter((s) => s.id !== formData.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
              </select>
            </div>

            {/* X 坐标 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                <span>X 坐标 (0~512)</span>
                <span className="font-mono text-amber-300 text-[10px]">X: {formData.coord_x ?? 128}</span>
              </label>
              <input
                type="number"
                min="0"
                max="512"
                value={formData.coord_x ?? 128}
                onChange={(e) => handleChange('coord_x', Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Y 坐标 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                <span>Y 坐标 (0~512)</span>
                <span className="font-mono text-amber-300 text-[10px]">Y: {formData.coord_y ?? 256}</span>
              </label>
              <input
                type="number"
                min="0"
                max="512"
                value={formData.coord_y ?? 256}
                onChange={(e) => handleChange('coord_y', Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 地貌标签 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">地貌标签 (Tag)</label>
              <input
                type="text"
                value={formData.tag || ''}
                onChange={(e) => handleChange('tag', e.target.value)}
                placeholder="例如: 森严官府, 万里神行, 繁盛市井"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 状态说明 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">状态说明 (Status Desc)</label>
              <input
                type="text"
                value={formData.status_desc || ''}
                onChange={(e) => handleChange('status_desc', e.target.value)}
                placeholder="例如: 繁华市井 · 安全区"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 传送按钮文本 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">操作按钮文本</label>
              <input
                type="text"
                value={formData.btn_text || '前往'}
                onChange={(e) => handleChange('btn_text', e.target.value)}
                placeholder="例如: 前往, 移步府衙, 神行传送"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 耗时/消耗 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">行路/传送消耗说明</label>
              <input
                type="text"
                value={formData.cost_desc || ''}
                onChange={(e) => handleChange('cost_desc', e.target.value)}
                placeholder="例如: 行步耗时：15息"
                className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* 缩略图 URL 与即时预览 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">全息场景立绘/缩略图 URL (Card Thumb)</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={formData.thumb || ''}
                onChange={(e) => handleChange('thumb', e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
              {formData.thumb && (
                <div className="w-12 h-9 rounded-lg overflow-hidden border border-slate-700 flex-shrink-0 bg-slate-900">
                  <img
                    src={formData.thumb}
                    alt="立绘预览"
                    className="w-full h-full object-cover"
                    onError={(e) => ((e.target as any).style.display = 'none')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 地图底图背景 URL (进入该地图时作为大千网格/视口背景展示) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              地图底图背景 URL (Map Background)
              <span className="text-[10px] text-slate-400 font-normal ml-2">
                进入该场景或其子场景时，大地图背景直接展示此图；留空则回退继承上级场景或根世界大地图
              </span>
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={formData.background_url || ''}
                onChange={(e) => handleChange('background_url', e.target.value)}
                placeholder="https://... 或 /assets/maps/..."
                className="flex-1 px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              />
              {formData.background_url && (
                <div className="w-12 h-9 rounded-lg overflow-hidden border border-slate-700 flex-shrink-0 bg-slate-900">
                  <img
                    src={formData.background_url}
                    alt="背景预览"
                    className="w-full h-full object-cover"
                    onError={(e) => ((e.target as any).style.display = 'none')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 特色风物 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">特色风物说明</label>
            <input
              type="text"
              value={formData.feature || ''}
              onChange={(e) => handleChange('feature', e.target.value)}
              placeholder="特色风物：神行客商、百工器械、通宝钱庄"
              className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* 详叙描述 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">场景详叙背景</label>
            <textarea
              rows={2}
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="输入场景渊源与风貌设定..."
              className="w-full px-3 py-2 bg-[#090d14] border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* 底部操作 */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isNew ? '立即增添场景' : '保存修改'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

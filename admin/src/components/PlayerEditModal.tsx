import React, { useState, useEffect } from 'react';
import { PlayerItem, SceneItem } from '../types';
import { adminApi } from '../services/api';
import {
  X,
  Save,
  Shield,
  Heart,
  Zap,
  Coins,
  MapPin,
  Sparkles,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Ban,
  Home,
  Flame,
} from 'lucide-react';

interface PlayerEditModalProps {
  isOpen: boolean;
  player: PlayerItem | null;
  scenes: SceneItem[];
  onClose: () => void;
  onRefresh: () => void;
}

export const PlayerEditModal: React.FC<PlayerEditModalProps> = ({
  isOpen,
  player,
  scenes,
  onClose,
  onRefresh,
}) => {
  const [formData, setFormData] = useState<Partial<PlayerItem>>({});
  const [saving, setSaving] = useState(false);
  const [quickActionLoading, setQuickActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 货币发放临时状态
  const [grantSilver, setGrantSilver] = useState(10000);
  const [grantIngot, setGrantIngot] = useState(1000);

  useEffect(() => {
    if (player) {
      setFormData({
        nickname: player.nickname,
        sect: player.sect,
        sect_position: player.sect_position,
        realm: player.realm,
        level: player.level,
        exp: player.exp,
        silver: player.silver,
        ingot: player.ingot,
        copper: player.copper,
        zone_id: player.zone_id,
        area_id: player.area_id,
        status: player.status,
        vip_level: player.vip_level,
        combat_model_key: player.combat_model_key || 'player_default',
        signature: player.signature || '',
      });
    }
    setErrorMsg('');
    setSuccessMsg('');
  }, [player, isOpen]);

  if (!isOpen || !player) return null;

  const handleChange = (field: keyof PlayerItem, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 纯客户端实时动态属性推演（响应输入框中 level 与 realm 的瞬时变化）
  const previewStats = React.useMemo(() => {
    const currentLevel = Math.max(1, Number(formData.level) || player.level || 1);
    const originalLevel = Math.max(1, Number(player.level) || 1);
    const realmStr = formData.realm || player.realm || '练气初期';

    // 境界加成表
    const realmBonusMap: Record<string, number> = {
      '化神': 0.24,
      '元婴': 0.16,
      '金丹': 0.10,
      '筑基': 0.06,
      '练气': 0.03,
    };
    let realmBonus = 0.03;
    for (const [key, bonus] of Object.entries(realmBonusMap)) {
      if (realmStr.includes(key)) {
        realmBonus = bonus;
        break;
      }
    }

    // 基础等级成长推演 (Lv.1 为 3000/1500，每级 +200/+100)
    const baseHpGrowth = 3000 + (currentLevel - 1) * 200;
    const baseMpGrowth = 1500 + (currentLevel - 1) * 100;

    // 保留装备与洗髓丹等附加增幅
    const origBaseHp = 3000 + (originalLevel - 1) * 200;
    const origBaseMp = 1500 + (originalLevel - 1) * 100;
    const origExtraHp = Math.max(0, (player.max_hp ?? 3000) - origBaseHp);
    const origExtraMp = Math.max(0, (player.max_mp ?? 1500) - origBaseMp);

    const previewMaxHp = Math.round(baseHpGrowth * (1 + realmBonus) - (baseHpGrowth * 0.03)) + origExtraHp;
    const previewMaxMp = Math.round(baseMpGrowth * (1 + realmBonus) - (baseMpGrowth * 0.03)) + origExtraMp;

    // 当前气血/法力不超出最新上限
    const previewHp = Math.min(previewMaxHp, Number(player.hp ?? 0));
    const previewMp = Math.min(previewMaxMp, Number(player.mp ?? 0));

    // 综合修仙战力动态增量：每级 +120
    const powerDelta = (currentLevel - originalLevel) * 120;
    const previewCombatPower = Math.max(500, (player.combat_power ?? 800) + powerDelta);

    return {
      hp: previewHp,
      max_hp: previewMaxHp,
      mp: previewMp,
      max_mp: previewMaxMp,
      combat_power: previewCombatPower,
      isModified: currentLevel !== originalLevel || formData.realm !== player.realm,
    };
  }, [formData.level, formData.realm, player]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);

    try {
      await adminApi.updatePlayer(player.id, formData);
      setSuccessMsg('玩家属性与档案已保存成功！');
      // 重新获取该玩家最新详情（包含后端重算的战力与属性），同步更新本地弹窗与父页面
      try {
        const detailRes = await adminApi.getPlayerDetail(player.id);
        if (detailRes?.player) {
          player.combat_power = detailRes.player.combat_power;
          player.level = detailRes.player.level;
          player.realm = detailRes.player.realm;
          player.exp = detailRes.player.exp;
          player.hp = detailRes.player.hp;
          player.max_hp = detailRes.player.max_hp;
          player.mp = detailRes.player.mp;
          player.max_mp = detailRes.player.max_mp;
        }
      } catch {
        // 忽略静默失败
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAction = async (action: 'full_restore' | 'teleport_home' | 'grant_currency' | 'set_status', extra = {}) => {
    setErrorMsg('');
    setSuccessMsg('');
    setQuickActionLoading(true);

    try {
      const res = await adminApi.playerQuickAction(player.id, action, extra);
      setSuccessMsg(res.message);
      onRefresh();
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || '操作失败');
    } finally {
      setQuickActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#121722] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0e131c]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-base">{player.nickname}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {player.is_guest ? '散修游客' : '正式门生'}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {player.realm}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">UUID: {player.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 提示条 */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 内容区 */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* GM 快捷指令行动区 */}
          <div className="p-4 rounded-xl bg-[#0a0e16] border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4" />
                <span>GM 快捷天道指令</span>
              </span>
              <span className="text-[10px] text-slate-500">免手动填写快速下发</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                disabled={quickActionLoading}
                onClick={() => handleQuickAction('full_restore')}
                className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Heart className="w-3.5 h-3.5" />
                <span>满血满蓝</span>
              </button>

              <button
                type="button"
                disabled={quickActionLoading}
                onClick={() => handleQuickAction('teleport_home')}
                className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Home className="w-3.5 h-3.5" />
                <span>传送回长乐城</span>
              </button>

              <button
                type="button"
                disabled={quickActionLoading}
                onClick={() =>
                  handleQuickAction('grant_currency', { silver: grantSilver, ingot: grantIngot })
                }
                className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>补发千两灵石</span>
              </button>

              <button
                type="button"
                disabled={quickActionLoading}
                onClick={() =>
                  handleQuickAction('set_status', {
                    status: formData.status === 'BANNED' ? 'OFFLINE' : 'BANNED',
                  })
                }
                className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50 ${
                  formData.status === 'BANNED'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{formData.status === 'BANNED' ? '解除封禁' : '封禁玩家'}</span>
              </button>
            </div>
          </div>

          {/* 表单明细 */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. 基础道籍信息 */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>基础仙身与门派</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">道号 / 角色名</label>
                  <input
                    type="text"
                    value={formData.nickname || ''}
                    onChange={(e) => handleChange('nickname', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">所属门派</label>
                  <input
                    type="text"
                    value={formData.sect || ''}
                    onChange={(e) => handleChange('sect', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">门派阶位</label>
                  <input
                    type="text"
                    value={formData.sect_position || ''}
                    onChange={(e) => handleChange('sect_position', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">修仙大境界</label>
                  <select
                    value={formData.realm || '练气前期'}
                    onChange={(e) => handleChange('realm', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    <option value="练气前期">练气前期</option>
                    <option value="练气中期">练气中期</option>
                    <option value="练气圆满">练气圆满</option>
                    <option value="筑基初期">筑基初期</option>
                    <option value="筑基中期">筑基中期</option>
                    <option value="筑基圆满">筑基圆满</option>
                    <option value="金丹初期">金丹初期</option>
                    <option value="金丹中期">金丹中期</option>
                    <option value="金丹圆满">金丹圆满</option>
                    <option value="元婴初期">元婴初期</option>
                    <option value="元婴圆满">元婴圆满</option>
                    <option value="化神大圆满">化神大圆满</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">等级 (Level)</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={formData.level ?? 1}
                    onChange={(e) => handleChange('level', Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">修仙经验 (EXP)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.exp ?? 0}
                    onChange={(e) => handleChange('exp', Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* 2. 战斗属性与法力（只读展示，沿用系统动态计算逻辑） */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-red-400" />
                  <span>战斗属性与法力 (动态计算)</span>
                </h4>
                <div className="flex items-center gap-2">
                  {previewStats.isModified && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">
                      实时推演预览中
                    </span>
                  )}
                  <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    沿用属性成长与装备加成计算
                  </span>
                </div>
              </div>

              {/* 属性数值只读卡片展示 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 p-3 rounded-xl bg-[#090d14]/80 border border-slate-800">
                <div className="p-2 rounded-lg bg-[#121722] border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">当前气血</div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                    {Number(previewStats.hp).toLocaleString()}
                  </div>
                </div>

                <div className={`p-2 rounded-lg bg-[#121722] transition-colors ${previewStats.isModified ? 'border border-emerald-500/40 bg-emerald-950/20' : 'border border-slate-800/80'}`}>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>气血上限 (Max HP)</span>
                    {previewStats.isModified && <span className="text-[9px] text-emerald-400">预览</span>}
                  </div>
                  <div className={`text-xs font-mono font-bold mt-0.5 ${previewStats.isModified ? 'text-emerald-300 font-extrabold' : 'text-slate-200'}`}>
                    {Number(previewStats.max_hp).toLocaleString()}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-[#121722] border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">当前内力</div>
                  <div className="text-xs font-mono font-bold text-sky-400 mt-0.5">
                    {Number(previewStats.mp).toLocaleString()}
                  </div>
                </div>

                <div className={`p-2 rounded-lg bg-[#121722] transition-colors ${previewStats.isModified ? 'border border-sky-500/40 bg-sky-950/20' : 'border border-slate-800/80'}`}>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>内力上限 (Max MP)</span>
                    {previewStats.isModified && <span className="text-[9px] text-sky-400">预览</span>}
                  </div>
                  <div className={`text-xs font-mono font-bold mt-0.5 ${previewStats.isModified ? 'text-sky-300 font-extrabold' : 'text-slate-200'}`}>
                    {Number(previewStats.max_mp).toLocaleString()}
                  </div>
                </div>

                <div className={`p-2 rounded-lg bg-[#121722] col-span-2 sm:col-span-1 transition-colors ${previewStats.isModified ? 'border border-amber-400/50 bg-amber-950/25' : 'border border-amber-500/20'}`}>
                  <div className="text-[10px] text-amber-300/80 flex items-center justify-between">
                    <span>综合修仙战力</span>
                    {previewStats.isModified && <span className="text-[9px] text-amber-300">预览</span>}
                  </div>
                  <div className={`text-xs font-mono font-bold mt-0.5 ${previewStats.isModified ? 'text-amber-200 font-extrabold' : 'text-amber-300'}`}>
                    {Number(previewStats.combat_power).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 战斗模型 Key */}
              <div className="mt-2.5">
                <label className="block text-[11px] text-slate-400 mb-1">战斗模型 Key (battle_models)</label>
                <input
                  type="text"
                  value={formData.combat_model_key || 'player_default'}
                  onChange={(e) => handleChange('combat_model_key', e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* 3. 灵石通宝财富 */}
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>仙道资产与通宝</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">流通纹银 (Silver)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.silver ?? 0}
                    onChange={(e) => handleChange('silver', Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">高阶元宝 (Ingot)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.ingot ?? 0}
                    onChange={(e) => handleChange('ingot', Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">坊市铜钱 (Copper)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.copper ?? 0}
                    onChange={(e) => handleChange('copper', Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* 4. 地理驻留与状态 */}
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span>驻留地理与账号状态</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">驻留子场景 (area_id)</label>
                  <select
                    value={formData.area_id || 'square'}
                    onChange={(e) => handleChange('area_id', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    {scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">所属大区 (zone_id)</label>
                  <input
                    type="text"
                    value={formData.zone_id || 'changle_city'}
                    onChange={(e) => handleChange('zone_id', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">账号状态</label>
                  <select
                    value={formData.status || 'OFFLINE'}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#090d14] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    <option value="ONLINE">ONLINE (在线)</option>
                    <option value="OFFLINE">OFFLINE (离线)</option>
                    <option value="MEDITATING">MEDITATING (打坐洞府中)</option>
                    <option value="BANNED">BANNED (已封禁/囚于锁妖塔)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 底部保存提交 */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                关闭
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>保存全部修改</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

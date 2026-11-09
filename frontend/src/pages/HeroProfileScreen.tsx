import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopSceneHeader } from '../components/TopSceneHeader';
import { usePlayerStore } from '../store/usePlayerStore';
import { gameApi } from '../services/api';
import { getRequiredExpForLevel, calculateExpProgress } from '../constants/experience';

interface HeroProfileScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenPlayerModal: (playerId?: string) => void;
}

type PresetAvatar = Awaited<ReturnType<typeof gameApi.getPresets>>['avatars'][number];

/**
 * 屏幕：人物信息与侠客档案 (HeroProfileScreen)
 * 支持修改名称、头像立绘、个性签名，并全息展示道境属性与神兵法宝
 */
export const HeroProfileScreen: React.FC<HeroProfileScreenProps> = ({
  onShowNotice,
}) => {
  const navigate = useNavigate();
  const player = usePlayerStore((s) => s.player);
  const inventory = usePlayerStore((s) => s.inventory);
  const setPlayer = usePlayerStore((s) => s.setPlayer);

  // 页签控制：默认激活 'edit'（资料修改），方便立即修改名称、头像、签名
  const [subTab, setSubTab] = useState<'edit' | 'dossier' | 'equipment' | 'attributes' | 'biography'>('edit');

  // 修改表单本地临时状态
  const [editName, setEditName] = useState<string>('');
  const [editAvatar, setEditAvatar] = useState<string>('');
  const [editSignature, setEditSignature] = useState<string>('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 法相头像目录与取名库均来自后端预设接口，前端不再内置任何假数据
  const [presetAvatars, setPresetAvatars] = useState<PresetAvatar[]>([]);
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [isPresetsLoading, setIsPresetsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    gameApi
      .getPresets()
      .then((data) => {
        if (cancelled) return;
        setPresetAvatars(Array.isArray(data?.avatars) ? data.avatars : []);
        setPresetNames(Array.isArray(data?.names) ? data.names : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPresetAvatars([]);
        setPresetNames([]);
      })
      .finally(() => {
        if (!cancelled) setIsPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 同步当前玩家已有数据到编辑状态
  useEffect(() => {
    if (player) {
      setEditName(player.nickname || '');
      setEditAvatar(player.avatar || '');
      setEditSignature(player.signature || '');
    }
  }, [player]);

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-on-surface-variant text-sm">
        <span className="material-symbols-outlined text-3xl mb-2 animate-spin text-primary">progress_activity</span>
        <span>正从太虚玉牒中调阅道友真身...</span>
      </div>
    );
  }

  // 筛选真实已佩戴的装备
  const equippedItems = inventory.filter((item) => item.isEquipped);

  // 经验计算：优先使用后端权威下发的 maxExp，若无则使用统一经验公式
  const nextLevelExp = player.maxExp ?? getRequiredExpForLevel(player.level);
  const expPercent = calculateExpProgress(player.exp, nextLevelExp);

  // 随机取名：取名库由后端预设接口下发，库空时仅提示、不造名
  const handleRandomName = () => {
    if (presetNames.length === 0) {
      onShowNotice('取名库暂未开放');
      return;
    }
    const candidates = presetNames.filter((n) => n !== editName);
    const pool = candidates.length > 0 ? candidates : presetNames;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    setEditName(chosen);
    onShowNotice(`感悟天道得灵感道号：【${chosen}】`);
  };

  // 应用自定义头像链接
  const handleApplyCustomAvatar = () => {
    if (!customAvatarUrl.trim()) {
      onShowNotice('请输入头像图片直链 URL');
      return;
    }
    setEditAvatar(customAvatarUrl.trim());
    onShowNotice('已应用自定义法相立绘');
  };

  // 保存资料修改
  const handleSaveProfile = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      onShowNotice('修仙道号不可为空');
      return;
    }
    if (trimmedName.length < 2 || trimmedName.length > 16) {
      onShowNotice('道号须在 2 至 16 个字符之间');
      return;
    }

    setIsSaving(true);
    try {
      const res = await gameApi.updateProfile({
        nickname: trimmedName,
        avatar: editAvatar,
        signature: editSignature.trim(),
      });

      if (res.player) {
        setPlayer(res.player);
      }
      onShowNotice(res.message || '修仙玉牒铭刻成功，名震九州！');
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '更新人物资料失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 恢复原本
  const handleResetForm = () => {
    if (player) {
      setEditName(player.nickname || '');
      setEditAvatar(player.avatar || '');
      setEditSignature(player.signature || '');
      setCustomAvatarUrl('');
      onShowNotice('已重置为当前玉牒记录');
    }
  };

  // 返回上一页
  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/features');
    }
  };

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-2">
      <TopSceneHeader onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')} />

      <section className="mx-space-md mt-space-xs flex flex-col gap-space-xs text-on-surface">
        {/* 面包屑与顶部导航 */}
        <div className="flex items-center justify-between px-2 py-1 rounded bg-surface-container-lowest/80 border border-outline-variant/30 text-[11px]">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span className="font-headline-sm text-[11px] font-bold">返回</span>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-primary font-headline-sm font-bold text-[12px] tracking-wide">
              人物信息 · 侠客档案
            </span>
            <span className="text-[9px] font-data-metric text-on-surface-variant bg-surface-container-high px-1 py-0.2 rounded">
              #{player.id}
            </span>
          </div>
        </div>

        {/* 顶部身份形象全息主卡 (即时联动预览) */}
        <div className="relative rounded bg-gradient-to-b from-surface-container-high via-surface-container to-surface-container-low p-2 shadow-md border border-outline-variant/30 overflow-hidden">
          <div className="flex items-start gap-2 relative z-10">
            {/* 头像预览 & 点击修改提示 */}
            <div
              className="relative flex-shrink-0 cursor-pointer group"
              onClick={() => {
                setSubTab('edit');
                onShowNotice('可在下方「资料修改」中随心挑选心仪法相');
              }}
              title="点击切换法相头像"
            >
              <div className="w-16 h-16 rounded overflow-hidden bg-surface-container-highest shadow-inner p-[1px] border border-primary/50 relative group-hover:border-primary transition-all">
                {editAvatar ? (
                  <img
                    className="w-full h-full object-cover rounded"
                    alt={editName || player.nickname}
                    src={editAvatar}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary font-bold text-xl">
                    {(editName || player.nickname).slice(0, 1)}
                  </div>
                )}
                {/* 悬浮/小标签更换提示 */}
                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[1px] text-[8px] text-[#ffe2a5] text-center py-0.5 leading-none flex items-center justify-center gap-0.5">
                  <span className="material-symbols-outlined text-[10px]">photo_camera</span>
                  <span>更换</span>
                </div>
              </div>
              <span className="absolute -top-1 -left-1 bg-secondary-container text-on-secondary-container text-[8px] font-label-sm px-1 rounded shadow">
                Lv.{player.level}
              </span>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-primary font-headline-md text-[15px] font-bold tracking-wide truncate">
                    {editName || player.nickname}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSubTab('edit')}
                    className="text-tertiary hover:text-primary transition-colors cursor-pointer"
                    title="点击修改名称"
                  >
                    <span className="material-symbols-outlined text-[13px]">edit</span>
                  </button>
                </div>
                {player.title && (
                  <div className="text-primary text-[10px] font-label-sm flex items-center gap-0.5 shrink-0">
                    <span className="material-symbols-outlined text-[12px]">military_tech</span>
                    <span className="font-bold">「{player.title}」</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-on-surface-variant">{player.sect}</span>
                <span className="text-tertiary font-medium">{player.realm}</span>
              </div>

              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-1 bg-surface-container-lowest px-1.5 py-0.5 rounded border border-outline-variant/20">
                  <span className="material-symbols-outlined text-primary text-[13px]">swords</span>
                  <span className="text-[9px] font-label-sm text-on-surface-variant">战力</span>
                  <span className="text-primary font-headline-sm text-[13px] font-bold tracking-wide ml-0.5">
                    {player.combatPower.toLocaleString()}
                  </span>
                </div>
                <div className="flex-1 ml-2 max-w-[130px]">
                  <div className="flex justify-between text-[8px] font-data-metric text-on-surface-variant mb-0.5">
                    <span>经验</span>
                    <span className="text-primary-fixed">
                      {nextLevelExp > 0
                        ? `${player.exp.toLocaleString()} / ${nextLevelExp.toLocaleString()}`
                        : `${player.exp.toLocaleString()} (登峰造极)`}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-surface-container-lowest overflow-hidden p-[0.5px]">
                    <div
                      className="h-full bg-gradient-to-r from-primary-container to-primary rounded"
                      style={{ width: `${expPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 核心气血与内力状态条 */}
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 pt-1 border-t border-outline-variant/20">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] font-data-metric">
                    <span className="text-secondary font-bold">气血</span>
                    <span className="text-secondary font-bold">
                      {player.hp.toLocaleString()} / {player.maxHp.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-surface-container-lowest overflow-hidden p-[0.5px]">
                    <div
                      className="h-full bg-gradient-to-r from-secondary-container to-secondary rounded transition-all duration-300"
                      style={{
                        width: `${
                          player.maxHp > 0
                            ? Math.min(100, Math.max(0, Math.round((player.hp / player.maxHp) * 100)))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] font-data-metric">
                    <span className="text-tertiary font-bold">内力值</span>
                    <span className="text-tertiary font-bold">
                      {player.mp.toLocaleString()} / {player.maxMp.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-surface-container-lowest overflow-hidden p-[0.5px]">
                    <div
                      className="h-full bg-gradient-to-r from-on-tertiary-fixed-variant to-tertiary rounded transition-all duration-300"
                      style={{
                        width: `${
                          player.maxMp > 0
                            ? Math.min(100, Math.max(0, Math.round((player.mp / player.maxMp) * 100)))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 二级导航页签栏 */}
        <div className="grid grid-cols-5 gap-1 p-0.5 rounded bg-surface-container-low shadow-sm border border-outline-variant/30 text-center">
          {(
            [
              { key: 'edit', label: '资料修改', icon: 'edit' },
              { key: 'dossier', label: '侠客玉牒', icon: 'badge' },
              { key: 'equipment', label: '法宝', icon: 'shield' },
              { key: 'attributes', label: '属性', icon: 'vital_signs' },
              { key: 'biography', label: '履历', icon: 'history_edu' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={`py-1 rounded text-[10px] sm:text-[11px] font-headline-sm font-bold transition-all flex items-center justify-center gap-0.5 cursor-pointer ${
                subTab === t.key
                  ? 'bg-secondary-container text-on-secondary-container shadow ring-1 ring-secondary/50'
                  : 'bg-surface-container text-on-surface-variant hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* 页签内容展现区域 */}
        <div className="rounded bg-surface-container-low p-2 shadow-md border border-outline-variant/30 min-h-[220px]">
          {/* 1. 资料修改 (修改名称、头像、个性签名) */}
          {subTab === 'edit' && (
            <div className="flex flex-col gap-2.5">
              {/* (1) 修改名称 */}
              <div className="p-2 rounded bg-surface-container border border-outline-variant/30 space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary">
                    <span className="material-symbols-outlined text-[13px]">badge</span>
                    <span>修改修仙道号 (名称)</span>
                  </div>
                  <span className="text-[9px] text-on-surface-variant">2~16 字</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={16}
                    placeholder="请输入修仙道号..."
                    className="flex-1 px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant/40 focus:border-primary text-[11px] text-on-surface outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRandomName}
                    className="px-2 py-1 rounded bg-surface-container-highest hover:bg-surface-container-high border border-outline-variant/40 text-[10px] text-primary flex items-center gap-0.5 cursor-pointer active:scale-95 transition-transform shrink-0"
                    title="随机生成仙号"
                  >
                    <span className="material-symbols-outlined text-[12px]">casino</span>
                    <span>随机</span>
                  </button>
                </div>
              </div>

              {/* (2) 修改头像 */}
              <div className="p-2 rounded bg-surface-container border border-outline-variant/30 space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary">
                    <span className="material-symbols-outlined text-[13px]">face</span>
                    <span>选择法相立绘 (头像)</span>
                  </div>
                  <span className="text-[9px] text-tertiary">点击即可选定</span>
                </div>

                {/* 预设头像九宫格缩略图 */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {isPresetsLoading ? (
                    <div className="col-span-4 py-4 text-center text-[10px] text-on-surface-variant/70">
                      正在调阅法相画卷...
                    </div>
                  ) : presetAvatars.length === 0 ? (
                    <div className="col-span-4 py-4 text-center text-[10px] text-on-surface-variant/70">
                      法相画卷暂未开放
                    </div>
                  ) : (
                    presetAvatars.map((av) => {
                      const isSelected = editAvatar === av.url;
                      return (
                        <div
                          key={av.id}
                          onClick={() => setEditAvatar(av.url)}
                          className={`p-1 rounded cursor-pointer transition-all flex flex-col items-center gap-0.5 relative group ${
                            isSelected
                              ? 'bg-secondary-container/30 border border-primary shadow-sm ring-1 ring-primary'
                              : 'bg-surface-container-lowest border border-outline-variant/30 hover:border-primary/50'
                          }`}
                        >
                          <div className="w-10 h-10 rounded overflow-hidden bg-surface-container-highest relative">
                            <img className="w-full h-full object-cover" src={av.url} alt={av.name} />
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-[16px] drop-shadow">
                                  check_circle
                                </span>
                              </div>
                            )}
                          </div>
                          <span className={`text-[9px] truncate max-w-full ${isSelected ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                            {av.name}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 自定义网络头像 URL */}
                <div className="mt-1 pt-1 border-t border-outline-variant/20 flex items-center gap-1.5">
                  <input
                    type="url"
                    value={customAvatarUrl}
                    onChange={(e) => setCustomAvatarUrl(e.target.value)}
                    placeholder="或输入外部图片直链 URL..."
                    className="flex-1 px-2 py-0.8 rounded bg-surface-container-lowest border border-outline-variant/40 focus:border-primary text-[10px] text-on-surface outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomAvatar}
                    className="px-2 py-0.8 rounded bg-surface-container-high border border-outline-variant/40 text-[10px] text-primary cursor-pointer active:scale-95 transition-transform shrink-0"
                  >
                    应用
                  </button>
                </div>
              </div>

              {/* (3) 修改个性签名 */}
              <div className="p-2 rounded bg-surface-container border border-outline-variant/30 space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary">
                    <span className="material-symbols-outlined text-[13px]">format_quote</span>
                    <span>修改签名</span>
                  </div>
                  <span className="text-[9px] text-on-surface-variant">{editSignature.length}/100</span>
                </div>

                <textarea
                  rows={2}
                  maxLength={100}
                  value={editSignature}
                  onChange={(e) => setEditSignature(e.target.value)}
                  className="w-full p-1.5 rounded bg-surface-container-lowest border border-outline-variant/40 focus:border-primary text-[11px] text-on-surface outline-none resize-none leading-relaxed"
                />

              </div>

              {/* (4) 保存与重置提交按钮 */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResetForm}
                  disabled={isSaving}
                  className="px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface-variant text-[11px] font-label-sm cursor-pointer active:scale-95 transition-transform"
                >
                  重置
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="px-4 py-1.2 rounded bg-gradient-to-r from-[#ffe2a5] to-[#f4c264] text-[#3a2a10] font-headline-sm font-bold text-[11px] shadow hover:brightness-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      保存中...
                    </>
                  ) : (
                    <>
                      保存
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 2. 侠客玉牒档案 */}
          {subTab === 'dossier' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 text-[11px] font-body-sm">
                <div className="p-1.5 rounded bg-surface-container space-y-1 border border-outline-variant/20">
                  <div className="text-[10px] font-label-sm text-primary font-bold border-b border-outline-variant/30 pb-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">badge</span>身份玉牒
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">道号：</span>
                    <span className="text-on-surface font-semibold">{player.nickname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">修为：</span>
                    <span className="text-primary font-semibold">{player.realm}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">宗门：</span>
                    <span className="text-on-surface truncate">{player.sect}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">位阶：</span>
                    <span className="text-tertiary">{player.sectPosition || '—'}</span>
                  </div>
                </div>

                <div className="p-1.5 rounded bg-surface-container space-y-1 border border-outline-variant/20">
                  <div className="text-[10px] font-label-sm text-primary font-bold border-b border-outline-variant/30 pb-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">pin_drop</span>驻留仙境
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">大区：</span>
                    <span className="text-tertiary truncate">{player.zoneId || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">区域：</span>
                    <span className="text-on-surface font-semibold">{player.areaId || player.currentMap || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">状态：</span>
                    <span className="text-primary font-semibold">{player.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">灵根：</span>
                    <span className="text-tertiary truncate">{player.spiritualRoot || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. 神兵法宝装备 */}
          {subTab === 'equipment' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-on-surface-variant px-0.5">
                <span>当前佩戴法宝 ({equippedItems.length} 件)</span>
              </div>
              {equippedItems.length === 0 ? (
                <div className="py-8 text-center text-on-surface-variant/60 text-[11px]">
                  「当前未穿戴任何神兵宝甲，可在行囊中选择装备」
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {equippedItems.map((eq) => (
                    <div
                      key={eq.id}
                      className="p-1.5 rounded bg-surface-container border border-primary/40 flex items-center gap-1.5 cursor-pointer hover:border-primary transition-colors"
                      onClick={() => onShowNotice(`【${eq.itemName}】+${eq.enhanceLevel} (${eq.quality})`)}
                    >
                      <div className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0">
                        <span className="material-symbols-outlined text-[16px]">colorize</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-primary font-bold truncate">
                          {eq.itemName} +{eq.enhanceLevel}
                        </span>
                        <span className="text-[8px] text-tertiary">{eq.slot} · {eq.quality}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. 道境基础与六维属性 */}
          {subTab === 'attributes' && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-body-sm">
                <div className="p-1.5 rounded bg-surface-container space-y-1 border border-outline-variant/20">
                  <div className="text-primary font-bold border-b border-outline-variant/30 pb-0.5 flex justify-between">
                    <span>基础气脉</span>
                    <span className="font-data-metric text-[9px] text-tertiary">{player.realm}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">角色位阶</span>
                    <span className="font-data-metric text-primary font-bold">
                      Lv.{player.level}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">气海修为</span>
                    <span className="font-data-metric text-tertiary font-bold">
                      {nextLevelExp > 0
                        ? `${player.exp.toLocaleString()} / ${nextLevelExp.toLocaleString()}`
                        : `${player.exp.toLocaleString()} (满级)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">最大气血</span>
                    <span className="font-data-metric text-secondary font-bold">
                      {player.maxHp.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">最大内力</span>
                    <span className="font-data-metric text-tertiary font-bold">
                      {player.maxMp.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">仙盟声望</span>
                    <span className="font-data-metric text-primary">{player.reputation || '—'}</span>
                  </div>
                </div>

                <div className="p-1.5 rounded bg-surface-container space-y-1 border border-outline-variant/20">
                  <div className="text-primary font-bold border-b border-outline-variant/30 pb-0.5 flex justify-between">
                    <span>战力造诣</span>
                    <span className="font-data-metric text-[9px] text-tertiary">{player.title || ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">综合修仙战力</span>
                    <span className="font-data-metric text-primary font-bold">
                      {player.combatPower.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">修真洞府</span>
                    <span className="font-data-metric text-tertiary truncate">{player.residence || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">道心赞叹</span>
                    <span className="font-data-metric text-primary-fixed">{player.likesCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. 江湖履历 */}
          {subTab === 'biography' && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] text-on-surface-variant flex items-center justify-between px-0.5">
                <span>九州修仙大事纪</span>
              </div>
              <div className="py-6 text-center text-on-surface-variant/60 text-[11px]">
                「道途漫漫，历练传记正由天机阁实时编撰中」
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

export default HeroProfileScreen;

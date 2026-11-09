import React, { useEffect, useMemo, useState } from 'react';
import { Check, Image as ImageIcon, Link2, Sparkles, X } from 'lucide-react';
import {
  CHARACTER_SPRITE_OPTIONS,
  CHARACTER_SPRITE_MAP,
  type CharacterSpriteOption,
} from '../constants/characterSprites';

interface CharacterSpritePickerProps {
  /** 当前头像 / 立绘 URL */
  value: string;
  onChange: (value: string) => void;
  /** 区块标题，默认「头像 / 立绘」 */
  title?: string;
  /** 标题下方的辅助说明 */
  hint?: string;
  /** 预览框尺寸，compact 用于弹窗内的紧凑布局 */
  compact?: boolean;
}

const FACTION_STYLE: Record<CharacterSpriteOption['faction'], string> = {
  HERO: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  ENEMY: 'bg-red-500/15 text-red-300 border-red-500/30',
  DEFAULT: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const FACTION_LABEL: Record<CharacterSpriteOption['faction'], string> = {
  HERO: '我方',
  ENEMY: '敌方',
  DEFAULT: '通用',
};

/**
 * 头像 / 立绘选择器
 *
 * - 可以从 frontend/public/assets/combat/characters 的透明底基础立绘中直接点选
 * - 也保留手填 URL 的能力（兼容历史外链头像）
 * - 选中的 URL 会原样保存到 npc_templates.avatar
 */
export const CharacterSpritePicker: React.FC<CharacterSpritePickerProps> = ({
  value,
  onChange,
  title = '头像 / 立绘',
  hint = '从基础立绘库选择，或直接填写图片 URL；支持 /assets/... 与 https://...',
  compact = false,
}) => {
  const [previewError, setPreviewError] = useState(false);
  const [showGallery, setShowGallery] = useState(true);

  useEffect(() => {
    setPreviewError(false);
  }, [value]);

  const selectedSprite = CHARACTER_SPRITE_MAP[value] || null;
  const isCustomUrl = Boolean(value) && !selectedSprite;

  const selectedLabel = useMemo(() => {
    if (selectedSprite) return `${selectedSprite.name} · ${selectedSprite.subtitle}`;
    if (isCustomUrl) return '自定义图片 URL';
    return '尚未选择头像';
  }, [selectedSprite, isCustomUrl]);

  const previewSize = compact ? 'w-16 h-20' : 'w-24 h-32';

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0a0e16] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sky-300 font-bold">
            <ImageIcon className="w-4 h-4" />
            <span>{title}</span>
            {selectedSprite && (
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${FACTION_STYLE[selectedSprite.faction]}`}
              >
                {FACTION_LABEL[selectedSprite.faction]}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowGallery((prev) => !prev)}
          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-[11px] text-slate-300 transition"
        >
          {showGallery ? '收起立绘库' : `展开立绘库 (${CHARACTER_SPRITE_OPTIONS.length})`}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* 当前选中预览：透明立绘用 contain 完整展示，避免被裁掉头部/脚部 */}
        <div
          className={`${previewSize} shrink-0 rounded-xl border border-slate-700 bg-gradient-to-b from-slate-800/80 to-[#060a10] overflow-hidden flex items-center justify-center relative`}
        >
          {value && !previewError ? (
            <img
              src={value}
              alt={selectedLabel}
              className="w-full h-full object-contain p-1"
              onError={() => setPreviewError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-600">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px]">{previewError ? '图片加载失败' : '暂无头像'}</span>
            </div>
          )}
          {value && !previewError && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute top-1 right-1 p-0.5 rounded-md bg-black/60 hover:bg-red-500/80 text-slate-300 hover:text-white transition"
              title="清除头像"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/assets/combat/characters/... 或 https://..."
              className="flex-1 min-w-0 px-3 py-2 bg-[#121722] border border-slate-700 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-sky-400"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className={`truncate ${previewError ? 'text-red-400' : 'text-slate-500'}`}>
              {selectedLabel}
            </span>
            {isCustomUrl && (
              <span className="shrink-0 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                外链
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            头像会用于 NPC 列表、对话与名片；战斗待机立绘仍优先读取模板的 idle_avatar。
          </p>
        </div>
      </div>

      {showGallery && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400/80" />
            <span>基础立绘库</span>
            <span className="text-slate-600">（{CHARACTER_SPRITE_OPTIONS.length} 张）</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CHARACTER_SPRITE_OPTIONS.map((sprite) => {
              const active = value === sprite.url;
              return (
                <button
                  key={sprite.url}
                  type="button"
                  onClick={() => onChange(sprite.url)}
                  title={`${sprite.name} · ${sprite.subtitle}`}
                  className={`group relative rounded-xl border overflow-hidden text-left transition ${
                    active
                      ? 'border-sky-400 ring-2 ring-sky-400/30 bg-sky-500/10'
                      : 'border-slate-800 bg-[#060a10] hover:border-slate-600 hover:bg-slate-900'
                  }`}
                >
                  <div className="h-24 w-full flex items-center justify-center bg-gradient-to-b from-slate-800/50 to-[#060a10]">
                    <img
                      src={sprite.url}
                      alt={sprite.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain p-1 transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  <div className="px-2 py-1.5 border-t border-slate-800/80 bg-[#0b0f17]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-medium text-slate-200 truncate">
                        {sprite.name}
                      </span>
                      <span
                        className={`shrink-0 px-1 rounded border text-[9px] leading-4 ${FACTION_STYLE[sprite.faction]}`}
                      >
                        {FACTION_LABEL[sprite.faction]}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 truncate mt-0.5">{sprite.subtitle}</div>
                  </div>
                  {active && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default CharacterSpritePicker;

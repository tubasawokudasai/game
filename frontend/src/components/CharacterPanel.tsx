import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { getRequiredExpForLevel, calculateExpProgress } from '../constants/experience';

interface CharacterPanelProps {
  onOpenPlayerModal: (playerId?: string) => void;
  onShowNotice: (msg: string) => void;
}

export const CharacterPanel: React.FC<CharacterPanelProps> = ({
                                                                onOpenPlayerModal,
                                                                onShowNotice,
                                                              }) => {
  const navigate = useNavigate();
  const player = usePlayerStore((s) => s.player);
  const party = usePlayerStore((s) => s.party);

  // 严格从 store/player 读取真实数据，未配置字段不使用硬编码假数据
  const level = player?.level ?? 1;
  const nickname = player?.nickname || '无名修士';
  const sect = player?.sect || '';
  const title = player?.title || '';
  const combatPower = player?.combatPower ?? 0;

  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHp ?? 0;
  const mp = player?.mp ?? 0;
  const maxMp = player?.maxMp ?? 0;

  const hpPercent = maxHp > 0 ? Math.min(100, Math.max(0, Math.round((hp / maxHp) * 100))) : 0;
  const mpPercent = maxMp > 0 ? Math.min(100, Math.max(0, Math.round((mp / maxMp) * 100))) : 0;

  // 经验计算：优先使用后端权威下发的 maxExp，若无则使用统一经验公式
  const exp = player?.exp ?? 0;
  const maxExp = player?.maxExp ?? getRequiredExpForLevel(level);
  const expPercent = calculateExpProgress(exp, maxExp);

  // 货币与灵石
  const ingot = player?.ingot ?? 0;
  const silver = player?.silver ?? 0;
  const copper = player?.copper ?? 0;

  // VIP/赞助等级
  const vipLevel = (player as any)?.vip ?? (player as any)?.vipLevel;

  // 队伍阵法名
  const formationName = (player as any)?.formationName || '';

  // 出战队伍只来自玩家自己的队伍数据（usePlayerStore.party），
  // 与当前区域内的其他道友（PartyStatusBar / sceneStore.players）完全无关。
  const partyLeader = party.find((m) => m.isLeader || m.role === 'LEADER');
  const leaderAvatar = player?.avatar || '';

  // 队员：排除队长本人；主角永远作为出战队长单独渲染；休息中的伙伴不出现在出战卡片上
  const teammates = party.filter(
      (m) =>
          !(m.isLeader || m.role === 'LEADER') &&
          m.id !== player?.id &&
          m.id !== partyLeader?.id &&
          m.isActive !== false
  );

  // 出战人数以真实出战阵容为准（不含休息伙伴）；队伍数据未就绪时至少显示主角一人
  const partySize = Math.max(1, party.filter((m) => m.isActive !== false).length);

  return (
      <div className="col-span-5 h-full flex flex-col justify-between">
        {/* 玩家立绘与主要身位卡 */}
        <div className="rounded bg-gradient-to-b from-surface-container-high via-surface-container to-surface-container-low p-space-xs shadow-md">
          <div className="flex items-center gap-space-xs">
            {/* 头像 */}
            <div
                className="relative w-12 h-12 flex-shrink-0 cursor-pointer group"
                onClick={() => onOpenPlayerModal(player?.id)}
                title="查看侠客档案"
            >
              <div className="w-full h-full rounded overflow-hidden bg-surface-container-highest shadow-inner">
                {leaderAvatar ? (
                  <img
                      className="w-full h-full object-cover"
                      data-alt="主角修仙立绘"
                      src={leaderAvatar}
                      alt={nickname}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary font-bold text-base">
                    {nickname.slice(0, 1)}
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 bg-secondary-container text-on-secondary-container text-[9px] font-label-sm px-1 rounded shadow">
              Lv.{level}
            </span>
            </div>

            {/* 称号与名号 */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
              <span className="text-primary font-headline-sm text-[13px] truncate font-bold">
                {nickname}
              </span>
                {typeof vipLevel === 'number' && vipLevel > 0 && (
                    <span className="bg-primary-container text-on-primary-container text-[9px] font-data-metric px-1 rounded font-bold">
                  V{vipLevel}
                </span>
                )}
              </div>
              {(sect || title) && (
                  <span className="text-[10px] font-label-sm text-tertiary truncate">
                {[sect, title].filter(Boolean).join(' · ')}
              </span>
              )}
            </div>
          </div>

          {/* 出战队伍卡片 */}
          <div className="mt-space-xs p-1 rounded bg-surface-container-lowest/80 border border-outline-variant/30">
            <div className="flex items-center justify-between mb-0.5">
              <div
                className="flex items-center gap-1 cursor-pointer group hover:text-primary transition-colors"
                onClick={() => navigate('/party')}
                title="点击进入队伍整备（查看全部伙伴）"
              >
                <span className="material-symbols-outlined text-[12px] text-primary">groups</span>
                <span className="text-[9px] font-label-sm text-primary font-bold group-hover:underline">出战队伍</span>
                <span className="text-[8px] font-data-metric text-tertiary">
                  ({partySize}/4)
                </span>
                <span className="text-[8px] text-on-surface-variant/70 group-hover:text-primary">›</span>
              </div>
              {formationName && (
                  <span
                      className="text-[8px] font-label-sm text-on-surface-variant cursor-pointer hover:text-primary transition-colors"
                      onClick={() => onShowNotice(`当前阵法：${formationName}`)}
                  >
                {formationName} ›
              </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-1">
              {/* 出战队长（主角） */}
              <div
                  className="relative cursor-pointer group active:scale-95 transition-transform"
                  onClick={() => onOpenPlayerModal(player?.id)}
                  title={`出战队长【${nickname}】：点击查看侠客档案`}
              >
                <div className="w-7 h-7 rounded bg-surface-container-highest overflow-hidden p-[0.5px] border border-primary/50 group-hover:border-primary">
                  {leaderAvatar ? (
                    <img
                        className="w-full h-full object-cover rounded"
                        alt="队长头像"
                        src={leaderAvatar}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center rounded bg-surface-container-highest text-primary font-bold text-[11px]">
                      {nickname.slice(0, 1)}
                    </div>
                  )}
                </div>
                <span className="absolute -top-1 -right-1 bg-primary text-on-primary text-[7px] px-0.5 rounded font-bold leading-none py-0.2">
                阵
              </span>
              </div>

              {/* 真实出战队员列表 */}
              {teammates.map((tm, idx) => (
                  <div
                      key={(tm as any).id || idx}
                      className="relative cursor-pointer group active:scale-95 transition-transform"
                      onClick={() => onOpenPlayerModal(tm.id)}
                      title={`队员【${tm.name}】：点击查看侠客档案`}
                  >
                    <div className="w-7 h-7 rounded bg-surface-container-highest overflow-hidden p-[0.5px] border border-transparent group-hover:border-primary/60 transition-colors">
                      {tm.avatar ? (
                        <img
                            className="w-full h-full object-cover rounded"
                            alt={`队员头像 ${tm.name}`}
                            src={tm.avatar}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center rounded bg-surface-container-highest text-primary font-bold text-[11px]">
                          {(tm.name || '道').slice(0, 1)}
                        </div>
                      )}
                    </div>
                  </div>
              ))}

              {/* 队伍整备入口：查看全部伙伴并选择出战 / 休息 */}
              <button
                  type="button"
                  className="w-7 h-7 rounded border border-dashed border-outline/50 flex items-center justify-center text-outline hover:text-primary hover:border-primary transition-colors"
                  onClick={() => navigate('/party')}
                  title="队伍整备：查看全部伙伴并调整出战/休息"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
              </button>
            </div>
          </div>

          {/* 战力核心大字 */}
          <div className="mt-space-xs flex items-center justify-between px-space-xs py-0.5 rounded bg-surface-container-lowest">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-[14px]">swords</span>
              <span className="text-[10px] font-label-sm text-on-surface-variant">战力</span>
            </div>
            <span className="text-primary font-headline-md text-[15px] font-bold tracking-wide">
            {combatPower.toLocaleString()}
          </span>
          </div>

          {/* 核心气血与内力条 */}
          <div className="mt-space-xs space-y-1">
            {/* 气血 HP */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-data-metric">
                <span className="text-secondary">气血</span>
                <span className="text-secondary font-bold">
                {hp} / {maxHp}
              </span>
              </div>
              <div className="w-full h-2 rounded bg-surface-container-lowest overflow-hidden p-[1px]">
                <div
                    className="h-full bg-gradient-to-r from-secondary-container to-secondary rounded transition-all duration-300"
                    style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>

            {/* 内力 MP */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-data-metric">
                <span className="text-tertiary">内力</span>
                <span className="text-tertiary font-bold">
                {mp} / {maxMp}
              </span>
              </div>
              <div className="w-full h-2 rounded bg-surface-container-lowest overflow-hidden p-[1px]">
                <div
                    className="h-full bg-gradient-to-r from-on-tertiary-fixed-variant to-tertiary rounded transition-all duration-300"
                    style={{ width: `${mpPercent}%` }}
                />
              </div>
            </div>

            {/* 经验 EXP */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-data-metric">
                <span className="text-primary-fixed-dim">经验</span>
                <span className="text-primary-fixed-dim">
                  {maxExp > 0 ? `${exp.toLocaleString()} / ${maxExp.toLocaleString()}` : `${exp.toLocaleString()} (登峰造极)`}
                </span>
              </div>
              <div className="w-full h-1.5 rounded bg-surface-container-lowest overflow-hidden p-[0.5px]">
                <div
                    className="h-full bg-gradient-to-r from-primary-container to-primary rounded transition-all duration-300"
                    style={{ width: `${expPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 货币与灵石栏 */}
        <div className="rounded bg-surface-container-low p-space-xs space-y-1 text-[10px] font-data-metric shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-primary">
              <span className="material-symbols-outlined text-[13px]">paid</span>
              <span>元宝</span>
            </div>
            <span className="text-primary font-bold">{ingot.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-on-surface">
              <span className="material-symbols-outlined text-[13px]">monetization_on</span>
              <span>纹银</span>
            </div>
            <span className="text-on-surface">{silver.toLocaleString()} 两</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-on-surface-variant">
              <span className="material-symbols-outlined text-[13px]">toll</span>
              <span>铜钱</span>
            </div>
            <span className="text-on-surface-variant">{copper.toLocaleString()}</span>
          </div>
        </div>
      </div>
  );
};

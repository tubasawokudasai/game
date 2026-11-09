import React, { useState, useEffect } from 'react';
import { NpcEntity } from '../../../types/game';
import { wsManager } from '../../../hooks/useWebSocket';
import { MessageType, CombatAction } from '../../../types/ws';

interface EncounterModalProps {
  npc: NpcEntity | null;
  onClose: () => void;
  onShowNotice: (msg: string) => void;
}

export const EncounterModal: React.FC<EncounterModalProps> = ({
  npc,
  onClose,
  onShowNotice,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [countdown, setCountdown] = useState<number>(npc?.cooldownRemaining || 0);

  // 实时倒计时处理
  useEffect(() => {
    if (!npc) return;
    const initialCooldown = Number(npc.cooldownRemaining) || 0;
    setCountdown(initialCooldown);

    if (initialCooldown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [npc]);

  if (!npc) return null;

  const isOneTimeDefeated = npc.cooldownRemaining === -1;
  const isOnCooldown = countdown > 0;

  const enemies = npc.enemyPreview || [];
  // 单人遭遇没有 battleGroupId，只要服务端下发了敌方阵容即可开战
  const isConfigured = enemies.length > 0;
  const canFight = !isOneTimeDefeated && !isOnCooldown && isConfigured;

  const rewards = npc.battleReward || {};
  const hasItems = Array.isArray(rewards.items) && rewards.items.length > 0;

  const handleStartCombat = () => {
    if (!canFight || isStarting) return;

    if (!wsManager.isConnected()) {
      onShowNotice('尚未连接九州网络，无法拔剑迎战');
      return;
    }

    setIsStarting(true);
    onShowNotice(`气机锁定！正在向【${npc.name}】及其麾下阵容拔剑迎战……`);

    // 实时回合制遭遇战：服务端组装阵容后通过 PVE_START 下发
    const sent = wsManager.sendMessage(MessageType.COMBAT, CombatAction.PVE_START, {
      battleType: 'ENCOUNTER',
      npcId: npc.id,
    });

    if (!sent) {
      onShowNotice('神识传讯失败，无法入阵迎战');
      setIsStarting(false);
      return;
    }

    // 关闭遭遇弹窗，等待服务端下发战斗视口
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0c141e] border-2 border-primary/40 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-on-surface select-none">
        {/* 顶部强敌全息名帖栏 */}
        <div className="px-4 py-3 bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-high border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            {npc.avatar ? (
              <div className="w-12 h-12 rounded-lg border border-primary/50 overflow-hidden bg-surface shrink-0 shadow-md">
                <img
                  src={npc.avatar}
                  alt={npc.name}
                  className="w-full h-full object-cover"
                  onError={(e) => ((e.target as any).style.display = 'none')}
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-lg border border-primary/50 bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                <span className="material-symbols-outlined text-[24px]">swords</span>
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="font-headline-md font-bold text-primary tracking-wider truncate text-base">
                  {npc.name}
                </h2>
                {npc.badge && (
                  <span className="text-[10px] text-error border border-error/50 px-1 rounded-sm bg-error-container/20 shrink-0">
                    {npc.badge}
                  </span>
                )}
                {npc.battleLevel && (
                  <span className="text-[10px] text-tertiary border border-tertiary/40 px-1.5 py-0.2 rounded bg-tertiary-container/20 shrink-0 font-mono">
                    Lv.{npc.battleLevel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {npc.title || '江湖绝顶高手'} · 驻留于当前场景
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container-highest/60 hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* 主体内容 */}
        <div className="p-4 space-y-3.5 overflow-y-auto max-h-[75vh]">

          {/* 敌方阵容 (1~4 个多敌人槽位) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <div className="flex items-center space-x-1 font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary text-[15px]">groups</span>
                <span>迎战阵容 ({enemies.length > 0 ? `${enemies.length} 人登台` : ''})</span>
              </div>
              {npc.battleGroupName ? (
                <span className="text-[11px] text-primary/80 font-mono">
                  战队: {npc.battleGroupName}
                </span>
              ) : npc.battleMode === 'SOLO' ? (
                <span className="text-[11px] text-rose-300/90 font-mono">单人强敌</span>
              ) : null}
            </div>

            {enemies.length === 0 ? (
              <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/20 text-center text-xs text-on-surface-variant">
                阵容探查中，点击开战即可见敌阵真容……
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {enemies.map((enemy, idx) => (
                  <div
                    key={enemy.id || idx}
                    className="p-2 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col items-center justify-between relative overflow-hidden group shadow-sm"
                  >
                    {enemy.isBoss && (
                      <span className="absolute top-1 right-1 text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                        头领
                      </span>
                    )}

                    <div className="w-11 h-11 rounded-lg overflow-hidden border border-outline-variant/40 bg-surface shrink-0 mt-1">
                      {enemy.avatar ? (
                        <img
                          src={enemy.avatar}
                          alt={enemy.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as any).style.display = 'none')}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary/60 text-xs">
                          敌
                        </div>
                      )}
                    </div>

                    <div className="text-center w-full mt-1.5 space-y-0.5">
                      <div className="font-bold text-xs text-on-surface truncate">
                        {enemy.name}
                      </div>
                      <div className="flex items-center justify-center space-x-1">
                        <span
                          className={`text-[9px] px-1 rounded ${
                            enemy.position === 'BACK'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {enemy.position === 'BACK' ? '后排' : '前排'}
                        </span>
                      </div>
                      {enemy.hp > 0 && (
                        <div className="text-[10px] font-mono text-primary/90">
                          HP {enemy.hp.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 胜利战利品悬赏预览 */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/20 space-y-2">
            <div className="flex items-center space-x-1 text-xs font-bold text-primary">
              <span className="material-symbols-outlined text-[15px]">card_giftcard</span>
              <span>胜利悬赏</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {rewards.exp ? (
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 font-mono text-[11px]">
                  修为经验 +{rewards.exp}
                </span>
              ) : null}

              {rewards.gold ? (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono text-[11px]">
                  铜钱 +{rewards.gold}
                </span>
              ) : null}

              {rewards.silver ? (
                <span className="px-2 py-0.5 rounded bg-slate-400/10 text-slate-200 border border-slate-400/30 font-mono text-[11px]">
                  纹银 +{rewards.silver}
                </span>
              ) : null}

              {hasItems &&
                rewards.items!.map((it) => (
                  <span
                    key={it.id}
                    className="px-2 py-0.5 rounded bg-tertiary-container/20 text-tertiary border border-tertiary/40 font-mono text-[11px]"
                  >
                    {it.name} ×{it.count}
                  </span>
                ))}

              {!rewards.exp && !rewards.gold && !rewards.silver && !hasItems && (
                <span className="text-on-surface-variant text-[11px]">
                  挑战得胜可获江湖声望与切磋心得
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-4 py-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-medium transition"
          >
            暂避锋芒
          </button>

          <button
            type="button"
            onClick={handleStartCombat}
            disabled={!canFight || isStarting}
            className="px-6 py-2 rounded-lg bg-primary hover:bg-primary-fixed text-on-primary font-bold text-xs tracking-wider transition shadow-lg shadow-primary/20 disabled:opacity-40 disabled:pointer-events-none flex items-center space-x-1.5"
          >
            {isStarting ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                <span>神识凝阵中...</span>
              </>
            ) : !isConfigured ? (
              <span>阵容未配置</span>
            ) : isOneTimeDefeated ? (
              <span>已诛灭道消</span>
            ) : isOnCooldown ? (
              <span>调息冷却中 ({countdown}s)</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">swords</span>
                <span>拔 剑 迎 战</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

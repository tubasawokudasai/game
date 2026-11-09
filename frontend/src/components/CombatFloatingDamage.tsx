import React, { useState } from 'react';
import { useWsEvent } from '../hooks/useWebSocket';
import {
  MessageType,
  CombatAction,
  CombatDamagePayload,
  CombatHealPayload,
} from '../types/ws';

interface FloatingNumber {
  id: string;
  text: string;
  type: 'damage' | 'crit' | 'heal';
  xOffset: number; // 随机轻微横向偏移
  subtitle?: string;
}

/**
 * 独立战斗飘字组件 (CombatFloatingDamage)
 *
 * 核心设计：
 * 依托统一 WebSocket 事件总线 `useWsEvent`，完全解耦自业务视图。
 * 只要场景内有任何战斗、技能、受击广播涌入，便能纯响应式捕捉并渲染飘字视效。
 */
export const CombatFloatingDamage: React.FC = () => {
  const [floatings, setFloatings] = useState<FloatingNumber[]>([]);

  // 1. 订阅战斗伤害飘字流
  useWsEvent<CombatDamagePayload>(
    MessageType.COMBAT,
    CombatAction.COMBAT_DAMAGE,
    (payload) => {
      const id = `dmg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isCrit = Boolean(payload.isCrit);
      const text = isCrit ? `暴击 -${payload.damage}` : `-${payload.damage}`;
      const subtitle = payload.skillName
        ? `【${payload.skillName}】`
        : payload.targetName
        ? `命中 ${payload.targetName}`
        : undefined;

      const item: FloatingNumber = {
        id,
        text,
        type: isCrit ? 'crit' : 'damage',
        xOffset: (Math.random() - 0.5) * 120,
        subtitle,
      };

      setFloatings((prev) => [...prev.slice(-10), item]);

      // 1.8 秒后淡出消逝
      setTimeout(() => {
        setFloatings((prev) => prev.filter((f) => f.id !== id));
      }, 1800);
    }
  );

  // 2. 订阅战斗治疗/回春流
  useWsEvent<CombatHealPayload>(
    MessageType.COMBAT,
    CombatAction.COMBAT_HEAL,
    (payload) => {
      const id = `heal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const item: FloatingNumber = {
        id,
        text: `+${payload.amount}`,
        type: 'heal',
        xOffset: (Math.random() - 0.5) * 80,
        subtitle: payload.sourceName ? `来自 ${payload.sourceName}` : '回春术',
      };

      setFloatings((prev) => [...prev.slice(-10), item]);

      setTimeout(() => {
        setFloatings((prev) => prev.filter((f) => f.id !== id));
      }, 1800);
    }
  );

  if (floatings.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {floatings.map((item) => {
        const isCrit = item.type === 'crit';
        const isHeal = item.type === 'heal';

        return (
          <div
            key={item.id}
            style={{
              transform: `translateX(${item.xOffset}px)`,
            }}
            className="absolute flex flex-col items-center animate-bounce transition-all duration-1000 ease-out"
          >
            {item.subtitle && (
              <span className="text-[11px] font-serif text-amber-200/90 drop-shadow-md">
                {item.subtitle}
              </span>
            )}
            <span
              className={`font-black tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none font-serif ${
                isCrit
                  ? 'text-3xl text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] scale-110'
                  : isHeal
                  ? 'text-2xl text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : 'text-2xl text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]'
              }`}
            >
              {item.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};

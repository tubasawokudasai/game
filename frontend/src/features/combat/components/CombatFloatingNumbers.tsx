import React, { useEffect } from 'react';
import { useCombatStore } from '../store/useCombatStore';

export const CombatFloatingNumbers: React.FC = () => {
  const { floatingList, removeFloating } = useCombatStore();

  useEffect(() => {
    if (floatingList.length === 0) return;

    const timer = setTimeout(() => {
      floatingList.forEach((item) => removeFloating(item.id));
    }, 1800);

    return () => clearTimeout(timer);
  }, [floatingList, removeFloating]);

  if (floatingList.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center font-serif">
      {floatingList.map((item) => {
        const isCrit = item.isCrit;
        const isHeal = Boolean(item.heal);
        // 敌方在左半区受击，我方在右半区受击
        const sideClass = item.camp === 'PLAYER' ? 'right-[20%] top-[34%]' : 'left-[22%] top-[34%]';

        return (
          <div
            key={item.id}
            className={`absolute ${sideClass} flex flex-col items-center animate-bounce-slow`}
          >
            {/* 暴击主数值 (如截图: 暴击 8,640！) */}
            <span
              className={`font-black select-none tracking-wider ${
                isCrit
                  ? 'text-3xl text-amber-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)] stroke-black scale-110'
                  : isHeal
                  ? 'text-2xl text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                  : 'text-2xl text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'
              }`}
            >
              {item.text || `-${item.damage}`}
            </span>

            {/* 副标题或阴煞附带伤害 (如截图: -320 阴煞) */}
            {item.subtitle && (
              <span className="text-sm font-bold text-red-500/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mt-0.5">
                {item.subtitle}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

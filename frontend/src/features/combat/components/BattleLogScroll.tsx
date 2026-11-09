import React from 'react';
import { useCombatStore } from '../store/useCombatStore';

export const BattleLogScroll: React.FC = () => {
  const { actionLogs } = useCombatStore();
  const latestLog = actionLogs[actionLogs.length - 1];

  return (
    <div className="relative w-full px-3 py-1 pointer-events-none select-none z-30 font-serif">
      {/* 国风玉简卷轴外框 */}
      <div className="relative mx-auto max-w-lg rounded-sm border border-emerald-700/60 bg-[#162a26]/90 shadow-[0_4px_12px_rgba(0,0,0,0.6)] backdrop-blur-sm overflow-hidden py-2 px-4 flex items-center">
        {/* 左侧卷轴轴头饰件 */}
        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-emerald-800 via-amber-600/70 to-emerald-900 border-r border-amber-500/40" />

        {/* 播报文本 */}
        <div className="pl-3 flex-1 flex items-center text-xs tracking-wide">
          <p className="text-emerald-100 font-medium leading-relaxed drop-shadow">
            {latestLog ? (
              <>
                <span className="text-amber-300 font-bold mr-1">
                  {latestLog.text.split(' ')[0]}
                </span>
                <span>{latestLog.text.substring(latestLog.text.indexOf(' ') + 1)}</span>
              </>
            ) : (
              '[战局平稳] 气机锁定，静候决胜机缘……'
            )}
          </p>
        </div>

        {/* 右侧卷轴轴头饰件 */}
        <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-gradient-to-l from-emerald-800 via-amber-600/70 to-emerald-900 border-l border-amber-500/40" />
      </div>
    </div>
  );
};

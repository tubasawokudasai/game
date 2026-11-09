import React from 'react';

interface ToastProps {
  message: string;
  title?: string;
  visible: boolean;
}

/**
 * 全局浮层通知组件 (Toast)
 * 用于展示修为突破、灵石增减、组队状态与系统传书提示
 *
 * 轻量级、fixed 悬浮、不占据页面布局；支持可选标题，
 * 玩家升级通知会以「标题 + 内容」的形式展示。
 */
export const Toast: React.FC<ToastProps> = ({ message, title, visible }) => {
  return (
    <div
      className={`fixed top-14 left-1/2 -translate-x-1/2 z-[100] max-w-[calc(100%-2rem)] px-4 py-2.5 rounded bg-surface-container-highest/95 text-primary shadow-xl transition-all duration-300 flex items-start gap-2 border border-primary/30 pointer-events-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">auto_awesome</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? (
          <span className="font-headline-sm text-sm font-bold tracking-wide text-primary">
            {title}
          </span>
        ) : null}
        <span className="text-sm tracking-wide break-words">{message}</span>
      </div>
    </div>
  );
};

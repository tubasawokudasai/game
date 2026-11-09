import React from 'react';
import { useNavigate } from 'react-router-dom';

interface MainTabNavigationProps {
  activeTab: 'person' | 'facility' | 'travel' | 'menu';
}

/**
 * 底部四大核心主导航栏 (MainTabNavigation)
 * 路由：人物(/), 设施(/facility), 移动(/travel), 功能(/features)
 */
export const MainTabNavigation: React.FC<MainTabNavigationProps> = ({ activeTab }) => {
  const navigate = useNavigate();

  const tabs = [
    { id: 'person', label: '人物', icon: 'person', path: '/' },
    { id: 'facility', label: '设施', icon: 'apartment', path: '/facility' },
    { id: 'travel', label: '移动', icon: 'navigation', path: '/travel' },
    { id: 'menu', label: '功能', icon: 'widgets', path: '/features' },
  ] as const;

  return (
    <section className="mx-space-md mt-space-xs grid grid-cols-4 gap-space-xs z-10">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.path)}
            className={`py-2 px-1 rounded flex items-center justify-center gap-1 transition-all text-center select-none ${
              isActive
                ? 'bg-secondary-container text-on-secondary-container shadow font-bold ring-1 ring-secondary/50'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className={`material-symbols-outlined text-[16px] ${isActive ? '' : 'text-primary'}`}>
              {tab.icon}
            </span>
            <span className="font-headline-sm text-[13px]">{tab.label}</span>
          </button>
        );
      })}
    </section>
  );
};

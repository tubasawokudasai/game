import React, { useState } from 'react';
import { useWsEvent } from '../hooks/useWebSocket';
import { usePlayerStore } from '../store/usePlayerStore';
import {
    MessageType,
    NoticeAction,
    NoticePayload,
    MailAction,
    MailNewPayload,
} from '../types/ws';

interface NoticeItem {
    id: string;
    content: string;
    level: 'info' | 'warning' | 'broadcast' | 'urgent';
    type: 'notice' | 'mail';
}

/**
 * 独立系统公告跑马灯组件 (SystemNoticeBanner)
 *
 * 核心设计：
 * - 纯响应式订阅 `MessageType.NOTICE` 与 `MessageType.MAIL` 事件流。
 * - fixed 悬浮定位，不挤压主布局。
 * - 点击邮件类通知时直接打开信箱弹窗查看详情。
 */
export const SystemNoticeBanner: React.FC = () => {
    const [currentNotice, setCurrentNotice] = useState<NoticeItem | null>(null);
    const setMailModalOpen = usePlayerStore((s) => s.setMailModalOpen);

    // 系统公告/大区跑马灯共用展示逻辑
    const showSystemNotice = (payload: NoticePayload) => {
        if (!payload?.content) return;
        const item: NoticeItem = {
            id: payload.id || `notice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            content: payload.content,
            level: payload.level || 'broadcast',
            type: 'notice',
        };
        setCurrentNotice(item);

        const duration = payload.duration || 6000;
        setTimeout(() => {
            setCurrentNotice((prev) => (prev?.id === item.id ? null : prev));
        }, duration);
    };

    // 1. 订阅系统公告与切磋/大区跑马灯
    useWsEvent<NoticePayload>(
        MessageType.NOTICE,
        NoticeAction.SYSTEM_ANNOUNCEMENT,
        showSystemNotice
    );
    useWsEvent<NoticePayload>(
        MessageType.NOTICE,
        NoticeAction.MARQUEE,
        showSystemNotice
    );

    // 2. 订阅新邮件精准私发事件，提供修仙飞鸽提示
    useWsEvent<MailNewPayload>(
        MessageType.MAIL,
        MailAction.MAIL_NEW,
        (payload) => {
            const item: NoticeItem = {
                id: `mail_notify_${Date.now()}`,
                content: `【飞鸽传书】收到来自玩家「${payload.senderName || '未知道友'}」的信笺：《${payload.title}》！`,
                level: 'info',
                type: 'mail',
            };
            setCurrentNotice(item);

            setTimeout(() => {
                setCurrentNotice((prev) => (prev?.id === item.id ? null : prev));
            }, 5000);
        }
    );

    if (!currentNotice) return null;

    // 点击横幅的处理：如果是邮件类型通知，唤起信箱弹窗并关闭当前通知条
    const handleBannerClick = () => {
        if (currentNotice.type === 'mail') {
            setMailModalOpen(true);
            setCurrentNotice(null);
        }
    };

    return (
        <aside
            aria-live="polite"
            className="fixed top-2 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
        >
            <div
                className={`pointer-events-auto flex w-full max-w-lg items-center gap-2 overflow-hidden rounded-lg bg-surface-container-high/95 px-3 py-1.5 shadow-xl border border-amber-500/40 backdrop-blur-md animate-fadeIn ${
                    currentNotice.type === 'mail' ? 'cursor-pointer hover:border-amber-400 hover:bg-surface-container-highest transition-all' : ''
                }`}
                onClick={handleBannerClick}
                title={currentNotice.type === 'mail' ? '点击查看传书信件' : undefined}
            >
        <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0 animate-pulse">
          campaign
        </span>
                <div className="flex-1 overflow-hidden">
                    <p className="truncate font-serif text-xs text-amber-200 tracking-wide select-none">
                        {currentNotice.content}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation(); // 阻止冒泡，避免关闭时误触发打开信箱
                        setCurrentNotice(null);
                    }}
                    className="text-on-surface-variant hover:text-on-surface text-[14px] ml-1 shrink-0 transition-colors p-1"
                    title="关闭"
                >
                    ✕
                </button>
            </div>
        </aside>
    );
};
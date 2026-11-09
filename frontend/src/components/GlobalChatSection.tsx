import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { ChatChannel, ChatMessage } from '../types/game';
import { wsManager, useWsStatus } from '../hooks/useWebSocket';
import { MessageType, ChatAction } from '../types/ws';

interface GlobalChatSectionProps {
  onShowNotice: (msg: string) => void;
}

/**
 * 全局千里传音聊天组件 (GlobalChatSection)
 * 纯动态数据驱动：完全移除写死假数据，接收实时推流并在无消息时展示空态
 */
export const GlobalChatSection: React.FC<GlobalChatSectionProps> = ({ onShowNotice }) => {
  const messages = useChatStore((s) => s.messages);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const addMessage = useChatStore((s) => s.addMessage);

  const player = usePlayerStore((s) => s.player);
  const [inputText, setInputText] = useState<string>('');
  const isWsConnected = useWsStatus();

  const channels: Array<{ key: ChatChannel; name: string }> = [
    { key: 'all', name: '综合' },
    { key: 'world', name: '世界' },
    { key: 'sect', name: '门派' },
    { key: 'trade', name: '商会' },
    { key: 'system', name: '系统' },
  ];

  const handleSend = () => {
    if (!inputText.trim()) return;

    const channel = activeChannel === 'all' ? 'world' : activeChannel;
    const text = inputText.trim();

    // 1. 通过 WebSocketManager 发送统一协议报文 (主模块 CHAT, 指令 CHAT_SEND)
    const isSent = wsManager.sendMessage(
      MessageType.CHAT,
      ChatAction.CHAT_SEND,
      {
        text,
        channel,
        senderId: player?.id,
        senderName: player?.nickname || '无名散修',
        senderRealm: player?.realm || '',
      }
    );

    if (isSent) {
      setInputText('');
      onShowNotice('传音玉符已激发，仙音四海皆闻！');
    } else {
      // 2. 长连接暂未连通时的本地兜底逻辑
      const fallbackMsg: ChatMessage = {
        id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        channel,
        senderId: player?.id,
        senderName: player?.nickname || '无名散修',
        text,
        timestamp: Date.now(),
        timeFormatted: '刚刚 (本地)',
      };
      addMessage(fallbackMsg);
      setInputText('');
      onShowNotice('传音法阵连通中，灵讯暂录于随身玉简。');
    }
  };

  const filteredMessages = messages.filter(
    (m) => activeChannel === 'all' || m.channel === activeChannel
  );

  return (
    <div className="flex flex-col">
      <section className="mx-space-md mt-space-xs rounded bg-surface-container-low p-space-xs flex flex-col shadow-lg border border-outline-variant/20">
        {/* 频道切换与长连接法阵状态 */}
        <div className="flex items-center justify-between gap-1 pb-1">
          <div className="flex items-center gap-1 overflow-x-auto">
            {channels.map((ch) => (
              <button
                key={ch.key}
                type="button"
                onClick={() => setActiveChannel(ch.key)}
                className={`px-2 py-0.5 rounded text-[11px] font-label-sm flex-shrink-0 transition-colors ${
                  activeChannel === ch.key
                    ? 'bg-secondary-container text-on-secondary-container font-bold ring-1 ring-secondary/40'
                    : 'bg-surface-container text-on-surface-variant hover:text-primary'
                }`}
              >
                {ch.name}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-serif shrink-0 bg-surface-container/60 border border-outline-variant/30 text-on-surface-variant"
            title={isWsConnected ? '场景长连接已就绪' : '长连接连通中'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isWsConnected ? '已连接' : '连通中'}</span>
          </div>
        </div>

        {/* 动态滚动记录 */}
        <div className="h-32 sm:h-36 overflow-y-auto space-y-1.5 pr-1 text-[11px] font-body-sm flex flex-col justify-end">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/60 py-4">
              <span className="material-symbols-outlined text-[20px] mb-1 opacity-40">forum</span>
              <span className="text-[10px]">「当前频道暂无千里传音」</span>
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div key={msg.id} className="p-1 rounded bg-surface-container flex items-start gap-1">
                <span
                  className={`text-[9px] font-label-sm px-1 py-0.2 rounded font-bold flex-shrink-0 mt-0.5 ${
                    msg.channel === 'system'
                      ? 'bg-error-container text-on-error-container'
                      : msg.channel === 'world'
                      ? 'bg-primary-container text-on-primary-container'
                      : msg.channel === 'local'
                      ? 'bg-tertiary-container text-on-tertiary-container'
                      : 'bg-secondary-container text-on-secondary-container'
                  }`}
                >
                  {msg.channel === 'system'
                    ? '系统'
                    : msg.channel === 'world'
                    ? '世界'
                    : msg.channel === 'local'
                    ? '区域'
                    : msg.channel === 'sect'
                    ? '门派'
                    : '商会'}
                </span>
                <div className="leading-snug">
                  <span
                    className="text-primary font-semibold cursor-pointer hover:underline"
                    onClick={() => onShowNotice(`传音交互: ${msg.senderName}`)}
                  >
                    {msg.senderName}:
                  </span>
                  <span className="text-on-surface ml-1">{msg.text}</span>
                  {msg.timeFormatted && (
                    <span className="text-on-surface-variant text-[9px] ml-1">
                      {msg.timeFormatted}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 传音输入 */}
      <section className="mx-space-md mt-space-xs rounded bg-surface-container-high p-space-xs flex items-center gap-space-xs shadow-md mb-2 border border-outline-variant/30">
        <button
          type="button"
          onClick={() => onShowNotice('快捷指令：支持快速求组、切磋、送礼与坐标发送。')}
          className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
        </button>
        <button
          type="button"
          onClick={() => setInputText((prev) => prev + '【抱拳】')}
          className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary-fixed-dim active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[18px]">mood</span>
        </button>
        <div className="flex-1 bg-surface-container-lowest rounded px-2 py-1 flex items-center border border-outline-variant/20">
          <input
            className="w-full bg-transparent text-[11px] font-body-sm text-on-surface placeholder:text-outline focus:outline-none"
            placeholder="输入千里传音内容..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          className="px-3 py-1.5 rounded bg-secondary-container text-on-secondary-container hover:bg-secondary font-headline-sm text-[12px] font-bold active:scale-95 transition-transform flex items-center gap-0.5 shadow"
        >
          <span>传音</span>
          <span className="material-symbols-outlined text-[14px]">send</span>
        </button>
      </section>
    </div>
  );
};

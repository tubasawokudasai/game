import { create } from 'zustand';
import { ChatMessage, ChatChannel } from '../types/game';

interface ChatState {
  messages: ChatMessage[];
  activeChannel: ChatChannel;
  addMessage: (msg: ChatMessage) => void;
  setActiveChannel: (channel: ChatChannel) => void;
  clearMessages: () => void;
}

/**
 * 全局传音聊天 Store (Zustand)
 * 纯动态数据：初始空消息列表，通过 WebSocket / MapDO 广播实时推流填入
 */
export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  activeChannel: 'all',

  addMessage: (msg) =>
    set((state) => {
      if (state.messages.some((m) => m.id === msg.id)) {
        return state;
      }
      return {
        // 保留最近 100 条实时传音记录
        messages: [...state.messages.slice(-99), msg],
      };
    }),

  setActiveChannel: (channel) => set({ activeChannel: channel }),

  clearMessages: () => set({ messages: [] }),
}));

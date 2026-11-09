/**
 * 对话与剧情状态类型定义
 *
 * 唯一真源位于 game/models/dialogue.ts（前后端共享协议）。
 * 这里只做纯类型转出，避免把 zod 运行时依赖打进前端产物。
 */
export type {
  DialogueCondition,
  DialogueAction,
  OptionStyleType,
  DialogueOptionViewModel,
  DialoguePage,
  DialoguePageViewModel,
  DialogueRenderPayload,
  DialogueInteractResult,
} from '../../../game/models/dialogue';

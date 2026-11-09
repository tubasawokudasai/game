/**
 * 战斗协议类型：唯一真源位于 game/models/combat.ts（前后端共享）
 * 这里只做纯类型转出，避免把服务端实现打进前端包。
 */
export type {
  CombatCamp,
  CombatFighter,
  CombatBuff,
  CombatSkill,
  CombatActionLog,
  CombatInitOptions,
  CombatScriptEvent,
} from '../../../game/models/combat';

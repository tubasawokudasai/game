export * from '../../../../game/models/combat';

export type CombatPhase = 
  | 'INTRO'        // 入场喊话阶段
  | 'READY'        // 等待玩家选技能/目标
  | 'SELECT_TARGET'// 已选技能，等待选择目标
  | 'ANIMATING'    // 动画播放中 (冲刺/斩击/受击/飘字)
  | 'SETTLEMENT';  // 胜负结算展示

import { prepareCombat, settleCombat, prepareEncounterCombat, settleEncounterCombat } from '../db/combatDb';

export const combatService = {
  prepareCombat(db: D1Database, playerId: string, monsterGroupId: string) {
    return prepareCombat(db, playerId, monsterGroupId);
  },

  settleCombat(
    db: D1Database,
    playerId: string,
    monsterGroupId: string,
    winNodeId?: string,
    loseNodeId?: string
  ) {
    return settleCombat(db, playerId, monsterGroupId, winNodeId, loseNodeId);
  },

  prepareEncounterCombat(db: D1Database, playerId: string, npcId: string) {
    return prepareEncounterCombat(db, playerId, npcId);
  },

  settleEncounterCombat(db: D1Database, playerId: string, npcId: string) {
    return settleEncounterCombat(db, playerId, npcId);
  },
};

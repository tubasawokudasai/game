import { Env } from '../../models/env';
import { DialogueEngine } from './DialogueEngine';

export const dialogueService = {
  async startDialogue(
    env: Env,
    playerId: string,
    npcId?: string,
    nodeId?: string
  ) {
    const engine = new DialogueEngine(env.DB, env);
    if (nodeId) {
      // 直接进入剧情节点：必须通过位置 / 白名单 / 前置 Flag 三重校验
      const ctx = await engine.assertNodeEntry(playerId, nodeId);
      return engine.renderNode(nodeId, ctx);
    }
    return engine.startDialogue(playerId, npcId!);
  },

  async advanceDialogue(
    env: Env,
    playerId: string,
    currentNodeId: string
  ) {
    const engine = new DialogueEngine(env.DB, env);
    return engine.advanceDialogue(playerId, currentNodeId);
  },

  async selectOption(
    env: Env,
    playerId: string,
    currentNodeId: string,
    optionId: string
  ) {
    const engine = new DialogueEngine(env.DB, env);
    return engine.selectOption(playerId, currentNodeId, optionId);
  },
};

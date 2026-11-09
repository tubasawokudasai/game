import { Env } from '../models/env';

export const casinoService = {
  /**
   * 获取赌场当前期数盘面状态
   */
  async getStatus(env: Env): Promise<Response> {
    const doId = env.CASINO_DO.idFromName('global_casino');
    const casinoStub = env.CASINO_DO.get(doId);
    return casinoStub.fetch('http://do/status');
  },

  /**
   * 玩家下注业务编排
   */
  async placeBet(
    env: Env,
    playerId: string,
    betType: string,
    amount: number
  ): Promise<Response> {
    const player = await env.DB.prepare('SELECT nickname FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ nickname: string }>();

    if (!player) {
      return new Response(JSON.stringify({ error: '修仙者角色不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const doId = env.CASINO_DO.idFromName('global_casino');
    const casinoStub = env.CASINO_DO.get(doId);

    return casinoStub.fetch('http://do/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        playerName: player.nickname,
        betType,
        amount,
      }),
    });
  },
};

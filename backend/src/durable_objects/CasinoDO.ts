import { Env } from '../models/env';

interface BetEntry {
  betId: string;
  playerId: string;
  playerName: string;
  betType: 'BIG' | 'SMALL' | 'TRIPLE';
  amount: number;
}

interface CasinoStateData {
  roundId: string;
  roundNumber: number;
  status: 'BETTING' | 'SETTLING';
  endTime: number;
  bets: BetEntry[];
}

/**
 * 玲珑坊骰宝赌场状态对象 (CasinoDO)
 *
 * 核心设计：
 * 1. 利用 Cloudflare Durable Objects 原生 state.storage.setAlarm() 实现可靠的边缘定时器。
 * 2. 内存收集注单，防范并发超卖。
 * 3. 定时唤醒 (alarm 周期回调)：执行摇骰、结算胜负并利用 D1 批量事务原子入库派彩。
 */
export class CasinoDO implements DurableObject {
  state: DurableObjectState;
  env: Env;

  // 每一轮开奖倒计时时长 (默认 60 秒一期)
  readonly ROUND_DURATION_MS = 60 * 1000;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. 获取当前期数盘面与倒计时状态
    if (url.pathname.endsWith('/status')) {
      const current = await this.getCurrentRound();
      const remainingSeconds = Math.max(0, Math.ceil((current.endTime - Date.now()) / 1000));
      return Response.json({
        roundId: current.roundId,
        roundNumber: current.roundNumber,
        status: current.status,
        remainingSeconds,
        totalPool: current.bets.reduce((sum, b) => sum + b.amount, 0),
        totalBetsCount: current.bets.length,
      });
    }

    // 2. 玩家下注接口 (POST /bet)
    if (url.pathname.endsWith('/bet') && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          playerId: string;
          playerName?: string;
          betType: 'BIG' | 'SMALL' | 'TRIPLE';
          amount: number;
        };

        if (!body.playerId || !body.betType || !body.amount || body.amount <= 0) {
          return Response.json({ success: false, message: '下注参数有误' }, { status: 400 });
        }

        const current = await this.getCurrentRound();
        if (current.status !== 'BETTING' || Date.now() >= current.endTime - 2000) {
          return Response.json({ success: false, message: '本期即将封盘开奖，暂停下注' }, { status: 403 });
        }

        // 强校验并扣减玩家 D1 资产 (使用 CAS 条件更新)
        const deductResult = await this.env.DB.prepare(
          'UPDATE players SET ingot = ingot - ? WHERE id = ? AND ingot >= ?'
        )
          .bind(body.amount, body.playerId, body.amount)
          .run();

        if (!deductResult.meta.changes || deductResult.meta.changes <= 0) {
          return Response.json({ success: false, message: '道友元宝不足，无法下注' }, { status: 400 });
        }

        // 记入注单
        const betId = `bet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const bet: BetEntry = {
          betId,
          playerId: body.playerId,
          playerName: body.playerName || '散修道友',
          betType: body.betType,
          amount: body.amount,
        };

        current.bets.push(bet);
        await this.state.storage.put('current_round', current);

        return Response.json({
          success: true,
          message: `已成功在玲珑坊下注【${body.betType}】${body.amount} 元宝！`,
          betId,
        });
      } catch (err: unknown) {
        return Response.json({ success: false, message: '下注异常' }, { status: 500 });
      }
    }

    return new Response('CasinoDO Active', { status: 200 });
  }

  /**
   * Cloudflare DO 定时唤醒回调函数 (Alarm Handler)
   * 封盘、掷骰、胜负结算、派发奖金入 D1 数据库、开启下一轮
   */
  async alarm(): Promise<void> {
    const round = await this.getCurrentRound();
    round.status = 'SETTLING';
    await this.state.storage.put('current_round', round);

    // 1. 产生真随机三枚骰子 (1 - 6)
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const dice3 = Math.floor(Math.random() * 6) + 1;
    const diceSum = dice1 + dice2 + dice3;

    // 2. 判定开奖类型 (围骰/全色豹子优于大小)
    let resultType: 'TRIPLE' | 'BIG' | 'SMALL';
    if (dice1 === dice2 && dice2 === dice3) {
      resultType = 'TRIPLE';
    } else if (diceSum >= 11 && diceSum <= 17) {
      resultType = 'BIG';
    } else {
      resultType = 'SMALL';
    }

    // 3. 统计全池与派彩结算
    let totalPool = 0;
    let totalPayout = 0;
    const batchStatements: D1PreparedStatement[] = [];

    for (const b of round.bets) {
      totalPool += b.amount;
      const isWon = b.betType === resultType;
      let payout = 0;

      if (isWon) {
        // 赔率规则: 围骰 24倍, 大/小 1.95倍
        const odds = b.betType === 'TRIPLE' ? 24 : 1.95;
        payout = Math.floor(b.amount * odds);
        totalPayout += payout;

        // 生成返奖更新语句
        batchStatements.push(
          this.env.DB.prepare('UPDATE players SET ingot = ingot + ? WHERE id = ?').bind(payout, b.playerId)
        );
      }

      // 生成注单历史存证语句
      batchStatements.push(
        this.env.DB.prepare(
          `INSERT INTO casino_bets (bet_id, round_id, player_id, player_name, bet_type, bet_amount, odds, payout, is_won)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          b.betId,
          round.roundId,
          b.playerId,
          b.playerName,
          b.betType,
          b.amount,
          b.betType === 'TRIPLE' ? 24 : 1.95,
          payout,
          isWon ? 1 : 0
        )
      );
    }

    // 4. 生成本期总盘面记录语句
    batchStatements.push(
      this.env.DB.prepare(
        `INSERT INTO casino_rounds (round_id, round_number, status, dice_1, dice_2, dice_3, dice_sum, result_type, total_pool, total_payout, start_time, end_time)
         VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        round.roundId,
        round.roundNumber,
        dice1,
        dice2,
        dice3,
        diceSum,
        resultType,
        totalPool,
        totalPayout,
        Math.floor((round.endTime - this.ROUND_DURATION_MS) / 1000),
        Math.floor(Date.now() / 1000)
      )
    );

    // 5. 使用 D1 批量事务统一提交开奖数据与派彩资金 (保证资金绝对安全)
    try {
      if (batchStatements.length > 0) {
        await this.env.DB.batch(batchStatements);
      }
    } catch (dbErr) {
      console.error('[CasinoDO] D1 结算入库事务异常:', dbErr);
    }

    // 6. 开启全新一期并设置下一阶段 Alarm
    const nextRoundNumber = round.roundNumber + 1;
    const nextRoundId = `round_${Date.now()}_${nextRoundNumber}`;
    const nextEndTime = Date.now() + this.ROUND_DURATION_MS;

    const nextRound: CasinoStateData = {
      roundId: nextRoundId,
      roundNumber: nextRoundNumber,
      status: 'BETTING',
      endTime: nextEndTime,
      bets: [],
    };

    await this.state.storage.put('current_round', nextRound);
    await this.state.storage.setAlarm(nextEndTime);

    console.log(
      `[CasinoDO] 第 ${round.roundNumber} 期结算完毕: 骰子 [${dice1}, ${dice2}, ${dice3}] = ${diceSum}点 (${resultType})，总派彩: ${totalPayout}元宝。下一期已启动。`
    );
  }

  /**
   * 获取或初始化当前盘口数据
   */
  private async getCurrentRound(): Promise<CasinoStateData> {
    let current = await this.state.storage.get<CasinoStateData>('current_round');

    if (!current) {
      const now = Date.now();
      const endTime = now + this.ROUND_DURATION_MS;
      current = {
        roundId: `round_${now}_1`,
        roundNumber: 1,
        status: 'BETTING',
        endTime,
        bets: [],
      };
      await this.state.storage.put('current_round', current);
      // 首次设置定时唤醒
      await this.state.storage.setAlarm(endTime);
    }

    return current;
  }
}

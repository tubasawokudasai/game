import { Env } from '../models/env';
import { authDb } from '../db/authDb';
import { hashPassword, verifyPassword, signAuthToken } from '../utils/crypto';
import { toAuthPlayerDto, AuthPlayerDto } from '../mappers/authPlayerMapper';

export interface AuthResult {
  success: boolean;
  token: string;
  isNewGuest?: boolean;
  message?: string;
  mergeSummary?: any;
  player: AuthPlayerDto;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export const authService = {
  /**
   * 1. 匿名免登录换取 Token
   */
  async guestLogin(env: Env, deviceId: string): Promise<AuthResult> {
    let player = await authDb.findGuestByDeviceId(env.DB, deviceId);
    let isNewGuest = false;

    if (!player) {
      player = await authDb.createGuestPlayer(env.DB, deviceId);
      isNewGuest = true;
    }

    const token = await signAuthToken(
      {
        sub: player.id,
        username: player.username,
        isGuest: true,
        deviceId,
      },
      env.JWT_SECRET
    );

    return {
      success: true,
      token,
      isNewGuest,
      player: toAuthPlayerDto(player, true),
    };
  },

  /**
   * 2. 账号升级 (原地转正)
   */
  async register(
    env: Env,
    currentSub: string | undefined,
    username: string,
    password: string
  ): Promise<AuthResult> {
    let playerId = currentSub;
    if (!playerId) {
      const existing = await authDb.findPlayerByUsername(env.DB, username);
      if (existing) {
        throw new AuthError('此仙名/账号已被九州其他道友注册，请更换', 400);
      }
      const newDeviceId = String(Math.floor(100000 + Math.random() * 900000));
      const guestPlayer = await authDb.createGuestPlayer(env.DB, newDeviceId);
      playerId = guestPlayer.id;
    }

    const passwordHash = await hashPassword(password);
    const updatedPlayer = await authDb.upgradeGuestToFormal(
      env.DB,
      playerId,
      username,
      passwordHash
    );

    const newToken = await signAuthToken(
      {
        sub: updatedPlayer.id,
        username: updatedPlayer.username,
        isGuest: false,
        deviceId: updatedPlayer.device_id,
      },
      env.JWT_SECRET
    );

    return {
      success: true,
      message: '恭喜道友，账号已正式归录长乐仙籍！',
      token: newToken,
      player: toAuthPlayerDto(updatedPlayer, false),
    };
  },

  /**
   * 3. 现有账号合并
   */
  async mergeGuest(
    env: Env,
    guestPlayerId: string,
    username: string,
    password: string
  ): Promise<AuthResult> {
    const formalPlayer = await authDb.findPlayerByUsername(env.DB, username);
    if (!formalPlayer) {
      throw new AuthError('所输入的仙籍正式账号不存在', 404);
    }

    if (formalPlayer.is_guest === 1) {
      throw new AuthError('该账号仍为临时游客，无法作为主归属账号', 400);
    }

    if (!formalPlayer.password_hash) {
      throw new AuthError('该正式账号未设置密码凭证，请联系仙盟总督府', 400);
    }

    const isMatch = await verifyPassword(password, formalPlayer.password_hash);
    if (!isMatch) {
      throw new AuthError('账号密码有误，身份核验失败', 401);
    }

    const mergeSummary = await authDb.mergeGuestIntoFormalTx(
      env.DB,
      guestPlayerId,
      formalPlayer.id
    );

    const refreshedFormal = await authDb.findPlayerById(env.DB, formalPlayer.id);
    if (!refreshedFormal) {
      throw new Error('获取合并后账号状态失败');
    }

    const newToken = await signAuthToken(
      {
        sub: refreshedFormal.id,
        username: refreshedFormal.username,
        isGuest: false,
        deviceId: refreshedFormal.device_id,
      },
      env.JWT_SECRET
    );

    return {
      success: true,
      message: '试玩神兵道具与钱两已圆满合并至正式仙籍！',
      token: newToken,
      mergeSummary,
      player: toAuthPlayerDto(refreshedFormal, false),
    };
  },

  /**
   * 4. 正式账号直接登录
   */
  async login(env: Env, username: string, password: string): Promise<AuthResult> {
    const player = await authDb.findPlayerByUsername(env.DB, username);
    if (!player) {
      throw new AuthError('该修仙账号不存在', 404);
    }

    if (!player.password_hash) {
      throw new AuthError('该账号暂未绑定密码', 400);
    }

    const isMatch = await verifyPassword(password, player.password_hash);
    if (!isMatch) {
      throw new AuthError('账号或密码不正确', 401);
    }

    const token = await signAuthToken(
      {
        sub: player.id,
        username: player.username,
        isGuest: player.is_guest === 1,
        deviceId: player.device_id,
      },
      env.JWT_SECRET
    );

    return {
      success: true,
      token,
      player: toAuthPlayerDto(player, player.is_guest === 1),
    };
  },
};

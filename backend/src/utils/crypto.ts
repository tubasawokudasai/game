import { sign, verify } from 'hono/jwt';

const PASSWORD_SALT = ':changle_xianxia_salt_2026';

/**
 * 使用 Web Crypto API 进行密码安全哈希 (兼容 Cloudflare Workers 与 Node.js)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 校验明文密码是否与数据库哈希一致
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

export interface JwtAuthPayload {
  sub: string;
  username?: string | null;
  isGuest: boolean;
  deviceId?: string | null;
  role?: string;
  exp?: number;
}

/**
 * 颁发游戏 JWT 凭证 (有效期 30 天)
 */
export async function signAuthToken(
  payload: Omit<JwtAuthPayload, 'exp'>,
  secret: string
): Promise<string> {
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30天
  };
  return await sign(fullPayload, secret, 'HS256');
}

/**
 * 验签游戏 JWT 凭证
 */
export async function verifyAuthToken(
  token: string,
  secret: string
): Promise<JwtAuthPayload> {
  const payload = await verify(token, secret, 'HS256');
  return payload as unknown as JwtAuthPayload;
}

import { Hono } from 'hono';
import { Env } from '../../models/env';
import { JwtAuthPayload } from '../../utils/crypto';
import { NPC_QUALITY_IDS, NPC_GROWTH_TEMPLATE_IDS } from '../../services/npc/attributes';

// 统一子路由的 Hono 泛型签名
export type AdminEnv = {
  Bindings: Env;
  Variables: {
    adminUser: JwtAuthPayload;
  };
};

export function createAdminRouter() {
  return new Hono<AdminEnv>();
}

// 公共数值与 JSON 工具
export function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toNullableInt(value: any, min = 0): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.round(n));
}

export function toNullableNumber(value: any, min = 0): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, n);
}

export function safeParseJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function normalizeQuality(value: any): string | null {
  const quality = String(value || '').trim().toUpperCase();
  return NPC_QUALITY_IDS.includes(quality as any) ? quality : null;
}

export function normalizeGrowthTemplate(value: any): string | null {
  const growthTemplate = String(value || '').trim();
  return NPC_GROWTH_TEMPLATE_IDS.includes(growthTemplate as any) ? growthTemplate : null;
}

export async function loadTemplateMap(db: D1Database, ids: string[]): Promise<Map<string, any>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT * FROM npc_templates WHERE id IN (${placeholders})`)
    .bind(...unique)
    .all<any>();
  return new Map((results || []).map((row) => [row.id, row]));
}

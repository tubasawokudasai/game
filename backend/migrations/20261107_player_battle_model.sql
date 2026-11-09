-- ==============================================================================
-- 迁移: 玩家战斗模型 (battle_models + players.combat_model_key)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
--
-- 执行:
--   npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_player_battle_model.sql
--   npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_player_battle_model.sql
--
-- 注意：SQLite 不支持 ADD COLUMN IF NOT EXISTS。
-- 若目标库已执行过本迁移（players 已有 combat_model_key），跳过最后一条 ALTER 即可。
-- 新库直接执行 schema.sql 即可，无需本迁移。
-- ==============================================================================

-- 1. 战斗模型表：与个人头像 players.avatar 解耦
CREATE TABLE IF NOT EXISTS battle_models (
    model_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    idle_avatar TEXT NOT NULL,
    attack_avatar TEXT,
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_battle_models_default ON battle_models(is_default, sort_order);

-- 2. 当前默认战斗模型（后续新增模型只需 INSERT 并更新 players.combat_model_key）
INSERT OR IGNORE INTO battle_models (
    model_key, name, idle_avatar, attack_avatar, description, is_default, sort_order
) VALUES (
    'player_default',
    '默认剑客',
    '/assets/combat/characters/player_default_trans.png',
    '/assets/combat/characters/player_default_trans.png',
    '当前所有玩家默认使用的战斗模型，后续可扩展为玩家专属模型/皮肤。',
    1,
    10
);

-- 3. 玩家当前穿戴的战斗模型；默认指向 player_default
ALTER TABLE players ADD COLUMN combat_model_key TEXT NOT NULL DEFAULT 'player_default';

-- ==============================================================================
-- 迁移: 战斗阵容数据化 (companion_templates 战斗属性 + monster_groups 怪物组)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
-- 执行: npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_combat_roster.sql
--       npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_combat_roster.sql
--
-- 注意：SQLite 不支持 ADD COLUMN IF NOT EXISTS。
-- 若目标库已执行过本迁移，请跳过对应 ALTER 语句后重复执行其余部分。
-- ==============================================================================

-- 1. 伙伴模版补充战斗演出与基础属性（战斗阵容的唯一真源）
ALTER TABLE companion_templates ADD COLUMN combat_idle_avatar TEXT;
ALTER TABLE companion_templates ADD COLUMN combat_attack_avatar TEXT;
ALTER TABLE companion_templates ADD COLUMN base_hp INTEGER NOT NULL DEFAULT 12000;
ALTER TABLE companion_templates ADD COLUMN base_mp INTEGER NOT NULL DEFAULT 300;
ALTER TABLE companion_templates ADD COLUMN base_attack INTEGER NOT NULL DEFAULT 2800;
ALTER TABLE companion_templates ADD COLUMN base_defense INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE companion_templates ADD COLUMN base_speed INTEGER NOT NULL DEFAULT 120;

-- 2. 三个伙伴的战斗数据（按原演出数值迁移）
UPDATE companion_templates SET
    combat_idle_avatar = '/assets/combat/characters/hero_cangyun_idle_trans.png',
    combat_attack_avatar = '/assets/combat/characters/hero_cangyun_attack_trans.png',
    base_hp = 15820, base_mp = 300, base_attack = 3200, base_defense = 1800, base_speed = 150
WHERE member_key = 'npc_cangyun_001';

UPDATE companion_templates SET
    combat_idle_avatar = '/assets/combat/characters/hero_luoqinghan_trans.png',
    combat_attack_avatar = '/assets/combat/characters/hero_luoqinghan_trans.png',
    base_hp = 11200, base_mp = 450, base_attack = 3800, base_defense = 1200, base_speed = 130
WHERE member_key = 'npc_luoqinghan_001';

UPDATE companion_templates SET
    combat_idle_avatar = '/assets/combat/characters/hero_suningxiang_trans.png',
    combat_attack_avatar = '/assets/combat/characters/hero_suningxiang_trans.png',
    base_hp = 12500, base_mp = 400, base_attack = 1400, base_defense = 1400, base_speed = 110
WHERE member_key = 'npc_suningxiang_001';

-- 3. 怪物组模版表
CREATE TABLE IF NOT EXISTS monster_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enemies_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO monster_groups (id, name, enemies_json) VALUES
('nether_01', '幽冥敌众', '[
  {"id":"enemy_guard","name":"幽冥守卫","avatar":"/assets/combat/characters/hero_shieldman_trans.png","position":"FRONT","slotIndex":0,"isBoss":true,"hp":18500,"maxHp":18500,"mp":200,"maxMp":200,"attack":2100,"defense":2600,"speed":95},
  {"id":"enemy_firefox","name":"山野妖灵","avatar":"/assets/combat/characters/enemy_firefox_trans.png","position":"FRONT","slotIndex":1,"isBoss":false,"hp":14200,"maxHp":14200,"mp":180,"maxMp":180,"attack":2800,"defense":1100,"speed":140},
  {"id":"enemy_cultist","name":"邪化修士","avatar":"/assets/combat/characters/enemy_cultist_trans.png","position":"BACK","slotIndex":2,"isBoss":false,"hp":19800,"maxHp":19800,"mp":500,"maxMp":500,"attack":3600,"defense":1500,"speed":120}
]');

-- ==============================================================================
-- 迁移: 战斗技能表 (combat_skills)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
--
-- 执行:
--   npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_combat_skills.sql
--   npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_combat_skills.sql
--
-- 说明:
--   target_type 决定技能可选目标：
--     SINGLE_ENEMY 敌方单体 / SINGLE_ALLY 我方单体 / SELF 自身
--     ALL_ENEMIES 敌方全体 / ALL_ALLIES 我方全体（由 CombatEngine 多目标结算）
--   skill_kind 决定 UI 提示与目标校验（HEAL 会校验目标气血）。
--   新增技能时必须同时在后端 strategies.ts 注册对应 skillId 的策略。
-- ==============================================================================

CREATE TABLE IF NOT EXISTS combat_skills (
    skill_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cost_mp INTEGER NOT NULL DEFAULT 0,
    target_type TEXT NOT NULL DEFAULT 'SINGLE_ENEMY',
    skill_kind TEXT NOT NULL DEFAULT 'DAMAGE',
    power REAL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_combat_skills_enabled ON combat_skills(is_enabled, sort_order);

INSERT OR IGNORE INTO combat_skills (
    skill_key, name, description, cost_mp, target_type, skill_kind, sort_order, is_enabled
) VALUES
('skill_pure_yang_sword', '纯阳剑煞',
 '催动纯阳剑罡破敌，忽略目标 30% 护甲，造成高额外功伤害。',
 120, 'SINGLE_ENEMY', 'DAMAGE', 10, 1),
('skill_tai_qing_heal', '太清回春',
 '引碧玉甘霖回复选中的我方目标气血（含自身，目标气血低于 75% 时方可施展）。',
 90, 'SINGLE_ALLY', 'HEAL', 20, 1),
('skill_nine_sky_thunder', '九霄天雷',
 '引九天玄刹轰落，以内功震碎灵光，对单体造成巨额法术伤害。',
 150, 'SINGLE_ENEMY', 'DAMAGE', 30, 1),
('skill_basic_attack', '普通挥砍',
 '不耗内力的基础近身攻击，伤害平稳，适合内力匮乏时使用。',
 0, 'SINGLE_ENEMY', 'DAMAGE', 40, 1),
('skill_wanjian_guizong', '万剑归宗',
 '万柄太虚灵剑悬空齐发，对敌方全体造成巨额剑罡伤害。',
 220, 'ALL_ENEMIES', 'DAMAGE', 50, 1),
('skill_spring_rain', '春风化雨',
 '化春风为灵雨洒落，为我方全体回复气血（仅对气血低于 75% 的目标生效）。',
 160, 'ALL_ALLIES', 'HEAL', 60, 1);

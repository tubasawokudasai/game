-- ==============================================================================
-- 迁移: 出战队伍表 party_members + 伙伴模版表 companion_templates (增量、幂等)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空其他表
-- 执行: npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261106_party_members.sql
--       npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261106_party_members.sql
-- ==============================================================================

-- 1. 伙伴模版表：名称 / 称号 / 立绘的唯一真源（代码中不再保留任何副本）
CREATE TABLE IF NOT EXISTS companion_templates (
    member_key TEXT PRIMARY KEY,                   -- 伙伴业务键 (如: npc_cangyun_001)
    name TEXT NOT NULL,                            -- 伙伴名号
    title TEXT,                                    -- 门派/定位称号
    avatar TEXT,                                   -- 立绘 URL
    role TEXT NOT NULL DEFAULT 'DPS',              -- 队伍定位: DPS, HEALER, TANK
    realm TEXT,                                    -- 修为境界
    level INTEGER NOT NULL DEFAULT 1,              -- 等级
    sort_order INTEGER NOT NULL DEFAULT 0          -- 默认站位排序
);

INSERT OR IGNORE INTO companion_templates (member_key, name, title, avatar, role, realm, level, sort_order) VALUES
('npc_cangyun_001', '苍云剑客', '苍云剑宗 · 剑修',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBBkUmeC_x-6wO1a1ggdufyf3pmSARNgax7jG_yMB5DeLcZiFDXjz1fzl6gdksyKoTLqDVy4KndVqR5hyAhbCSWNAZ3ZdsABwNewS-BBgCtP5X0It_aqABeygtXOJA2y9jw8mewCwSJueD2MI9kggRA867LrykO1Kt5cPeBSmFUOuspPyDBEasMt6f9sw5Xfs-7MALAbBW89yTgzs-akYkIpnVbmCGosUiWJ29FUx1e',
 'DPS', '金丹中期', 66, 10),
('npc_luoqinghan_001', '洛清寒', '玄霜心法 · 控场',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuB25WUvlGsiaVcOw8vtu1wblSepGnRGevKDqUBJvYCaYJqGvQ58EimK9KqrAwvZbgr-3xnYRzqQBbMiSMN9fd83nLq9uJLG5HHTv7Ig0UVUKVByFQJOzYODn9uYdXCpRw9lL0OyEcgIS-onczSxXXK-plYGuW_F6CHr-fKXq3KU1YdfdvXkZD--HS51KuofuPSD0uaq-GQtAGbRv9UW-CUm45U7xKai7VdzlSht-TJU',
 'DPS', '金丹后期', 67, 20),
('npc_suningxiang_001', '苏凝香', '九叶灵草 · 医修',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXKYSr2MVfViSnldCFqevDyMjos0y2xAFuuwKPcasEEl5LzYrobR7-Iul7jKdiuEiw2fgvkMfYkTm_tGWI5ZiFIGQ85J3KPxwcOxtoFIiRoUgCD-3BGxuWPTZlZI3iLKPHbauMQCaWyl5Zfu7ovDPS_JPA6BPrezkwE0IO68QuVoBFJ7bLWyJyPRYtDKQtmGu9o_fXoM6711Fl64Ue5q2kV5h_QqRK19_2DW0pch5b',
 'HEALER', '金丹初期', 65, 30);

-- 2. 出战队伍表：只存伙伴，主角由 players 表实时合成
CREATE TABLE IF NOT EXISTS party_members (
    id TEXT PRIMARY KEY,                           -- 队员唯一标识 (playerId:memberKey)
    player_id TEXT NOT NULL,                       -- 所属玩家 ID (关联 players.id)
    member_key TEXT NOT NULL,                      -- 伙伴业务模版键 (如: npc_cangyun_001)
    member_name TEXT NOT NULL,                     -- 伙伴名号 (如: 苍云剑客)
    title TEXT,                                    -- 门派/定位称号 (如: 苍云剑宗 · 剑修)
    avatar TEXT,                                   -- 伙伴头像 URL
    role TEXT NOT NULL DEFAULT 'DPS',              -- 队伍定位: DPS, HEALER, TANK
    realm TEXT,                                    -- 修为境界 (如: 金丹中期)
    level INTEGER NOT NULL DEFAULT 1,              -- 等级
    sort_order INTEGER NOT NULL DEFAULT 0,         -- 出战卡片站位排序 (越小越靠前)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(player_id, member_key)
);

CREATE INDEX IF NOT EXISTS idx_party_members_player ON party_members(player_id, sort_order);

-- 3. 不再为所有道友预置伙伴：出战伙伴由剧情动作 JOIN_PARTY 按需入队，
--    否则"三位同伴入队"的剧情永远是一句空话。

-- ==============================================================================
-- 迁移: 有向图对话引擎 + 内容模版表 (增量、幂等)
-- 适用于已有数据的本地 / 线上 D1，不会重建或清空已有表
-- 执行: npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261106_dialogue_engine.sql
--       npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261106_dialogue_engine.sql
-- ==============================================================================

-- 1. NPC 增加印章头衔列（SQLite 不支持 ADD COLUMN IF NOT EXISTS；
--    若目标库已存在 badge 列，请删掉下面这一行再执行）
ALTER TABLE npcs ADD COLUMN badge TEXT DEFAULT '';

-- 2. 场景归属大区回填：scenes.zone_id 是传送与跨区校验的唯一真源
UPDATE scenes SET zone_id = 'canglan_state' WHERE id IN ('canglan', 'canglan_state');
UPDATE scenes SET zone_id = 'kunwu_state'   WHERE id IN ('kunwu', 'kunwu_state', 'forge');
UPDATE scenes SET zone_id = 'qingyun_state' WHERE id IN ('qingyun', 'qingyun_state');
UPDATE scenes SET zone_id = 'tianheng_state' WHERE id IN ('tianheng', 'tianheng_state');

-- 3. 以下为对话引擎表 / 内容模版表与种子数据（重复执行安全）

-- 12. 玩家任务进度表 (player_quests)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS player_quests (
    player_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'DONE', 'SUBMITTED'
    progress INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_player_quests_pid ON player_quests(player_id);

-- ==============================================================================
-- 13. NPC 入口路由规则表 (npc_dialogue_routers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS npc_dialogue_routers (
    id TEXT PRIMARY KEY,
    npc_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,        -- 优先级：数字越大越优先匹配
    root_node_id TEXT NOT NULL,        -- 命中的起始对话节点 ID
    conditions_json TEXT DEFAULT '[]', -- 触发条件 JSON 数组
    description TEXT,                  -- 后台配置备注
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_npc_dialogue_routers_priority ON npc_dialogue_routers(npc_id, priority DESC);

-- ==============================================================================
-- 14. 对话节点表 (dialogue_nodes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dialogue_nodes (
    id TEXT PRIMARY KEY,               -- 节点唯一标识
    npc_id TEXT NOT NULL,              -- 归属说话人
    chapter_title TEXT,                -- 章节标识，如 '长乐古井篇 · 卷一'
    content TEXT NOT NULL,             -- 主对话内容
    quote_box TEXT,                    -- 蓝框强调/暗语提示文本
    ui_meta_json TEXT DEFAULT '{}',    -- 表现层扩展配置
    editor_pos_json TEXT DEFAULT '{}'  -- 可视化工作流节点坐标
);
CREATE INDEX IF NOT EXISTS idx_dialogue_nodes_npc ON dialogue_nodes(npc_id);

-- ==============================================================================
-- 15. 对话选项与动作边表 (dialogue_options)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dialogue_options (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,             -- 所属节点 ID
    sort_order INTEGER DEFAULT 0,      -- 排序
    text TEXT NOT NULL,                -- 选项文本
    action_label TEXT,                 -- 右侧短标签：'知悉' / '奉诏' / '作罢'
    style_type TEXT DEFAULT 'NORMAL',  -- 样式枚举：'GOLD', 'RED', 'GRAY', 'NORMAL'
    next_node_id TEXT,                 -- 下一个对话节点 ID (NULL 为关闭对话)
    show_conditions_json TEXT DEFAULT '[]',   -- 可见条件
    enable_conditions_json TEXT DEFAULT '[]', -- 可选条件
    actions_json TEXT DEFAULT '[]',           -- 点击后触发的副作用指令队列
    FOREIGN KEY (node_id) REFERENCES dialogue_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dialogue_options_node ON dialogue_options(node_id, sort_order);

-- ==============================================================================
-- 16. 玩家剧情/对话状态与历史记录表 (player_dialogue_flags)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS player_dialogue_flags (
    player_id TEXT NOT NULL,
    flag_key TEXT NOT NULL,            -- 状态键
    flag_value INTEGER DEFAULT 1,      -- 状态值
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, flag_key)
);
CREATE INDEX IF NOT EXISTS idx_player_dialogue_flags_pid ON player_dialogue_flags(player_id);

-- ==============================================================================
-- 插入“墨芳·天机使”有向图对话树真实数据（还原长乐古井篇场景）
-- ==============================================================================

-- 1. 更新墨芳 NPC 基础实体 (司星 · 天机使)
--    位置信息不落在 npcs 表：NPC 所在大区/区域统一由 scene_id -> scenes 表推导，避免双份事实
UPDATE npcs SET
    name = '墨芳',
    badge = '司星',
    title = '天机使'
WHERE key = 'mofang';

-- 2. 墨芳入口路由规则 (优先匹配长乐古井篇起始)
INSERT OR IGNORE INTO npc_dialogue_routers (id, npc_id, priority, root_node_id, conditions_json, description) VALUES
('router_mofang_gujing', 'npc_mofang_001', 10, 'node_mofang_gujing_01', '[]', '墨芳·长乐古井篇卷一入口');

-- 3. 对话节点表数据
INSERT OR IGNORE INTO dialogue_nodes (id, npc_id, chapter_title, content, quote_box, ui_meta_json, editor_pos_json) VALUES
(
    'node_mofang_gujing_01',
    'npc_mofang_001',
    '长乐古井篇 · 卷一',
    '“少侠近日前来长乐城，想必已察觉古井暗流有异动。天机阁夜观星象，北斗七星隐隐泛起赤光……你此行是为宗门密令而来，还是顺应机缘？”',
    '“井底幽冥封印已有松动之兆，长乐城内外修士暗涌。若不早作决断，恐天机逆乱，殃及八荒。”',
    '{"mood":"serious","theme":"ancient_mystery"}',
    '{"x":100,"y":200}'
),
(
    'node_mofang_gujing_02',
    'npc_mofang_001',
    '长乐古井篇 · 卷二',
    '“古井之下乃是上古【太幽玄冥大阵】阵眼所在。千百年前，魔道巨擘‘幽泉老祖’被镇压于此……如今封印松动，必有魔修作祟。”',
    '“若欲破局，非金丹以上修为不可，且需持天机鉴印探明阵法生门。”',
    '{"mood":"mystic"}',
    '{"x":360,"y":140}'
),
(
    'node_mofang_quest_accepted',
    'npc_mofang_001',
    '长乐古井篇 · 奉诏',
    '“很好！此乃【天机罗盘】，你持此物前往古井探查异动，切记万事小心，不可惊动潜藏魔物。”',
    '“天机阁将时刻以星轨推演助你。速去速回！”',
    '{"mood":"trust"}',
    '{"x":360,"y":320}'
);

-- 4. 对话选项与连线数据
INSERT OR IGNORE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, show_conditions_json, enable_conditions_json, actions_json) VALUES
-- 节点 1 选项
(
    'opt_mofang_ask_truth',
    'node_mofang_gujing_01',
    1,
    '探问天机 · 追问古井幽冥阵真相',
    '知悉',
    'GOLD',
    'node_mofang_gujing_02',
    '[]',
    '[]',
    '[{"type":"SET_FLAG","key":"asked_gujing_truth","value":1}]'
),
(
    'opt_mofang_accept_quest',
    'node_mofang_gujing_01',
    2,
    '承接密令 · 请司星使下发天机委托',
    '奉诏',
    'RED',
    'node_mofang_quest_accepted',
    '[{"type":"QUEST_STATUS","questId":"quest_gujing_01","status":"NONE"}]',
    '[]',
    '[{"type":"ACCEPT_QUEST","questId":"quest_gujing_01"},{"type":"GIVE_ITEM","itemId":"item_tianji_compass","count":1}]'
),
(
    'opt_mofang_leave_01',
    'node_mofang_gujing_01',
    3,
    '告辞离去 · 在下暂且退去',
    '作罢',
    'GRAY',
    NULL,
    '[]',
    '[]',
    '[]'
),
-- 节点 2 选项
(
    'opt_mofang_accept_from_truth',
    'node_mofang_gujing_02',
    1,
    '承接密令 · 请司星使下发天机委托',
    '奉诏',
    'RED',
    'node_mofang_quest_accepted',
    '[{"type":"QUEST_STATUS","questId":"quest_gujing_01","status":"NONE"}]',
    '[]',
    '[{"type":"ACCEPT_QUEST","questId":"quest_gujing_01"},{"type":"GIVE_ITEM","itemId":"item_tianji_compass","count":1}]'
),
(
    'opt_mofang_leave_02',
    'node_mofang_gujing_02',
    2,
    '容我思量 · 暂且别过',
    '作罢',
    'GRAY',
    NULL,
    '[]',
    '[]',
    '[]'
),
-- 节点 3 选项
(
    'opt_mofang_acknowledged',
    'node_mofang_quest_accepted',
    1,
    '领命而去 · 定不负司星使所托',
    '知悉',
    'GOLD',
    NULL,
    '[]',
    '[]',
    '[{"type":"SET_FLAG","key":"mofang_quest_dialogue_done","value":1}]'
);

-- ==============================================================================

-- 18. 出战伙伴模版表 (companion_templates)
-- 新玩家建档时按此表播种 party_members，伙伴的名称/称号/立绘不在代码里写死
-- ==============================================================================
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

-- ==============================================================================
-- 19. 内容预设表 (preset_assets)
-- 头像立绘目录与道号取名库：前端不再内置静态数组，统一由本表下发
-- ==============================================================================
CREATE TABLE IF NOT EXISTS preset_assets (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,                        -- 'AVATAR' (头像) / 'NAME' (道号)
    label TEXT NOT NULL,                           -- 头像名 / 道号
    sub_label TEXT,                                -- 头像流派说明 (NAME 类为 NULL)
    url TEXT,                                      -- 头像直链 (NAME 类为 NULL)
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_preset_assets_category ON preset_assets(category, sort_order);

INSERT OR IGNORE INTO preset_assets (id, category, label, sub_label, url, sort_order) VALUES
('avatar_muyun', 'AVATAR', '暮云剑仙', '纯阳剑修',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYje_RLeL7kHWpdVbR0NSiXnogmi2iQRnzqAwO7vcFpeTJOH3MVeD6okfV0FgyH-KLbgC-XbUWH0H1YU8roGnC-rOfEsZiIuimHhByqUOZfp8poa6mPPyrJagySrOAVmFDUxyqbaU4a2Nq8S1j4i_xyE3a36cKD5tbw3jcLrEKaK1tKaxrPLS9rLAGc36W2PjnaDWFLw-1VIDqV7ntjgHjBDMY7HPASOAqHJkPUFnq', 10),
('avatar_liuqing', 'AVATAR', '柳青游侠', '江湖浪子',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBBkUmeC_x-6wO1a1ggdufyf3pmSARNgax7jG_yMB5DeLcZiFDXjz1fzl6gdksyKoTLqDVy4KndVqR5hyAhbCSWNAZ3ZdsABwNewS-BBgCtP5X0It_aqABeygtXOJA2y9jw8mewCwSJueD2MI9kggRA867LrykO1Kt5cPeBSmFUOuspPyDBEasMt6f9sw5Xfs-7MALAbBW89yTgzs-akYkIpnVbmCGosUiWJ29FUx1e', 20),
('avatar_mofang', 'AVATAR', '墨芳术士', '神秘灵修',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPVVfzU4gXlppijrSdYzYcmul39HCHVkUjpQC3d85JtqWBBHsY0tVo71e-ILB4Pz4TRtOBR9mMZOdfNlPbUqi6TbeFpO8nGlBbDl5FJsIt31JUXMoXC4wWmJvckjSGr8eIJEykqCp9AhEmhVxRXm01WVlpUxkT2ShXiSKNGu3-_vlVQQh4k5W4cSoVZOJRlARvQIuaS9KVEPEDlv74dv43DZ4Ekln5d6xa1SmObhtH', 30),
('avatar_yunxier', 'AVATAR', '云溪仙子', '飘渺琴心',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuB25WUvlGsiaVcOw8vtu1wblSepGnRGevKDqUBJvYCaYJqGvQ58EimK9KqrAwvZbgr-3xnYRzqQBbMiSMN9fd83nLq9uJLG5HHTv7Ig0UVUKVByFQJOzYODn9uYdXCpRw9lL0OyEcgIS-onczSxXXK-plYGuW_F6CHr-fKXq3KU1YdfdvXkZD--HS51KuofuPSD0uaq-GQtAGbRv9UW-CUm45U7xKai7VdzlSht-TJU', 40),
('avatar_linghu', 'AVATAR', '青丘妖主', '幻术魅影',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBFXnhKe4iNuj-eVedF0LMD0d68VQPIzCAmDpwAJY2fDy0lk5wftbiHi1s1SjqakDb6cUxVkoeTXjm1Gh8Fduw5PgfAxZ4J54iEjMjCW0P6g362pgSvZVP6HMj0xMgYQl6JzW895v1fNikWheYSjwiUdVxPvi6k_feiCCJ0chjWsm4_ZUT-5qR_xqZXx0ujOXSlPvIPu7-bcBgtPP1Ji_TwTmrdpmXGwve12J_SSx5c', 50),
('avatar_tianyu', 'AVATAR', '太虚道尊', '天道至尊',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuDRw78fwaX95LWkUHANOqTHMnwTDriQuWnXiOI7ME05eyRQURFlDPTyZ0IdNbI8cY_2L67OIC2G0vsoMVXpY0NzC99_958xb8NEctxom2iKs5tDKJskcDB_c1V9fKVEaE85KWyUJEhVGBtkBY2YDAjX3aJQJgH2EM7qhX7Qa0tAndz61k15zektnwgdazZk60dXUuFlFq_v3fipHtrN1L7ya3EJkoqoLQb3BMYOM6M2', 60),
('avatar_chiyang', 'AVATAR', '赤阳狂客', '焚天霸刀',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBypgf-Ptv_rypUeYSFPT3kxpyVEjHv0I1NazLe_rCLbyMa4_sdJU3qf5FJIHimuRMX7_Y1C6E5LUvD33mxXGcRw4uEkwBn1lDglR3rxk4l_HDDUxps44nTFNdOpmcqCV1VB8w2YzfRPgx72bN2kBVAX9T3WjuBqOnba7Wt1k6DokXO_Hq2h5tjaunHLplZfb368lLO_iJUlov5c-m4kC4pNSkosVk6tgDz2LGRNOls', 70),
('avatar_cangming', 'AVATAR', '沧溟散仙', '碧落逍遥',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuB7CKAfiZ8cFdRMyaxxC0wNQdQTb5HoCFM-Z_W53WSakiO0NBc87TJGIClMohboSdOW4EE5EL8wZKJDLwiyi6I52CGZpCz9tA-9ZBTKw88OOkLPUuO0Vw3rINrAEzrJrnHuPbMQIlealKJ2g0uxmr6vY1wGuDB9mt90D7pQ_HzpvQVE50AH_1fa0h-Ibvbklcb_qXYhCTQuOnQPnIjx6rB8eZjixlOEUS_7SS-p03uo', 80),
('name_01', 'NAME', '暮云清歌', NULL, NULL, 10),
('name_02', 'NAME', '青玄剑仙', NULL, NULL, 20),
('name_03', 'NAME', '寒江孤舟', NULL, NULL, 30),
('name_04', 'NAME', '太虚游侠', NULL, NULL, 40),
('name_05', 'NAME', '问心道人', NULL, NULL, 50),
('name_06', 'NAME', '落月飞羽', NULL, NULL, 60),
('name_07', 'NAME', '紫霄真人', NULL, NULL, 70),
('name_08', 'NAME', '凌霜仙子', NULL, NULL, 80),
('name_09', 'NAME', '赤霄狂客', NULL, NULL, 90),
('name_10', 'NAME', '丹青墨染', NULL, NULL, 100),
('name_11', 'NAME', '玄冥幽客', NULL, NULL, 110),
('name_12', 'NAME', '玉笛清风', NULL, NULL, 120),
('name_13', 'NAME', '沧浪踏雪', NULL, NULL, 130),
('name_14', 'NAME', '醉倚长风', NULL, NULL, 140),
('name_15', 'NAME', '浮生半日', NULL, NULL, 150),
('name_16', 'NAME', '万剑归一', NULL, NULL, 160),
('name_17', 'NAME', '逍遥散修', NULL, NULL, 170),
('name_18', 'NAME', '天玑真人', NULL, NULL, 180),
('name_19', 'NAME', '白露为霜', NULL, NULL, 190),
('name_20', 'NAME', '御剑乘风', NULL, NULL, 200);

-- ==============================================================================
-- 20. 场景坊市/名胜表 (venues)
-- 长乐广场六大场所画卷：文案、标签、配图均由本表下发，前端不再内置静态数组
-- ==============================================================================
CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL,                        -- 归属场景 (关联 scenes.id)
    name TEXT NOT NULL,
    badge TEXT,                                    -- 右上角短标签
    tag TEXT,                                      -- 缩略图角标
    description TEXT,                              -- 一句风物描述
    chips_json TEXT DEFAULT '[]',                  -- 特色标签数组 JSON
    action_notice TEXT,                            -- 点击“立即前往”后的提示文案
    img TEXT,                                      -- 场景配图
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_venues_scene ON venues(scene_id, sort_order);

INSERT OR IGNORE INTO venues (id, scene_id, name, badge, tag, description, chips_json, action_notice, img, sort_order) VALUES
('venue_square_center', 'square', '广场中心', '灵泉论道', '枢纽中心', '“汉白玉灵泉台 · 万人论道”',
 '["同道交流","世界公告","角色展示","宗门庆典"]', '已步入广场中心灵泉台，感受四方灵韵。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBFXnhKe4iNuj-eVedF0LMD0d68VQPIzCAmDpwAJY2fDy0lk5wftbiHi1s1SjqakDb6cUxVkoeTXjm1Gh8Fduw5PgfAxZ4J54iEjMjCW0P6g362pgSvZVP6HMj0xMgYQl6JzW895v1fNikWheYSjwiUdVxPvi6k_feiCCJ0chjWsm4_ZUT-5qR_xqZXx0ujOXSlPvIPu7-bcBgtPP1Ji_TwTmrdpmXGwve12J_SSx5c', 10),
('venue_square_casino', 'square', '玲珑坊', '听骰夺彩', '游艺闲趣', '“朱红雕栏 · 暖金流光 · 听骰掷琼”',
 '["骰宝博弈","大小对决","围骰派彩","定时开奖"]', '已进入玲珑坊，可向庄家下注元宝博取灵石。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuDRw78fwaX95LWkUHANOqTHMnwTDriQuWnXiOI7ME05eyRQURFlDPTyZ0IdNbI8cY_2L67OIC2G0vsoMVXpY0NzC99_958xb8NEctxom2iKs5tDKJskcDB_c1V9fKVEaE85KWyUJEhVGBtkBY2YDAjX3aJQJgH2EM7qhX7Qa0tAndz61k15zektnwgdazZk60dXUuFlFq_v3fipHtrN1L7ya3EJkoqoLQb3BMYOM6M2', 20),
('venue_square_teahouse', 'square', '听雨茶楼', '八荒传闻', '江湖机密', '“倚栏听雨 · 龙井香冽 · 八荒隐秘”',
 '["打探机密","坐品灵茗","奇遇茶客","秘境线索"]', '已步入听雨茶楼，暗香盈袖，品茗静候机缘。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuBypgf-Ptv_rypUeYSFPT3kxpyVEjHv0I1NazLe_rCLbyMa4_sdJU3qf5FJIHimuRMX7_Y1C6E5LUvD33mxXGcRw4uEkwBn1lDglR3rxk4l_HDDUxps44nTFNdOpmcqCV1VB8w2YzfRPgx72bN2kBVAX9T3WjuBqOnba7Wt1k6DokXO_Hq2h5tjaunHLplZfb368lLO_iJUlov5c-m4kC4pNSkosVk6tgDz2LGRNOls', 30),
('venue_square_stage', 'square', '百戏台', '九州雅乐', '雅乐演艺', '“彩绫翻飞 · 霓裳羽衣 · 九州雅乐”',
 '["折子戏","琴箫合奏","才艺展示","道法演练"]', '已入座百戏台看席，静赏仙姬乐舞。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuB7CKAfiZ8cFdRMyaxxC0wNQdQTb5HoCFM-Z_W53WSakiO0NBc87TJGIClMohboSdOW4EE5EL8wZKJDLwiyi6I52CGZpCz9tA-9ZBTKw88OOkLPUuO0Vw3rINrAEzrJrnHuPbMQIlealKJ2g0uxmr6vY1wGuDB9mt90D7pQ_HzpvQVE50AH_1fa0h-Ibvbklcb_qXYhCTQuOnQPnIjx6rB8eZjixlOEUS_7SS-p03uo', 40),
('venue_square_market', 'square', '珍宝摊', '散修贸易', '自由摆摊', '“灵木搭棚 · 货殖万千 · 捡漏鉴宝”',
 '["玩家出摊","寄售比价","奇珍异草","灵兽符箓"]', '已开启珍宝摊市集，浏览在场修士出摊宝物。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuD4rBDMW741Bxe4Rl5ZlxqThz2yMbR4QAAbVqiI-XZtkNQY3Z7go-Ol4J6SXrDpF4QLhyM1lhtDfrui7lTu7sZBW_k_hqJnItLp7jpiUsimzPFEWyVvjFe4GZbiLC5gkzlIdV0xQxzaUOj3u6lLk_wfXvTUrBCHEPDwnVvVxDmK5zJcmk3sQNICRsoP6zyFjPazx_7n42hVwNMrXkHeVbHMzsGKeGouuT6oHgv0DvZE', 50),
('venue_square_noticeboard', 'square', '江湖告示栏', '官府昭示', '除妖悬赏', '“长乐府朱印 · 悬赏除妖 · 九州共鉴”',
 '["突发异动","日常悬赏","宗门诏令","秘境线索"]', '正在查阅长乐府最新除妖除魔告示。',
 'https://lh3.googleusercontent.com/aida-public/AB6AXuD-mBovEOanLYgf-mGyGsO1txN6EiwQGscauKaKqGleSJ13ehun1mtAH9h40PnaGYAABoJtbsel2Oo8raru2PdfhowX1gFO2j3vwVnLnzgNpi-kAOvD_Njwi6FyJyeLhWu0cIkW0Vdu49nUBv4ULH_41D1bhe1Q6olWLERXXFiVZ8jaxS15d9JlFSXflY_iVCRauSeFij6uOfLY4IMjO0gC0EU7SlrvSe9cEzkvBaSA', 60);

-- ==============================================================================

-- 21. 道具模版表 (item_templates)
-- 发放/展示道具时的名称、品类、品阶唯一真源；对话动作不再内置道具名字典
-- ==============================================================================
CREATE TABLE IF NOT EXISTS item_templates (
    id TEXT PRIMARY KEY,                           -- 道具模版 ID (如: item_tianji_compass)
    name TEXT NOT NULL,                            -- 道具名 (如: 天机罗盘)
    type TEXT NOT NULL DEFAULT 'MATERIAL',         -- EQUIPMENT / CONSUMABLE / MATERIAL / SPECIAL
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- COMMON / RARE / EPIC / LEGENDARY / MYTHIC
    description TEXT DEFAULT ''                    -- 风物说明
);

INSERT OR IGNORE INTO item_templates (id, name, type, quality, description) VALUES
('item_tianji_compass', '天机罗盘', 'MATERIAL', 'RARE', '天机阁司星使所赐，可推演古井阵法生门。'),
('item_zhuji_dan', '筑基丹', 'CONSUMABLE', 'RARE', '破境筑基之丹，服之可固本培元。'),
('item_ling_shi', '下品灵石', 'MATERIAL', 'COMMON', '九州通行的低阶灵石，蕴含微薄灵气。'),
('item_secret_token', '宗门密令', 'SPECIAL', 'EPIC', '宗门加急密令，凭此可在各地驿馆验证身份。');

-- ==============================================================================
-- 22. 委托模版表 (quest_templates)
-- 任务标题的唯一真源；对话接取/交付时按 quest_id 读取，不在代码里写死标题
-- ==============================================================================
CREATE TABLE IF NOT EXISTS quest_templates (
    id TEXT PRIMARY KEY,                           -- 委托 ID (如: quest_gujing_01)
    title TEXT NOT NULL,                           -- 委托标题
    summary TEXT DEFAULT ''                        -- 委托简述
);

INSERT OR IGNORE INTO quest_templates (id, title, summary) VALUES
('quest_gujing_01', '长乐古井异动 · 卷一', '携天机罗盘前往长乐古井，探查太幽玄冥大阵封印异动。');

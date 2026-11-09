-- ==============================================================================
-- 万象录 - Cloudflare D1 (SQLite) 数据库架构定义文件 (schema.sql)
--
-- 设计规范：
-- 1. 强类型与完备约束：全表采用 UUID/主键索引，关键关联建立外键与联合索引。
-- 2. 事务安全性 (ACID)：背包与邮件附件设计为强一致模型，保证交易与提取的原子性。
-- 3. 灵活半结构化支持：装备属性与技能快照采用 JSON TEXT 存储，契合 RPG 自由词条需求。
-- 4. AI Agent 友好：包含 NPC 对话状态表与战斗事件溯源表，便于 LLM 读取上下文并进行 Function Calling。
-- ==============================================================================

-- 开启 SQLite 外键约束支持
PRAGMA foreign_keys = ON;

-- 先删除相互引用的子表，避免外键开启时 DROP 父表失败
DROP TABLE IF EXISTS monster_group_members;
DROP TABLE IF EXISTS npc_dialogue_routers;
DROP TABLE IF EXISTS npc_instances;
DROP TABLE IF EXISTS npc_templates;
DROP TABLE IF EXISTS npcs;
DROP TABLE IF EXISTS companion_templates;

-- ------------------------------------------------------------------------------
-- 1. 玩家主信息表 (players)
-- 记录修仙道友基础道号、境界等级、五行基础数值、货币财富与地理位置
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS players;
CREATE TABLE players (
    id TEXT PRIMARY KEY,                           -- 玩家唯一标识符 (6位数字UUID)
    username TEXT UNIQUE,                          -- 账号登录名 (正式账号唯一，匿名账号可为空或系统生成)
    account_id TEXT UNIQUE,                        -- 正式账号 ID (允许为空，正式绑定后填入)
    password_hash TEXT,                            -- 账号密码散列 (允许为空，正式绑定后填入)
    is_guest INTEGER NOT NULL DEFAULT 1,           -- 是否为匿名试玩账号: 1:是匿名账号, 0:正式账号
    device_id TEXT,                                -- 记录前端生成的唯一浏览器设备标识
    nickname TEXT NOT NULL,                        -- 角色道号 (如: 暮云清歌 / 逍遥散修_1001)
    level INTEGER NOT NULL DEFAULT 1,              -- 等级 (如: 68)
    exp INTEGER NOT NULL DEFAULT 0,                -- 当前等级已积累修仙经验
    hp INTEGER NOT NULL DEFAULT 18540,             -- 当前气血
    max_hp INTEGER NOT NULL DEFAULT 18540,         -- 最大气血上限
    mp INTEGER NOT NULL DEFAULT 9620,              -- 当前内力
    max_mp INTEGER NOT NULL DEFAULT 9620,          -- 最大内力上限
    combat_power INTEGER NOT NULL DEFAULT 1000,    -- 综合修仙战力 (用于天梯排行)
    sect TEXT NOT NULL DEFAULT '沧浪剑阁',          -- 所属宗门
    sect_position TEXT NOT NULL DEFAULT '真传弟子',  -- 宗门身份 (如: 首席真传, 内门执事, 散修)
    realm TEXT NOT NULL DEFAULT '金丹圆满',         -- 修为大境界 (练气/筑基/金丹/元婴/化神)
    vip_level INTEGER NOT NULL DEFAULT 6,          -- 仙途尊享位阶 (如: V6)
    spiritual_root TEXT NOT NULL DEFAULT '庚金至纯剑魄', -- 灵根天赋 (如: 庚金至纯剑魄, 丙火纯阳灵根)
    reputation TEXT NOT NULL DEFAULT '万仙敬仰 (玖品)',  -- 仙盟声望
    residence TEXT NOT NULL DEFAULT '蓬莱灵泉·甲等',     -- 洞府灵脉
    likes_count INTEGER NOT NULL DEFAULT 0,        -- 仙友点赞/赞叹数
    silver INTEGER NOT NULL DEFAULT 158400,        -- 纹银 (游戏内流通银两)
    ingot INTEGER NOT NULL DEFAULT 2860,           -- 元宝 (高阶通宝灵石)
    copper INTEGER NOT NULL DEFAULT 980520,        -- 铜钱 (坊市杂用基础货币)
    zone_id TEXT NOT NULL DEFAULT 'changle_city',  -- 当前驻留大区 (如: changle_city, canglan_state)
    area_id TEXT NOT NULL DEFAULT 'square',        -- 当前驻留子区域 (如: square, manor, arena, pharmacy, post)
    signature TEXT DEFAULT '一剑霜寒十四州，笑看九州烟雨休。', -- 个人签名心言
    avatar TEXT,                                   -- 个人头像/名片立绘 URL（不用于战斗模型）
    combat_model_key TEXT NOT NULL DEFAULT 'player_default', -- 战斗场景使用的模型 (battle_models.model_key)
    title TEXT DEFAULT '霜刃绝尘',                 -- 当前佩戴特殊称号
    status TEXT DEFAULT 'ONLINE',                  -- 状态: ONLINE, OFFLINE, MEDITATING(打坐), MERGED(已合并归入正籍)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- 创角时间
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 上次更新时间
);

CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_device_id ON players(device_id);
CREATE INDEX idx_players_account_id ON players(account_id);
CREATE INDEX idx_players_is_guest ON players(is_guest);
CREATE INDEX idx_players_zone_area ON players(zone_id, area_id);
CREATE INDEX idx_players_combat_power ON players(combat_power DESC);


-- ------------------------------------------------------------------------------
-- 1.1 战斗模型表 (battle_models)
-- 玩家在战斗场景中的独立模型；与个人头像 players.avatar 解耦。
-- 后续可为不同玩家/皮肤配置不同模型，只需更新 players.combat_model_key。
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS battle_models;
CREATE TABLE battle_models (
    model_key TEXT PRIMARY KEY,                    -- 模型业务键 (如: player_default, player_swordsman_02)
    name TEXT NOT NULL,                            -- 模型名称
    idle_avatar TEXT NOT NULL,                     -- 待机/战斗立绘
    attack_avatar TEXT,                            -- 预留：攻击姿态立绘
    description TEXT,                              -- 模型描述/获取来源
    is_default INTEGER NOT NULL DEFAULT 0,         -- 是否默认模型
    sort_order INTEGER NOT NULL DEFAULT 0,         -- 展示排序
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_battle_models_default ON battle_models(is_default, sort_order);

INSERT INTO battle_models (
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


-- ------------------------------------------------------------------------------
-- 1.2 战斗技能表 (combat_skills)
-- 技能的作用目标类型由 target_type 配置，前端据此决定可选目标（敌方/我方/自身/全体）。
-- 技能数值公式仍由后端 strategies.ts 实现，本表负责名称、消耗、目标类型与展示配置。
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS combat_skills;
CREATE TABLE combat_skills (
    skill_key TEXT PRIMARY KEY,                    -- 技能键，与后端策略 skillId 对应
    name TEXT NOT NULL,                            -- 技能名称
    description TEXT,                              -- 技能描述
    cost_mp INTEGER NOT NULL DEFAULT 0,            -- 内力消耗
    target_type TEXT NOT NULL DEFAULT 'SINGLE_ENEMY',
        -- SINGLE_ENEMY 敌方单体 / SINGLE_ALLY 我方单体 / SELF 自身
        -- ALL_ENEMIES 敌方全体 / ALL_ALLIES 我方全体
    skill_kind TEXT NOT NULL DEFAULT 'DAMAGE',     -- DAMAGE / HEAL / BUFF / DEBUFF
    power REAL,                                    -- 预留：倍率/系数（具体公式仍在策略层）
    icon TEXT,                                     -- 预留：技能图标键
    sort_order INTEGER NOT NULL DEFAULT 0,         -- 展示排序
    is_enabled INTEGER NOT NULL DEFAULT 1,         -- 是否启用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_combat_skills_enabled ON combat_skills(is_enabled, sort_order);

INSERT INTO combat_skills (
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


-- ------------------------------------------------------------------------------
-- 2. 玩家背包装备表 (inventory)
-- 统一管理行囊物品与已佩戴穿戴神兵，通过 is_equipped 与 slot 字段区分
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (
    id TEXT PRIMARY KEY,                           -- 物品唯一实例 ID
    player_id TEXT NOT NULL,                       -- 所属玩家 ID
    item_id TEXT NOT NULL,                         -- 物品配置模版 ID (如: equip_sword_chixiao)
    item_name TEXT NOT NULL,                       -- 物品名称 (如: 赤霄九曜剑)
    item_type TEXT NOT NULL,                       -- 物品分类: EQUIPMENT(装备), CONSUMABLE(丹药), MATERIAL(材料), SPECIAL(符箓)
    count INTEGER NOT NULL DEFAULT 1,              -- 堆叠数量 (装备通常固定为1)
    is_equipped INTEGER NOT NULL DEFAULT 0,        -- 是否佩戴生效: 0:在背包, 1:穿戴中
    slot TEXT,                                     -- 装备槽位: WEAPON(武器), HELMET(头饰), ARMOR(衣袍), BOOTS(云履), ARTIFACT(法宝)
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- 品阶: COMMON(凡品), RARE(灵品), EPIC(地阶), LEGENDARY(天阶), MYTHIC(神品)
    stats TEXT,                                    -- 属性词条 (JSON 文本格式, 如: {"outer_attack":1280, "crit_rate":0.15})
    enhance_level INTEGER NOT NULL DEFAULT 0,      -- 淬炼强化等级 (如: +12)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_inventory_player ON inventory(player_id);
CREATE INDEX idx_inventory_player_equipped ON inventory(player_id, is_equipped);
CREATE INDEX idx_inventory_item ON inventory(item_id);


-- ------------------------------------------------------------------------------
-- 3. 飞鸽传书邮件表 (mails)
-- 承载系统补偿、宗门通告、玩家间点对点传书与带物品交易
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS mails;
CREATE TABLE mails (
    id TEXT PRIMARY KEY,                           -- 邮件唯一 UUID
    sender_id TEXT,                                -- 发信人 ID (若为 NULL 则代表万仙盟/系统通知)
    sender_name TEXT NOT NULL,                     -- 发信人展示名 (如: 万宝阁主, 独孤忘)
    receiver_id TEXT NOT NULL,                     -- 收信玩家 ID
    title TEXT NOT NULL,                           -- 邮件标题
    content TEXT NOT NULL,                         -- 邮件正文
    mail_type TEXT NOT NULL DEFAULT 'PLAYER',      -- 邮件类别: SYSTEM(系统), PLAYER(玩家私信), TRADE(交易货单)
    has_attachment INTEGER NOT NULL DEFAULT 0,     -- 是否含有附件: 0:否, 1:是
    is_read INTEGER NOT NULL DEFAULT 0,            -- 是否已查阅: 0:未读, 1:已读
    is_claimed INTEGER NOT NULL DEFAULT 0,         -- 附件是否已全部提取: 0:未提取, 1:已提取
    expire_at INTEGER NOT NULL,                    -- 过期销毁时间戳 (Unix Epoch 秒数，默认30天后)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receiver_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_mails_receiver ON mails(receiver_id);
CREATE INDEX idx_mails_receiver_status ON mails(receiver_id, is_read, is_claimed);


-- ------------------------------------------------------------------------------
-- 4. 邮件附件表 (mail_attachments)
-- 强事务关联表：拆分邮件与附件资产。提取附件时，D1事务保证道具生成与附件状态标记原子完成
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS mail_attachments;
CREATE TABLE mail_attachments (
    id TEXT PRIMARY KEY,                           -- 附件唯一 ID
    mail_id TEXT NOT NULL,                         -- 所属邮件 ID
    item_id TEXT,                                  -- 道具模版 ID (若为纯货币邮件可为空)
    item_snapshot TEXT,                            -- 物品实例化完整快照 (JSON 文本, 包含品质、强化等级、词条等)
    count INTEGER NOT NULL DEFAULT 1,              -- 道具数量
    silver INTEGER NOT NULL DEFAULT 0,             -- 随信附赠纹银
    ingot INTEGER NOT NULL DEFAULT 0,              -- 随信附赠元宝
    grant_type TEXT NOT NULL DEFAULT 'ITEM',       -- 发放类型: ITEM(道具) / COMPANION(角色伙伴) / CURRENCY(货币)，后续可扩展 EQUIPMENT 等
    grant_payload TEXT,                            -- 类型专属参数 JSON (角色等级/境界/出战、装备词条等)，领取时按 grant_type 分派
    claimed_at TIMESTAMP,                          -- 领取时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE
);

CREATE INDEX idx_attachments_mail ON mail_attachments(mail_id);


-- ------------------------------------------------------------------------------
-- 5. 赌场定时开奖记录表 (casino_rounds)
-- 记录玲珑坊骰宝游戏历史盘面、随机骰子结果、开奖类型与发奖总池
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS casino_rounds;
CREATE TABLE casino_rounds (
    round_id TEXT PRIMARY KEY,                     -- 期数 ID (如: round_20261104_001)
    round_number INTEGER NOT NULL,                 -- 递增轮次序号
    status TEXT NOT NULL DEFAULT 'BETTING',        -- 状态: BETTING(下注中), SETTLING(结算中), COMPLETED(已结盘)
    dice_1 INTEGER,                                -- 骰子1点数 (1-6)
    dice_2 INTEGER,                                -- 骰子2点数 (1-6)
    dice_3 INTEGER,                                -- 骰子3点数 (1-6)
    dice_sum INTEGER,                              -- 骰子总点数和 (3-18)
    result_type TEXT,                              -- 开奖形态: SMALL(小4-10), BIG(大11-17), TRIPLE(全色围骰)
    total_pool INTEGER NOT NULL DEFAULT 0,         -- 本期全服总下注金额
    total_payout INTEGER NOT NULL DEFAULT 0,       -- 本期全服总派彩金额
    start_time INTEGER NOT NULL,                   -- 开启下注时间戳 (秒)
    end_time INTEGER NOT NULL,                     -- 封盘开奖时间戳 (秒)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_casino_rounds_status ON casino_rounds(status);


-- ------------------------------------------------------------------------------
-- 6. 赌场玩家注单表 (casino_bets)
-- 记录玩家具体下注方向、赔率与中奖结算结果
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS casino_bets;
CREATE TABLE casino_bets (
    bet_id TEXT PRIMARY KEY,                       -- 注单唯一 ID
    round_id TEXT NOT NULL,                        -- 所属期数 ID
    player_id TEXT NOT NULL,                       -- 下注玩家 ID
    player_name TEXT NOT NULL,                     -- 下注玩家昵称
    bet_type TEXT NOT NULL,                        -- 押注类型: BIG(大), SMALL(小), TRIPLE(围骰), POINT(指定和值)
    bet_value TEXT,                                -- 下注具体内容 (例如具体的和值 14)
    bet_amount INTEGER NOT NULL,                   -- 下注元宝数
    odds REAL NOT NULL DEFAULT 1.95,               -- 结算赔率
    payout INTEGER NOT NULL DEFAULT 0,             -- 实际赢取金额 (本金+奖金)
    is_won INTEGER NOT NULL DEFAULT 0,             -- 是否中奖: 0:未中, 1:中奖
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id) REFERENCES casino_rounds(round_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_casino_bets_round ON casino_bets(round_id);
CREATE INDEX idx_casino_bets_player ON casino_bets(player_id);


-- ------------------------------------------------------------------------------
-- 7. 战斗日志与决策审计表 (combat_logs)
-- 记录 PVP/PVE 策略模式结算全过程，为回放与 AI Agent 学习提供结构化数据
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS combat_logs;
CREATE TABLE combat_logs (
    id TEXT PRIMARY KEY,
    attacker_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    battle_type TEXT NOT NULL,                     -- DUEL(切磋), WILD(野外生死决斗), ARENA(演武校场)
    rounds_count INTEGER NOT NULL,                 -- 回合总数
    battle_details TEXT NOT NULL,                  -- 回合战报详情 (JSON 结构化记录每回合策略、暴击与技能结算)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_combat_logs_users ON combat_logs(attacker_id, defender_id);


-- ------------------------------------------------------------------------------
-- 8. 地图场景元数据表 (scenes)
-- 存储九州各大名城、子区域、坊市与州域的地理位置、坐标与状态说明
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS scenes;
CREATE TABLE scenes (
    id TEXT PRIMARY KEY,                           -- 场景唯一标识 (如: square, manor, arena, post, changle, linan, qingyun, tianheng, canglan, kunwu, pharmacy)
    zone_id TEXT NOT NULL DEFAULT 'changle_city',  -- 所属大区/ZoneDO (如: changle_city, canglan_state, kunwu_state, tianheng_state, qingyun_state)
    name TEXT NOT NULL,                            -- 场景名称 (如: 长乐广场)
    region TEXT NOT NULL,                          -- 所属州域/区域 (如: 天衡州)
    level INTEGER NOT NULL DEFAULT 3,              -- 层级 (1: 州域, 2: 都城, 3: 坊市)
    parent_id TEXT DEFAULT NULL,                   -- 上级地图场景 ID
    icon TEXT DEFAULT '',                          -- 地图图标名称
    coord_x INTEGER NOT NULL DEFAULT 128,          -- X 坐标
    coord_y INTEGER NOT NULL DEFAULT 256,          -- Y 坐标
    status_desc TEXT NOT NULL DEFAULT '',          -- 场景状态与地貌说明 (如: 繁盛市井 · 安全区)
    tag TEXT NOT NULL DEFAULT '',                  -- 地貌标签 (如: 繁盛市井)
    subtitle TEXT NOT NULL DEFAULT '',             -- 地图二级说明
    thumb TEXT NOT NULL DEFAULT '',                -- 全息场景地貌图景
    description TEXT NOT NULL DEFAULT '',          -- 场景详叙说明
    feature TEXT NOT NULL DEFAULT '',              -- 特色风物说明
    cost_desc TEXT NOT NULL DEFAULT '',            -- 传送与行步耗费说明
    btn_text TEXT NOT NULL DEFAULT '前往',         -- 交互按钮文本
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scenes_region ON scenes(region);


-- ------------------------------------------------------------------------------
-- 9. 地图 NPC 实体
-- 原 npcs 表已合并进 npc_instances（scene_id / key / name / title / avatar / quote 等）
-- 定义见本文件末尾 23.1 节；此处不再单独建表，避免 NPC 身份与战斗配置双写。
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- 9.0 NPC 模板库与实例表
-- npc_templates: 可复用的 NPC / 怪物模板（属性、立绘；不区分战斗/对话）
-- npc_instances: 地图 NPC 的实例配置（绑定模板、战斗配置、等级、奖励、重生）
-- 玩家看到的是 npc_instances 实例，战斗中的每个敌人是战斗配置槽位里的模板实例
-- 建表放在文件末尾（依赖 monster_groups），此处仅预留说明
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- 9.1 玩家遭遇野怪状态表 (player_encounter_state)
-- 记录玩家对特定野怪/遭遇 NPC 的击杀次数与最后击败时间戳 (毫秒)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS player_encounter_state;
CREATE TABLE player_encounter_state (
    player_id TEXT NOT NULL,
    npc_id TEXT NOT NULL,
    defeat_count INTEGER NOT NULL DEFAULT 0,
    last_defeat_at INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, npc_id)
);

CREATE INDEX idx_encounter_player ON player_encounter_state(player_id);


-- ------------------------------------------------------------------------------
-- 10. 玩家生平大事纪表 (player_chronicles)
-- 记录修仙道友仙途历程与江湖大事记节点
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS player_chronicles;
CREATE TABLE player_chronicles (
    id TEXT PRIMARY KEY,                           -- 纪事唯一标识
    player_id TEXT NOT NULL,                       -- 所属玩家 ID
    title TEXT NOT NULL,                           -- 纪事题名 (如: 【青石初悟】)
    year TEXT NOT NULL,                            -- 年号/纪元 (如: 天启初年)
    content TEXT NOT NULL,                         -- 历程详叙 (如: 居沧澜州青石溪，引气入体开辟庚金剑魄。)
    order_index INTEGER NOT NULL DEFAULT 0,        -- 排序索引 (越小越早)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_player_chronicles_player ON player_chronicles(player_id);


-- ------------------------------------------------------------------------------
-- 11. 仙友赞叹记录表 (player_likes)
-- 记录道友点赞/赞叹互动，防止单人重复赞叹
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS player_likes;
CREATE TABLE player_likes (
    id TEXT PRIMARY KEY,                           -- 赞叹唯一标识
    player_id TEXT NOT NULL,                       -- 被赞道友 ID
    liker_id TEXT NOT NULL,                        -- 赞叹发起人 ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, liker_id)
);

CREATE INDEX idx_player_likes_player ON player_likes(player_id);


-- ==============================================================================
-- 初始测试种子数据 (Seed Data)
-- 地图场景与常驻 NPC 元数据
-- ==============================================================================

-- 1. 插入地图场景元数据种子 (scenes)
INSERT INTO scenes (id, name, region, coord_x, coord_y, status_desc, tag, subtitle, thumb, description, feature, cost_desc, btn_text) VALUES
('square', '长乐城', '天衡州', 128, 256, '繁华闹市 · 太平盛世', '天衡州主城', '天衡州长乐城核心 · 坐标 [128, 256]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuAUD6VvIZ0fyB3jyr-KV3NbhFtm_Im2Wy1WbtWmiMgOSxnfgnhd2fAhUP_XPolqhVnPXVlxm-qN4S23EhUq_IK57hacf4Ba4i2d-6bubBVE0sb3hmCiTk7_BAttgDOUG5sZ_UI-GRWCFrXQbev3PD-ec2lasrEiwWg6LCW8GI5F5R84G71wAb12rnwOjQW9FrM8r6cTnB-VOiB780Xaa3Br3nx3KLFVT6tHlZ-DT6Ny', '九州天衡通衢汇聚之所，百贾交会，游侠云集。广场四角立有九龙擎天金柱，日夜有羽林甲士巡检，商铺鳞次栉比。', '特色风物：神行客商、百工器械、通宝钱庄', '行路耗时：无', '在此寻访'),
('manor', '长乐城主府', '天衡州', 128, 102, '森严官府 · 安全区', '森严官府', '长乐城镇守中枢 · 坐标 [128, 102]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '天衡州总督与长乐城主议政重地，玄金重甲卫士把守。唯有功名卓著者方可登堂觐见领受朝廷密令。', '特色风物：天策榜题名、官职晋升、皇朝俸禄', '行步耗时：15息', '移步府衙'),
('arena', '演武校场', '天衡州', 46, 180, '论剑禁地 · 决斗区', '论剑禁地', '天衡州论剑演武道 · 坐标 [46, 180]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '擂台金石铺就，结界笼罩。八方剑修常于此立下生死状以武会友，扬名九州天梯榜。', '特色风物：天梯排位、押注比试、剑意淬炼', '行步耗时：25息', '前往校场'),
('post', '四方神行驿', '天衡州', 58, 310, '万里神行 · 安全区', '万里神行', '州际传送通关驿 · 坐标 [58, 310]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '上古符阵交织之地，蓄养八百头赤羽飞驹。可借灵脉罡风瞬息飞渡八百里直达各大名邑。', '特色风物：灵符兑换、长途御剑阵、飞舟租借', '神行消耗：神行符×1', '神行传送'),
('pharmacy', '悬壶馆', '天衡州', 92, 240, '回春疗伤 · 丹道堂', '回春疗伤', '悬壶济世丹道堂 · 坐标 [92, 240]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '药王神仙孙思邈驻足之地，药香扑鼻，丹炉终年不息。专治走火入魔与经脉受损。', '特色风物：疗伤丹药、极品灵草、丹道传授', '行步耗时：10息', '步入医馆'),
('changle', '长乐都城', '天衡州', 128, 256, '九州总都 · 安全区', '九州总都', '天衡州皇脉中枢 · 坐标 [128, 256]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '天衡州第一大城，方圆百里，金碧辉煌，聚天下英豪。', '特色风物：万商汇聚、天衡重地', '直达都城', '进入城内'),
('linan', '临安古渡', '天衡州', 412, 198, '水运通衢 · 争渡区', '水运通衢', '天衡东境水渡 · 坐标 [412, 198]', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '漕运必经咽喉，千里大河直通东海与沧澜州，常有水匪出没。', '特色风物：画舫租用、水路货运、东海灵鱼', '御剑耗时：1分20秒', '御剑前往'),
('qingyun', '青云灵山', '天衡州', 160, 90, '洞天福地 · 修炼区', '洞天福地', '清修圣境 · 仙云缭绕', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '名门宗派祖庭所在，灵气氤氲，瀑布倒挂苍崖，多灵禽仙兽。', '特色风物：灵脉打坐、采摘伴生草', '御剑耗时：2分15秒', '御剑前往'),
('tianheng', '天衡州', '大禹皇朝', 256, 256, '中原文脉 · 太平州', '中原文脉', '大禹皇朝祖脉所在 · 太平鼎盛', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '九州腹地沃土千里，王道气象磅礴。名城长乐镇守中央，天下修士问道中原之首选。', '州域特色：皇朝律法、宗门云集、商贸鼎盛', '所处州域', '查看州域'),
('canglan', '沧澜州', '沧澜州', 420, 310, '水木清华 · 历练区', '水木清华', '水系纵横 · 碧海青天', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '万流归海，渔歌互答。蓬莱仙阁与东海剑客常出入其间，多奇异水系秘宝。', '州域特色：水法神通、龙绡锦缎', '跨州传送：神行符×3', '跨州神行'),
('kunwu', '昆吾州', '昆吾州', 75, 380, '剑气凌霄 · 险地', '剑气凌霄', '西极万仞险峰 · 庚金灵脉', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '群山如剑直插霄汉，乃铸剑师与体修圣地。近日地底矿脉异动，妖兽潮大起！', '州域特色：绝世神兵、剑意试炼', '跨州传送：神行符×3', '火速驰援'),
('forge', '天工剑庐', '昆吾州', 75, 380, '地火剑庐 · 铸剑区', '地火剑庐', '西极万仞险峰 · 庚金灵脉 · 剑庐', 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8R_p8MkzyMA7v523t1jbFvPELXrEPfqBFXBR2o2yOcWMD5X9rX5hCSJcS09Y7Jh5J8G2GB5aSdJQurUAUtrfoyAzrbrHwkn15CeIVa5yktyB_KySXxcO_gBWIjC8BXXe6gg58XIU197fEcEcnj6y8a4K_qZt9_v9AM81d1TNB8zRjGUZUAMnYwct7--h8hkwvHUrL4HA7XItpgfWFmpESS_AnVhbqfiCQ0zNaphvs', '昆吾地底赤炎地火交织之地，万千飞剑胚胎在此淬火。乃天工铸手潜修铸道之所。', '特色风物：绝世神兵、剑意淬火、地火精粹', '所处大区', '进入剑庐');

-- 场景归属大区回填：scenes.zone_id 是场景所属大区的唯一真源（传送/对话跨区校验均依赖它）
-- INSERT 未逐行指定该列，因此这里显式回填；未列出的场景默认留在长乐大区
UPDATE scenes SET zone_id = 'canglan_state' WHERE id = 'canglan';
UPDATE scenes SET zone_id = 'kunwu_state'   WHERE id IN ('kunwu', 'forge');
UPDATE scenes SET zone_id = 'qingyun_state' WHERE id = 'qingyun';
UPDATE scenes SET zone_id = 'tianheng_state' WHERE id = 'tianheng';

-- ------------------------------------------------------------------------------
-- 1.1 场景层级与父子关系 (地图三层画布的唯一决定因素)
-- level: 1 = 州域(根节点) / 2 = 都城·地点 / 3 = 坊市·街区
-- parent_id: 决定该点位归属于哪一张上层画布，缺失会导致画布上没有任何点位
-- 注意：coord_x / coord_y 是 512×512 世界坐标，与画布百分比换算在前端统一处理
-- ------------------------------------------------------------------------------
-- 州域 (根节点)
UPDATE scenes SET level = 1, parent_id = NULL
 WHERE id IN ('tianheng', 'canglan', 'kunwu');

-- 都城 · 地点 (隶属天衡州)
UPDATE scenes SET level = 2, parent_id = 'tianheng'
 WHERE id IN ('changle', 'linan', 'qingyun');

-- 坊市 · 街区 (隶属长乐都城)
UPDATE scenes SET level = 3, parent_id = 'changle'
 WHERE id IN ('square', 'manor', 'arena', 'post', 'pharmacy');

-- 坊市 · 街区 (隶属昆吾州)
UPDATE scenes SET level = 3, parent_id = 'kunwu'
 WHERE id IN ('forge');

-- ------------------------------------------------------------------------------
-- 1.2 世界坐标校准 (512×512 世界网格，与 docs/map-hierarchy-plan.md 的节点布局一致)
-- 前端只在展示时把世界坐标换算成画布百分比，不会反写库
-- ------------------------------------------------------------------------------
UPDATE scenes SET coord_x = 256, coord_y = 230 WHERE id = 'tianheng';
UPDATE scenes SET coord_x = 420, coord_y = 282 WHERE id = 'canglan';
UPDATE scenes SET coord_x = 92,  coord_y = 333 WHERE id = 'kunwu';

UPDATE scenes SET coord_x = 256, coord_y = 256, subtitle = '天衡州皇脉中枢 · 坐标 [256, 256]' WHERE id = 'changle';
UPDATE scenes SET coord_x = 420, coord_y = 154, subtitle = '天衡东境水渡 · 坐标 [420, 154]' WHERE id = 'linan';
UPDATE scenes SET coord_x = 113, coord_y = 102 WHERE id = 'qingyun';

UPDATE scenes SET coord_x = 256, coord_y = 282, subtitle = '天衡州长乐城核心 · 坐标 [256, 282]' WHERE id = 'square';
UPDATE scenes SET coord_x = 256, coord_y = 77,  subtitle = '长乐城镇守中枢 · 坐标 [256, 77]' WHERE id = 'manor';
UPDATE scenes SET coord_x = 102, coord_y = 154, subtitle = '天衡州论剑演武道 · 坐标 [102, 154]' WHERE id = 'arena';
UPDATE scenes SET coord_x = 113, coord_y = 399, subtitle = '州际传送通关驿 · 坐标 [113, 399]' WHERE id = 'post';
UPDATE scenes SET coord_x = 179, coord_y = 230, subtitle = '悬壶济世丹道堂 · 坐标 [179, 230]' WHERE id = 'pharmacy';
UPDATE scenes SET coord_x = 256, coord_y = 256 WHERE id = 'forge';

-- 场景地标图标回填 (Material Symbols 标识，匹配 admin 预设库)
UPDATE scenes SET icon = 'flag'                  WHERE id = 'square';
UPDATE scenes SET icon = 'temple_buddhist'       WHERE id = 'manor';
UPDATE scenes SET icon = 'sports_martial_arts'   WHERE id = 'arena';
UPDATE scenes SET icon = 'share_location'        WHERE id = 'post';
UPDATE scenes SET icon = 'local_pharmacy'        WHERE id = 'pharmacy';
UPDATE scenes SET icon = 'castle'                WHERE id = 'changle';
UPDATE scenes SET icon = 'rowing'                WHERE id = 'linan';
UPDATE scenes SET icon = 'landscape'             WHERE id = 'qingyun';
UPDATE scenes SET icon = 'fort'                  WHERE id = 'tianheng';
UPDATE scenes SET icon = 'sailing'               WHERE id = 'canglan';
UPDATE scenes SET icon = 'fort'                  WHERE id = 'kunwu';
UPDATE scenes SET icon = 'local_fire_department' WHERE id = 'forge';

-- 2. 地图 NPC 种子已合并到文件末尾 23.1 节 npc_instances 的初始化数据。

-- 3. 插入初始主角修仙全息种子 (暮云清歌 p_muyun_001)
INSERT INTO players (
    id, username, account_id, password_hash, is_guest, device_id,
    nickname, level, exp, hp, max_hp, mp, max_mp, 
    combat_power, sect, sect_position, realm, vip_level,
    spiritual_root, reputation, residence, likes_count,
    silver, ingot, copper, zone_id, area_id, signature, avatar, title
) VALUES (
    'p_muyun_001',
    'muyun_qingge',
    'acc_muyun_001',
    '42c2f90734fea754864fcfd90f84f46657d3b137a9cf2417667f80b65fffd19e',
    0,
    'dev_seed_muyun_001',
    '暮云清歌',
    68,
    845000,
    18540,
    18540,
    9620,
    9620,
    188650,
    '沧浪剑阁',
    '首席真传',
    '金丹圆满',
    6,
    '庚金至纯剑魄',
    '万仙敬仰 (玖品)',
    '蓬莱灵泉·甲等',
    1280,
    158400,
    2860,
    980520,
    'changle_city',
    'square',
    '一剑霜寒十四州，笑看九州烟雨休。',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDYje_RLeL7kHWpdVbR0NSiXnogmi2iQRnzqAwO7vcFpeTJOH3MVeD6okfV0FgyH-KLbgC-XbUWH0H1YU8roGnC-rOfEsZiIuimHhByqUOZfp8poa6mPPyrJagySrOAVmFDUxyqbaU4a2Nq8S1j4i_xyE3a36cKD5tbw3jcLrEKaK1tKaxrPLS9rLAGc36W2PjnaDWFLw-1VIDqV7ntjgHjBDMY7HPASOAqHJkPUFnq',
    '霜刃绝尘'
);

-- 4. 插入暮云清歌 5 件已穿戴神兵法宝 (WEAPON, HELMET, ARMOR, BOOTS, ARTIFACT)
INSERT INTO inventory (
    id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level
) VALUES 
(
    'inv_sword_001',
    'p_muyun_001',
    'equip_chixiao_sword',
    '赤霄九曜剑',
    'EQUIPMENT',
    1,
    1,
    'WEAPON',
    'MYTHIC',
    '{"outer_attack":1280,"crit_rate":0.42,"crit_dmg":2.15,"metal_affinity":180}',
    12
),
(
    'inv_helmet_001',
    'p_muyun_001',
    'equip_tianshu_crown',
    '天枢冠',
    'EQUIPMENT',
    1,
    1,
    'HELMET',
    'EPIC',
    '{"defense":320,"perception":45,"mp_max":1200}',
    12
),
(
    'inv_armor_001',
    'p_muyun_001',
    'equip_xuanyu_robe',
    '玄羽青衫',
    'EQUIPMENT',
    1,
    1,
    'ARMOR',
    'LEGENDARY',
    '{"hp":2800,"shield":0.18,"defense":650}',
    10
),
(
    'inv_boots_001',
    'p_muyun_001',
    'equip_tayun_boots',
    '踏云飞靴',
    'EQUIPMENT',
    1,
    1,
    'BOOTS',
    'EPIC',
    '{"speed":0.60,"dodge":0.12,"dexterity":150}',
    10
),
(
    'inv_artifact_001',
    'p_muyun_001',
    'equip_taiyin_pendant',
    '太阴玉佩',
    'EQUIPMENT',
    1,
    1,
    'ARTIFACT',
    'RARE',
    '{"mp_regen":25,"ice_resist":0.30,"inner_attack":280}',
    12
);

-- 5. 插入暮云清歌 4 幕江湖生平大事纪 (player_chronicles)
INSERT INTO player_chronicles (id, player_id, title, year, content, order_index) VALUES
('chr_muyun_1', 'p_muyun_001', '【青石初悟】', '天启初年', '居沧澜州青石溪，引气入体开辟庚金剑魄。', 1),
('chr_muyun_2', 'p_muyun_001', '【拜入剑阁】', '开元初年', '试剑峰绝顶夺魁，入阁主独孤忘座下为首席真传。', 2),
('chr_muyun_3', 'p_muyun_001', '【万剑除灵】', '开元二年', '平定万剑冢剑灵之乱，斩获天阶诛仙残剑。', 3),
('chr_muyun_4', 'p_muyun_001', '【金丹破境】', '开元三年', '九道天劫凝铸纯阳金丹，名列潜龙榜首。', 4);

-- 6. 插入一封欢迎飞鸽传书
INSERT INTO mails (
    id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at
) VALUES (
    'mail_welcome_001',
    NULL,
    '长乐城主府',
    'p_muyun_001',
    '恭迎道友登临长乐仙城',
    '暮云清歌道友仙鉴：闻道友破境金丹圆满，长乐总督府特备薄礼相赠，助道友在九州论剑台大展神威！',
    'SYSTEM',
    1,
    0,
    0,
    1798761600
);

INSERT INTO mail_attachments (
    id, mail_id, item_id, item_snapshot, count, silver, ingot
) VALUES (
    'att_welcome_001',
    'mail_welcome_001',
    'mat_nine_sky_iron',
    '{"item_name":"九天玄铁","quality":"EPIC","count":5}',
    5,
    50000,
    500
);

-- 7. 插入一封道友私信密音
INSERT INTO mails (
    id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at
) VALUES (
    'mail_whisper_001',
    'p_huananying_001',
    '花弄影',
    'p_muyun_001',
    '长乐古树放祈愿天灯邀约',
    '清歌师兄，今晚八点同赴长乐古树放祈愿天灯可好？',
    'PLAYER',
    0,
    0,
    0,
    1798761600
);

-- 8. 插入长乐广场常驻同道：花弄影 (p_huananying_001)
INSERT INTO players (
    id, username, account_id, password_hash, is_guest, device_id, nickname,
    level, exp, hp, max_hp, mp, max_mp, combat_power, sect, sect_position,
    realm, vip_level, spiritual_root, reputation, residence, likes_count,
    silver, ingot, copper, zone_id, area_id, signature, avatar, title
) VALUES (
    'p_huananying_001',
    'hua_nongying',
    'acc_hua_001',
    '42c2f90734fea754864fcfd90f84f46657d3b137a9cf2417667f80b65fffd19e',
    0,
    'dev_seed_hua_001',
    '花弄影',
    65,
    720000,
    16400,
    16400,
    11200,
    11200,
    168500,
    '百花谷',
    '百花谷主',
    '金丹后期',
    5,
    '乙木长生灵根',
    '名动九州 (捌品)',
    '落霞仙居·甲等',
    88,
    124000,
    2150,
    520130,
    'changle_city',
    'square',
    '落花流水杳然去，别有天地非人间。',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80',
    '百花谷主'
);

INSERT INTO inventory (
    id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level
) VALUES 
('inv_hua_sword', 'p_huananying_001', 'equip_biyulian_whip', '碧玉青莲软剑', 'EQUIPMENT', 1, 1, 'WEAPON', 'LEGENDARY', '{"inner_attack":1150,"wood_affinity":240,"crit_rate":0.35}', 10),
('inv_hua_crown', 'p_huananying_001', 'equip_luoxia_pin', '落霞凤羽簪', 'EQUIPMENT', 1, 1, 'HELMET', 'EPIC', '{"defense":280,"perception":52,"mp_max":1500}', 10),
('inv_hua_robe', 'p_huananying_001', 'equip_tianxiang_robe', '天香流云仙裙', 'EQUIPMENT', 1, 1, 'ARMOR', 'LEGENDARY', '{"hp":2400,"defense":580,"shield":0.20}', 10),
('inv_hua_boots', 'p_huananying_001', 'equip_luohua_shoes', '踏花凌波履', 'EQUIPMENT', 1, 1, 'BOOTS', 'EPIC', '{"speed":0.55,"dodge":0.15}', 10),
('inv_hua_artifact', 'p_huananying_001', 'equip_linglong_ring', '七彩玲珑环', 'EQUIPMENT', 1, 1, 'ARTIFACT', 'EPIC', '{"mp_regen":30,"wood_affinity":120}', 10);

INSERT INTO player_chronicles (id, player_id, title, year, content, order_index) VALUES
('chr_hua_1', 'p_huananying_001', '【谷主出山】', '天启五年', '接任百花谷主之位，以万木灵诀重铸百花大阵。', 1),
('chr_hua_2', 'p_huananying_001', '【广结善缘】', '开元元年', '于长乐城设立百草医庐，悬壶济世救助凡尘万民。', 2),
('chr_hua_3', 'p_huananying_001', '【结丹巅峰】', '开元三年', '炼制出九转还魂金丹，受邀列座万仙盛典。', 3);

-- 9. 插入长乐广场常驻同道：凌清寒 (p_lingqinghan_001)
INSERT INTO players (
    id, username, account_id, password_hash, is_guest, device_id, nickname,
    level, exp, hp, max_hp, mp, max_mp, combat_power, sect, sect_position,
    realm, vip_level, spiritual_root, reputation, residence, likes_count,
    silver, ingot, copper, zone_id, area_id, signature, avatar, title
) VALUES (
    'p_lingqinghan_001',
    'ling_qinghan',
    'acc_ling_001',
    '42c2f90734fea754864fcfd90f84f46657d3b137a9cf2417667f80b65fffd19e',
    0,
    'dev_seed_ling_001',
    '凌清寒',
    72,
    950000,
    21000,
    21000,
    13500,
    13500,
    215000,
    '玄剑仙宗',
    '首席大师兄',
    '元婴初期',
    7,
    '极寒九霄剑髓',
    '威震八荒 (玖品)',
    '万剑孤峰·天等',
    156,
    210000,
    4500,
    880666,
    'changle_city',
    'square',
    '霜寒三千界，唯我剑心明。',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=128&q=80',
    '玄剑仙宗首席'
);

INSERT INTO inventory (
    id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level
) VALUES 
('inv_ling_sword', 'p_lingqinghan_001', 'equip_hanbing_sword', '九幽玄冰神剑', 'EQUIPMENT', 1, 1, 'WEAPON', 'MYTHIC', '{"outer_attack":1450,"ice_affinity":300,"crit_dmg":2.3}', 12),
('inv_ling_crown', 'p_lingqinghan_001', 'equip_hanxiao_crown', '寒宵冰玉冠', 'EQUIPMENT', 1, 1, 'HELMET', 'LEGENDARY', '{"defense":380,"mp_max":1800}', 11),
('inv_ling_robe', 'p_lingqinghan_001', 'equip_bingxue_robe', '素雪玄霜法袍', 'EQUIPMENT', 1, 1, 'ARMOR', 'MYTHIC', '{"hp":3200,"defense":720,"shield":0.25}', 12),
('inv_ling_boots', 'p_lingqinghan_001', 'equip_xuanshuang_boots', '玄霜疾行步履', 'EQUIPMENT', 1, 1, 'BOOTS', 'LEGENDARY', '{"speed":0.70,"dodge":0.16}', 11),
('inv_ling_artifact', 'p_lingqinghan_001', 'equip_jianxin_bead', '太上斩念剑魄', 'EQUIPMENT', 1, 1, 'ARTIFACT', 'MYTHIC', '{"crit_rate":0.15,"attack_bonus":0.20}', 12);

INSERT INTO player_chronicles (id, player_id, title, year, content, order_index) VALUES
('chr_ling_1', 'p_lingqinghan_001', '【剑心通明】', '天启二年', '三岁握剑，十岁领悟天阶大河剑意。', 1),
('chr_ling_2', 'p_lingqinghan_001', '【独闯魔窟】', '天启七年', '一人一剑斩灭九幽阴煞窟十三大妖魔。', 2),
('chr_ling_3', 'p_lingqinghan_001', '【碎丹成婴】', '开元二年', '于万剑峰顶引动九重紫霄神雷，一举凝聚元婴金身。', 3);

-- ==============================================================================
-- 12. 玩家任务进度表 (player_quests)
-- ==============================================================================
DROP TABLE IF EXISTS player_quests;
CREATE TABLE player_quests (
    player_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'DONE', 'SUBMITTED'
    progress INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, quest_id)
);
CREATE INDEX idx_player_quests_pid ON player_quests(player_id);

-- ==============================================================================
-- ==============================================================================
-- 12.5 剧情剧本资产表 (dialogue_packages)
-- ==============================================================================
DROP TABLE IF EXISTS dialogue_packages;
CREATE TABLE dialogue_packages (
    id TEXT PRIMARY KEY,                           -- 剧本唯一标识 (如: pkg_mofang_gujing)
    name TEXT NOT NULL,                            -- 剧本名称 (如: "长乐古井篇 · 幽冥探秘")
    description TEXT DEFAULT '',                   -- 剧本描述/背景设定
    category TEXT NOT NULL DEFAULT 'STORY',        -- 分类: MAIN(主线) / BRANCH(支线) / ENCOUNTER(奇遇) / FACILITY(设施)
    default_root_node_id TEXT,                     -- 默认起始根节点 ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dialogue_packages_category ON dialogue_packages(category);

-- 13. NPC 入口路由规则表 (npc_dialogue_routers)
-- ==============================================================================
DROP TABLE IF EXISTS npc_dialogue_routers;
CREATE TABLE npc_dialogue_routers (
    id TEXT PRIMARY KEY,
    npc_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,        -- 优先级：数字越大越优先匹配
    root_node_id TEXT NOT NULL,        -- 命中的起始对话节点 ID
    conditions_json TEXT DEFAULT '[]', -- 触发条件 JSON 数组
    description TEXT,                  -- 后台配置备注
    package_id TEXT DEFAULT NULL,      -- 所属剧本
    scene_id TEXT DEFAULT NULL,        -- 限定场景
    -- 逻辑关联 npc_instances.npc_id；schema 初始化时 npc_instances 建表在后，
    -- 为避免顺序依赖，不建立物理外键，由后台删除 NPC 时显式清理路由。
    UNIQUE(id)
);
CREATE INDEX idx_npc_dialogue_routers_priority ON npc_dialogue_routers(npc_id, priority DESC);

-- ==============================================================================
-- 14. 对话节点表 (dialogue_nodes)
-- ==============================================================================
DROP TABLE IF EXISTS dialogue_nodes;
CREATE TABLE dialogue_nodes (
    id TEXT PRIMARY KEY,               -- 节点唯一标识
    npc_id TEXT NOT NULL,              -- 归属说话人
    chapter_title TEXT,                -- 章节标识，如 '长乐古井篇 · 卷一'
    content TEXT NOT NULL,             -- 兼容字段：多页台词合并文本（第一页/---分隔）
    pages_json TEXT NOT NULL DEFAULT '[]', -- 节点内多段线性台词 [{speaker_id,content}]
    direct_next_node_id TEXT DEFAULT NULL, -- 无分支直连的下一节点；与 dialogue_options 互斥
    quote_box TEXT,                    -- 蓝框强调/暗语提示文本
    ui_meta_json TEXT DEFAULT '{}',    -- 表现层扩展配置
    editor_pos_json TEXT DEFAULT '{}', -- 可视化工作流节点坐标
    package_id TEXT DEFAULT NULL,      -- 所属剧本 ID
    scene_id TEXT DEFAULT NULL,        -- 节点发生地图；绑定剧本的 NPC 只在该节点所在地图出现
    on_enter_actions_json TEXT NOT NULL DEFAULT '[]',    -- 进入节点时触发的动作
    on_complete_actions_json TEXT NOT NULL DEFAULT '[]'  -- 完成节点（选择任一选项离开）时触发的动作
);
CREATE INDEX idx_dialogue_nodes_npc ON dialogue_nodes(npc_id);
CREATE INDEX idx_dialogue_nodes_package ON dialogue_nodes(package_id);
CREATE INDEX idx_dialogue_nodes_scene ON dialogue_nodes(scene_id);

-- ==============================================================================
-- 15. 对话选项与动作边表 (dialogue_options)
-- ==============================================================================
DROP TABLE IF EXISTS dialogue_options;
CREATE TABLE dialogue_options (
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
CREATE INDEX idx_dialogue_options_node ON dialogue_options(node_id, sort_order);

-- ==============================================================================
-- 16. 玩家剧情/对话状态与历史记录表 (player_dialogue_flags)
-- ==============================================================================
DROP TABLE IF EXISTS player_dialogue_flags;
CREATE TABLE player_dialogue_flags (
    player_id TEXT NOT NULL,
    flag_key TEXT NOT NULL,            -- 状态键
    flag_value INTEGER DEFAULT 1,      -- 状态值
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, flag_key)
);
CREATE INDEX idx_player_dialogue_flags_pid ON player_dialogue_flags(player_id);

-- ==============================================================================
-- 16.1 玩家剧情进度表 (player_story_progress)
-- 记录玩家在每套剧情剧本中的当前节点；地图 NPC 的可见场景由该节点决定
-- ==============================================================================
DROP TABLE IF EXISTS player_story_progress;
CREATE TABLE player_story_progress (
    player_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    node_id TEXT NOT NULL,                 -- 当前所在剧情节点 (dialogue_nodes.id)
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / COMPLETED
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, package_id)
);
CREATE INDEX idx_player_story_progress_player ON player_story_progress(player_id);
CREATE INDEX idx_player_story_progress_package ON player_story_progress(package_id);

-- ==============================================================================
-- 17. 剧情节点入口白名单表 (dialogue_entry_nodes)
-- 战斗结算后允许直接打开的剧情节点；require_flag 未置位时禁止直开
-- ==============================================================================
DROP TABLE IF EXISTS dialogue_entry_nodes;
CREATE TABLE dialogue_entry_nodes (
    node_id TEXT PRIMARY KEY,                      -- 允许直开的节点 ID
    require_flag TEXT,                             -- 需要的剧情 Flag (为 1 时放行)
    description TEXT
);

-- ==============================================================================
-- 17. 出战队伍表 (party_members)
-- 记录每名玩家招募/结伴出战的伙伴阵容，通过 player_id 关联 players 表
-- 主角（队长/阵眼）不落此表，由 players 实时数据合成，避免等级/头像出现双份脏数据
-- ==============================================================================
DROP TABLE IF EXISTS party_members;
CREATE TABLE party_members (
    id TEXT PRIMARY KEY,                           -- 队员唯一标识 (playerId:memberKey)
    player_id TEXT NOT NULL,                       -- 所属玩家 ID (关联 players.id)
    member_key TEXT NOT NULL,                      -- 角色模板 ID (npc_templates.id，如: tpl_cangyun)
    member_name TEXT NOT NULL,                     -- 伙伴名号 (如: 苍云剑客)
    title TEXT,                                    -- 门派/定位称号 (如: 苍云剑宗 · 剑修)
    avatar TEXT,                                   -- 伙伴头像 URL
    role TEXT NOT NULL DEFAULT 'DPS',              -- 队伍定位: DPS, HEALER, TANK
    realm TEXT,                                    -- 修为境界 (如: 金丹中期)
    level INTEGER NOT NULL DEFAULT 1,              -- 等级
    sort_order INTEGER NOT NULL DEFAULT 0,         -- 出战卡片站位排序 (越小越靠前)
    is_active INTEGER NOT NULL DEFAULT 1,          -- 出战状态: 1:出战, 0:休息(待命)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(player_id, member_key)
);

CREATE INDEX idx_party_members_player ON party_members(player_id, sort_order);
CREATE INDEX idx_party_members_active ON party_members(player_id, is_active);


-- ==============================================================================
-- 18. 出战伙伴不再单独建档
-- 任何 NPC 模板都可以进入玩家队伍：角色真源统一为 npc_templates，
-- 玩家拥有的角色记录在 party_members，member_key 直接存 npc_templates.id。
-- 原 companion_templates 表已删除，避免同一角色在两张模板表中重复维护。
-- ==============================================================================

-- ==============================================================================
-- 19. 内容预设表 (preset_assets)
-- 头像立绘目录与道号取名库：前端不再内置静态数组，统一由本表下发
-- ==============================================================================
DROP TABLE IF EXISTS preset_assets;
CREATE TABLE preset_assets (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,                        -- 'AVATAR' (头像) / 'NAME' (道号)
    label TEXT NOT NULL,                           -- 头像名 / 道号
    sub_label TEXT,                                -- 头像流派说明 (NAME 类为 NULL)
    url TEXT,                                      -- 头像直链 (NAME 类为 NULL)
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_preset_assets_category ON preset_assets(category, sort_order);

INSERT INTO preset_assets (id, category, label, sub_label, url, sort_order) VALUES
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
DROP TABLE IF EXISTS venues;
CREATE TABLE venues (
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

CREATE INDEX idx_venues_scene ON venues(scene_id, sort_order);

INSERT INTO venues (id, scene_id, name, badge, tag, description, chips_json, action_notice, img, sort_order) VALUES
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

-- 出战伙伴不再建档即预置：由剧情动作 JOIN_PARTY 按需入队，
-- 否则"三位同伴入队"的剧情永远是一句空话。

-- ==============================================================================
-- 21. 道具模版表 (item_templates)
-- 发放/展示道具时的名称、品类、品阶唯一真源；对话动作不再内置道具名字典
-- ==============================================================================
DROP TABLE IF EXISTS item_templates;
CREATE TABLE item_templates (
    id TEXT PRIMARY KEY,                           -- 道具模版 ID (如: item_tianji_compass)
    name TEXT NOT NULL,                            -- 道具名 (如: 天机罗盘)
    type TEXT NOT NULL DEFAULT 'MATERIAL',         -- EQUIPMENT / CONSUMABLE / MATERIAL / SPECIAL
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- COMMON / RARE / EPIC / LEGENDARY / MYTHIC
    description TEXT DEFAULT ''                    -- 风物说明
);

INSERT INTO item_templates (id, name, type, quality, description) VALUES
('item_tianji_compass', '天机罗盘', 'MATERIAL', 'RARE', '天机阁司星使所赐，可推演古井阵法生门。'),
('item_juqi_dan', '聚气丹', 'CONSUMABLE', 'COMMON', '聚引周遭灵气入体，助益练气破阶。'),
('item_healing_dan', '回春金疮散', 'CONSUMABLE', 'COMMON', '百花谷秘制金疮圣药，可迅速止血愈伤，调养体魄恢复充沛气血。'),
('item_zhuji_dan', '筑基丹', 'CONSUMABLE', 'RARE', '破境筑基之丹，服之可固本培元。'),
('item_jindan_yuye', '金丹玉液', 'CONSUMABLE', 'EPIC', '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力。'),
('item_tianjie_jinchuang', '天阶金创药', 'CONSUMABLE', 'EPIC', '悬壶馆药王孙真人秘炼天阶金创圣药，肉白骨活死人，服用可瞬间恢复 12,000 点气血。'),
('item_xisui_dan', '洗髓丹', 'CONSUMABLE', 'LEGENDARY', '脱胎换骨之无上灵丹，洗经伐髓，服用永久增加 1,000 气血上限与 500 内力上限，全状态补满并获得 15,000 气海修为！'),
('item_ling_shi', '下品灵石', 'MATERIAL', 'COMMON', '九州通行的低阶灵石，蕴含微薄灵气。'),
('item_shangpin_lingshi', '上品灵石', 'MATERIAL', 'EPIC', '通体晶莹剔透的高纯度灵石，灵气纯澈沛然。'),
('item_hantie_ore', '寒铁精矿', 'MATERIAL', 'RARE', '极北苦寒之地所凝玄铁精魄，铸剑绝佳灵材。'),
('item_sword_steel', '寒光玄铁剑', 'EQUIPMENT', 'RARE', '采极北玄铁所铸利刃，剑锋掠寒芒，锋锐逼人。'),
('item_teleport_rune', '神行符', 'SPECIAL', 'RARE', '缩地成寸灵符，撕碎后可瞬息御风而行，免耗盘缠。'),
('item_scroll_taiyi', '太乙心经残卷', 'SKILL_BOOK', 'EPIC', '上古玄门太乙真经残页，参悟可略窥天道玄奥，大幅提升修仙领悟。'),
('item_secret_token', '宗门密令', 'SPECIAL', 'EPIC', '宗门加急密令，凭此可在各地驿馆验证身份。');

-- ==============================================================================
-- 21.1 丹道药品配置表 (medicines)
-- 包含药品名称、品质、悬壶馆售价、药效数值、风物描述与在售状态
-- ==============================================================================
DROP TABLE IF EXISTS medicines;
CREATE TABLE medicines (
    id TEXT PRIMARY KEY,                           -- 药品唯一标识 (如: item_healing_dan)
    name TEXT NOT NULL,                            -- 药品名称 (如: 回春金疮散)
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- 药品品阶 (COMMON / RARE / EPIC / LEGENDARY / MYTHIC)
    type TEXT NOT NULL DEFAULT 'CONSUMABLE',       -- 药品类别 (CONSUMABLE)
    price_copper INTEGER NOT NULL DEFAULT 100,     -- 悬壶馆售价 (铜钱)
    effect_desc TEXT NOT NULL DEFAULT '',          -- 药效详细说明
    description TEXT NOT NULL DEFAULT '',          -- 风物典故 / 背景简介
    icon TEXT NOT NULL DEFAULT 'medication',       -- 图标标识 (medication, healing, flare, spa, science, etc.)
    hp_restore INTEGER NOT NULL DEFAULT 0,         -- 服用瞬回气血值
    mp_restore INTEGER NOT NULL DEFAULT 0,         -- 服用瞬回真气值
    exp_restore INTEGER NOT NULL DEFAULT 0,        -- 服用增加修为值
    max_hp_bonus INTEGER NOT NULL DEFAULT 0,       -- 永久增加气血上限
    max_mp_bonus INTEGER NOT NULL DEFAULT 0,       -- 永久增加内力上限
    status INTEGER NOT NULL DEFAULT 1,             -- 状态: 1=在售/启用, 0=下架/停用
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO medicines (id, name, quality, type, price_copper, effect_desc, description, icon, hp_restore, mp_restore, exp_restore, max_hp_bonus, max_mp_bonus, status) VALUES
('item_healing_dan', '回春金疮散', 'COMMON', 'CONSUMABLE', 100, '服用迅速恢复 3,000 点气血', '百花谷秘制金疮圣药，可迅速止血愈伤，调养体魄恢复充沛气血。', 'healing', 3000, 0, 0, 0, 0, 1),
('item_juqi_dan', '聚气丹', 'COMMON', 'CONSUMABLE', 120, '服用恢复 500 点真气与 300 点修为', '聚引周遭灵气入体，助益练气破阶。', 'spa', 0, 500, 300, 0, 0, 1),
('item_zhuji_dan', '筑基丹', 'RARE', 'CONSUMABLE', 800, '服用恢复 5,000 气血、2,000 真气与 2,000 修为', '破境筑基之丹，服之可固本培元。', 'science', 5000, 2000, 2000, 0, 0, 1),
('item_tianjie_jinchuang', '天阶金创药', 'EPIC', 'CONSUMABLE', 600, '服用瞬间恢复 12,000 点气血并平复内伤', '悬壶馆药王秘炼天阶金创圣药，肉白骨活死人。', 'medication', 12000, 0, 0, 0, 0, 1),
('item_xisui_dan', '洗髓丹', 'LEGENDARY', 'CONSUMABLE', 3000, '永久增加 1,000 气血上限与 500 内力上限，全状态回满 + 15,000 修为', '脱胎换骨之无上灵丹，洗经伐髓。', 'flare', 99999, 99999, 15000, 1000, 500, 1),
('item_jindan_yuye', '金丹玉液', 'EPIC', 'CONSUMABLE', 2000, '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力，状态完全补满并获得 10,000 修为。', '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力。', 'water_drop', 99999, 99999, 10000, 0, 0, 1);


-- ==============================================================================
-- 22. 委托模版表 (quest_templates)
-- 任务标题的唯一真源；对话接取/交付时按 quest_id 读取，不在代码里写死标题
-- ==============================================================================
DROP TABLE IF EXISTS quest_templates;
CREATE TABLE quest_templates (
    id TEXT PRIMARY KEY,                           -- 委托 ID (如: quest_gujing_01)
    title TEXT NOT NULL,                           -- 委托标题
    summary TEXT DEFAULT ''                        -- 委托简述
);

INSERT INTO quest_templates (id, title, summary) VALUES
('quest_gujing_01', '长乐古井异动 · 卷一', '携天机罗盘前往长乐古井，探查太幽玄冥大阵封印异动。');


-- ==============================================================================
-- 23. 怪物组模版表 (monster_groups)
-- 战斗敌方的唯一真源；dialogue_options 里的 monsterGroupId 直接查本表
-- ==============================================================================
DROP TABLE IF EXISTS monster_groups;
CREATE TABLE monster_groups (
    id TEXT PRIMARY KEY,                           -- 怪物组 ID (如: nether_01)
    name TEXT NOT NULL,                            -- 战队名 (如: 幽冥敌众)
    enemies_json TEXT NOT NULL,                    -- 敌方阵容 JSON 数组
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO monster_groups (id, name, enemies_json) VALUES
('nether_01', '幽冥敌众', '[
  {"id":"enemy_guard","name":"幽冥守卫","avatar":"/assets/combat/characters/hero_shieldman_trans.png","position":"FRONT","slotIndex":0,"isBoss":true,"hp":18500,"maxHp":18500,"mp":200,"maxMp":200,"attack":2100,"defense":2600,"speed":95},
  {"id":"enemy_firefox","name":"山野妖灵","avatar":"/assets/combat/characters/enemy_firefox_trans.png","position":"FRONT","slotIndex":1,"isBoss":false,"hp":14200,"maxHp":14200,"mp":180,"maxMp":180,"attack":2800,"defense":1100,"speed":140},
  {"id":"enemy_cultist","name":"邪化修士","avatar":"/assets/combat/characters/enemy_cultist_trans.png","position":"BACK","slotIndex":2,"isBoss":false,"hp":19800,"maxHp":19800,"mp":500,"maxMp":500,"attack":3600,"defense":1500,"speed":120}
]');

-- ==============================================================================
-- 23.1 NPC 模板库 / 地图实例 / 战斗配置槽位
-- ==============================================================================
DROP TABLE IF EXISTS npc_templates;
CREATE TABLE npc_templates (
    id TEXT PRIMARY KEY,                           -- 模板 ID (如: tpl_jianwuhen)
    key TEXT UNIQUE NOT NULL,                      -- 模板业务键 (如: jianwuhen)
    name TEXT NOT NULL,                            -- 模板姓名 (如: 剑无痕)
    title TEXT NOT NULL DEFAULT '',                -- 称号/门派
    badge TEXT NOT NULL DEFAULT '',                -- 头衔印章
    avatar TEXT NOT NULL DEFAULT '',               -- 地图/名片立绘
    idle_avatar TEXT NOT NULL DEFAULT '',          -- 战斗待机立绘
    attack_avatar TEXT NOT NULL DEFAULT '',        -- 预留：战斗攻击立绘
    base_hp INTEGER NOT NULL DEFAULT 10000,        -- 1 级基础气血
    base_mp INTEGER NOT NULL DEFAULT 200,          -- 1 级基础内力
    base_attack INTEGER NOT NULL DEFAULT 1500,     -- 1 级基础攻击
    base_defense INTEGER NOT NULL DEFAULT 800,     -- 1 级基础防御
    base_speed INTEGER NOT NULL DEFAULT 100,       -- 1 级基础速度
    -- 八维扩展：全部为 NOT NULL，数值由迁移/后台直接写入数据库
    base_matk INTEGER NOT NULL DEFAULT 0,          -- 1 级基础法术攻击
    base_mdef INTEGER NOT NULL DEFAULT 0,          -- 1 级基础法术防御
    base_crit REAL NOT NULL DEFAULT 0,             -- 1 级基础暴击率 0~1
    -- 成长配置：1 级基础值 + (等级-1) × 每级成长值
    growth_template TEXT DEFAULT NULL,             -- 仅作为新建模板的预设标识；实际成长值以 growth_* 列为准
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- COMMON / ELITE / BOSS / LEGENDARY
    growth_hp INTEGER NOT NULL DEFAULT 0,          -- 每级气血成长（数据库唯一真源）
    growth_mp INTEGER NOT NULL DEFAULT 0,
    growth_attack INTEGER NOT NULL DEFAULT 0,
    growth_matk INTEGER NOT NULL DEFAULT 0,
    growth_defense INTEGER NOT NULL DEFAULT 0,
    growth_mdef INTEGER NOT NULL DEFAULT 0,
    growth_speed REAL NOT NULL DEFAULT 0,
    growth_crit REAL NOT NULL DEFAULT 0,
    bonus_json TEXT NOT NULL DEFAULT '{}',         -- 装备/永久属性加成 { equipment:[], permanent:[] }
    skills_json TEXT NOT NULL DEFAULT '[]',        -- 技能配置
    description TEXT NOT NULL DEFAULT '',
    dialogue_package_id TEXT DEFAULT NULL,         -- 默认关联剧情剧本 (dialogue_packages.id)
    dialogue_root_node_id TEXT DEFAULT NULL,       -- 默认起始根节点 (dialogue_nodes.id)
    quote TEXT DEFAULT '',                         -- 默认对话台词
    gossip TEXT DEFAULT '',                        -- 探听异闻台词
    -- 以下字段供"任何 NPC 都可以进入玩家队伍"使用：
    -- 战斗属性由 base_* + growth_* + quality + 实例 realm + bonus_json
    -- 统一交给 NpcAttributeCalculator 生成；party_members 只保存玩家侧等级与出战状态。
    role TEXT NOT NULL DEFAULT 'DPS',              -- 队伍定位: DPS / HEALER / TANK
    sort_order INTEGER NOT NULL DEFAULT 0,         -- 队伍名册默认排序
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS npc_instances;
CREATE TABLE npc_instances (
    -- 实例唯一标识：每个从 npc_templates 创建出来的 NPC 都有一行
    npc_id TEXT PRIMARY KEY,                       -- 如: npc_cangyun_001 / npcinst_mail_xxx / npcinst_battle_xxx
    template_id TEXT NOT NULL,                     -- 来源模板 (npc_templates.id)
    instance_type TEXT NOT NULL DEFAULT 'WORLD',   -- WORLD / PLAYER / BATTLE / MAIL
    status TEXT NOT NULL DEFAULT 'ACTIVE',         -- ACTIVE / PENDING / MERGED / DISABLED

    -- 地图归属（WORLD 实例必填；PLAYER / BATTLE 实例可为空）
    scene_id TEXT,                                 -- 所属场景 ID (关联 scenes.id)
    key TEXT,                                      -- WORLD 业务键，如: cangyun
    name TEXT NOT NULL,                            -- 实例显示名（可由模板覆盖）
    badge TEXT DEFAULT '',                         -- 红色印章/头衔
    title TEXT NOT NULL,                           -- 实例称号/门派
    avatar TEXT,                                   -- 实例头像/立绘 URL
    type TEXT NOT NULL DEFAULT 'dialogue',         -- dialogue / battle / companion
    quote TEXT DEFAULT '',                         -- 默认对话台词
    gossip TEXT DEFAULT '',                        -- 探听异闻台词
    dialogue_package_id TEXT DEFAULT NULL,         -- 关联剧情剧本 (dialogue_packages.id)
    dialogue_root_node_id TEXT DEFAULT NULL,       -- 自定义指定起始根节点 (dialogue_nodes.id)

    -- 实例用途与玩家剧情位置
    -- MAP: 地图常驻 NPC；STORY: 玩家剧情 NPC；STORY_BATTLE: 剧情战斗角色定义
    npc_role TEXT NOT NULL DEFAULT 'MAP',
    pos_x INTEGER,                                 -- 玩家剧情 NPC 在地图上的 X 坐标
    pos_y INTEGER,                                 -- 玩家剧情 NPC 在地图上的 Y 坐标

    -- 归属与发放审计
    owner_player_id TEXT,                          -- STORY 实例归属玩家；MAP/STORY_BATTLE 为 NULL
    created_by TEXT NOT NULL DEFAULT 'SYSTEM',     -- 发放者/创建者：admin 用户名 / SYSTEM / DIALOGUE
    source TEXT NOT NULL DEFAULT 'WORLD',          -- WORLD / MAIL_GRANT / DIALOGUE_JOIN / MONSTER_GROUP / ADMIN
    source_ref TEXT,                               -- 邮件 ID / 战斗配置 ID / 对话节点等来源引用

    -- 世界战斗配置（WORLD 实例专用）
    battle_group_id TEXT DEFAULT NULL,             -- 绑定的战斗配置 (monster_groups.id)
    battle_level INTEGER NOT NULL DEFAULT 1,       -- 实例建议等级/展示等级
    battle_member_levels_json TEXT NOT NULL DEFAULT '{}', -- 该地图 NPC 专属的敌方槽位等级覆盖 {"0":20,"1":15}
    battle_reward_json TEXT NOT NULL DEFAULT '{}', -- 实例胜利奖励
    respawn_seconds INTEGER NOT NULL DEFAULT 0,    -- 击败重生冷却秒数
    once_flag TEXT DEFAULT NULL,                   -- 一次性击败标记

    -- 玩家/战斗槽位实例等级与境界（模板不再保存默认等级/境界）
    level INTEGER NOT NULL DEFAULT 1,
    realm TEXT DEFAULT NULL,                       -- 修为境界 (如: 金丹中期)

    -- 实例级属性覆盖（为空则继承 npc_templates）
    quality TEXT DEFAULT NULL,                     -- 实例品质覆盖
    growth_template TEXT DEFAULT NULL,             -- 实例成长模板覆盖
    bonus_json TEXT NOT NULL DEFAULT '{}',         -- 实例专属永久加成（与模板加成叠加）
    skills_json TEXT DEFAULT NULL,                 -- 实例专属技能配置覆盖（JSON 数组，如: ["skill_pure_yang_sword"]，为空则继承模板）

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES npc_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (battle_group_id) REFERENCES monster_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_npc_instances_scene ON npc_instances(scene_id, type);
CREATE INDEX idx_npc_instances_template ON npc_instances(template_id);
CREATE INDEX idx_npc_instances_group ON npc_instances(battle_group_id);
CREATE INDEX idx_npc_instances_owner ON npc_instances(owner_player_id, status);
CREATE INDEX idx_npc_instances_source ON npc_instances(source, status);
CREATE INDEX idx_npc_instances_role_scene ON npc_instances(npc_role, scene_id);
-- 地图常驻 NPC 的 key 唯一；剧情 NPC 允许不同玩家共用同一个剧情 key
CREATE UNIQUE INDEX idx_npc_instances_map_key ON npc_instances(key)
    WHERE key IS NOT NULL AND instance_type = 'WORLD' AND npc_role = 'MAP';
-- 一个玩家在一个剧本里的同一个剧情角色只能有一条 STORY 记录
CREATE UNIQUE INDEX idx_npc_instances_story_singleton
    ON npc_instances(owner_player_id, dialogue_package_id, template_id)
    WHERE npc_role = 'STORY' AND owner_player_id IS NOT NULL;
-- 一个战斗选项只能有一条 STORY_BATTLE 定义
CREATE UNIQUE INDEX idx_npc_instances_story_battle_option
    ON npc_instances(source_ref)
    WHERE npc_role = 'STORY_BATTLE';

DROP TABLE IF EXISTS monster_group_members;
CREATE TABLE monster_group_members (
    group_id TEXT NOT NULL,                        -- 战斗配置 ID
    slot_index INTEGER NOT NULL,                   -- 0..3，对应战斗画布敌方槽位
    npc_instance_id TEXT NOT NULL,                 -- 该槽位引用的 NPC 实例 (npc_instances.npc_id)
    level INTEGER NOT NULL DEFAULT 1,              -- 该实例的等级 (属性按等级缩放)
    position TEXT NOT NULL DEFAULT 'FRONT',        -- FRONT / BACK
    is_boss INTEGER NOT NULL DEFAULT 0,            -- 是否头领
    quality TEXT DEFAULT NULL,                     -- 槽位品质覆盖 (为空则继承实例/模板)
    hp_override INTEGER DEFAULT NULL,              -- 指定气血 (为空则统一计算服务生成)
    mp_override INTEGER DEFAULT NULL,
    attack_override INTEGER DEFAULT NULL,
    defense_override INTEGER DEFAULT NULL,
    speed_override INTEGER DEFAULT NULL,
    PRIMARY KEY (group_id, slot_index),
    FOREIGN KEY (group_id) REFERENCES monster_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (npc_instance_id) REFERENCES npc_instances(npc_id) ON DELETE CASCADE
);

CREATE INDEX idx_monster_group_members_instance ON monster_group_members(npc_instance_id);

-- 1) 核心 NPC 模板由下方显式 INSERT 提供；不再从 npcs 表自动派生。
--    任何新增 NPC 都必须先有模板，再在 npc_instances 中放置。

-- 2) 《万象录》核心立绘全鉴模板（数值为 1 级基础值，战斗中按槽位等级缩放）
INSERT OR REPLACE INTO npc_templates
    (id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
     base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description)
VALUES
(
    'tpl_cangyun', 'cangyun', '苍云剑客', '出战核心输出 · 天策剑修', '剑意纵横',
    'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ',
    '/assets/combat/characters/hero_cangyun_idle_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ',
    15800, 300, 3200, 1800, 150,
    '["skill_pure_yang_sword","skill_wanjian_guizong","skill_basic_attack"]',
    '青碧雷光月牙剑弧，单手执剑疾速突进横斩，凌厉剑气四溢。面向左侧敌方阵容。'
),
(
    'tpl_luoqinghan', 'luoqinghan', '洛清寒', '后排法术控场 · 极寒冰修', '九霄玄冰',
    'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA',
    '/assets/combat/characters/hero_luoqinghan_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA',
    11200, 450, 3800, 1200, 130,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '雪花法杖凌空凝聚玄冰，冰晶雪花阵环绕身周，白蓝广袖如飞雪轻拂。面向左侧。'
),
(
    'tpl_suningxiang', 'suningxiang', '苏凝香', '团队治疗辅助 · 回春医仙', '妙手回春',
    'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA',
    '/assets/combat/characters/hero_suningxiang_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA',
    12500, 400, 1400, 1400, 110,
    '["skill_tai_qing_heal","skill_spring_rain","skill_basic_attack"]',
    '横吹青玉灵笛，碧绿生命光环与粉色莲花瓣盘旋环绕，步步生莲。面向左侧。'
),
(
    'tpl_tiexinwu', 'tiexinwu', '重甲卫士', '前排磐石肉盾 · 古铜巨盾', '固若金汤',
    'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ',
    '/assets/combat/characters/hero_shieldman_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ',
    19500, 200, 1800, 2600, 95,
    '["skill_basic_attack"]',
    '一手稳立厚实古铜巨盾，一手斜握精铁短剑，金绿护盾罡气环绕，固若金汤。面向左侧。'
),
(
    'tpl_xuanjia_wushi', 'xuanjia_wushi', '玄甲武士', '重装近战狂战 · 青龙偃月', '狂澜刀诀',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    16800, 260, 3100, 1600, 115,
    '["skill_basic_attack"]',
    '手握铭龙重型斩马刀，全力下劈带起冲天金赤真火气浪与爆裂火屑。面向左侧。'
),
(
    'tpl_zixiao_fashi', 'zixiao_fashi', '紫霄法师', '群体元素轰炸 · 太清天师', '九霄雷引',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    11500, 520, 3700, 1150, 125,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '右手执八卦雷灵幡，左手掐剑指引九霄神雷，紫金电弧撕裂虚空。面向左侧。'
),
(
    'tpl_xuanmen_shushi', 'xuanmen_shushi', '玄门术士', '诅咒控场术士 · 太乙符法', '赤练神符',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    12800, 420, 3200, 1350, 120,
    '["skill_basic_attack"]',
    '指尖引燃朱砂真符，数道燃烧黄纸神符化作火螺旋飞舞，手提引魂灯。面向左侧。'
),
(
    'tpl_nether_cultist', 'nether_cultist', '邪化修士', '敌方核心Boss · 白骨魔修', '九幽血咒',
    'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw',
    '/assets/combat/characters/enemy_cultist_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw',
    19800, 500, 3600, 1500, 120,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '手执骷髅法杖，激发幽黑血煞煞气球，周身浮现血色残缺古文字符。面向右侧敌对阵营。'
),
(
    'tpl_nether_firefox', 'nether_firefox', '赤焰九尾狐', '敌方敏捷妖兽 · 妖火奔袭', '赤炎梵天',
    'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg',
    '/assets/combat/characters/enemy_firefox_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg',
    14200, 180, 2800, 1100, 140,
    '["skill_basic_attack"]',
    '低姿伏地蓄势前扑，九条炽焰尾羽熊熊燃烧，神火符印流转周身。面向右侧敌对阵营。'
);

-- 3.1) 三个可入队主角的队伍定位/排序（等级与境界已移至 npc_instances）
UPDATE npc_templates SET role = 'DPS',    sort_order = 10 WHERE id = 'tpl_cangyun';
UPDATE npc_templates SET role = 'DPS',    sort_order = 20 WHERE id = 'tpl_luoqinghan';
UPDATE npc_templates SET role = 'HEALER', sort_order = 30 WHERE id = 'tpl_suningxiang';

-- 3.2) 旧战斗配置引用的补全模板（保持历史战斗组可用；已存在则跳过）
INSERT OR IGNORE INTO npc_templates
    (id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
     base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description)
VALUES
('tpl_jianwuhen', 'jianwuhen', '剑无痕', '独孤剑痴', '剑痴', '', '', '', 12000, 400, 1600, 900, 120, '[]', '演武校场剑道魁首'),
('tpl_tuobalie', 'tuobalie', '拓跋烈', '霸刀门主', '门主', '', '', '', 14000, 300, 1800, 1000, 110, '[]', '霸刀门当代门主'),
('tpl_changle_guard', 'changle_guard', '长乐统领', '都城宿卫', '宿卫', '', '', '', 16000, 400, 1900, 1200, 105, '[]', '长乐都城禁军统领'),
('tpl_qingyun_jiankui', 'qingyun_jiankui', '玄剑傀儡', '青云试炼剑灵', '剑灵', '', '', '', 18000, 500, 2100, 1300, 130, '[]', '青云灵山试炼剑傀'),
('tpl_jianshi_a', 'jianshi_a', '剑侍甲', '演武剑侍', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 5000, 200, 800, 500, 110, '[]', '演武剑阵前排剑侍'),
('tpl_jianshi_b', 'jianshi_b', '剑侍乙', '演武剑侍', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 4800, 200, 850, 480, 115, '[]', '演武剑阵后排剑侍'),
('tpl_kuangdao_a', 'kuangdao_a', '霸刀门徒', '霸刀门弟子', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 6000, 200, 1000, 600, 105, '[]', '霸刀门横练弟子'),
('tpl_kuangdao_b', 'kuangdao_b', '霸刀门徒·狂', '霸刀门弟子', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 5500, 200, 1100, 550, 115, '[]', '霸刀门狂化弟子'),
('tpl_suwei_a', 'suwei_a', '长乐宿卫', '都城禁军', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 7000, 200, 1100, 800, 100, '[]', '长乐都城宿卫'),
('tpl_suwei_b', 'suwei_b', '长乐宿卫·弩', '都城禁军', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 6000, 200, 1200, 700, 110, '[]', '长乐都城弩手'),
('tpl_jianling_a', 'jianling_a', '剑灵·青', '青云剑灵', '', '/assets/combat/characters/enemy_firefox_trans.png', '', '', 6500, 300, 1300, 700, 130, '[]', '青云试炼青锋剑灵'),
('tpl_jianling_b', 'jianling_b', '剑灵·玄', '青云剑灵', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 6200, 300, 1400, 650, 135, '[]', '青云试炼玄锋剑灵'),
('tpl_nether_guard', 'nether_guard', '幽冥守卫', '血炼阵眼', 'Boss', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 12000, 200, 1400, 1700, 95, '[]', '幽冥死气凝成的阵眼肉盾');

-- 3.3) 八维基础值与每级成长值直接落库（数据库是唯一真源，运行时不再做旧版推导）
--      - 旧五维模板：法攻/法防 = 物攻/物防，暴击 = 0.25
--      - 成长值按基础值 × 10%/级 固化，保持历史战斗数值
UPDATE npc_templates SET
    base_matk = base_attack,
    base_mdef = base_defense,
    base_crit = 0.25,
    growth_hp = CAST(ROUND(base_hp * 0.1) AS INTEGER),
    growth_mp = CAST(ROUND(base_mp * 0.1) AS INTEGER),
    growth_attack = CAST(ROUND(base_attack * 0.1) AS INTEGER),
    growth_matk = CAST(ROUND(base_attack * 0.1) AS INTEGER),
    growth_defense = CAST(ROUND(base_defense * 0.1) AS INTEGER),
    growth_mdef = CAST(ROUND(base_defense * 0.1) AS INTEGER),
    growth_speed = base_speed * 0.1,
    growth_crit = 0;

-- 4) 战斗配置（monster_groups 作为配置头，具体阵容在 monster_group_members）
INSERT OR IGNORE INTO monster_groups (id, name, enemies_json) VALUES
('npc_jianwuhen', '演武剑阵', '[]'),
('npc_tuobalie', '霸刀横刀阵', '[]'),
('npc_changle_guard', '长乐宿卫阵', '[]'),
('npc_qingyun_jiankui', '青云试炼剑阵', '[]');

-- 5) 战斗配置槽位：每个槽位先创建一条 BATTLE 类型的 npc_instances 记录，
--    再通过 monster_group_members.npc_instance_id 关联到战斗配置。
DROP TABLE IF EXISTS _seed_battle_slots;
CREATE TABLE _seed_battle_slots (
    group_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    template_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    position TEXT NOT NULL,
    is_boss INTEGER NOT NULL,
    hp_override INTEGER,
    mp_override INTEGER,
    attack_override INTEGER,
    defense_override INTEGER,
    speed_override INTEGER
);

INSERT INTO _seed_battle_slots
    (group_id, slot_index, template_id, level, position, is_boss,
     hp_override, mp_override, attack_override, defense_override, speed_override)
VALUES('npc_jianwuhen', 0, 'tpl_jianwuhen', 15, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_jianwuhen', 1, 'tpl_jianshi_a', 12, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_jianwuhen', 2, 'tpl_jianshi_b', 12, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 0, 'tpl_tuobalie', 20, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 1, 'tpl_kuangdao_a', 16, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 2, 'tpl_kuangdao_b', 16, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 0, 'tpl_changle_guard', 25, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 1, 'tpl_suwei_a', 20, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 2, 'tpl_suwei_b', 20, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 0, 'tpl_qingyun_jiankui', 30, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 1, 'tpl_jianling_a', 25, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 2, 'tpl_jianling_b', 25, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('nether_01', 0, 'tpl_nether_guard', 15, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('nether_01', 1, 'tpl_nether_firefox', 12, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('nether_01', 2, 'tpl_nether_cultist', 14, 'BACK', 0, NULL, NULL, NULL, NULL, NULL);

INSERT INTO npc_instances (
    npc_id, template_id, instance_type, status, name, badge, title, avatar, type,
    created_by, source, source_ref, level
)
SELECT
    'npcinst_battle_' || s.group_id || '_' || s.slot_index,
    s.template_id, 'BATTLE', 'ACTIVE', t.name, t.badge, t.title, t.avatar, 'battle',
    'SYSTEM', 'MONSTER_GROUP', s.group_id, s.level
FROM _seed_battle_slots s
JOIN npc_templates t ON t.id = s.template_id;

INSERT INTO monster_group_members
    (group_id, slot_index, npc_instance_id, level, position, is_boss,
     hp_override, mp_override, attack_override, defense_override, speed_override)
SELECT
    s.group_id, s.slot_index,
    'npcinst_battle_' || s.group_id || '_' || s.slot_index,
    s.level, s.position, s.is_boss,
    s.hp_override, s.mp_override, s.attack_override, s.defense_override, s.speed_override
FROM _seed_battle_slots s;

DROP TABLE _seed_battle_slots;

-- 6) 地图 NPC 实体（身份 + 模板 + 战斗配置已合并为 npc_instances 一行）
INSERT INTO npc_instances (
    npc_id, scene_id, key, name, badge, title, avatar, quote, gossip, type,
    template_id, battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag
) VALUES
('npc_cangyun_001', 'arena', 'cangyun', '苍云剑客', '剑意纵横', '出战核心输出 · 天策剑修', 'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ', '单手提剑疾走破风，青碧雷电真元化为巨弧斩击。', '青碧雷光月牙剑弧，单手执剑疾速突进横斩，凌厉剑气四溢。面向左侧敌方阵容。', 'battle', 'tpl_cangyun', NULL, '15', '{"exp":800,"gold":500}', '0', NULL),
('npc_luoqinghan_001', 'qingyun', 'luoqinghan', '洛清寒', '九霄玄冰', '后排法术控场 · 极寒冰修', 'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA', '御空浮立，法杖挥出万丈寒潮，冰菱飞舞封冻万灵。', '雪花法杖凌空凝聚玄冰，冰晶雪花阵环绕身周，白蓝广袖如飞雪轻拂。面向左侧。', 'dialogue', 'tpl_luoqinghan', NULL, '15', '{}', '0', NULL),
('npc_nether_cultist_001', 'canglan', 'nether_cultist', '邪化修士', '九幽血咒', '敌方核心Boss · 白骨魔修', 'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw', '兜帽白骨面具下凶光毕露，骷髅权杖引燃无尽怨气。', '手执骷髅法杖，激发幽黑血煞煞气球，周身浮现血色残缺古文字符。面向右侧敌对阵营。', 'battle', 'tpl_nether_cultist', NULL, '25', '{"exp":2500,"gold":2000,"items":[{"id":"item_jindan_yuye","name":"金丹玉液","count":1}]}', '300', NULL),
('npc_nether_firefox_001', 'kunwu', 'nether_firefox', '赤焰九尾狐', '赤炎梵天', '敌方敏捷妖兽 · 妖火奔袭', 'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg', '身披三昧妖火，九尾掀起滔天焰海，利爪撕裂生灵。', '低姿伏地蓄势前扑，九条炽焰尾羽熊熊燃烧，神火符印流转周身。面向右侧敌对阵营。', 'battle', 'tpl_nether_firefox', NULL, '20', '{"exp":1600,"gold":1000,"items":[{"id":"item_juqi_dan","name":"聚气丹","count":2}]}', '180', NULL),
('npc_suningxiang_001', 'pharmacy', 'suningxiang', '苏凝香', '妙手回春', '团队治疗辅助 · 回春医仙', 'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA', '玉笛清音悠扬婉转，生机莲花治愈我方全员伤势。', '横吹青玉灵笛，碧绿生命光环与粉色莲花瓣盘旋环绕，步步生莲。面向左侧。', 'dialogue', 'tpl_suningxiang', NULL, '15', '{}', '0', NULL),
('npc_tiexinwu_001', 'changle', 'tiexinwu', '重甲卫士', '固若金汤', '前排磐石肉盾 · 古铜巨盾', 'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ', '单膝下沉扎马沉稳，巨型青铜阵盾吸收全额冲击。', '一手稳立厚实古铜巨盾，一手斜握精铁短剑，金绿护盾罡气环绕，固若金汤。面向左侧。', 'battle', 'tpl_tiexinwu', NULL, '1', '{}', '0', NULL),
('npc_xuanjia_wushi_001', 'arena', 'xuanjia_wushi', '玄甲武士', '狂澜刀诀', '重装近战狂战 · 青龙偃月', 'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA', '霸道阔刀携百钧之力力斩而下，真武烈火贯通地脉。', '手握铭龙重型斩马刀，全力下劈带起冲天金赤真火气浪与爆裂火屑。面向左侧。', 'battle', 'tpl_xuanjia_wushi', NULL, '20', '{"exp":1500,"gold":900}', '120', NULL),
('npc_xuanmen_shushi_001', 'square', 'xuanmen_shushi', '玄门术士', '赤练神符', '诅咒控场术士 · 太乙符法', 'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ', '幽灯引路，朱砂燃符破邪缚魅，玄道天机尽在指尖。', '指尖引燃朱砂真符，数道燃烧黄纸神符化作火螺旋飞舞，手提引魂灯。面向左侧。', 'dialogue', 'tpl_xuanmen_shushi', NULL, '18', '{}', '0', NULL),
('npc_zixiao_fashi_001', 'tianheng', 'zixiao_fashi', '紫霄法师', '九霄雷引', '群体元素轰炸 · 太清天师', 'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw', '御风凌虚，星斗八卦法印汇聚，轰落万道紫霄劫雷。', '右手执八卦雷灵幡，左手掐剑指引九霄神雷，紫金电弧撕裂虚空。面向左侧。', 'dialogue', 'tpl_zixiao_fashi', NULL, '22', '{}', '0', NULL);

-- 6.1) 境界迁移到实例层：模板不再保存默认境界
UPDATE npc_instances SET realm = '金丹中期' WHERE npc_id = 'npc_cangyun_001';
UPDATE npc_instances SET realm = '金丹后期' WHERE npc_id = 'npc_luoqinghan_001';
UPDATE npc_instances SET realm = '金丹初期' WHERE npc_id = 'npc_suningxiang_001';

-- 7) 战斗 NPC 的等级/奖励覆盖（模板与阵容仍由 npc_templates / monster_group_members 提供）

UPDATE npc_instances SET
    battle_level = 15,
    battle_reward_json = '{"exp":800,"gold":500}'
WHERE npc_id = 'npc_cangyun_001';

UPDATE npc_instances SET
    battle_level = 20,
    battle_reward_json = '{"exp":1200,"gold":800}',
    respawn_seconds = 120
WHERE npc_id = 'npc_tiexinwu_001';

UPDATE npc_instances SET
    battle_level = 20,
    battle_reward_json = '{"exp":1500,"gold":900}',
    respawn_seconds = 120
WHERE npc_id = 'npc_xuanjia_wushi_001';

UPDATE npc_instances SET
    battle_level = 25,
    battle_reward_json = '{"exp":2500,"gold":2000,"items":[{"id":"item_jindan_yuye","name":"金丹玉液","count":1}]}',
    respawn_seconds = 300
WHERE npc_id = 'npc_nether_cultist_001';

UPDATE npc_instances SET
    battle_level = 20,
    battle_reward_json = '{"exp":1600,"gold":1000,"items":[{"id":"item_juqi_dan","name":"聚气丹","count":2}]}',
    respawn_seconds = 180
WHERE npc_id = 'npc_nether_firefox_001';

-- ------------------------------------------------------------------------------
-- 仙友系统表 (friends & friend_requests)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(player_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_player ON friends(player_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);

CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    mail_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id, status);

-- ==============================================================================
-- 25. 通知管理 · 玩家升级通知 / 剧情节点触发器
-- 配置表 + 升级事件 Outbox（幂等依据）
-- ==============================================================================
DROP TABLE IF EXISTS level_up_events;
DROP TABLE IF EXISTS notification_configs;

CREATE TABLE notification_configs (
    event_code TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    reward_items_json TEXT NOT NULL DEFAULT '[]', -- 发放内容 JSON（道具 / 角色 / 货币；旧格式自动兼容）
    updated_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_configs
    (event_code, enabled, title, content, reward_items_json, updated_by)
VALUES
    (
        'PLAYER_LEVEL_UP',
        1,
        '恭喜升级！',
        '恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！',
        '[]',
        'SYSTEM'
    ),
    (
        'STORY_NODE_TRIGGER',
        1,
        '剧情推进',
        '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
        '[]',
        'SYSTEM'
    );

-- 剧情通知资产：一套剧本 / 一个节点可配置多条独立通知
DROP TABLE IF EXISTS story_notifications;
CREATE TABLE story_notifications (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    node_id TEXT DEFAULT NULL,
    trigger_event TEXT NOT NULL DEFAULT 'ANY',
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    reward_items_json TEXT NOT NULL DEFAULT '[]', -- 发放内容 JSON（道具 / 角色 / 货币）
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_story_notifications_package ON story_notifications(package_id);
CREATE INDEX idx_story_notifications_node ON story_notifications(node_id);

INSERT OR IGNORE INTO story_notifications
    (id, package_id, node_id, trigger_event, name, title, content, enabled, created_by)
SELECT
    'snotif_default_' || p.id,
    p.id,
    NULL,
    'ANY',
    p.name || ' · 默认通知',
    nc.title,
    nc.content,
    nc.enabled,
    'SYSTEM'
FROM dialogue_packages p
JOIN notification_configs nc ON nc.event_code = 'STORY_NODE_TRIGGER'
WHERE EXISTS (SELECT 1 FROM dialogue_nodes dn WHERE dn.package_id = p.id);

CREATE TABLE level_up_events (
    event_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    old_level INTEGER NOT NULL,
    new_level INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    notification_sent INTEGER NOT NULL DEFAULT 0,
    mail_id TEXT,
    last_error TEXT,
    locked_at TIMESTAMP,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, new_level)
);

CREATE INDEX idx_level_up_events_player
    ON level_up_events(player_id, new_level);

CREATE INDEX idx_level_up_events_status
    ON level_up_events(status, created_at);

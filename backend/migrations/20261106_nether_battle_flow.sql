-- ==============================================================================
-- 迁移: 演武校场·幽冥守卫对话剧情与战斗流向 (幂等执行)
-- ==============================================================================

-- 1. NPC 墨芳路由规则 (高优先级引导)
INSERT OR REPLACE INTO npc_dialogue_routers (id, npc_id, priority, root_node_id, conditions_json, description)
VALUES (
  'router_mofang_nether',
  'npc_mofang_001',
  100,
  'mofang_start',
  '[]',
  '墨芳关于演武校场幽冥异动的起始引导'
);

-- 2. 写入 5 个对话节点
INSERT OR REPLACE INTO dialogue_nodes (id, npc_id, chapter_title, content, quote_box) VALUES
(
  'mofang_start',
  'npc_mofang_001',
  '演武风云 · 幽冥初现',
  '阁下面生，可是新入长乐城的修士？近来入夜后，演武校场方向总有幽冥死气丝丝渗出，甚至引得周遭灵脉震颤。城主府不便明面调遣精锐，老朽只能私下寻觅信得过的游历道友……',
  '幽冥死气 · 阵眼抽髓'
),
(
  'mofang_info',
  'npc_mofang_001',
  '演武风云 · 探秘虚实',
  '据暗桩查探，校场内被布下了血炼大阵，阵眼正是那尊幽冥守卫！若不优先破去这前排肉盾，后排的邪修杀之不尽。\n\n城中洛清寒、苏凝香、苍云剑客三位道友与此阵皆有渊源，皆可助阵，唯独缺一位主持大局的领头人。',
  '破阵之法 · 需断阵眼'
),
(
  'mofang_accept',
  'npc_mofang_001',
  '演武风云 · 密令托付',
  '好！这枚密令你收好。三位已在城中候命，今夜子时，演武校场见。\n\n妖邪趁夜抽髓，刻不容缓，子时一到，校场残破石阵见真章！',
  '密令已授 · 诸友来投'
),
(
  'node_won',
  'npc_mofang_001',
  '演武风云 · 邪祟荡平',
  '幽冥守卫已碎，阵眼熄灭。你们守住了长乐城的灵脉。这是城主府的赏赐。',
  '灵脉归安 · 长乐无虞'
),
(
  'node_lost',
  'npc_mofang_001',
  '演武风云 · 重伤归馆',
  '苏凝香（昏沉中）：“别动……伤得很重，这里是悬壶馆。”',
  '气脉受损 · 悬壶还魂'
);

-- 3. 配置各节点的选项与 actions_json

-- [mofang_start] 选项
INSERT OR REPLACE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, actions_json)
VALUES
('opt_start_accept', 'mofang_start', 10, '【承接密令】除魔卫道，义不容辞', '受命', 'GOLD', 'mofang_accept', '[
  {"type":"JOIN_PARTY","memberKey":"npc_cangyun_001"},
  {"type":"JOIN_PARTY","memberKey":"npc_luoqinghan_001"},
  {"type":"JOIN_PARTY","memberKey":"npc_suningxiang_001"}
]'),
('opt_start_info', 'mofang_start', 20, '【先打探一下消息】知己知彼，方能百战不殆', '探查', 'NORMAL', 'mofang_info', '[]'),
('opt_start_leave', 'mofang_start', 30, '【改日再来】在下尚有俗事未结', '作罢', 'GRAY', NULL, '[]');

-- [mofang_info] 选项（带回环）
INSERT OR REPLACE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, actions_json)
VALUES
('opt_info_accept', 'mofang_info', 10, '【承接密令】既然已有良策，便交给我吧', '受命', 'GOLD', 'mofang_accept', '[
  {"type":"JOIN_PARTY","memberKey":"npc_cangyun_001"},
  {"type":"JOIN_PARTY","memberKey":"npc_luoqinghan_001"},
  {"type":"JOIN_PARTY","memberKey":"npc_suningxiang_001"}
]'),
('opt_info_back', 'mofang_info', 20, '【我再想想】事关重大，还需斟酌', '回退', 'NORMAL', 'mofang_start', '[]');

-- [mofang_accept] 选项（进险地 / 再做准备）
INSERT OR REPLACE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, actions_json)
VALUES
('opt_accept_fight', 'mofang_accept', 10, '【踏入险地迎敌】集结同伴，立赴校场！', '出战', 'RED', NULL, '[
  {"type":"START_COMBAT","monsterGroupId":"nether_01","winNodeId":"node_won","loseNodeId":"node_lost"}
]'),
('opt_accept_wait', 'mofang_accept', 20, '【再做准备】先去购置些丹药符箓', '整备', 'NORMAL', NULL, '[]');

-- [node_won] 选项（一次性领奖防刷 + 传送神行驿）
INSERT OR REPLACE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, show_conditions_json, actions_json)
VALUES
('opt_won_reward', 'node_won', 10, '【领取奖赏】谢过墨老与城主府', '受赏', 'GOLD', 'node_won',
 '[{"type":"HAS_FLAG","key":"flag_nether_01_win","expectedValue":1},{"type":"HAS_FLAG","key":"flag_nether_01_reward","expectedValue":0}]',
 '[
   {"type":"GIVE_ITEM","itemId":"item_zhuji_dan","count":1},
   {"type":"ADD_EXP_OR_GOLD","exp":5000,"gold":2000},
   {"type":"SET_FLAG","key":"flag_nether_01_reward","value":1}
 ]'),
('opt_won_post', 'node_won', 20, '【前往四方神行驿】此间事了，云游四方', '远行', 'NORMAL', NULL, '[]',
 '[
   {"type":"TELEPORT","areaId":"post"}
 ]');

-- [node_lost] 选项（战败苏醒后送医 / 重整旗鼓回广场）
INSERT OR REPLACE INTO dialogue_options (id, node_id, sort_order, text, action_label, style_type, next_node_id, actions_json)
VALUES
('opt_lost_pharmacy', 'node_lost', 10, '【静养片刻】运功化开护脉丹药力', '疗伤', 'NORMAL', 'node_lost', '[
  {"type":"TELEPORT","areaId":"pharmacy"}
]'),
('opt_lost_regroup', 'node_lost', 20, '【重整旗鼓】伤势已无大碍，再去寻墨老商议', '再战', 'RED', 'mofang_start', '[
  {"type":"TELEPORT","areaId":"square"}
]');


-- 5. 剧情节点入口白名单：只允许结算后打开 win/lose 节点，防止任意节点直开
CREATE TABLE IF NOT EXISTS dialogue_entry_nodes (
    node_id TEXT PRIMARY KEY,
    require_flag TEXT,
    description TEXT
);

INSERT OR REPLACE INTO dialogue_entry_nodes (node_id, require_flag, description) VALUES
('node_won', 'flag_nether_01_win', '演武校场胜利结算节点'),
('node_lost', 'flag_nether_01_lose', '演武校场战败结算节点');

-- 6. 修复历史上被写成场景 id 的非法大区（如 zone_id='tianheng'）
UPDATE players
SET zone_id = (SELECT zone_id FROM scenes WHERE scenes.id = players.area_id)
WHERE EXISTS (SELECT 1 FROM scenes WHERE scenes.id = players.area_id)
  AND zone_id NOT IN (SELECT DISTINCT zone_id FROM scenes);

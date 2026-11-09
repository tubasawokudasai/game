-- ==============================================================================
-- 迁移：清空 npcs 表并以《万象录》立绘库 HTML 全鉴为准重新入库
-- 同时同步 npc_templates 与 npc_instances
-- ==============================================================================

-- 1. 清空旧 npcs 及其关联的实例与对话路由（受外键级联）
DELETE FROM npc_dialogue_routers WHERE npc_id NOT IN ('');
DELETE FROM npc_instances WHERE npc_id NOT IN ('');
DELETE FROM npcs;

-- 2. 插入 HTML 中的 9 尊核心角色数据至 npcs 表
INSERT INTO npcs (
    id, scene_id, key, name, badge, title, avatar, type, quote, gossip
) VALUES
(
    'npc_cangyun_001',
    'arena',
    'cangyun',
    '苍云剑客',
    '剑意纵横',
    '出战核心输出 · 天策剑修',
    'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ',
    'battle',
    '单手提剑疾走破风，青碧雷电真元化为巨弧斩击。',
    '青碧雷光月牙剑弧，单手执剑疾速突进横斩，凌厉剑气四溢。面向左侧敌方阵容。'
),
(
    'npc_luoqinghan_001',
    'qingyun',
    'luoqinghan',
    '洛清寒',
    '九霄玄冰',
    '后排法术控场 · 极寒冰修',
    'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA',
    'dialogue',
    '御空浮立，法杖挥出万丈寒潮，冰菱飞舞封冻万灵。',
    '雪花法杖凌空凝聚玄冰，冰晶雪花阵环绕身周，白蓝广袖如飞雪轻拂。面向左侧。'
),
(
    'npc_suningxiang_001',
    'pharmacy',
    'suningxiang',
    '苏凝香',
    '妙手回春',
    '团队治疗辅助 · 回春医仙',
    'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA',
    'dialogue',
    '玉笛清音悠扬婉转，生机莲花治愈我方全员伤势。',
    '横吹青玉灵笛，碧绿生命光环与粉色莲花瓣盘旋环绕，步步生莲。面向左侧。'
),
(
    'npc_tiexinwu_001',
    'changle',
    'tiexinwu',
    '重甲卫士',
    '固若金汤',
    '前排磐石肉盾 · 古铜巨盾',
    'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ',
    'battle',
    '单膝下沉扎马沉稳，巨型青铜阵盾吸收全额冲击。',
    '一手稳立厚实古铜巨盾，一手斜握精铁短剑，金绿护盾罡气环绕，固若金汤。面向左侧。'
),
(
    'npc_xuanjia_wushi_001',
    'arena',
    'xuanjia_wushi',
    '玄甲武士',
    '狂澜刀诀',
    '重装近战狂战 · 青龙偃月',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    'battle',
    '霸道阔刀携百钧之力力斩而下，真武烈火贯通地脉。',
    '手握铭龙重型斩马刀，全力下劈带起冲天金赤真火气浪与爆裂火屑。面向左侧。'
),
(
    'npc_zixiao_fashi_001',
    'tianheng',
    'zixiao_fashi',
    '紫霄法师',
    '九霄雷引',
    '群体元素轰炸 · 太清天师',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    'dialogue',
    '御风凌虚，星斗八卦法印汇聚，轰落万道紫霄劫雷。',
    '右手执八卦雷灵幡，左手掐剑指引九霄神雷，紫金电弧撕裂虚空。面向左侧。'
),
(
    'npc_xuanmen_shushi_001',
    'square',
    'xuanmen_shushi',
    '玄门术士',
    '赤练神符',
    '诅咒控场术士 · 太乙符法',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    'dialogue',
    '幽灯引路，朱砂燃符破邪缚魅，玄道天机尽在指尖。',
    '指尖引燃朱砂真符，数道燃烧黄纸神符化作火螺旋飞舞，手提引魂灯。面向左侧。'
),
(
    'npc_nether_cultist_001',
    'canglan',
    'nether_cultist',
    '邪化修士',
    '九幽血咒',
    '敌方核心Boss · 白骨魔修',
    'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw',
    'battle',
    '兜帽白骨面具下凶光毕露，骷髅权杖引燃无尽怨气。',
    '手执骷髅法杖，激发幽黑血煞煞气球，周身浮现血色残缺古文字符。面向右侧敌对阵营。'
),
(
    'npc_nether_firefox_001',
    'kunwu',
    'nether_firefox',
    '赤焰九尾狐',
    '赤炎梵天',
    '敌方敏捷妖兽 · 妖火奔袭',
    'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg',
    'battle',
    '身披三昧妖火，九尾掀起滔天焰海，利爪撕裂生灵。',
    '低姿伏地蓄势前扑，九条炽焰尾羽熊熊燃烧，神火符印流转周身。面向右侧敌对阵营。'
);

-- 3. 同步写入 npc_templates 模板库
INSERT INTO npc_templates (
    id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
    base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description
) VALUES
(
    'tpl_cangyun',
    'cangyun',
    '苍云剑客',
    '出战核心输出 · 天策剑修',
    '剑意纵横',
    'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ',
    '/assets/combat/characters/hero_cangyun_idle_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UcOJh7TzDwCUgFQ8qNONbL6TyfESKwyIlqAWLCnvF6l8NaQo6uaEZR06ncoKfSt2Qu6D-KIi-7ib1aSfOiozrdLTtHnhBEYpwT7AfjEuNSMqHPRNo9fkpz2itnUcnTYuRRqndM8Y6yE_bIkO29ku55f3euU4ae5VsM56o_8PPfrFHCJD_iO2-vmIHHC2D8uA0PsimLnprTEYqehtOXJGzNE6riHBoBppfC_wXmr1hcyQ',
    15800, 300, 3200, 1800, 150,
    '["skill_pure_yang_sword","skill_wanjian_guizong","skill_basic_attack"]',
    '青碧雷光月牙剑弧，单手执剑疾速突进横斩，凌厉剑气四溢。面向左侧敌方阵容。'
),
(
    'tpl_luoqinghan',
    'luoqinghan',
    '洛清寒',
    '后排法术控场 · 极寒冰修',
    '九霄玄冰',
    'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA',
    '/assets/combat/characters/hero_luoqinghan_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UZu4trEX2L0qFMf5Krcyeij84-XfJU29WP0bzlREAjTf6mvyc8aEhc5XQR2SFOlclOowrR_ikLa-mSUf6xY3b5JnbBXJOwKKEadexPABI2Kv7ouPW0vCo8aCgtY2ZsSl_lx4LZ7PtdrBGDJ2PM5fvVbfjgFtMi3y4PQs81Wa7bJIBtsWGbLw4D7h1MNpKKOfriaXpBt31N7KiBSzbHvs4pzmHVz0De4dZVYyy65STXCA',
    11200, 450, 3800, 1200, 130,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '雪花法杖凌空凝聚玄冰，冰晶雪花阵环绕身周，白蓝广袖如飞雪轻拂。面向左侧。'
),
(
    'tpl_suningxiang',
    'suningxiang',
    '苏凝香',
    '团队治疗辅助 · 回春医仙',
    '妙手回春',
    'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA',
    '/assets/combat/characters/hero_suningxiang_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UBIILMpDQicImkIVUHn8F-l0ie0BNCPPIxFur8ZXBiri-mPTj2_xns3A_PW-jTqIuXlRso8MEc2gg79FW0-nyck-ND15kBrjTL1A0uu7A0uwW7tHOernXQ5lSROtWVIOMe0RNXunbYI79OI1qSyufYS-QOF_vMMoLr0ANxSo9ID4mmYy9vfvzgz_WY5SJisJBVLV6Go2uNyIiAbhY8CAy1dic6Mdbgd4JA4NflUOV_sA',
    12500, 400, 1400, 1400, 110,
    '["skill_tai_qing_heal","skill_spring_rain","skill_basic_attack"]',
    '横吹青玉灵笛，碧绿生命光环与粉色莲花瓣盘旋环绕，步步生莲。面向左侧。'
),
(
    'tpl_tiexinwu',
    'tiexinwu',
    '重甲卫士',
    '前排磐石肉盾 · 古铜巨盾',
    '固若金汤',
    'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ',
    '/assets/combat/characters/hero_shieldman_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1Vku5oRY0G27FCliCQ1k5SrDNRRV1ixroIhXA-GaZEkczUJKWLLnrTtrTvh-S-VNMkJ2mF1En3GQGk24PLbdJWOc9mnCZ-WQqaE6rNuUovnbemntqMU9C3SKcJDV_1SNm0HRqgizyH93mY0IZX7IMtAvOEZh6FPLr4rJ-uv5PxYK7Enwt3LXrJqqNTU_70bwrVAzlaq_DPXjJ9hctQ2xjMUfBifqmbODpHv6BcNYagrKQ',
    19500, 200, 1800, 2600, 95,
    '["skill_basic_attack"]',
    '一手稳立厚实古铜巨盾，一手斜握精铁短剑，金绿护盾罡气环绕，固若金汤。面向左侧。'
),
(
    'tpl_xuanjia_wushi',
    'xuanjia_wushi',
    '玄甲武士',
    '重装近战狂战 · 青龙偃月',
    '狂澜刀诀',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    'https://lh3.googleusercontent.com/aida/ALJJyrAzNzrl8mmklc12IYPgBtdmweO64rO1HDFcdvSzDtChKYemna5VqcealjXYzeJ955vBGH0uwiDoBXelWNp6evtWqqErC5ihdyLSU5t-Plc-9oNAJLEvNMY7l5o0oFyUg_k2rXTtLG8XK_Sr49wSoiVpbvJVQZLQK0OSwpQ91wGxGmayv8e07kKrnr7VHJUUwNhUB8-NehC_NiXt6zu0HhZv34jhmbe8uaKVofUt3xOKkA',
    16800, 260, 3100, 1600, 115,
    '["skill_basic_attack"]',
    '手握铭龙重型斩马刀，全力下劈带起冲天金赤真火气浪与爆裂火屑。面向左侧。'
),
(
    'tpl_zixiao_fashi',
    'zixiao_fashi',
    '紫霄法师',
    '群体元素轰炸 · 太清天师',
    '九霄雷引',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    'https://lh3.googleusercontent.com/aida/ALJJyrAfw_GdXafzkA6knHsRr1Vve41Cl8Ery58MSlUZHM74-4tQsqBOmIjvFvT6ljksunY9uQqC0cqP04j62OfNLGM7Xpc36zfIK3v7fmwFq4vw8tloZVNulEC0pU52kVqm-RSINP8wt5OkU3hVu4ewfyriekvodUWUnTHF-EkKRIy6cf3MkJH5smxd0YwADNgyvys4zD1b_bu5TWGKdKcKFrzc2ysx3moIVKPI3UKQxBsgcw',
    11500, 520, 3700, 1150, 125,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '右手执八卦雷灵幡，左手掐剑指引九霄神雷，紫金电弧撕裂虚空。面向左侧。'
),
(
    'tpl_xuanmen_shushi',
    'xuanmen_shushi',
    '玄门术士',
    '诅咒控场术士 · 太乙符法',
    '赤练神符',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    'https://lh3.googleusercontent.com/aida/ALJJyrD7XCCK6KHrVI2L5g4hrVdf5Njf95opnAzrx2ziLEfGUEcm7woI6nC-ZEA_L-BXXrYtSY4OwdmYd8oVM9MUk_Z-qyrscUdRQauy1NfZE6kGz4UYkYrpHDMvi12PDt6WONNguP0BngkmeebqoRmJz92_UsEG1x-q5PKimCm4kv4TSmF2ohD5P0wIWLQTa_Z-z86XsUrws33FSwR2PRJgIECxxaQI-u9YNxVcqqXSVh2_BQ',
    12800, 420, 3200, 1350, 120,
    '["skill_basic_attack"]',
    '指尖引燃朱砂真符，数道燃烧黄纸神符化作火螺旋飞舞，手提引魂灯。面向左侧。'
),
(
    'tpl_nether_cultist',
    'nether_cultist',
    '邪化修士',
    '敌方核心Boss · 白骨魔修',
    '九幽血咒',
    'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw',
    '/assets/combat/characters/enemy_cultist_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1UzdI0PWdH9CEgqvG9vby_15raMwAAKX3GIvjJKhPpXMQ5vydZef9QKCl8QV8LDtQNCiwfF9jb6IV1gmmaVsTTjqGLJUYuvo_-MzFlsW5KXa3w1fWPs-jTJg6J-p7OXAjnQ7jeGK02QOWgu1e9Kgroufzxbn5APSAkAEHZ4WLP5gPzfF-ATJ3H5CTBzhWpfxAbLT4vPXYSRBkzi1SzkQEcB-pGkIrNAgbigNgXSAyoInw',
    19800, 500, 3600, 1500, 120,
    '["skill_nine_sky_thunder","skill_basic_attack"]',
    '手执骷髅法杖，激发幽黑血煞煞气球，周身浮现血色残缺古文字符。面向右侧敌对阵营。'
),
(
    'tpl_nether_firefox',
    'nether_firefox',
    '赤焰九尾狐',
    '敌方敏捷妖兽 · 妖火奔袭',
    '赤炎梵天',
    'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg',
    '/assets/combat/characters/enemy_firefox_trans.png',
    'https://lh3.googleusercontent.com/aida/AEtjO1XdU1r2PVhekLV6FFcEoS6_PaLKiubNAjFVCnHBLicwhcGZwNLJw2tlDl-5CnCOMKWINRL2ZkinCNIqaUK3vB0PrD4wqNKVhWFQdaS5jOn0fqjy4RRjbfFRjOVGUxSnznbeBx8GK7tLU695EsGEJXhU3ePJv6kI9Ij-MkAQ0y11MVRuU0DlvwvHviu0FRsJ1B9q_sC5tp0YNAy3p0sMmknKXO74vUFUbpCm4I__njQ4tg',
    14200, 180, 2800, 1100, 140,
    '["skill_basic_attack"]',
    '低姿伏地蓄势前扑，九条炽焰尾羽熊熊燃烧，神火符印流转周身。面向右侧敌对阵营。'
)
ON CONFLICT(id) DO UPDATE SET
    key = excluded.key,
    name = excluded.name,
    title = excluded.title,
    badge = excluded.badge,
    avatar = excluded.avatar,
    idle_avatar = excluded.idle_avatar,
    attack_avatar = excluded.attack_avatar,
    base_hp = excluded.base_hp,
    base_mp = excluded.base_mp,
    base_attack = excluded.base_attack,
    base_defense = excluded.base_defense,
    base_speed = excluded.base_speed,
    skills_json = excluded.skills_json,
    description = excluded.description,
    updated_at = CURRENT_TIMESTAMP;

-- 4. 为每个地图 NPC 生成一条实例记录 (npc_instances)
INSERT INTO npc_instances
    (npc_id, template_id, battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag)
VALUES
('npc_cangyun_001', 'tpl_cangyun', NULL, 15, '{"exp":800,"gold":500}', 0, NULL),
('npc_luoqinghan_001', 'tpl_luoqinghan', NULL, 15, '{}', 0, NULL),
('npc_suningxiang_001', 'tpl_suningxiang', NULL, 15, '{}', 0, NULL),
('npc_tiexinwu_001', 'tpl_tiexinwu', NULL, 20, '{"exp":1200,"gold":800}', 120, NULL),
('npc_xuanjia_wushi_001', 'tpl_xuanjia_wushi', NULL, 20, '{"exp":1500,"gold":900}', 120, NULL),
('npc_zixiao_fashi_001', 'tpl_zixiao_fashi', NULL, 22, '{}', 0, NULL),
('npc_xuanmen_shushi_001', 'tpl_xuanmen_shushi', NULL, 18, '{}', 0, NULL),
('npc_nether_cultist_001', 'tpl_nether_cultist', NULL, 25, '{"exp":2500,"gold":2000,"items":[{"id":"item_jindan_yuye","name":"金丹玉液","count":1}]}', 300, NULL),
('npc_nether_firefox_001', 'tpl_nether_firefox', NULL, 20, '{"exp":1600,"gold":1000,"items":[{"id":"item_juqi_dan","name":"聚气丹","count":2}]}', 180, NULL)
ON CONFLICT(npc_id) DO UPDATE SET
    template_id = excluded.template_id,
    battle_group_id = excluded.battle_group_id,
    battle_level = excluded.battle_level,
    battle_reward_json = excluded.battle_reward_json,
    respawn_seconds = excluded.respawn_seconds,
    updated_at = CURRENT_TIMESTAMP;

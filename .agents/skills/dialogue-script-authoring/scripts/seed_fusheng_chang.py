#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《浮生唱 · 铁马冰河篇》剧情剧本导入脚本
剧本 ID: pkg_fusheng_chang
涵盖场景:
  - 青石弄 · 浮生茶庐 (scene_fusheng_teahouse)
  - 烟水渡 · 十里长亭 (scene_shili_changting)
  - 霜风绝壁 · 喋血破阵原 (scene_shuangfeng_battlefield)
  - 望君坡 · 梁燕合葬冢 (scene_wuming_graveyard)
"""

import sys
import os

# 确保可引入 dialogue_lib
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from dialogue_lib import login, api, item_grant, currency_grant, notify, encounter, set_root, ApiError

PKG_ID = "pkg_fusheng_chang"
ROOT_NODE_ID = "node_fsc_01_root"

def import_fusheng_chang():
    print("=== 开始导入《浮生唱》剧本包 ===")
    tok = login("admin", "admin123")
    print("1. 管理员登录成功")

    # 1.1 若剧本已存在，先清理旧剧本以确保数据完全干净
    try:
        api(tok, "GET", f"/admin/dialogues/packages/{PKG_ID}")
        print(f"   检测到旧剧本包 [{PKG_ID}]，执行安全删除清理...")
        api(tok, "DELETE", f"/admin/dialogues/packages/{PKG_ID}")
        print("   旧剧本包已清理完毕")
    except ApiError:
        pass

    # 1.2 绑定 NPC 模板专属法诀
    api(tok, "PUT", "/admin/npc-templates/tpl_huajiuxian", {
        "skills": ["skill_wangsheng_huchun", "skill_fusheng_ruomeng"]
    })
    api(tok, "PUT", "/admin/npc-templates/tpl_guyunan", {
        "skills": ["skill_hanmei_tiema"]
    })
    api(tok, "PUT", "/admin/npc-templates/tpl_guyuling", {
        "skills": ["skill_hanmei_tiema"]
    })
    api(tok, "PUT", "/admin/npc-templates/tpl_huyanxiao", {
        "skills": ["skill_kuanglang_baolie"]
    })
    print("2. NPC 模板专属技能绑定完成")

    # 2. 创建剧本包
    api(tok, "POST", "/admin/dialogues/packages", {
        "id": PKG_ID,
        "name": "浮生唱 · 铁马冰河篇",
        "description": "江陵青石弄浮生茶庐，老板娘花玖弦苦候出征雁门关的破虏将军顾羽南。玩家持神茶奔赴十里长亭营救胞妹顾羽灵，北上破阵原血战强虏先锋将呼延啸，夺回血书遗信，并伴花玖弦于望君坡梁燕冢合葬释怀，唱尽浮生一梦。",
        "category": "BRANCH",
        "default_root_node_id": None
    })
    print("3. 剧本包主体创建完成")

    # 3. 创建全部节点（先不带选项）
    nodes = [
        # --- 场景1：青石弄 · 浮生茶庐 ---
        {
            "id": "node_fsc_01_root",
            "package_id": PKG_ID,
            "npc_id": "tpl_huajiuxian",
            "scene_id": "scene_fusheng_teahouse",
            "chapter_title": "浮生茶庐 · 苦候故人",
            "pages": [
                {"speaker_id": "speaker", "content": "“客官，吃茶么？常客进门求的是醉梦还阳，可凡人一世，哪有那么多大梦可做。”"},
                {"speaker_id": "player", "content": "“听闻老板娘手烹‘往生’与‘浮生’二盏灵茗，可定神魄、辨执妄。不知今日可有闲情烹上一壶？”"},
                {"speaker_id": "speaker", "content": "“茶尚温着，可饮茶的人……却在三年前随北征破虏军去了雁门关，音信全无。今日晨间，烟水渡十里长亭传来战马嘶鸣，似有重伤兵士伏地不起……我心神不宁，分身乏术。”"},
                {"speaker_id": "speaker", "content": "“若少侠愿代我走一趟长亭，这盏刚煨好的极品【往生茶】与家传护心的【青玉镯】请速速带去。往生甘霖可吊住心脉，青玉镯……亦可令故人识得旧识。”"}
            ],
            "editor_pos": {"x": 100, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_01_lore",
            "package_id": PKG_ID,
            "npc_id": "tpl_huajiuxian",
            "scene_id": "scene_fusheng_teahouse",
            "chapter_title": "浮生茶庐 · 塞外寒梅",
            "pages": [
                {"speaker_id": "speaker", "content": "“他叫顾羽南，是大周破虏大将军……昔年出征前，他解下这只青玉镯套在我的腕上，说‘寒梅铁马，终有归期’。”"},
                {"speaker_id": "speaker", "content": "“可塞北朔风如刀，雁门关外数万北荒蛮骑围困破阵原，已是死战之局。朝廷迁延不救，我在这青石弄苦守三年，只盼他能留得残躯归家。”"},
                {"speaker_id": "player", "content": "“原来是将门忠烈！老板娘宽心，在下既知缘由，定全力相助！”"}
            ],
            "editor_pos": {"x": 100, "y": 380},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_after_chat",
            "package_id": PKG_ID,
            "npc_id": "tpl_huajiuxian",
            "scene_id": "scene_fusheng_teahouse",
            "chapter_title": "浮生茶庐 · 茶香悠远",
            "pages": [
                {"speaker_id": "speaker", "content": "“少侠又来了？快请坐。近来江陵青石弄风调雨顺，我烹了一壶新茶，清甘回甜，少侠且尝尝看。”"},
                {"speaker_id": "player", "content": "“老板娘气色甚佳，心境大有不同了。”"},
                {"speaker_id": "speaker", "content": "“心锁既已解开，望君坡前青山常在，我便在这一方小庐里静待红尘过客。少侠仗义相助之恩，玖弦铭感五内，此地茶香永为少侠而温。”"}
            ],
            "editor_pos": {"x": 100, "y": 50},
            "on_enter_actions": [],
            "on_complete_actions": []
        },

        # --- 场景2：烟水渡 · 十里长亭 ---
        {
            "id": "node_fsc_02_changting",
            "package_id": PKG_ID,
            "npc_id": "tpl_guyuling",
            "scene_id": "scene_shili_changting",
            "chapter_title": "十里长亭 · 绝塞惊变",
            "pages": [
                {"speaker_id": "narrator", "content": "十里长亭细雨霏霏，一匹遍体鳞伤的战马倒在泥水之中。凉亭石阶上，一位身披残破铁甲的劲装女子半跪于地，嘴角溢血，手中紧紧护着一个染血包裹。"},
                {"speaker_id": "speaker", "content": "“咳……咳咳！北荒贼子……我破虏亲军断无投降之辈……谁、谁在那里？！”"},
                {"speaker_id": "player", "content": "“姑娘莫慌！在下受浮生茶庐花玖弦之托，送来往生甘露与青玉镯救你！”"},
                {"speaker_id": "speaker", "content": "“玖弦姐姐的青玉镯？！……真的是你！……快，我胸口被裂地蛮锤震裂，寒毒攻心……”"}
            ],
            "editor_pos": {"x": 300, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_03_reveal",
            "package_id": PKG_ID,
            "npc_id": "tpl_guyuling",
            "scene_id": "scene_shili_changting",
            "chapter_title": "十里长亭 · 遗信血书",
            "pages": [
                {"speaker_id": "narrator", "content": "饮下往生神茶，顾羽灵苍白如纸的面颊泛起血色，狂暴的寒毒被彻底拔除。她紧握着石栏，泪如雨下。"},
                {"speaker_id": "speaker", "content": "“我是破虏副将顾羽灵……亦是顾羽南的亲妹。半月前，北荒先锋悍将呼延啸引数万蛮骑在霜风绝壁设伏。兄长为掩护百姓与残部南撤，率亲兵死守喋血破阵原，直至……全军殉国！”"},
                {"speaker_id": "speaker", "content": "“兄长战死前，割袍断笔写下遗书，将当年出征时玖弦姐姐亲手为他戴上的【素木玉簪】交予我，拼死杀出重围……”"},
                {"speaker_id": "speaker", "content": "“可呼延啸夺下破阵原后，竟将兄长的断刃残甲践踏于阵前！我求少侠北上霜风绝壁，斩杀呼延啸，夺回应有之尊严！”"},
                {"speaker_id": "speaker", "content": "“此簪与绝笔血书在此，拜托少侠了！”"}
            ],
            "editor_pos": {"x": 500, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": []
        },

        # --- 场景3：霜风绝壁 · 喋血破阵原 ---
        {
            "id": "node_fsc_04_battle",
            "package_id": PKG_ID,
            "npc_id": "tpl_huyanxiao",
            "scene_id": "scene_shuangfeng_battlefield",
            "chapter_title": "霜风绝壁 · 破阵死斗",
            "pages": [
                {"speaker_id": "narrator", "content": "雁门关外，狂风卷着暴雪怒号。霜风绝壁之下，数千柄断折的长枪斜插在冻土中，暗红的血迹早已凝固成玄冰。"},
                {"speaker_id": "speaker", "content": "“哈哈哈！哪来的中原野小子？顾羽南那厮自命硬骨头，还不是被老子双锤砸成肉糜！你送上门来，正好给老子的狂狼斩当祭品！”"},
                {"speaker_id": "player", "content": "“北荒蛮将，休逞凶顽！今日便用你的血，祭奠破虏军满门忠烈！”"}
            ],
            "editor_pos": {"x": 700, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_04_recon",
            "package_id": PKG_ID,
            "npc_id": "tpl_huyanxiao",
            "scene_id": "scene_shuangfeng_battlefield",
            "chapter_title": "霜风绝壁 · 破阵之隙",
            "pages": [
                {"speaker_id": "narrator", "content": "你凝神观瞧，呼延啸双柄巨锤沉重异常，每砸下一击都会在冻土上激起碎冰，其回气蓄力之时正是破绽！"},
                {"speaker_id": "player", "content": "“狂狼之势虽凶，然而回气迟滞，此战破敌便在此时！”"}
            ],
            "editor_pos": {"x": 700, "y": 380},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_05_lose",
            "package_id": PKG_ID,
            "npc_id": "tpl_guyuling",
            "scene_id": "scene_shuangfeng_battlefield",
            "chapter_title": "霜风绝壁 · 力战不支",
            "pages": [
                {"speaker_id": "narrator", "content": "呼延啸狂狼爆裂斩威力滔天，沉重巨锤轰散护体真气，你被狂暴震劲震退数丈，气血剧烈翻涌。"},
                {"speaker_id": "speaker", "content": "“少侠当心！羽灵虽伤势未愈，亦能执剑为你掠阵！速调息灵力，咱们再战蛮将！”"}
            ],
            "editor_pos": {"x": 900, "y": 320},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_05_win",
            "package_id": PKG_ID,
            "npc_id": "tpl_guyunan",
            "scene_id": "scene_shuangfeng_battlefield",
            "chapter_title": "霜风绝壁 · 忠魂长存",
            "pages": [
                {"speaker_id": "narrator", "content": "呼延啸惨嚎一声，双柄巨锤轰然落地，庞大的身躯倾倒在暴雪中，气绝毙命。朔风渐歇，风雪中浮现出一尊虚幻却凛冽的战将金甲虚影。"},
                {"speaker_id": "speaker", "content": "“寒梅铁马……终此一生。后辈少侠，多谢你替我破虏军雪耻，亦护下了舍妹性命。”"},
                {"speaker_id": "player", "content": "“顾将军！花老板娘手烹两盏神茶，在江陵苦苦等候你三年！”"},
                {"speaker_id": "speaker", "content": "“羽南身为大将，为国死战无怨无悔；唯独对玖弦……许下白头之约，终究化作泡影。烦请少侠将染血玉簪与青玉镯带去望君坡，与我残甲合葬……来世若有缘，再饮一盏浮生。”"}
            ],
            "editor_pos": {"x": 900, "y": 100},
            "on_enter_actions": [],
            "on_complete_actions": [
                notify("【铁血忠烈】斩狂狼破阵原", "少侠浴血霜风绝壁，斩杀北荒先锋呼延啸，告慰破虏军在天英魂。",
                       [currency_grant(silver=80, copper=2000), item_grant("item_tianjie_jinchuang", 2)],
                       once=True)
            ]
        },

        # --- 场景4：望君坡 · 梁燕合葬冢 ---
        {
            "id": "node_fsc_06_graveyard",
            "package_id": PKG_ID,
            "npc_id": "tpl_huajiuxian",
            "scene_id": "scene_wuming_graveyard",
            "chapter_title": "望君坡 · 梁燕悲歌",
            "pages": [
                {"speaker_id": "narrator", "content": "江陵城外望君坡，青山如黛，细雨如丝。花玖弦一袭素白衣衫伫立在梁燕冢前，凝视着石碑，眼中噙泪。"},
                {"speaker_id": "speaker", "content": "“少侠……你回来了。羽灵方才已将一切告知于我。呼延啸伏诛，羽南的残甲英魂……终于归乡了。”"},
                {"speaker_id": "player", "content": "“顾将军临终遗言，愿将素木玉簪、绝笔血书与青玉镯一同合葬于此坡，生未同衾，死当同穴。”"},
                {"speaker_id": "speaker", "content": "“‘寒梅铁马，终此一生，望自珍重。勿念，勿念’……傻子，既让我勿念，又何必写得字字如刀……”"},
                {"speaker_id": "speaker", "content": "“少侠，请将信物放入冢中石函吧。”"}
            ],
            "editor_pos": {"x": 1100, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": []
        },
        {
            "id": "node_fsc_07_finale",
            "package_id": PKG_ID,
            "npc_id": "tpl_huajiuxian",
            "scene_id": "scene_wuming_graveyard",
            "chapter_title": "浮生唱 · 琴歌绝响",
            "pages": [
                {"speaker_id": "narrator", "content": "石函合拢，新冢落成。花玖弦盘坐于古松之下，轻抚素琴。琴声如泣如诉，自塞北寒风吹至江南烟雨，最终化作清朗旷达的歌声。"},
                {"speaker_id": "speaker", "content": "“浮生若梦兮何所求，铁马冰河兮终归土。愿君英魂伴青山，此生唱罢……再无忧。”"},
                {"speaker_id": "speaker", "content": "“少侠，多谢你解我心中三年执障。这一盏我以本命心血与清晨冷露焙就的神品【浮生茶】，请务必收下。饮此神茶，可破心魔因果。”"},
                {"speaker_id": "player", "content": "“多谢花老板娘。愿将军英魂安息，老板娘亦得余生安宁。”"}
            ],
            "editor_pos": {"x": 1300, "y": 200},
            "on_enter_actions": [],
            "on_complete_actions": [
                notify("【浮生绝响】浮生一梦终归土", "少侠伴花玖弦立碑合葬，唱彻《浮生唱》，执念释怀，破除心魔因果。",
                       [item_grant("item_ling_shi", 10), currency_grant(silver=100, ingot=20)],
                       once=True)
            ]
        }
    ]

    for n in nodes:
        api(tok, "POST", "/admin/dialogues/nodes", n)
    print(f"4. 成功创建 {len(nodes)} 个节点")

    # 4. 创建所有选项
    options = [
        # --- node_fsc_01_root ---
        {
            "id": "opt_fsc_01_accept",
            "node_id": "node_fsc_01_root",
            "sort_order": 1,
            "text": "“人命关天！我这便携往生茶与青玉镯赶赴十里长亭救人。”",
            "action_label": "应允赴亭",
            "style_type": "GOLD",
            "next_node_id": "node_fsc_02_changting",
            "show_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_completed", "expectedValue": 0}],
            "enable_conditions": [],
            "actions": [
                {"type": "SET_FLAG", "key": "flag_fsc_started", "value": 1},
                {"type": "GIVE_ITEM", "itemId": "item_wangsheng_tea", "count": 1},
                {"type": "GIVE_ITEM", "itemId": "item_qingyu_bracelet", "count": 1}
            ]
        },
        {
            "id": "opt_fsc_01_inquire",
            "node_id": "node_fsc_01_root",
            "sort_order": 2,
            "text": "“老板娘神色凄切，不知当年随军北征之人……究竟是何方将领？”",
            "action_label": "细探往事",
            "style_type": "NORMAL",
            "next_node_id": "node_fsc_01_lore",
            "show_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_completed", "expectedValue": 0}],
            "enable_conditions": [],
            "actions": [
                {"type": "SET_FLAG", "key": "flag_fsc_asked_lore", "value": 1}
            ]
        },
        {
            "id": "opt_fsc_01_after_chat",
            "node_id": "node_fsc_01_root",
            "sort_order": 3,
            "text": "“老板娘，近来茶庐茶香悠远，炉火可还安好？”",
            "action_label": "品茗闲谈",
            "style_type": "BLUE",
            "next_node_id": "node_fsc_after_chat",
            "show_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_completed", "expectedValue": 1}],
            "enable_conditions": [],
            "actions": []
        },

        # --- node_fsc_01_lore ---
        {
            "id": "opt_fsc_lore_accept",
            "node_id": "node_fsc_01_lore",
            "sort_order": 1,
            "text": "“事不宜迟，取药救人要紧，我即刻启程赶往十里长亭！”",
            "action_label": "即刻出发",
            "style_type": "GOLD",
            "next_node_id": "node_fsc_02_changting",
            "show_conditions": [],
            "enable_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_asked_lore", "expectedValue": 1}],
            "actions": [
                {"type": "SET_FLAG", "key": "flag_fsc_started", "value": 1},
                {"type": "GIVE_ITEM", "itemId": "item_wangsheng_tea", "count": 1},
                {"type": "GIVE_ITEM", "itemId": "item_qingyu_bracelet", "count": 1}
            ]
        },

        # --- node_fsc_after_chat ---
        {
            "id": "opt_fsc_after_chat_leave",
            "node_id": "node_fsc_after_chat",
            "sort_order": 1,
            "text": "“好茶！老板娘保重，少侠去也。”",
            "action_label": "抱拳告辞",
            "style_type": "GRAY",
            "next_node_id": None,
            "show_conditions": [],
            "enable_conditions": [],
            "actions": []
        },

        # --- node_fsc_02_changting ---
        {
            "id": "opt_fsc_save_yuling",
            "node_id": "node_fsc_02_changting",
            "sort_order": 1,
            "text": "“速速饮下这盏【往生茶】，以神茶拔除死气！”",
            "action_label": "施药救治",
            "style_type": "GOLD",
            "next_node_id": "node_fsc_03_reveal",
            "show_conditions": [],
            "enable_conditions": [
                {"type": "HAS_FLAG", "key": "flag_fsc_started", "expectedValue": 1},
                {"type": "HAS_ITEM", "itemId": "item_wangsheng_tea", "count": 1}
            ],
            "actions": [
                {"type": "COST_ITEM", "itemId": "item_wangsheng_tea", "count": 1},
                {"type": "SET_FLAG", "key": "flag_fsc_saved_yuling", "value": 1}
            ]
        },

        # --- node_fsc_03_reveal ---
        {
            "id": "opt_fsc_accept_battle",
            "node_id": "node_fsc_03_reveal",
            "sort_order": 1,
            "text": "“顾将军忠魂不容折辱！这木簪血书我暂且保管，即刻北上诛灭呼延啸！”",
            "action_label": "慷慨北伐",
            "style_type": "RED",
            "next_node_id": "node_fsc_04_battle",
            "show_conditions": [],
            "enable_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_saved_yuling", "expectedValue": 1}],
            "actions": [
                {"type": "GIVE_ITEM", "itemId": "item_yunan_hairpin", "count": 1},
                {"type": "GIVE_ITEM", "itemId": "item_yunan_letter", "count": 1},
                {"type": "SET_FLAG", "key": "flag_fsc_avenge_accepted", "value": 1}
            ]
        },

        # --- node_fsc_04_battle ---
        {
            "id": "opt_fsc_fight_huyanxiao",
            "node_id": "node_fsc_04_battle",
            "sort_order": 1,
            "text": "拔剑出鞘，直撄裂地双锤！",
            "action_label": "血战呼延啸",
            "style_type": "RED",
            "next_node_id": None,
            "show_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_avenge_accepted", "expectedValue": 1}],
            "enable_conditions": [],
            "actions": [
                encounter("opt_fsc_fight_huyanxiao", "tpl_huyanxiao",
                          win="node_fsc_05_win", lose="node_fsc_05_lose",
                          level=5, exp=600, gold=200,
                          items=[{"id": "item_ling_shi", "count": 5}])
            ]
        },
        {
            "id": "opt_fsc_battle_recon",
            "node_id": "node_fsc_04_battle",
            "sort_order": 2,
            "text": "环顾破阵原残局，寻找地势借力",
            "action_label": "审察战势",
            "style_type": "NORMAL",
            "next_node_id": "node_fsc_04_recon",
            "show_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_avenge_accepted", "expectedValue": 1}],
            "enable_conditions": [],
            "actions": [
                {"type": "SET_FLAG", "key": "flag_fsc_battle_tactics", "value": 1}
            ]
        },

        # --- node_fsc_04_recon ---
        {
            "id": "opt_fsc_recon_to_fight",
            "node_id": "node_fsc_04_recon",
            "sort_order": 1,
            "text": "“看准破绽，趁其回气凝滞挥剑迎击！”",
            "action_label": "果断迎战",
            "style_type": "RED",
            "next_node_id": "node_fsc_04_battle",
            "show_conditions": [],
            "enable_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_battle_tactics", "expectedValue": 1}],
            "actions": []
        },

        # --- node_fsc_05_lose ---
        {
            "id": "opt_fsc_battle_retry",
            "node_id": "node_fsc_05_lose",
            "sort_order": 1,
            "text": "“调理气息，重整旗鼓再战呼延啸！”",
            "action_label": "重振旗鼓",
            "style_type": "RED",
            "next_node_id": "node_fsc_04_battle",
            "show_conditions": [],
            "enable_conditions": [],
            "actions": []
        },

        # --- node_fsc_05_win ---
        {
            "id": "opt_fsc_to_graveyard",
            "node_id": "node_fsc_05_win",
            "sort_order": 1,
            "text": "“将军安息。我这便启程南下望君坡，与花老板娘将信物合葬立碑。”",
            "action_label": "奔赴望君坡",
            "style_type": "GOLD",
            "next_node_id": "node_fsc_06_graveyard",
            "show_conditions": [],
            "enable_conditions": [],
            "actions": [
                {"type": "SET_FLAG", "key": "flag_fsc_hero_avenged", "value": 1}
            ]
        },

        # --- node_fsc_06_graveyard ---
        {
            "id": "opt_fsc_bury_relics",
            "node_id": "node_fsc_06_graveyard",
            "sort_order": 1,
            "text": "“将素木玉簪、绝笔血书与青玉镯敬入冢中石函，立碑祭拜。”",
            "action_label": "合葬立碑",
            "style_type": "GOLD",
            "next_node_id": "node_fsc_07_finale",
            "show_conditions": [],
            "enable_conditions": [
                {"type": "HAS_FLAG", "key": "flag_fsc_hero_avenged", "expectedValue": 1},
                {"type": "HAS_ITEM", "itemId": "item_yunan_hairpin", "count": 1},
                {"type": "HAS_ITEM", "itemId": "item_yunan_letter", "count": 1},
                {"type": "HAS_ITEM", "itemId": "item_qingyu_bracelet", "count": 1}
            ],
            "actions": [
                {"type": "COST_ITEM", "itemId": "item_yunan_hairpin", "count": 1},
                {"type": "COST_ITEM", "itemId": "item_yunan_letter", "count": 1},
                {"type": "COST_ITEM", "itemId": "item_qingyu_bracelet", "count": 1},
                {"type": "SET_FLAG", "key": "flag_fsc_relics_buried", "value": 1}
            ]
        },

        # --- node_fsc_07_finale ---
        {
            "id": "opt_fsc_finish_quest",
            "node_id": "node_fsc_07_finale",
            "sort_order": 1,
            "text": "“往事已矣，逝者安息。花掌柜，告辞了。”",
            "action_label": "别过长亭",
            "style_type": "GRAY",
            "next_node_id": None,
            "show_conditions": [],
            "enable_conditions": [{"type": "HAS_FLAG", "key": "flag_fsc_relics_buried", "expectedValue": 1}],
            "actions": [
                {"type": "GIVE_ITEM", "itemId": "item_fusheng_tea", "count": 1},
                {"type": "SET_FLAG", "key": "flag_fsc_completed", "value": 1},
                {"type": "ADD_EXP_OR_GOLD", "exp": 1200, "gold": 300}
            ]
        }
    ]

    for o in options:
        api(tok, "POST", "/admin/dialogues/options", o)
    print(f"5. 成功创建 {len(options)} 个选项")

    # 5. 设置默认根节点
    set_root(tok, PKG_ID, ROOT_NODE_ID)
    print(f"6. 默认根节点已设置为 [{ROOT_NODE_ID}]")

    # 6. 常驻 NPC 摆放 (在 scene_fusheng_teahouse 摆放 npc_huajiuxian)
    existing_npcs = api(tok, "GET", "/admin/npcs?sceneId=scene_fusheng_teahouse")["data"]
    h_npc = next((x for x in existing_npcs if x.get("id") == "npc_huajiuxian" or x.get("key") == "huajiuxian"), None)
    if h_npc:
        print("7. 常驻 NPC [npc_huajiuxian] 已存在，执行更新挂载...")
        api(tok, "PUT", f"/admin/npcs/{h_npc['id']}", {
            "template_id": "tpl_huajiuxian",
            "scene_id": "scene_fusheng_teahouse",
            "name": "花玖弦",
            "title": "浮生茶庐 · 掌柜",
            "badge": "浮生",
            "dialogue_package_id": PKG_ID,
            "dialogue_root_node_id": ROOT_NODE_ID,
            "quote": "“世人皆道浮生若梦，可若连梦都碎了，这残生又该如何唱将下去？”",
            "gossip": "“朔雪关山路远，那年铁马冰河里的执念，至今仍未散去……”"
        })
    else:
        print("7. 创建常驻 NPC [npc_huajiuxian] 摆放至青石弄·浮生茶庐...")
        api(tok, "POST", "/admin/npcs", {
            "id": "npc_huajiuxian",
            "key": "huajiuxian",
            "name": "花玖弦",
            "scene_id": "scene_fusheng_teahouse",
            "template_id": "tpl_huajiuxian",
            "type": "dialogue",
            "title": "浮生茶庐 · 掌柜",
            "badge": "浮生",
            "dialogue_package_id": PKG_ID,
            "dialogue_root_node_id": ROOT_NODE_ID,
            "quote": "“世人皆道浮生若梦，可若连梦都碎了，这残生又该如何唱将下去？”",
            "gossip": "“朔雪关山路远，那年铁马冰河里的执念，至今仍未散去……”"
        })
    print("   常驻 NPC [npc_huajiuxian] 摆放并挂载剧本包完成！")
    print("=== 《浮生唱》导入执行完毕 ===")

if __name__ == "__main__":
    import_fusheng_chang()

---
name: dialogue-script-authoring
description: 通过后台 HTTP API 自动创建/修改剧情剧本，包括多段台词、线性直连、分支选项、战斗遭遇选项、条件与奖励动作；提供 Python 规范库、静态拓扑校验器与端到端跑测脚本，确保一次写出可通关闭环的完整剧情。Use when an agent must author or verify a dialogue package, node graph, or battle option.
---

# 剧情剧本自动化配置 Skill

## 何时使用

当任务涉及以下任一内容时使用本 Skill：

- 新建/修改剧情剧本（`pkg_*`）
- 新建/修改对话节点（`node_*`）
- 节点内多段台词（Pages）
- 线性直连（Direct Next）
- 分支选项（Options）
- 战斗选项：单人遭遇 / 多人战阵（START_ENCOUNTER / START_COMBAT）
- 静态校验与 E2E 验证剧本可玩性

---

## 核心原则

1. **统一通过规范库调用 API，严禁手拼请求**：
   - AI 写内容**只能通过 `dialogue_lib.py` 的函数调用 API**，不得自行使用 urllib/requests/curl 拼凑底层 HTTP 请求。
   - **已有脚本跑不起来时先向人类报告错误，绝不得自行重写同功能脚本**。
2. **角色立绘与模板按需设计与复用**：
   - **核心角色、重要剧情 NPC、Boss**：凡剧情中涉及需要专属外观和剧情交互的新核心角色，**必须调用 `character-sprite-design` Skill**，在 Stitch MCP 中动态生成符合该地图独立世界观的新原画；并直接调用 `character-sprite-design/scripts/download_and_process.py` 执行下载、转码与去背景；最终登记入库并注册为 NPC 模板。
   - **已有角色优先复用**：若剧情涉及已有角色，优先复用已有的角色立绘和 NPC 模板。
   - **严禁冒充**：绝对不允许用其他角色的专属立绘冒充新角色。
   - **临时路人与群体角色**：允许使用通用素材，立绘入库不代表必须创建 NPC 模板；仅在角色确实需要参与剧情、地图交互或战斗时才创建或复用 NPC 模板。
   - **不重复实现**：严禁在剧本配置过程中自行编写下载和抠图脚本，新素材处理统一交给 `character-sprite-design`。
3. **只读文档和 API，不读后端源码**。查阅字段必须对照 `references/api.md`。遇到 400 错误优先对照字段表，若排查后确认是服务端行为与文档不一致，停下并报告人类。
4. **先查目录，再写剧本**。先确认地图 `scene_id`、NPC 模板 `tpl_*`、道具 `item_*`、怪物组 `group_*`。
5. **显式指定可读 ID**。剧本包、节点、选项均使用语义清晰的 ID（如 `pkg_xxx`、`node_xxx`、`opt_xxx`）。
6. **节点/选项保存是完整 upsert**。更新前先 `GET` 详情，整体回传全部字段，漏传字段会被置空。
7. **直连与分支互斥**。有 `options` 不要设 `direct_next_node_id`；设了直连后端会清空 options。
8. **跨场景默认让玩家自行前往**。除非人类明确要求“点选项瞬间传送”，否则跨场景选项不配 `TELEPORT`。
9. **写入后必须执行双重验收**：必须通过 `validate_pkg.py` 静态拓扑校验与 `e2e_walk.py` 端到端玩家真实步进校验。

完整字段说明与错误表见：
- `references/api.md`（接口快速索引与实测事实）
- `references/examples.md`（可直接复制的 JSON 示例）
- `docs/dialogue-script-authoring.md`（仓库底层技术文档）

---

## 运行环境与工具库

- 服务端 Base URL：`http://localhost:8787/api`
- 后台管理员默认凭据：`admin / admin123`
- 解释器：系统 Python 3（`/usr/bin/python3` 或 `python3`）

自动化工具脚本位于本 Skill 目录的 `scripts/`（项目根目录 `scripts/` 亦同步提供）：
- `scripts/dialogue_lib.py`：标准 API 调用库与结构构造函数
- `scripts/validate_pkg.py`：剧本静态规则与拓扑连通性校验脚本
- `scripts/e2e_walk.py`：端到端模拟游客玩家真实跑测脚本

---

## 一、配置流程规范（必须严格遵守）

1. **编写 Seed 文件**：
   剧情内容先写成一个 Python 或 JSON Seed 脚本，放置在仓库中，通过 `dialogue_lib.py` 导入。
   **写入顺序严格如下**：
   $$\text{创建剧本包} \longrightarrow \text{创建全部节点（先不带选项）} \longrightarrow \text{创建所有选项} \longrightarrow \text{PUT 设置默认根节点}$$
2. **每步失败立即终止**：
   每一步必须检查返回结果。`dialogue_lib.api()` 内置失败即抛出 `ApiError` 异常，**严禁吞掉异常或盲目继续**。
3. **遇到 400 对照字段表排查**：
   遇到 400 错误时，先对照 `references/api.md` 的「物品字段对照表」和动作格式，检查是否字段拼错（如 `itemId` vs `id`、`count` vs `quantity`）。严禁脱离文档自行发明字段。
4. **静态拓扑校验**：
   导入完成后，立刻执行校验脚本：
   ```bash
   python3 .agents/skills/dialogue-script-authoring/scripts/validate_pkg.py <pkg_id>
   ```
   输出中若有「问题」项，**必须全部修复完毕**，直至退出码为 0。
5. **交付 E2E 跑测路径**：
   每个剧本包必须随同交付一个 `<pkg_id>_path.json`，并运行 E2E 脚本完整跑通：
   ```bash
   python3 .agents/skills/dialogue-script-authoring/scripts/e2e_walk.py <pkg_id>_path.json
   ```

---

## 二、剧情设计规范（防止“创建了数据但不可玩”）

1. **必须设计完成态与根节点分流（核心防刷规则）**：
   - 每个剧本包必须有明确的“完成状态”：在任务结局处执行 `COMPLETE_QUEST`，或在结局选项执行 `SET_FLAG`（如 `flag_<pkg>_completed = 1`）。
   - **根节点必须按完成状态分流**：
     - 未完成时：显示接取任务、打听线索的初始选项；
     - 已完成时：显示“事后闲聊”或“感谢致辞”选项，进入已完结的对话节点。
     - **严禁让已完成剧情的玩家重新触发任务起点并重复领奖！**
2. **禁止假选择**：
   一个节点的多个选项如果指向同一个后续节点，必须各自带有不同的动作（如赋予不同 Flag、不同道德倾向、不同道具或属性增减），否则属于假选择，必须修改。
3. **台词承诺必有交付**：
   台词中只要提到“给你某物”、“这是谢礼”，同一节点或其选项必须配置对应的 `GIVE_ITEM`、`grants` 或 `battleReward`。
4. **条件闭环**：
   `HAS_ITEM` 等条件用到的物品，必须在本批内容的某处通过剧情发放，或在场景商店中可购得，否则该分支永远不可达。
5. **战斗胜负双分支与失败后果**：
   每场战斗必须同时配置 `winNodeId` 和 `loseNodeId`。失败节点必须有实质后果或重试路径（如退回备战节点），不能仅是无意义的台词复述。
6. **奖励通知防刷**：
   所有节点级 `SEND_NOTIFICATION` 必须显式携带 `"once": true`。
7. **经验发放规范**：
   经验只能通过 `battleReward.exp` 或选项动作 `ADD_EXP_OR_GOLD` 发放，**严禁塞入 `grants`**（grants 仅支持 ITEM、CURRENCY、COMPANION）。
8. **合理排布编辑器坐标**：
   每个节点必须填写 `editor_pos`（按剧情树层级分层排布），严禁传空导致后台拓扑编辑器内节点重叠一团。
9. **场景真实性与跨场景规则**：
   所有节点的 `scene_id` 必须是真实存在于 `GET /admin/scenes` 的场景。跨场景选项默认不配 `TELEPORT` 动作，由玩家自行前往。
10. **设定真实与逻辑自洽**：
    台词中提及的人物、地点、道具必须真实存在于数据库中；同一时间线的数字（如“三十年前”“五百年前”）在所有台词中必须前后严格统一。
11. **拒绝虚假实现**：
    不得宣称“已实现”某个玩法或剧情效果，除非底层确实配置了对应的动作、条件或实体数据。

---

## 三、代码编写示例（使用 `dialogue_lib.py`）

编写 seed 脚本（如 `seed_my_story.py`）：

```python
from dialogue_lib import login, api, item_grant, currency_grant, notify, encounter, set_root

tok = login("admin", "admin123")
PKG_ID = "pkg_my_quest"

# 1. 剧本包
api(tok, "POST", "/admin/dialogues/packages", {
    "id": PKG_ID, "name": "医谷寻芳录", "description": "寻找失落的神草",
    "category": "BRANCH", "default_root_node_id": None
})

# 2. 节点定义（先不带选项）
nodes = [
    {
        "id": "node_mq_01_root", "package_id": PKG_ID, "npc_id": "tpl_suwanling",
        "scene_id": "scene_qixia_valley", "chapter_title": "初至药谷",
        "pages": [{"speaker_id": "speaker", "content": "少侠所为何来？"}],
        "editor_pos": {"x": 100, "y": 100}, "on_enter_actions": [], "on_complete_actions": []
    },
    {
        "id": "node_mq_02_fight", "package_id": PKG_ID, "npc_id": "tpl_suwanling",
        "scene_id": "scene_huichun_terrace", "chapter_title": "灵坪诛兽",
        "pages": [{"speaker_id": "narrator", "content": "凶兽盘踞在此。"}],
        "editor_pos": {"x": 300, "y": 100}, "on_enter_actions": [], "on_complete_actions": []
    },
    {
        "id": "node_mq_03_win", "package_id": PKG_ID, "npc_id": "tpl_suwanling",
        "scene_id": "scene_huichun_terrace", "chapter_title": "凯旋",
        "pages": [{"speaker_id": "speaker", "content": "多谢少侠，此乃谢礼。"}],
        "editor_pos": {"x": 500, "y": 50}, "on_enter_actions": [],
        "on_complete_actions": [
            notify("寻芳有谢", "少侠助医仙采药有功，附赠灵药。", [item_grant("item_healing_dan", 2)], once=True)
        ]
    },
    {
        "id": "node_mq_03_lose", "package_id": PKG_ID, "npc_id": "tpl_suwanling",
        "scene_id": "scene_huichun_terrace", "chapter_title": "力战不敌",
        "pages": [{"speaker_id": "narrator", "content": "异兽凶猛，稍歇片刻再战。"}],
        "editor_pos": {"x": 500, "y": 200}, "on_enter_actions": [], "on_complete_actions": []
    },
    {
        "id": "node_mq_after", "package_id": PKG_ID, "npc_id": "tpl_suwanling",
        "scene_id": "scene_qixia_valley", "chapter_title": "安居药谷",
        "pages": [{"speaker_id": "speaker", "content": "多亏少侠此前仗义相助，后山药圃已然安宁。"}],
        "editor_pos": {"x": 100, "y": 300}, "on_enter_actions": [], "on_complete_actions": []
    }
]
for n in nodes:
    api(tok, "POST", "/admin/dialogues/nodes", n)

# 3. 选项定义（含完成态分流与战斗配置）
options = [
    # 根节点：未完成时接取任务（跨场景）
    {
        "id": "opt_mq_accept", "node_id": "node_mq_01_root", "sort_order": 1, "text": "我愿前去诛兽采药",
        "next_node_id": "node_mq_02_fight", "actions": [{"type": "SET_FLAG", "key": "flag_mq_started", "value": 1}],
        "show_conditions": [{"type": "HAS_FLAG", "key": "flag_mq_done", "expectedValue": 0}],
        "enable_conditions": []
    },
    # 根节点：已完成时分流到事后闲聊，禁止重复接任务
    {
        "id": "opt_mq_finished_chat", "node_id": "node_mq_01_root", "sort_order": 2, "text": "近来药谷景致可好？",
        "next_node_id": "node_mq_after", "actions": [],
        "show_conditions": [{"type": "HAS_FLAG", "key": "flag_mq_done", "expectedValue": 1}],
        "enable_conditions": []
    },
    # 战斗选项
    {
        "id": "opt_mq_fight", "node_id": "node_mq_02_fight", "sort_order": 1, "text": "拔剑斩兽",
        "next_node_id": None, "show_conditions": [], "enable_conditions": [],
        "actions": [
            encounter("opt_mq_fight", "tpl_yaoshan_xuanxi", win="node_mq_03_win", lose="node_mq_03_lose",
                      level=2, exp=100, gold=50, items=[{"id": "item_ling_shi", "count": 2}],
                      once_flag="flag_mq_monster_slain")
        ]
    },
    # 胜利节点结局选项：设置完成 Flag
    {
        "id": "opt_mq_win_finish", "node_id": "node_mq_03_win", "sort_order": 1, "text": "药谷安危已定，告辞",
        "next_node_id": None, "show_conditions": [], "enable_conditions": [],
        "actions": [{"type": "SET_FLAG", "key": "flag_mq_done", "value": 1}]
    },
    # 失败重试选项
    {
        "id": "opt_mq_retry", "node_id": "node_mq_03_lose", "sort_order": 1, "text": "调养气息，重振旗鼓！",
        "next_node_id": "node_mq_02_fight", "actions": [], "show_conditions": [], "enable_conditions": []
    }
]
for o in options:
    api(tok, "POST", "/admin/dialogues/options", o)

# 4. 设置默认根节点
set_root(tok, PKG_ID, "node_mq_01_root")
print("剧情包配置完毕！")
```

---

## 四、E2E 验证脚本编写指南

编写 `<pkg_id>_path.json`，支持的指令：

- `{"teleport": "scene_id"}`：传送至指定场景
- `{"start": {"npcId": "..."}}`：与指定常驻 NPC 开启对话
- `{"start": {"auto_npc": true}}`：与当前场景属于该玩家的剧情 NPC 对话（用于跨场景推进）
- `{"start": {"nodeId": "..."}}`：直接进入节点（需有 ACTIVE 进度）
- `{"select": "opt_id", "expect": {...}}`：选择选项并校验结果
- `{"advance": {}, "expect": {...}}`：离开无选项节点/直连下一节点
- `{"settle": "win"|"lose", "expect": {...}}`：战斗结算，自动承接 `winNodeId` 或 `loseNodeId`

`expect` 支持的断言字段：
- `status`: `"CONTINUE"` / `"CLOSE"` / `"COMBAT"` / `"TELEPORT"`
- `node`: 期望的目标节点 ID
- `sceneChanged`: 布尔值，是否发生了跨场景剧情 NPC 移动
- `options_include`: 期望包含的选项 ID 列表（且必须未被置灰）
- `options_exclude`: 期望不出现的选项 ID 列表
- `toast_contains`: 飘字信息包含的文本
- `inventory_has`: 行囊道具校验（列表或字典）
- `mail_count`: 邮件总数校验
- `mail_title_contains`: 邮件标题包含文本

---

## 五、验收标准与报告输出规则

任务完成后的最终报告必须遵循以下硬性验收标准：

1. **绝对交付条件**：
   - `validate_pkg.py <pkg_id>` 输出必须为「问题：无」。
   - `e2e_walk.py <pkg_id>_path.json` 输出必须全部步骤 `[OK]`，`0 步失败`。
2. **原样贴出执行输出**：报告中必须原样贴出这两个脚本的真实命令行原始输出，严禁删减或凭空编造。
3. **数据一律基于回读**：报告中的节点数、选项数、战斗数只能来自脚本或 API 真实回读，不得手算。
4. **分类罗列已验证与未验证**：
   - 报告必须分列「已验证清单」和「未验证清单」。
   - 凡没有被自动化脚本或真实测试覆盖到的内容，一律归入未验证清单，**严禁使用笼统的“全部通过”或盲目填写 PASS**。
5. **E2E 路径覆盖率要求**：
   测试路径必须覆盖：
   - 每个分支选项至少走一次；
   - 每场战斗的胜利（win）与失败（lose）各跑通一次；
   - 每个结局节点正常到达；
   - **必须包含一次“完成后重入”测试**：验证剧情完结后再次对话，确认已被分流至完成态，未发生剧情回退或重复刷奖。
6. **游客数据清理说明**：在报告末尾必须明确说明跑测产生的游客 ID（`sub`）及相关数据的清理方案。

# API 快速索引与规范手册

完整说明见仓库根目录 `docs/dialogue-script-authoring.md`。

所有管理端接口（除 `/admin/login`）都需要带请求头：
```http
Authorization: Bearer <ADMIN_JWT>
```

所有玩家端接口都需要带请求头：
```http
Authorization: Bearer <PLAYER_JWT>
```

Base URL：`http://localhost:8787/api`

---

## 一、认证接口

### 1.1 管理员登录 `POST /admin/login`

```json
{ "username": "admin", "password": "admin123" }
```

响应：`{ "success": true, "token": "...", "user": { "username": "admin", "role": "admin" } }`

### 1.2 游客玩家登录 `POST /auth/guest`（E2E 测试用）

```json
{ "deviceId": "e2e-random-uuid" }
```

响应：`{ "success": true, "token": "...", "isNewGuest": true, "player": { "id": "...", ... } }`  
每个全新 `deviceId` 对应一个全新修仙者账号，适合自动化 E2E 跑测。

---

## 二、素材目录接口

### 2.1 场景列表 `GET /admin/scenes`

> **注意响应结构**：`scenes` 是目录接口中唯一**不带** `{ success, data }` 外壳的，直接返回 `{ "scenes": [...] }`。

```json
{
  "scenes": [
    { "id": "scene_qixia_valley", "name": "栖霞药坞 · 青囊庐", "zone_id": "zone_qixia_valley", "level": 1 }
  ]
}
```

- 节点 `scene_id` 必须填写真实的 `scenes.id`。

### 2.2 NPC 模板 `GET /admin/npc-templates`

响应：`{ "success": true, "data": [{ "id": "tpl_xxx", "key": "xxx", "name": "苏晚菱", "avatar": "..." }] }`

- 用于节点 `npc_id`、台词页 `speaker_id`，以及战斗选项 `encounter.templateId`。

### 2.3 地图常驻 NPC `GET /admin/npcs?sceneId=<id>`

响应：`{ "success": true, "data": [...] }`

- 仅用于查询地图上的固定常驻人物。**严禁为了剧情战斗创建地图 WORLD NPC**。

### 2.4 怪物组模版 `GET /admin/monster-groups`

响应：`{ "success": true, "data": [{ "id": "group_xxx", "name": "...", "enemyCount": 2, "members": [...] }] }`

- 仅用于多敌战阵（`START_COMBAT` 或 `encounter.battleMode = "GROUP"`）。

### 2.5 道具库 `GET /admin/items`

响应：`{ "success": true, "data": [{ "id": "item_xxx", "name": "...", "type": "CONSUMABLE" }] }`

- 剧情中发放与消耗的道具必须真实存在于道具库。

### 2.6 施法技能库与 NPC 技能绑定

#### 查询技能列表 `GET /admin/skills`
响应：
```json
{
  "success": true,
  "data": [
    {
      "skill_key": "skill_pure_yang_sword",
      "name": "纯阳剑煞",
      "cost_mp": 120,
      "target_type": "SINGLE_ENEMY",
      "skill_kind": "DAMAGE",
      "power": null,
      "is_enabled": 1
    }
  ]
}
```

#### 新增自定义施法技能 `POST /admin/skills`
```json
{
  "skill_key": "skill_xxx",
  "name": "技能名称",
  "description": "法诀详述",
  "cost_mp": 80,
  "target_type": "SINGLE_ENEMY",
  "skill_kind": "DAMAGE",
  "power": 1.2,
  "icon": "flame",
  "sort_order": 10,
  "is_enabled": 1
}
```
- `target_type`：`SINGLE_ENEMY` / `ALL_ENEMIES` / `SINGLE_ALLY` / `ALL_ALLIES` / `SELF`
- `skill_kind`：`DAMAGE`（伤害攻击）/ `HEAL`（回春疗伤）/ `BUFF`（灵气增益）/ `DEBUFF`（减益禁制）

#### 绑定技能至 NPC 模板 `POST /admin/npc-templates` 或 `PUT /admin/npc-templates/:id`
```json
{
  "id": "tpl_xxx",
  "key": "xxx",
  "name": "自定义NPC",
  "avatar": "/assets/combat/characters/hero_xxx_trans.png",
  "quality": "RARE",
  "growth_template": "mage",
  "skills": ["skill_xxx"]
}
```
- 通过 `skills`（数组）或 `skills_json`（JSON 字符串）传入技能标识数组，NPC 在剧情遭遇战或常驻战斗中即可施放该自定义法诀。

---

## 三、物品字段对照表（核心易错点）

系统内三处涉及物品发放/校验的位置，字段命名规范不同，**必须严格按表书写**：

| 位置 | 必填字段格式 | 说明 |
| --- | --- | --- |
| 选项动作 `GIVE_ITEM` / `COST_ITEM` / 条件 `HAS_ITEM` | `{"itemId": "item_xxx", "count": 1}` | 数量字段为 `count`，必须 >= 1 |
| 节点触发器 `SEND_NOTIFICATION.grants` | `{"type": "ITEM", "itemId": "item_xxx", "quantity": 1}` | 数量字段为 `quantity`（保存时 `count` 为别名），**不接受 `id`** |
| 战斗奖励 `encounter.battleReward.items` | `{"id": "item_xxx", "count": 1}` | 字段名必须为 `id` 与 `count`；若写 `itemId` 会被服务端静默过滤为空数组 |

---

## 四、剧本包管理接口

### 4.1 获取剧本列表 `GET /admin/dialogues/packages`

响应：`{ "success": true, "data": [{ "id": "pkg_xxx", "name": "...", "default_root_node_id": "node_xxx", ... }] }`

### 4.2 创建剧本 `POST /admin/dialogues/packages`

```json
{
  "id": "pkg_xxx",
  "name": "剧本名称",
  "description": "剧本简介",
  "category": "MAIN",
  "default_root_node_id": null
}
```

- `category`: `MAIN`（主线）/ `BRANCH`（支线）/ `ENCOUNTER`（奇遇遭遇）/ `FACILITY`（功能设施）。
- 创建时 `default_root_node_id` 传 `null`，待根节点创建后再更新。

### 4.3 获取剧本详情 `GET /admin/dialogues/packages/:id`

响应：`{ "success": true, "data": { "package": {...}, "nodes": [...] } }`  
`nodes[]` 包含各节点详情、台词页、options、actions 及 conditions。

### 4.4 设置/更新剧本根节点 `PUT /admin/dialogues/packages/:id`

> **注意 HTTP Method**：更新剧本必须使用 **`PUT`**，使用 `POST` 会直接返回 404！

```json
{
  "default_root_node_id": "node_xxx"
}
```

### 4.5 删除剧本 `DELETE /admin/dialogues/packages/:id`

级联删除剧本下的全部节点、选项、自动生成的剧情 NPC 和剧情通知记录。

---

## 五、对话节点接口

### 5.1 保存节点 `POST /admin/dialogues/nodes`（完整 Upsert）

> **注意完整 Upsert 原则**：更新已有节点时，必须先 `GET` 读取完整数据并回传所有字段，漏传的字段会被后端置空！

```json
{
  "id": "node_xxx",
  "package_id": "pkg_xxx",
  "npc_id": "tpl_xxx",
  "chapter_title": "第一章 · 寻仙访道",
  "pages": [
    { "speaker_id": "narrator", "content": "初入青囊庐，药香沁人心脾。" },
    { "speaker_id": "speaker", "content": "“少侠自远方而来，所为何事？”" },
    { "speaker_id": "player", "content": "“听闻谷中灵药可活白骨，特来求教。”" }
  ],
  "quote_box": null,
  "scene_id": "scene_qixia_valley",
  "direct_next_node_id": null,
  "ui_meta": {},
  "editor_pos": { "x": 100, "y": 100 },
  "on_enter_actions": [],
  "on_complete_actions": []
}
```

#### 节点约束与运行规则：
1. **有效台词**：`pages` 必须至少有 1 页非空文本。
2. **直连互斥**：`direct_next_node_id` 与分支选项互斥。设置了直连目标后，后端会清空选项。
3. **坐标排列**：必须填写 `editor_pos`，避免在后台拓扑编辑器内重叠。
4. **单节点多页**：多页台词由前端在客户端本地翻页。无选项的直连/终点节点，玩家在最后一页点击「继续」时调用一次 `advance` 离开节点。
5. **触发器限制**：`on_enter_actions` / `on_complete_actions` 运行时**仅支持 `SEND_NOTIFICATION`**。节点上的 `SET_FLAG` 不会在运行时生效（已实测验证），设置标记必须放在选项动作中。

### 5.2 删除节点 `DELETE /admin/dialogues/nodes/:id`

删除指定节点及其名下所有 options。

---

## 六、分支选项接口

### 6.1 保存选项 `POST /admin/dialogues/options`（完整 Upsert）

```json
{
  "id": "opt_xxx",
  "node_id": "node_xxx",
  "sort_order": 1,
  "text": "答应相助",
  "action_label": "应允",
  "style_type": "GOLD",
  "next_node_id": "node_next",
  "show_conditions": [],
  "enable_conditions": [],
  "actions": []
}
```

- `style_type`: `GOLD`（金辉高亮）/ `RED`（战斗警示）/ `NORMAL`（常规）/ `GRAY`（低显）。
- 保存时后端按 `DialogueActionSchema` 严格强校验，非法直接报 400（如缺少 `npcId` 或动作类型错误）。
- **禁止假选择**：同一节点的多个选项若指向同一后续节点，必须附带不同的动作（设置不同 flag、不同道具或属性变动）。

### 6.2 跨场景跳转规则

- 跨场景选项（目标节点 `scene_id` 与当前节点不同）**默认不要配置 `TELEPORT` 动作**。
- 选项只需指定 `next_node_id`，`actions: []`。运行时服务端返回 `status: CLOSE`、`sceneChanged: true`、`nextNodeId: ...`。
- 服务端会在玩家名下自动生成/移动一个剧情 NPC（`npcinst_story_<序号>_<包id>_<模板id>`）。玩家自行御风或跑图前往目标场景后，与该剧情 NPC 对话即可续接下一节点。
- 仅当人类明确要求“点击选项后必须立刻瞬间传送”时，才配置 `{"type": "TELEPORT", "areaId": "scene_target"}`。

---

## 七、战斗选项规范与结算流程

### 7.1 `START_ENCOUNTER` 单人遭遇（推荐）

```json
{
  "type": "START_ENCOUNTER",
  "npcId": "npcinst_storybattle_opt_xxx",
  "encounter": {
    "templateId": "tpl_xxx",
    "battleMode": "SOLO",
    "battleGroupId": null,
    "battleLevel": 5,
    "battleMemberLevels": {},
    "battleReward": {
      "exp": 100,
      "gold": 50,
      "silver": 2,
      "items": [{ "id": "item_ling_shi", "count": 5 }]
    },
    "respawnSeconds": 0,
    "onceFlag": "flag_xxx_defeated"
  },
  "winNodeId": "node_battle_win",
  "loseNodeId": "node_battle_lose"
}
```

#### 关键约束与底层机制：
1. **必须同时提供 `npcId` 与 `encounter`**：缺少 `npcId` 返回 400 `选项动作第 1 项（START_ENCOUNTER）字段 npcId 配置不合法`。规范写法：直接传入 `npcinst_storybattle_<option_id>`。
2. **自动生成战斗 NPC 实例**：保存后服务端自动生成一条 `npc_role = 'STORY_BATTLE'`、`scene_id = null`、`source_ref = <option_id>` 的实例。校验方式：`GET /admin/npc-instances?keyword=<option_id>`。
3. **改动必须重存选项**：`encounter` 配置仅在保存选项时被服务端读取生成实例，运行时直接读取生成的实例数据。修改等级、奖励、模板后必须重新 `POST` 该选项。
4. **物品字段必须用 `id` 与 `count`**：`encounter.battleReward.items` 内部元素必须是 `{"id": "...", "count": N}`。写成 `itemId` 会被服务端解析器直接忽略！
5. **必须同时配 `winNodeId` 与 `loseNodeId`**：不可缺失或单配。胜负节点必须同属一个剧本包。

### 7.2 战斗运行时与结算流程（已完全实测验证）

1. **玩家点选项开战**：`POST /api/npc/dialogue/select` 返回：
   - `status: "COMBAT"`
   - `combatPayload`: `{ battleType: "ENCOUNTER", npcId: "...", winNodeId: "...", loseNodeId: "...", storyContext: { packageId, nodeId, completeOnFinish: false } }`
2. **战局推进**：前端通过 WebSocket 进入实时回合制战斗（或测试中直接结算）。
3. **战斗胜负承接**：
   - 战斗结束后，客户端直接调用 **`POST /api/npc/dialogue/start`**，Body 传入 **`{"nodeId": winNodeId}`**（胜利）或 **`{"nodeId": loseNodeId}`**（失败）。
   - 服务端校验玩家在该剧本内持有 `ACTIVE` 进度，立即放行并渲染对应的后续剧情节点。
   - **注意**：HTTP 接口 `POST /api/combat/encounter/settle` 仅用于地图常驻野怪，不支持 `STORY_BATTLE`（调用会报错 400 `未寻得此江湖强敌`）。

---

## 八、节点触发器与奖励发放（`SEND_NOTIFICATION`）

节点触发器配在节点的 `on_enter_actions` / `on_complete_actions`：

```json
[
  {
    "type": "SEND_NOTIFICATION",
    "title": "青囊圣药 · 悬壶济世",
    "content": "少侠斩灭异化玄蜥，采得绝壁圣药，药坞重归安宁！",
    "grants": [
      { "type": "ITEM", "itemId": "item_tianjie_jinchuang", "quantity": 2 },
      { "type": "CURRENCY", "copper": 1000, "silver": 50, "ingot": 0 }
    ],
    "once": true
  }
]
```

### 严格规则与校验：
1. **`grants` 格式必须为数组**：传入对象直接 400。最多 20 项。
2. **支持的发放类型**：
   - `ITEM`: `{"type": "ITEM", "itemId": "item_xxx", "quantity": 1}`。物品必须存在于 `item_templates`，同一条通知内不得重复，数量 1~99999。
   - `CURRENCY`: `{"type": "CURRENCY", "silver": 0, "ingot": 0, "copper": 0}`。均为非负整数，至少一项非零。
   - `COMPANION`: `{"type": "COMPANION", "memberKey": "tpl_xxx", "level": 1, "realm": ""}`。
3. **经验禁止塞入 grants**：`grants` 不支持发放经验！经验必须通过选项动作 `ADD_EXP_OR_GOLD` 或战斗奖励 `battleReward.exp` 发放。
4. **必须显式配置 `"once": true`**：防止剧本设计缺陷导致玩家重复刷邮件附件领奖。
5. **系统邮件自动生成**：`grants` 非空时，触发后系统会自动向玩家邮箱投递一封附带物品/货币的邮件，并附带确定性幂等主键（`storycfg_{nodeId}_{event}_{index}`）。

---

## 九、条件与动作完整清单

### 9.1 条件（全部为 AND 逻辑，无取反运算符）

```json
{ "type": "MIN_LEVEL", "level": 10 }
{ "type": "HAS_ITEM", "itemId": "item_xxx", "count": 1 }
{ "type": "QUEST_STATUS", "questId": "quest_xxx", "status": "ACTIVE" }
{ "type": "HAS_FLAG", "key": "flag_xxx", "expectedValue": 1 }
```

- `QUEST_STATUS` 状态四态：`NONE` / `ACTIVE` / `DONE` / `SUBMITTED`。
- `HAS_FLAG`：
  - `expectedValue` 默认为 1。
  - **重要实测事实**：`expectedValue: 0` 对从未设置过的 flag 判定为**真**（`true`）。当需要检测“某个任务/战斗尚未进行过”时，可安全使用 `expectedValue: 0` 做准入条件。

### 9.2 选项动作类型

```json
{ "type": "GIVE_ITEM", "itemId": "item_xxx", "count": 1 }
{ "type": "COST_ITEM", "itemId": "item_xxx", "count": 1 }
{ "type": "ADD_EXP_OR_GOLD", "exp": 500, "gold": 100 }
{ "type": "ACCEPT_QUEST", "questId": "quest_xxx" }
{ "type": "COMPLETE_QUEST", "questId": "quest_xxx" }
{ "type": "SET_FLAG", "key": "flag_xxx", "value": 1 }
{ "type": "START_ENCOUNTER", "npcId": "npcinst_storybattle_opt_xxx", "encounter": {...}, "winNodeId": "...", "loseNodeId": "..." }
{ "type": "START_COMBAT", "monsterGroupId": "group_xxx", "winNodeId": "...", "loseNodeId": "..." }
{ "type": "TELEPORT", "areaId": "scene_target" }
{ "type": "JOIN_PARTY", "memberKey": "tpl_xxx", "active": true }
```

- `TELEPORT` 只有 `areaId`（取 `scenes.id`），**严禁写 `sceneId`**。
- `JOIN_PARTY` 必须使用 `memberKey`（NPC 模板 ID 或 key）和 `active`（布尔值）。

---

## 十、玩家状态读取与 E2E 验证接口

### 10.1 玩家端交互接口

| 接口 | 方法 | Body / Query | 说明 |
| --- | --- | --- | --- |
| `/api/travel/teleport` | POST | `{"targetZoneId": "...", "targetAreaId": "..."}` | 场景传送（zoneId 会被转为小写） |
| `/api/npc/dialogue/start` | POST | `{"npcId": "..."}` 或 `{"nodeId": "..."}` | 开启对话（直接传 nodeId 需有 ACTIVE 进度） |
| `/api/npc/dialogue/advance` | POST | `{"currentNodeId": "..."}` | 直连推进或终点关闭 |
| `/api/npc/dialogue/select` | POST | `{"currentNodeId": "...", "optionId": "..."}` | 选择分支选项 |

### 10.2 玩家状态查询接口（用于自动化断言）

1. **行囊背包**：`GET /api/player/inventory`
   - 响应包含 `items: [{ "id": "...", "itemId": "item_xxx", "itemName": "...", "count": 1, "quality": "..." }, ...]`
   - 用于 E2E 断言 `inventory_has` 与 `inventory_has_not`。
2. **飞鸽传书（收件箱）**：`GET /api/mails`
   - 响应包含 `mails: [{ "id": "...", "title": "...", "content": "...", "hasAttachment": true }, ...]` 和 `unreadCount`
   - 用于 E2E 断言 `mail_count` 与 `mail_title_contains`。
3. **进行中剧情**：`GET /api/player/story/active`
   - 响应当前玩家所有处于 `ACTIVE` 状态的剧情进度列表。
4. **剧情 Flag 与任务状态**：
   - 玩家端与管理端无直接暴露的独立 GET 接口；业务层通过对话选项的 `show_conditions` 与 `enable_conditions` 条件（选项是否呈现、是否被置灰）进行全链路验证；测试脚本可通过本地 SQLite 数据库查询 `player_dialogue_flags` 与 `player_quests` 辅助断言。

### 10.3 剧情完成态与重入防刷机制（已完全实测验证）

- **终点节点机制**：无选项且无直连目标的节点被判定为剧情终点。进入/离开该节点后，服务单将剧情进度更新为 `COMPLETED`，并将该剧本在当前玩家名下的剧情 NPC 从场景移除。
- **重入回退风险**：剧情完成后，玩家再次与该剧本的常驻入口 NPC 对话时，由于数据库中不再存在 `ACTIVE` 进度，NPC 对话会默认回退并重新开启 `dialogue_root_node_id`！
- **设计必须遵循**：根节点必须依据完成状态进行条件分流（例如在根节点配置带 `QUEST_STATUS` 或 `HAS_FLAG expectedValue: 0` 的初始选项，以及带完成标记的“事后闲聊”选项），严禁让已完成剧情的玩家重新接取任务刷取奖励！

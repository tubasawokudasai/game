# 剧情剧本自动化配置文档（Agent API 版）

本文档面向 **自动化 Agent / 脚本**。目标：不阅读后端代码，只依赖本文档中的 HTTP 接口，就能完成：

- 查询地图、NPC 模板、地图 NPC、战斗配置、道具等素材
- 创建 / 更新 / 删除剧情剧本（Dialogue Package）
- 创建节点内多段台词（Pages）
- 配置线性直连（Direct Next）
- 配置分支选项（Options）
- 配置战斗选项（单人遭遇 / 多人战阵）
- 配置条件、奖励、传送、入队等选项动作
- 验证剧本是否配置正确

> 运行时约定：剧本保存后立即生效，没有单独的“发布”步骤。

---

## 1. 环境与鉴权

### 1.1 Base URL

本地开发：

```text
后端直连：http://localhost:8787/api
后台 Vite 代理：http://localhost:3001/api
```

自动化脚本建议直连后端 `http://localhost:8787/api`，避免依赖后台页面。

### 1.2 管理员登录

```http
POST /api/admin/login
Content-Type: application/json
```

请求：

```json
{
  "username": "admin",
  "password": "admin123"
}
```

本地默认账号来自后端环境变量：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

生产环境请使用实际环境变量，不要把默认密码写进脚本。

响应：

```json
{
  "success": true,
  "token": "<JWT>",
  "user": { "username": "admin", "role": "admin" }
}
```

后续所有 `/api/admin/*` 接口（除 `/login`）都需要：

```http
Authorization: Bearer <JWT>
```

### 1.3 通用错误格式

失败时通常返回 HTTP 4xx/5xx，响应体：

```json
{ "error": "具体错误原因" }
```

Agent 应把 `error` 原样记录，不要猜测成功。

### 1.4 登录与获取 Token 的示例

```bash
BASE="http://localhost:8787/api"

TOKEN=$(curl -s -X POST "$BASE/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

AUTH="Authorization: Bearer $TOKEN"
```

---

## 2. 核心概念

### 2.1 数据层级

```text
Dialogue Package（剧本）
  └── Dialogue Node（节点）
        ├── Pages（节点内多段线性台词）
        ├── Options（分支选项，可为空）
        └── Direct Next Node（无分支直连，可为空）
```

### 2.2 一个节点的三种流向

后端不存储 `flow_mode` 字段，而是根据数据判断：

| 模式 | 数据特征 | 运行时行为 |
|---|---|---|
| 分支选项 | `options` 非空，`direct_next_node_id = null` | 玩家翻完 Pages 后显示选项 |
| 线性直连 | `options` 为空，`direct_next_node_id = <node>` | 玩家翻完 Pages 后显示“继续”，直接进入下一节点 |
| 对话结束 | `options` 为空，`direct_next_node_id = null` | 玩家翻完 Pages 后显示“告辞”；该玩家剧情进度标记为 `COMPLETED` |

**互斥规则：**

- 有 `options` 时，不要设置 `direct_next_node_id`。
- 设置 `direct_next_node_id` 时，后端会主动清空该节点的全部 `options`。
- 想从直连/结束切回分支，必须保存节点时把 `direct_next_node_id` 置为 `null`，再重新创建 options。
- 想从分支切到结束，必须删除该节点的全部 options，并把 `direct_next_node_id` 置为 `null`。

### 2.3 Pages（节点内多段台词）

一个节点内可以有多页台词，玩家点击“继续”在节点内翻页，不会产生新节点。

```json
[
  { "speaker_id": "speaker", "content": "第一句台词" },
  { "speaker_id": "player", "content": "主角回应" },
  { "speaker_id": "narrator", "content": "旁白收束" }
]
```

`speaker_id` 约定：

| 值 | 含义 |
|---|---|
| 省略 / `speaker` | 继承节点的 `npc_id` |
| `player` | 当前玩家主角 |
| `narrator` | 旁白 |
| NPC 模板 ID 或实例 ID | 其他 NPC |

兼容字段 `content`：

- 保存节点时如果传了 `pages`，以 `pages` 为准。
- 如果没传 `pages`，后端会把 `content` 解析为多页：
  - JSON 数组字符串
  - `\n---\n` 分隔
  - 普通文本（视为单页）
- 后端会把多页用 `\n---\n` 合并写回 `content`，用于兼容旧读取。
- **Agent 新建剧本时始终优先使用 `pages`，不要只写 `content`。**

### 2.4 剧情 NPC 的玩家单例与位置

剧情 NPC 不再在保存根节点时自动创建地图 WORLD NPC。运行时按玩家生成一条 `npc_instances` 记录：

```text
npc_role:   STORY
owner_player_id: 当前玩家
npc_id:    npcinst_story_<playerId>_<packageId>_<templateId>
key:       story_<packageId>
scene_id:  当前剧情节点场景；NULL = 不在地图上
pos_x/y:   可空
source:    DIALOGUE
绑定:      dialogue_package_id = packageId
```

规则：

- 每个玩家对每个剧情角色只有一条 `STORY` 记录，由唯一索引保证；
- 首次进入地图 / 剧情节点时创建，之后只更新 `scene_id / pos_x / pos_y`，不重复创建；
- `scene_id = NULL` 表示不在地图上；要显示时直接写场景和坐标；
- 地图人物列表只返回 `npc_role='MAP'` 与当前玩家自己的 `STORY` 记录；
- 多个剧本若在同一场景用同一个 NPC 模板做根节点入口（例如前后两章都由「长乐统领」引出），系统只展示一个：优先展示玩家进行中的剧本，其次展示最早创建的剧本。其余入口记录保留但暂时移出地图，当前剧本完成后会自动接上，不会出现两个一模一样的角色；
- 剧情完成 / 节点结束 / 无后续时自动把 `scene_id` 置空。

> 不需要手动创建剧情 NPC。只需保证根节点 / 节点配置了合法的 `scene_id` 和 `npc_id` 模板。

### 2.5 地图 NPC 的两种战斗模式

`GET /api/admin/npcs` 返回的地图 NPC 中，`type = "battle"` 的才是战斗型 NPC。

| `battle_mode` | 条件 | 战斗阵容 |
|---|---|---|
| `SOLO` | `battle_group_id` 为空 | 单人遭遇，NPC 模板自身作为唯一敌人 |
| `GROUP` | `battle_group_id` 已绑定 | 多人战阵，按 `monster_groups` 槽位出怪 |

剧情战斗选项 `START_ENCOUNTER` **不再引用地图战斗 NPC**，而是在选项的 `encounter` 中直接配置战斗角色模板、单人/多人模式、等级、奖励、冷却与一次性标记。后端保存选项时会为该选项 upsert 一条 `npc_instances.npc_role = 'STORY_BATTLE'` 的定义，它不会出现在地图人物列表。

跨场景 `next_node_id` 默认让**玩家自行前往**：只关闭对话框、推进剧情进度、把剧情 NPC 移到目标场景，**不会移动玩家**。除非人类明确要求“点选项直接传送”，否则不要额外配置 `TELEPORT`；确需传送时用 `{ "type": "TELEPORT", "areaId": "<scenes.id>" }`，并保留 `next_node_id`（否则剧情进度不推进）。

---

## 3. Agent 标准工作流

推荐按以下顺序执行，避免外键/引用不存在。

### Step 0：登录

```bash
TOKEN=$(curl ... )  # 见 1.4
```

### Step 1：读取素材目录

```http
GET /api/admin/scenes
GET /api/admin/npc-templates
GET /api/admin/npcs
GET /api/admin/monster-groups
GET /api/admin/items
```

Agent 必须从这些接口读取真实 ID，**不要硬编码地图 ID、模板 ID、NPC ID、道具 ID**。

### Step 2：确定剧本 ID 与节点 ID

建议使用稳定、可读、唯一的 ID：

```text
pkg_<project>_<chapter>
node_<project>_<chapter>_<step>
opt_<project>_<chapter>_<step>_<n>
```

例如：

```text
pkg_qingyun_intro
node_qingyun_intro_start
node_qingyun_intro_win
node_qingyun_intro_lose
opt_qingyun_intro_fight
```

后端允许省略 ID 自动生成，但自动化创建时**强烈建议显式指定**，否则后续无法稳定引用。

### Step 3：创建剧本

```http
POST /api/admin/dialogues/packages
```

### Step 4：创建节点

先创建直连/分支的目标节点，再创建引用它们的节点。

原因：

- `direct_next_node_id` 保存时后端会校验目标节点已存在。
- 选项的 `next_node_id` 建议也先创建目标节点。

### Step 5：设置根节点

创建第一个节点时，如果剧本还没有根节点，后端会自动把该节点设为根节点。

但更稳妥的做法是：所有节点创建完成后，显式：

```http
PUT /api/admin/dialogues/packages/:id
{ "default_root_node_id": "node_..." }
```

### Step 6：创建选项

只给“分支选项模式”的节点创建 options。直连/结束节点不要创建 options。

### Step 7：验证

```http
GET /api/admin/dialogues/packages/:id
```

检查：

- `package.default_root_node_id` 是否正确
- 每个节点的 `pages` 是否完整
- 每个节点的 `direct_next_node_id` 是否符合预期
- 分支节点的 `options` 数量、顺序、动作是否正确
- 根节点是否配置了合法的 `scene_id` + `npc_id` 模板

---

## 4. API 参考

### 4.1 地图 / 素材目录

#### `GET /api/admin/scenes`

获取全部地图场景。

响应：

```json
{
  "scenes": [
    {
      "id": "kunwu",
      "zone_id": "kunwu_state",
      "name": "昆吾州",
      "region": "昆吾州",
      "level": 1,
      "parent_id": null,
      "icon": "fort",
      "coord_x": 92,
      "coord_y": 333,
      "status_desc": "剑气凌霄 · 险地",
      "tag": "剑气凌霄",
      "subtitle": "西极万仞险峰 · 庚金灵脉",
      "thumb": "https://...",
      "description": "...",
      "feature": "...",
      "cost_desc": "...",
      "btn_text": "火速驰援",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Agent 用到的字段主要是：`id`、`name`、`zone_id`、`level`、`parent_id`。

#### `GET /api/admin/npc-templates`

获取全部 NPC 模板。

响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "tpl_luoqinghan",
      "key": "luoqinghan",
      "name": "洛清寒",
      "title": "后排法术控场 · 极寒冰修",
      "badge": "九霄玄冰",
      "avatar": "/assets/combat/characters/hero_luoqinghan_trans.png",
      "idle_avatar": "...",
      "attack_avatar": "...",
      "quality": "COMMON",
      "role": "DPS",
      "quote": "“...”",
      "gossip": "“...”",
      "description": "...",
      "usage": { "configs": 0, "npcs": 0 }
    }
  ]
}
```

节点 `npc_id` 和 Pages 的 `speaker_id` 可以直接使用这里的 `id` 或 `key`。

#### `GET /api/admin/npcs?sceneId=<scene_id>`

获取地图世界 NPC。`sceneId` 可省略（返回全部）。

关键字段：

```json
{
  "id": "npc_xxx",
  "scene_id": "kunwu",
  "scene_name": "昆吾州",
  "key": "npc_kunwu_xxx",
  "name": "洛清寒",
  "title": "...",
  "avatar": "...",
  "type": "battle",
  "status": "ACTIVE",
  "template_id": "tpl_luoqinghan",
  "battle_mode": "SOLO",
  "battle_group_id": null,
  "battle_group_name": null,
  "battle_level": 10,
  "enemyCount": 1,
  "enemyNames": ["洛清寒"],
  "battle_reward": { "exp": 100, "gold": 50, "items": [] },
  "respawn_seconds": 0,
  "once_flag": null,
  "dialogue_package_id": null,
  "dialogue_root_node_id": null
}
```

地图遭遇战（WORLD NPC）筛选条件：

```text
npc.type === "battle" && npc.status === "ACTIVE"
```

- `battle_mode === "SOLO"`：单人遭遇
- `battle_mode === "GROUP"`：多人战阵

#### `GET /api/admin/monster-groups`

获取全部战斗配置（多人战阵）。

响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "group_xxx",
      "name": "野怪",
      "enemyCount": 2,
      "totalHp": 30000,
      "totalCombatPower": 29860,
      "referencedNpcs": [{ "id": "npc_xxx", "name": "赤焰九尾狐", "scene_id": "arena" }],
      "members": [
        {
          "slot_index": 0,
          "template_id": "tpl_xxx",
          "template_name": "赤焰九尾狐",
          "level": 10,
          "position": "FRONT",
          "is_boss": true,
          "hp": 18000,
          "attack": 2200,
          "defense": 900,
          "speed": 120
        }
      ]
    }
  ]
}
```

#### `GET /api/admin/items`

获取道具字典，用于 `GIVE_ITEM` / `COST_ITEM` / 战利品配置。

```json
{
  "success": true,
  "data": [
    { "id": "item_healing_dan", "name": "回春金疮散", "type": "CONSUMABLE", "quality": "COMMON", "description": "..." }
  ]
}
```

#### `GET /api/admin/npc-attributes/config`

可选。获取成长模板、品质、境界等配置；自动创建 NPC 模板时可参考。

---

### 4.2 剧本 CRUD

#### `GET /api/admin/dialogues/packages`

获取剧本列表。

```json
{
  "success": true,
  "data": [
    {
      "id": "pkg_xxx",
      "name": "剧本名",
      "description": "",
      "category": "MAIN",
      "default_root_node_id": "node_xxx",
      "node_count": 5,
      "npc_count": 1,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

#### `POST /api/admin/dialogues/packages`

创建剧本。

请求：

```json
{
  "id": "pkg_xxx",
  "name": "剧本名称",
  "description": "剧本梗概，可为空",
  "category": "MAIN",
  "default_root_node_id": null
}
```

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 不传则自动生成；一旦使用，必须全局唯一 |
| `name` | 是 | 不能为空 |
| `description` | 否 | 默认空字符串 |
| `category` | 否 | `MAIN` / `BRANCH` / `ENCOUNTER` / `FACILITY`；其他值会存为 `STORY` |
| `default_root_node_id` | 否 | 通常先不传，创建节点后再设置 |

响应：

```json
{
  "success": true,
  "message": "剧本【...】创建成功",
  "data": {
    "id": "pkg_xxx",
    "name": "...",
    "description": "",
    "category": "MAIN",
    "default_root_node_id": null,
  }
}
```

#### `GET /api/admin/dialogues/packages/:id`

获取剧本详情 + 全部节点 + 选项。

响应结构：

```json
{
  "success": true,
  "data": {
    "package": {
      "id": "pkg_xxx",
      "name": "...",
      "description": "",
      "category": "MAIN",
      "default_root_node_id": "node_xxx",
      "npc_count": 1,
      "created_at": "...",
      "updated_at": "..."
    },
    "nodes": [
      {
        "id": "node_xxx",
        "package_id": "pkg_xxx",
        "npc_id": "tpl_luoqinghan",
        "chapter_title": "第一章",
        "content": "第一句\n---\n第二句",
        "pages": [
          { "speaker_id": "speaker", "content": "第一句" },
          { "speaker_id": "player", "content": "第二句" }
        ],
        "direct_next_node_id": null,
        "quote_box": null,
        "scene_id": "kunwu",
        "ui_meta": {},
        "editor_pos": { "x": 100, "y": 100 },
        "on_enter_actions": [],
        "on_complete_actions": [],
        "options": [
          {
            "id": "opt_xxx",
            "node_id": "node_xxx",
            "sort_order": 1,
            "text": "继续",
            "action_label": "继续",
            "style_type": "NORMAL",
            "next_node_id": "node_yyy",
            "show_conditions": [],
            "enable_conditions": [],
            "actions": []
          }
        ]
      }
    ]
  }
}
```

**Agent 验证配置时，以这个接口为准。**

#### `PUT /api/admin/dialogues/packages/:id`

局部更新剧本元数据。未传字段沿用现有值。

请求示例：

```json
{
  "default_root_node_id": "node_xxx"
}
```

可更新字段：

- `name`
- `description`
- `category`
- `default_root_node_id`

设置根节点只更新剧本元数据；剧情 NPC 由玩家进入地图 / 节点时按玩家位置懒生成。

#### `DELETE /api/admin/dialogues/packages/:id`

删除剧本，并连带删除：

- 该剧本全部 `dialogue_nodes`
- 该剧本全部 `dialogue_options`
- 自动生成的剧情 NPC（`source=DIALOGUE` 且 `source_ref=package_id`）
- 该剧本的剧情通知

人工挂载的地图 NPC 只解绑，不删除。

---

### 4.3 节点 CRUD

#### `POST /api/admin/dialogues/nodes`

创建或更新节点。

> **重要：这是完整 upsert，不是局部更新。**  
> 更新节点时必须把节点完整字段一起提交，否则未传字段会被重置为默认值（`scene_id=null`、`on_enter_actions=[]` 等）。  
> 安全做法：先 `GET /api/admin/dialogues/packages/:id` 取到节点完整对象，修改目标字段，再整体 POST 回来。

请求：

```json
{
  "id": "node_xxx",
  "package_id": "pkg_xxx",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "第一章 · 起点",
  "pages": [
    { "speaker_id": "speaker", "content": "第一句台词" },
    { "speaker_id": "player", "content": "主角回应" },
    { "speaker_id": "narrator", "content": "旁白收束" }
  ],
  "quote_box": "可选的旁白引用框",
  "scene_id": "kunwu",
  "direct_next_node_id": null,
  "ui_meta": {},
  "editor_pos": { "x": 100, "y": 100 },
  "on_enter_actions": [],
  "on_complete_actions": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 不传则自动生成；建议显式指定 |
| `package_id` | 是 | 所属剧本 |
| `npc_id` | 否 | 节点默认说话人模板 ID/key；默认 `speaker` |
| `chapter_title` | 否 | 章节/幕次标题 |
| `pages` | 是* | 多段台词；至少 1 页非空。* 也可用 `content` 代替 |
| `content` | 否 | 兼容字段；未传 `pages` 时按 JSON 数组 / `\n---\n` / 普通文本解析 |
| `quote_box` | 否 | 旁白引用框 |
| `scene_id` | 否 | 地图 ID；`__hidden__` 表示过场隐藏；空表示跟随 NPC 实例地图 |
| `direct_next_node_id` | 否 | 线性直连下一节点；设置后后端会清空该节点 options |
| `ui_meta` | 否 | 表现层扩展对象 |
| `editor_pos` | 否 | 可视化坐标 `{x,y}` |
| `on_enter_actions` | 否 | 进入节点触发器；支持 `SEND_NOTIFICATION`，`grants` 非空时同时发系统邮件 |
| `on_complete_actions` | 否 | 离开节点触发器；支持 `SEND_NOTIFICATION`，`grants` 非空时同时发系统邮件 |

约束：

- 至少需要一句非空台词。
- `direct_next_node_id` 不能等于当前节点。
- `direct_next_node_id` 指向的节点必须已存在。
- 如果剧本还没有 `default_root_node_id`，创建的第一个节点会自动成为根节点。
- 剧情 NPC 由玩家进入地图 / 节点时按玩家懒生成（见 2.4），保存根节点不会创建地图 NPC。
- 如果先创建的是非预期根节点，可能在它的场景提前生成自动剧情 NPC；后续 `PUT` 设置真正的根节点时，该自动 NPC 的 `scene_id` / `dialogue_root_node_id` 会同步更新，不会重复生成。仍建议最终显式设置一次根节点。

响应：

```json
{
  "success": true,
  "message": "对话节点已保存",
  "data": {
    "id": "node_xxx",
    "package_id": "pkg_xxx",
    "npc_id": "tpl_luoqinghan",
    "chapter_title": "第一章 · 起点",
    "content": "第一句台词\n---\n主角回应\n---\n旁白收束",
    "pages": [
      { "speaker_id": "speaker", "content": "第一句台词" },
      { "speaker_id": "player", "content": "主角回应" },
      { "speaker_id": "narrator", "content": "旁白收束" }
    ],
    "pages_json": "[...]",
    "direct_next_node_id": null
  }
}
```

#### `DELETE /api/admin/dialogues/nodes/:id`

删除节点及其 options。

如果删除的是剧本根节点：

- 剧本 `default_root_node_id` 被置空
- 该剧本自动生成的剧情 NPC 会被删除

---

### 4.4 选项 CRUD

#### `POST /api/admin/dialogues/options`

创建或更新选项。

> **同样是完整 upsert。** 更新选项时必须把 `text`、`action_label`、`style_type`、`next_node_id`、`show_conditions`、`enable_conditions`、`actions` 全部带上，否则未传字段会被重置。

请求：

```json
{
  "id": "opt_xxx",
  "node_id": "node_xxx",
  "sort_order": 1,
  "text": "应战",
  "action_label": "出战",
  "style_type": "RED",
  "next_node_id": null,
  "show_conditions": [],
  "enable_conditions": [],
  "actions": [
    {
      "type": "START_ENCOUNTER",
      "encounter": {
        "templateId": "tpl_xxx",
        "battleMode": "SOLO",
        "battleGroupId": null,
        "battleLevel": 10,
        "battleMemberLevels": {},
        "battleReward": { "exp": 500, "gold": 100, "silver": 0, "items": [] },
        "respawnSeconds": 0,
        "onceFlag": null
      },
      "winNodeId": "node_win",
      "loseNodeId": "node_lose"
    }
  ]
}
```

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 不传自动生成；建议显式指定 |
| `node_id` | 是 | 所属节点 |
| `text` | 是 | 选项正文，不能为空 |
| `sort_order` | 否 | 排序，默认 1 |
| `action_label` | 否 | 右侧短标签，如 `出战` / `知悉` / `作罢` |
| `style_type` | 否 | `GOLD` / `RED` / `GRAY` / `NORMAL` |
| `next_node_id` | 否 | 选择后跳转的节点；空表示结束对话。跨场景时只关闭对话框并推进剧情，玩家自行前往（不配 `TELEPORT` 就不会被传送） |
| `show_conditions` | 否 | 不满足时隐藏 |
| `enable_conditions` | 否 | 不满足时置灰并给出原因 |
| `actions` | 否 | 选择后执行的副作用指令；保存时按 `DialogueActionSchema` 校验，非法直接 400（`TELEPORT` 用 `areaId`，`SEND_NOTIFICATION` 只能放节点触发器） |

响应：

```json
{
  "success": true,
  "message": "对话选项已保存",
  "data": {
    "id": "opt_xxx",
    "node_id": "node_xxx",
    "text": "应战",
    "action_label": "出战",
    "next_node_id": null
  }
}
```

#### `DELETE /api/admin/dialogues/options/:id`

删除单个选项。

---

### 4.5 条件（Conditions）

`show_conditions` / `enable_conditions` 是数组，多个条件之间是 **AND**。

#### `MIN_LEVEL`

```json
{ "type": "MIN_LEVEL", "level": 10 }
```

#### `HAS_ITEM`

```json
{ "type": "HAS_ITEM", "itemId": "item_healing_dan", "count": 1 }
```

#### `QUEST_STATUS`

```json
{ "type": "QUEST_STATUS", "questId": "quest_xxx", "status": "ACTIVE" }
```

`status` 取值：`NONE` / `ACTIVE` / `DONE` / `SUBMITTED`。

#### `HAS_FLAG`

```json
{ "type": "HAS_FLAG", "key": "flag_xxx", "expectedValue": 1 }
```

`expectedValue` 默认 1。

行为：

- `show_conditions` 不满足：选项直接隐藏。
- `enable_conditions` 不满足：选项显示但置灰，并附带原因。
- 条件配置损坏时 fail-closed：隐藏/置灰，不会误放行。

---

### 4.6 动作（Actions）

`actions` 是数组，选择选项后按顺序执行。

#### `GIVE_ITEM`

```json
{ "type": "GIVE_ITEM", "itemId": "item_healing_dan", "count": 1 }
```

道具 ID 从 `GET /api/admin/items` 获取。

#### `COST_ITEM`

```json
{ "type": "COST_ITEM", "itemId": "item_xxx", "count": 1 }
```

#### `ADD_EXP_OR_GOLD`

```json
{ "type": "ADD_EXP_OR_GOLD", "exp": 500, "gold": 100 }
```

#### `ACCEPT_QUEST`

```json
{ "type": "ACCEPT_QUEST", "questId": "quest_xxx" }
```

#### `COMPLETE_QUEST`

```json
{ "type": "COMPLETE_QUEST", "questId": "quest_xxx" }
```

#### `SET_FLAG`

```json
{ "type": "SET_FLAG", "key": "flag_xxx", "value": 1 }
```

#### `START_COMBAT`（直接指定怪物组）

```json
{
  "type": "START_COMBAT",
  "monsterGroupId": "group_xxx",
  "winNodeId": "node_win",
  "loseNodeId": "node_lose"
}
```

说明：直接按 `monster_groups` 打剧情战；不读取地图 NPC 的遭遇奖励/一次性标记/冷却。  
新剧本优先使用下面的 `START_ENCOUNTER`。

#### `START_ENCOUNTER`（剧情战斗，推荐）

```json
{
  "type": "START_ENCOUNTER",
  "npcId": "npcinst_storybattle_opt_xxx",
  "encounter": {
    "templateId": "tpl_cangyun",
    "battleMode": "SOLO",
    "battleGroupId": null,
    "battleLevel": 10,
    "battleMemberLevels": {},
    "battleReward": {
      "exp": 500,
      "gold": 100,
      "silver": 0,
      "items": [{ "id": "item_healing_dan", "count": 1 }]
    },
    "respawnSeconds": 0,
    "onceFlag": null
  },
  "winNodeId": "node_win",
  "loseNodeId": "node_lose"
}
```

- `encounter.templateId` 是战斗角色模板，必须存在于 `npc_templates`。
- 示例里的 `npcId` 是**保存后的入库形态**，请求时可省略（手填也会被后端覆盖）。
- `battleMode = "SOLO"`：模板自身作为唯一敌人；`battleGroupId` 必须为空。
- `battleMode = "GROUP"`：必须填写 `battleGroupId`，使用 `monster_group_members` 的 1~4 人阵容。
- `battleLevel`、`battleMemberLevels`、`battleReward`、`respawnSeconds`、`onceFlag` 与地图 NPC 的“遭遇模式与实例参数”完全一致。
- 后台保存选项时自动生成稳定的 `npcId`（`npcinst_storybattle_<option_id>`），并 upsert 一条 `npc_role='STORY_BATTLE'` 的定义。
- `STORY_BATTLE` 不出现在地图人物列表；节点结束/战斗结束不会残留地图 NPC。
- `winNodeId` / `loseNodeId` 可省略；省略时战斗结束直接把来源节点标记 `COMPLETED` 并关闭对话。
- 战斗结果节点必须在同一剧本。
- 不要同时设置 `next_node_id`。

#### `TELEPORT`

```json
{ "type": "TELEPORT", "areaId": "square", "posX": 120, "posY": 240 }
```

`areaId` 必须是 `GET /api/admin/scenes` 中的 `id`；`zoneId` 可省略，由服务端按场景推导。

#### `JOIN_PARTY`

```json
{ "type": "JOIN_PARTY", "memberKey": "tpl_luoqinghan", "active": true }
```

`memberKey` 是 NPC 模板 ID 或 `key`。

---

### 4.7 节点触发器与系统邮件（可选）

`on_enter_actions` / `on_complete_actions` 支持 `SEND_NOTIFICATION`。

**关键：`grants` 非空时，触发后不仅发即时通知，还会自动创建系统邮件（带附件）。不需要额外调用邮件接口。**

绑定通知资产：

```json
[
  {
    "type": "SEND_NOTIFICATION",
    "notificationId": "snotif_xxx",
    "once": true
  }
]
```

节点内联配置（不绑定通知资产）：

```json
[
  {
    "type": "SEND_NOTIFICATION",
    "title": "E2E 测试奖励",
    "content": "恭喜完成剧情测试，附件请查收。",
    "grants": [
      { "type": "ITEM", "itemId": "item_healing_dan", "quantity": 1 }
    ],
    "once": true
  }
]
```

规则：

- `grants` 为空：只发即时通知（toast）。
- `grants` 非空：即时通知 + 系统邮件（带附件）。
- 绑定 `notificationId`：使用通知资产里配置的 `grants`。
- 不绑定：使用节点内联的 `title` / `content` / `grants`。
- `once` 默认 `true`；重复触发不会重复发邮件。

`grants` 支持：

```json
{ "type": "ITEM", "itemId": "item_xxx", "quantity": 1 }
{ "type": "COMPANION", "memberKey": "tpl_xxx", "level": 1, "realm": "" }
{ "type": "CURRENCY", "silver": 1000, "ingot": 0, "copper": 0 }
```

可用变量：`{playerName}`、`{chapterTitle}`、`{packageName}`、`{nodeId}`。

### 4.8 剧情通知（可选）

节点触发器 `SEND_NOTIFICATION` 可以引用剧情通知资产。

#### `GET /api/admin/notifications/story-notifications?package_id=<pkg>`

```json
{
  "success": true,
  "data": [
    {
      "id": "snotif_xxx",
      "package_id": "pkg_xxx",
      "node_id": null,
      "trigger_event": "ANY",
      "name": "默认通知",
      "title": "剧情推进",
      "content": "少侠进入【{chapterTitle}】。",
      "grants": [],
      "enabled": 1
    }
  ]
}
```

#### `POST /api/admin/notifications/story-notifications`

```json
{
  "package_id": "pkg_xxx",
  "node_id": null,
  "trigger_event": "ANY",
  "name": "默认通知",
  "title": "剧情推进",
  "content": "少侠进入【{chapterTitle}】。",
  "grants": [
    { "type": "ITEM", "itemId": "item_healing_dan", "quantity": 1 }
  ],
  "enabled": 1
}
```

`trigger_event` 可选：`ANY` / `ENTER` / `COMPLETE`。  
`grants` 非空时，通知资产触发后会自动创建系统邮件。

节点触发器引用：

```json
[
  {
    "type": "SEND_NOTIFICATION",
    "notificationId": "snotif_xxx",
    "once": true
  }
]
```

---

## 5. 可选：创建战斗素材（如果目录为空）

如果 `GET /api/admin/npcs` 没有可用的战斗型 NPC，可以按以下顺序创建。

### 5.0 创建场景（可选）

如果 `GET /api/admin/scenes` 没有合适地图，可以创建场景。

```http
POST /api/admin/scenes
```

```json
{
  "id": "scene_demo",
  "name": "示例场景",
  "region": "天衡州",
  "zone_id": "tianheng_state",
  "level": 2,
  "parent_id": "tianheng",
  "icon": "castle",
  "coord_x": 300,
  "coord_y": 300,
  "status_desc": "示例 · 安全区",
  "tag": "示例",
  "subtitle": "示例场景",
  "description": "用于剧情测试的场景",
  "feature": "示例",
  "cost_desc": "行步耗时：无",
  "btn_text": "进入"
}
```

必填：`name`。  
`id` 不传会自动生成；`zone_id` 默认 `changle_city`；`level` 默认 3；坐标范围 0~512。  
创建后可以在节点的 `scene_id` 中使用该 `id`。

### 5.1 创建 NPC 模板（可选）

```http
POST /api/admin/npc-templates
```

最小示例：

```json
{
  "id": "tpl_demo_guard",
  "key": "demo_guard",
  "name": "示例守卫",
  "title": "城门守卫",
  "badge": "守",
  "avatar": "/assets/combat/characters/hero_shieldman_trans.png",
  "quality": "COMMON",
  "growth_template": "warrior",
  "role": "TANK",
  "description": "用于剧情战斗的示例模板"
}
```

省略基础属性时，服务端会按成长模板补默认值。  
如果只是想做剧情，优先复用现有模板，避免自己维护数值。

### 5.2 创建多人战阵（可选）

```http
POST /api/admin/monster-groups
```

```json
{
  "id": "group_demo_wave",
  "name": "示例战阵",
  "members": [
    {
      "slot_index": 0,
      "template_id": "tpl_demo_guard",
      "level": 10,
      "position": "FRONT",
      "is_boss": true
    },
    {
      "slot_index": 1,
      "template_id": "tpl_luoqinghan",
      "level": 10,
      "position": "BACK",
      "is_boss": false
    }
  ]
}
```

`members` 最多 4 个槽位，`slot_index` 0~3，不能重复。  
创建战阵时服务端会自动创建对应的 `BATTLE` NPC 实例。

### 5.3 在地图上放置战斗 NPC（仅地图遭遇，不用于剧情战斗）

> 剧情战斗选项请使用 `START_ENCOUNTER.encounter`，不要为了剧情战斗在本节创建地图 WORLD NPC。剧情战斗角色由后端按选项自动 upsert 为 `STORY_BATTLE`。

```http
POST /api/admin/npcs
```

**多人战阵：**

```json
{
  "scene_id": "arena",
  "template_id": "tpl_demo_guard",
  "name": "示例战阵守卫",
  "title": "演武校场 · 战阵",
  "type": "battle",
  "battle_group_id": "group_demo_wave",
  "battle_level": 10
}
```

**单人遭遇：** 不传 `battle_group_id` 即可。

```json
{
  "scene_id": "arena",
  "template_id": "tpl_demo_guard",
  "name": "示例独行守卫",
  "title": "演武校场 · 单人",
  "type": "battle",
  "battle_level": 10,
  "battle_reward": {
    "exp": 500,
    "gold": 100,
    "items": [{ "id": "item_healing_dan", "count": 1 }]
  },
  "respawn_seconds": 0,
  "once_flag": null
}
```

可选字段：

- `battle_member_levels`: `{ "0": 12, "1": 10 }` 覆盖战阵槽位等级
- `battle_reward`: 奖励对象
- `respawn_seconds`: 重生冷却秒数
- `once_flag`: 一次性击败标记；为空表示可重复挑战

---

## 6. 完整 JSON 示例

### 6.1 线性直连：3 页台词 → 下一节点

```http
// 1) 创建剧本
POST /api/admin/dialogues/packages
{
  "id": "pkg_demo_linear",
  "name": "示例 · 线性对话",
  "category": "MAIN"
}

// 2) 先创建终点节点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_linear_end",
  "package_id": "pkg_demo_linear",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 终章",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“此间事了，后会有期。”" }
  ],
  "direct_next_node_id": null
}

// 3) 创建起点节点，直连终点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_linear_start",
  "package_id": "pkg_demo_linear",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 起点",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“少侠留步。”" },
    { "speaker_id": "player", "content": "“仙长有何指教？”" },
    { "speaker_id": "narrator", "content": "山风掠过，剑意渐起。" }
  ],
  "direct_next_node_id": "node_demo_linear_end"
}

// 4) 显式设置根节点
PUT /api/admin/dialogues/packages/pkg_demo_linear
{
  "default_root_node_id": "node_demo_linear_start"
}
```

运行效果：

1. 玩家点击 NPC
2. 显示 3 页台词，每页点“继续”
3. 第 3 页后显示“继续前行”
4. 进入 `node_demo_linear_end`
5. 终点节点无 options / direct → 标记 `COMPLETED`，NPC 对该玩家消失

### 6.2 分支 + 战斗遭遇选项

```http
// 剧本
POST /api/admin/dialogues/packages
{ "id": "pkg_demo_battle", "name": "示例 · 战斗分支", "category": "BRANCH" }

// 胜利节点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_win",
  "package_id": "pkg_demo_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 胜利",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "speaker", "content": "“果然英雄出少年。”" }]
}

// 失败节点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_lose",
  "package_id": "pkg_demo_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 失败",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "narrator", "content": "你眼前一黑，退出了战阵。" }]
}

// 情报节点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_info",
  "package_id": "pkg_demo_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 情报",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "speaker", "content": "“校场有异，需小心行事。”" }]
}

// 起点节点
POST /api/admin/dialogues/nodes
{
  "id": "node_demo_start",
  "package_id": "pkg_demo_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 起点",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“前方战阵凶险，少侠可敢一战？”" }
  ]
}

// 选项 1：战斗
POST /api/admin/dialogues/options
{
  "id": "opt_demo_fight",
  "node_id": "node_demo_start",
  "sort_order": 1,
  "text": "应战",
  "action_label": "出战",
  "style_type": "RED",
  "next_node_id": null,
  "show_conditions": [],
  "enable_conditions": [],
  "actions": [
    {
      "type": "START_ENCOUNTER",
      "encounter": {
        "templateId": "tpl_demo_guard",
        "battleMode": "SOLO",
        "battleGroupId": null,
        "battleLevel": 10,
        "battleMemberLevels": {},
        "battleReward": { "exp": 500, "gold": 100, "silver": 0, "items": [] },
        "respawnSeconds": 0,
        "onceFlag": null
      },
      "winNodeId": "node_demo_win",
      "loseNodeId": "node_demo_lose"
    }
  ]
}

// 选项 2：打探
POST /api/admin/dialogues/options
{
  "id": "opt_demo_info",
  "node_id": "node_demo_start",
  "sort_order": 2,
  "text": "先打探消息",
  "action_label": "探查",
  "style_type": "NORMAL",
  "next_node_id": "node_demo_info",
  "show_conditions": [],
  "enable_conditions": [],
  "actions": []
}

// 选项 3：告辞
POST /api/admin/dialogues/options
{
  "id": "opt_demo_leave",
  "node_id": "node_demo_start",
  "sort_order": 3,
  "text": "告辞离去",
  "action_label": "作罢",
  "style_type": "GRAY",
  "next_node_id": null,
  "show_conditions": [],
  "enable_conditions": [],
  "actions": []
}

// 设置根节点
PUT /api/admin/dialogues/packages/pkg_demo_battle
{ "default_root_node_id": "node_demo_start" }
```

剧情战斗**不引用**上面的地图 WORLD NPC：`START_ENCOUNTER` 只需要 `encounter`，`npcId` 由后端按选项自动生成为 `npcinst_storybattle_<option_id>`，手工填写会被覆盖。改等级/奖励/战阵必须重新 `POST` 该选项（`encounter` 只在保存时读取）。

### 6.3 纯结束节点

```json
{
  "id": "node_demo_end",
  "package_id": "pkg_demo",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 结束",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "narrator", "content": "故事到此结束。" }],
  "direct_next_node_id": null
}
```

不要为它创建 options。  
运行时会显示“告辞”，并把玩家进度标记为 `COMPLETED`。

---

## 7. 常见错误与排查

| 错误 | 原因 | 解决 |
|---|---|---|
| `剧本名称不能为空` | POST package 没传 name | 补 name |
| `剧本 ID [...] 已存在` | 重复使用 ID | 换唯一 ID |
| `节点至少需要一句非空台词` | pages/content 都为空 | 至少传 1 页非空 content |
| `直连目标节点 [...] 不存在` | 目标节点未创建 | 先创建目标节点，再保存源节点 |
| `直连下一节点不能是当前节点自身` | 自环 | 换目标 |
| `所属节点 node_id 不能为空` | option 没传 node_id | 补 node_id |
| `选项文本不能为空` | option 没传 text | 补 text |
| 剧情战斗选项不出现在 UI | `show_conditions` 不满足，或玩家进度不在该节点 | 检查 `show_conditions` 与 `player_story_progress` |
| 战斗提示“非挑战型强敌” | `encounter.templateId` / 战阵配置无效 | 检查模板与战斗配置是否存在 |
| 战斗提示“已被诛灭” | NPC `once_flag` 已置位 | 换 NPC 或清空 `once_flag` |
| 战斗提示冷却中 | NPC `respawn_seconds` 未到 | 等待或调整配置 |
| 直连节点保存后 options 消失 | 后端按互斥规则清空 | 这是预期行为；切回分支要重新建 options |
| 更新节点后地图/台词被清空 | POST node 是完整 upsert，漏传了字段 | 先 GET 详情，整体回传 |
| 更新选项后 actions 消失 | POST option 是完整 upsert，漏传 actions | 先 GET 详情，整体回传 |
| 玩家点选项弹「该抉择的动作指令配置异常，已阻断执行」 | 选项 `actions` 不符合运行时 schema：`TELEPORT` 写成 `sceneId`、`SEND_NOTIFICATION` 放进选项、缺必填字段、`count <= 0`、未知 `type` | `TELEPORT` 用 `areaId`；通知改配节点触发器；按第 4 节「动作」逐项改后重存 |
| 保存选项返回 `选项动作第 N 项（…）配置不合法` | 保存期校验已拦截（与运行期同一份 schema） | 按提示改字段后重存，不要绕过校验 |
| 保存战斗选项返回 `剧情战斗选项缺少 encounter 配置` | `START_ENCOUNTER` 只传了 `npcId` | 补完整 `encounter`，`npcId` 由后端生成 |
| 玩家点跨场景选项后被强制传送 | 选项多配了 `TELEPORT` | 删掉该动作，只留 `next_node_id`，让玩家自行前往 |

---

## 8. Agent 验证清单

创建完成后逐项检查：

- [ ] `GET /api/admin/dialogues/packages/:id` 返回 200
- [ ] `package.default_root_node_id` 指向正确的起点节点
- [ ] 所有节点的 `pages` 非空
- [ ] 直连节点的 `direct_next_node_id` 存在且不是自身
- [ ] 直连节点没有残留 options
- [ ] 分支节点的 options 顺序、text、style、next_node_id 正确
- [ ] 战斗选项的 `actions[].type === "START_ENCOUNTER"`
- [ ] 战斗选项的 `actions[].encounter.templateId` 存在于 NPC 模板库
- [ ] GROUP 模式引用的 `monster-groups` 存在且有槽位
- [ ] 战斗胜利/失败节点属于同一剧本
- [ ] 跨场景选项默认 `actions: []`（只有人类明确要求自动传送时才配 `TELEPORT` + `areaId`，并保留 `next_node_id`）
- [ ] 每个 option 的 `GET` 结果原样 `POST` 一次返回 200（保存期与运行期共用同一份动作 schema，非法的会 400）
- [ ] 保存战斗选项后，`GET /api/admin/npc-instances?keyword=<option_id>` 能看到一条 `npc_role='STORY_BATTLE'` 定义，且不在地图人物列表中

---

## 9. 运行时行为摘要

- 玩家点击剧情 NPC → 后端按 `player_story_progress` 当前节点续接；没有进度则走剧本根节点。
- 节点内 Pages 由前端本地翻页，不请求后端。
- 翻完最后一页：
  - 有 options → 显示选项
  - 无 options 且有 direct → 显示“继续”，调用 `/api/npc/dialogue/advance`
  - 无 options 且无 direct → 显示“告辞”，标记 `COMPLETED`
- 选择战斗选项 → 返回 `COMBAT`，前端通过 WebSocket 发起 `ENCOUNTER` 战斗。
- 战斗结束：
  - 配置了 `winNodeId` / `loseNodeId` → 自动打开对应节点
  - 未配置 → 结束对话
- 剧情 NPC 的可见场景由玩家自己的 `npc_instances`（`npc_role='STORY'`）当前 `scene_id` 决定；`scene_id = NULL` 时隐藏。
- 跨场景 `next_node_id`：后端把剧情进度推进到目标节点、把剧情 NPC 位置更新到目标场景，并返回 `CLOSE`；玩家留在原地自行前往（行旅 / 任务面板），只有选项配了 `TELEPORT` 才会被传送。
- 玩家完成剧本后，该剧本的剧情 NPC 对该玩家隐藏；其他玩家不受影响。

---

## 10. 安全与操作建议

- 自动化测试请使用独立前缀（如 `pkg_agent_...`），避免覆盖人工剧本。
- 删除剧本会删除其全部节点/选项；执行前先 `GET` 详情备份。
- 不要硬编码模板/地图/NPC/道具 ID，始终先查目录接口。
- 剧情战斗不需要 `GET /api/admin/npcs` 中的地图战斗 NPC；只需要 NPC 模板和（可选）战斗配置。
- 生产环境不要使用默认管理员密码；通过环境变量注入。
- 所有写操作建议幂等：先查是否存在，再决定 POST 或 PUT。
- 接口报错时**不要靠阅读后端源码定位**：把请求、HTTP 状态码、原始 `error` 文本和相关 ID 原样报告；服务端行为与本文档不一致时，先反馈给人来裁决改文档还是改代码。

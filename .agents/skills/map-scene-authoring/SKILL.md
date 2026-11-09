---
name: map-scene-authoring
description: 通过后台 HTTP API 增删改查游戏大地图地标与场景锚点，配置场景所属层级、父子关系、坐标、图标与场景描述；并支持在场景中摆放地图 NPC。Use when creating, editing, moving, listing, or deleting map scenes, scene anchors, or placing NPCs into scenes.
---

# 地图场景与锚点配置 Skill

## 何时使用

当任务涉及以下需求时使用本 Skill：

- 新建地图场景 / 地标锚点（`POST /api/admin/scenes`）
- 修改已有场景的坐标、图标、层级、父节点、描述等（`PUT /api/admin/scenes/:id`）
- 删除非核心场景锚点（`DELETE /api/admin/scenes/:id`）
- 查询场景列表（`GET /api/admin/scenes`）
- 在场景中新增/关联地图 NPC（`POST /api/admin/npcs`），指定所属场景并挂载剧情剧本

---

## 核心原则

1. **地图拥有独立世界观与州域隔离（只能在自己的州域玩）**：
   - 游戏中的每张地图都可以拥有完全独立的世界观与文明背景，不设统一的仙侠题材或固定风格限制。
   - **严格的州域树形闭环与隔离**：玩家探索与移动按州域划分，严禁各州场景无序混杂或全部散开平铺。场景必须在自己所属的 1 级州域父节点树下进行空间流转。

2. **必须先创建 1 级州域父节点（严禁场景无父级散开）**：
   - **创建地图的唯一正确顺序**：
     1. **第一步**：先创建一个 **1 级州域父节点**（`level: 1`，`parent_id: "scene_jiuzhou_world"`），代表该独立世界观的州域/星区/大界（例如 `scene_shenzhou_region` 蜃州全境），并为其配置专属宏观全景底图（`background_url`）；
     2. **第二步**：创建该州域下的 **2 级都城/名胜场景**（`level: 2`），其 `parent_id` **必须显式指定为刚刚创建好的 1 级州域父节点 ID**；
     3. **第三步**：创建各个都城下的 **3 级坊市/街区/设施场景**（`level: 3`），其 `parent_id` 显式挂载在对应的 2 级都城场景 ID 之下。
   - **严禁直接创建孤立的 2 级都城或散落的 3 级坊市**，绝对不允许让不同州域的点位脱离父级直接平铺在地图视口中。

3. **必须配置场景底图 background_url（强校验必填）**：
   - 后端 API `POST /api/admin/scenes` 开启强制校验：`background_url` 为**必填项**，严禁留空或忽略！
   - 新建场景时，必须通过 `map-background-design` Skill（调用 Stitch MCP）设计生成符合该场景世界观的专属地图底图，或提供有效的已有地图静态底图路径（如 `/assets/maps/{scene_key}_bg.png`），确保玩家进入每个场景（无论是 1 级州域全景、2 级都城还是 3 级街区）都有对应的精美底图呈现。

4. **严格区分 zone_id 与 parent_id**：
   - `zone_id`：表示所属区域/分区标识（如 `changle_city`、`cyber_district_a`），用于区域划分与逻辑分组。
   - `parent_id`：表示场景树中的父级场景 ID（树形层级结构中的直接上级），用于场景空间包含关系。两者含义完全不同，**不得混淆**。

5. **关于 parent_id 与层级挂载规范**：
   - 1 级州域节点的 `parent_id` 为虚拟根节点 `scene_jiuzhou_world`。
   - 2 级场景必须显式设置 `parent_id` 为对应的 1 级州域 ID，不得留空。
   - 3 级场景必须显式设置 `parent_id` 为对应的 2 级都城 ID，不得跨级挂载或留空。

6. **NPC 合理摆放**：
   - 将 NPC 摆放至场景时，NPC 的身份、背景与当前场景的环境与剧情必须相符。
   - 核心角色/Boss 才需创建独立模板并配置专属剧情，临时路人或通用 NPC 优先复用已有资源。

7. **技术与接口规范**：
   - 只调用后台 HTTP API，不直接手写 SQL。
   - 场景 ID 规范：推荐使用有意义的小写英文或拼音下划线 ID（例如 `scene_shenzhou_region`、`scene_shenzhou_capital`、`scene_chaxiang_alley`）。
   - 坐标系统：大地图画布标准尺寸为 `512 x 512`，`coord_x` 与 `coord_y` 取值范围为 `0 ~ 512`，由 Agent 根据场景在地图上的空间方位自主分布。

---

## 环境与鉴权

```bash
BASE="http://localhost:8787/api"
# 获取管理员凭证
TOKEN=$(curl -s -X POST "$BASE/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"
```

---

## API 规范详解

### 1. 查询所有地图场景

```bash
curl -s -X GET "$BASE/admin/scenes" -H "$AUTH" | python3 -m json.tool
```

返回数据：
```json
{
  "scenes": [
    {
      "id": "changle_city",
      "zone_id": "changle_zone",
      "name": "长乐城",
      "region": "天衡州",
      "level": 1,
      "parent_id": null,
      "icon": "fort",
      "coord_x": 256,
      "coord_y": 256,
      "status_desc": "繁盛市井 · 核心主城",
      "subtitle": "天下枢纽，万仙来朝",
      "btn_text": "进城"
    }
  ]
}
```

---

### 2. 新增场景 / 锚点标准操作流程（严格按树形层级创建）

> [!IMPORTANT] 场景创建顺序规则
> 1. **步骤一（先创建 1 级州域父节点）**：创建 1 级州域父节点（`level: 1`），`parent_id` 设为 `scene_jiuzhou_world`，配置宏观州域全景底图 `background_url`。
> 2. **步骤二（再创建 2 级都城场景）**：创建该州域管辖下的都城场景（`level: 2`），`parent_id` **必须填入刚建好的 1 级州域 ID**，严禁留空或散开！
> 3. **步骤三（最后创建 3 级坊市/设施）**：创建都城内的街区坊市（`level: 3`），`parent_id` **必须填入对应的 2 级都城 ID**。

- **路径**：`POST /api/admin/scenes`
- **请求体关键字段**：

| 字段 | 类型 | 必填 | 默认值 / 示例 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | string | 否 | `scene_<timestamp>_<rand>` | 场景唯一 ID，推荐命名规范如 `scene_shenzhou_region`（1级）、`scene_shenzhou_capital`（2级）、`scene_chaxiang_alley`（3级） |
| `name` | string | **是** | `蜃州全境` / `蜃京天街` | 场景中文显示名 |
| `region` | string | 否 | `蜃州全境` | 所属大区/州域名称（同州场景保持一致） |
| `zone_id` | string | 否 | `zone_shenzhou_capital` | 所属区域分区标识（注意：与 parent_id 不同） |
| `level` | number | **是** | `1` / `2` / `3` | **场景层级**：`1` = 州域父节点，`2` = 都城/地标，`3` = 坊市/街区/设施 |
| `parent_id`| string | **是** | `scene_shenzhou_region` | **上级场景 ID（严禁留空散开）**：1 级填 `scene_jiuzhou_world`；2 级填对应 1 级州域 ID；3 级填对应 2 级都城 ID |
| `icon` | string | 否 | `public` / `fort` / `storefront` | Material Symbol 图标名（常用见附表） |
| `coord_x` | number | 否 | `256` | 地图横坐标（0~512） |
| `coord_y` | number | 否 | `256` | 地图纵坐标（0~512） |
| `status_desc`| string | 否 | `六境洞天 · 迷雾沧海` | 状态/标签简述 |
| `subtitle` | string | 否 | `蜃气弥天，玄机暗涌` | 场景副标题 |
| `thumb` | string | 否 | `https://...` | 场景名片/卡片立绘图 URL |
| `background_url` | string | **是** | `/assets/maps/...` | **地图底图背景 URL（强校验必填）**：进入该地图时视口背景直接展示此底图 |
| `description`| string | 否 | `详细背景说明...` | 详细背景说明与世界观环境设定 |
| `cost_desc` | string | 否 | `行步耗时：无` | 移动消耗提示 |
| `btn_text` | string | 否 | `纵览蜃州` / `步入天街` | 交互按钮文本 |

**完整示例：完整的三级场景创建流程**：

```bash
# 步骤 1：先创建 1 级州域父节点（宏观州域锚点）
curl -s -X POST "$BASE/admin/scenes" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "scene_shenzhou_region",
    "name": "蜃州全境",
    "region": "蜃州全境",
    "zone_id": "zone_shenzhou",
    "parent_id": "scene_jiuzhou_world",
    "level": 1,
    "coord_x": 256,
    "coord_y": 256,
    "background_url": "/assets/maps/shenzhou_region_bg.png",
    "icon": "public",
    "status_desc": "六境洞天 · 迷雾沧海",
    "subtitle": "蜃气弥天，玄机暗涌",
    "description": "蜃州全境疆域广袤，东临沧海，西峙万仞。",
    "btn_text": "纵览蜃州"
  }'

# 步骤 2：创建挂载在该 1 级州域下的 2 级都城
curl -s -X POST "$BASE/admin/scenes" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "scene_shenzhou_capital",
    "name": "蜃京天街 · 玄机府",
    "region": "蜃州全境",
    "zone_id": "zone_shenzhou_capital",
    "parent_id": "scene_shenzhou_region",
    "level": 2,
    "coord_x": 256,
    "coord_y": 200,
    "background_url": "/assets/maps/shenzhou_capital_bg.png",
    "icon": "fort",
    "status_desc": "皇朝枢纽 · 律令森严",
    "subtitle": "青鉴司掌印总舵，天下律令所出",
    "description": "蜃州中央枢纽大道，青砖朱阁连绵。",
    "btn_text": "步入天街"
  }'

# 步骤 3：创建挂载在该都城下的 3 级坊市/设施
curl -s -X POST "$BASE/admin/scenes" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "scene_chaxiang_alley",
    "name": "青石巷 · 听雨茶肆",
    "region": "蜃州全境",
    "zone_id": "zone_shenzhou_capital",
    "parent_id": "scene_shenzhou_capital",
    "level": 3,
    "coord_x": 230,
    "coord_y": 220,
    "background_url": "/assets/maps/chaxiang_alley_bg.png",
    "icon": "storefront",
    "status_desc": "烟雨市井 · 密探茶庐",
    "subtitle": "青砖雨巷深处的平民茶摊，暗流汇聚",
    "description": "蜃京僻静深处的湿润青石巷，迎来送往间汇聚着天下情报。",
    "btn_text": "进肆品茗"
  }'
```

---

### 3. 修改场景锚点属性与位置

- **路径**：`PUT /api/admin/scenes/:id`
- **支持局部更新**：传入需变更的字段即可。

```bash
# 例如将场景移动到坐标 [400, 210]，并更换图标为 local_pharmacy
curl -s -X PUT "$BASE/admin/scenes/scene_yaowang_valley" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "coord_x": 400,
    "coord_y": 210,
    "icon": "local_pharmacy",
    "status_desc": "丹香四溢 · 仙谷"
  }'
```

---

### 4. 删除场景锚点

- **路径**：`DELETE /api/admin/scenes/:id`
- **注意**：系统核心场景（`scene_jiuzhou_world`、`square`、`manor`）会被系统拦截保护。删除普通场景时，原本以此为 `parent_id` 的场景会自动解除绑定（`parent_id` 置 NULL）。

```bash
curl -s -X DELETE "$BASE/admin/scenes/scene_yaowang_valley" -H "$AUTH"
```

---

### 5. 将 NPC 放置入该场景（串联角色与剧情）

创建好场景后，若剧情需要，在场景内摆放 NPC 并挂载对应的剧情剧本（Dialogue Package）：

- **路径**：`POST /api/admin/npcs`
- **请求体**：
```json
{
  "scene_id": "scene_yaowang_valley",
  "template_id": "tpl_lujiuweng",
  "name": "陆九翁",
  "title": "青囊丹尊",
  "badge": "悬壶药圣",
  "type": "dialogue",
  "dialogue_package_id": "pkg_yaowang_intro",
  "dialogue_root_node_id": "node_root",
  "quote": "老夫这炉金丹，还差一味百年首乌。",
  "gossip": "近来后山妖兽躁动，小友采药时可千万小心。"
}
```

---

## 常用图标（Material Symbol）速查表

| 分类 | 推荐图标名 (`icon`) | 适用场景 |
| :--- | :--- | :--- |
| **都城 / 基地 / 枢纽** | `fort`, `castle`, `temple_buddhist`, `church`, `domain`, `apartment` | 主城、王府、宗门祖庭、基地控制中心、都市核心 |
| **市井 / 街区 / 设施** | `flag`, `storefront`, `local_pharmacy`, `theater_comedy`, `share_location`, `hub` | 广场、集市、商会、诊所、娱乐场、神行驿、空间站枢纽 |
| **历练 / 战场 / 竞技** | `swords`, `sports_martial_arts`, `shield`, `local_fire_department`, `military_tech` | 竞技场、演武场、禁地要塞、高危战场、机甲库 |
| **自然 / 旷野 / 异界** | `landscape`, `nature`, `sailing`, `rowing`, `ac_unit`, `volcano`, `rocket_launch` | 密林、远古雪原、沧浪水域、熔岩裂谷、异星荒漠、星环锚点 |


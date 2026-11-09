---
name: character-sprite-design
description: 根据游戏地图和角色设定，使用 Google Stitch 设计并生成游戏角色立绘，调用项目脚本自动下载、转换格式、去背景，并登记到游戏角色立绘库。适用于创建角色立绘、NPC 素材和管理角色立绘资源。
---

# Character Sprite Design

根据当前地图的世界观、角色身份和剧情定位，设计并生成高质量游戏角色立绘，完成素材处理和资源登记。

## 一、设计原则

### 1. 尊重地图独立世界观

每张地图都可以拥有独立的世界观，不限制题材、时代、文明、种族和美术风格（如东方仙侠/武侠/玄幻、西方奇幻/魔法文明、现代都市/赛博朋克、末日废土/机械文明、神话架空/异星文明等）。
不得为了统一游戏风格而强行统一不同地图的建筑、服装、种族、文明、道具和美术风格。

设计前先了解当前地图的：
- 世界观设定、时代背景和地域文明
- 势力、种族、职业和社会身份
- 已有角色及整体美术风格

如果资料不足，可以根据地图和剧情自主补充设定，但不要擅自套用其他地图的世界观。

### 2. 角色外观与身份逻辑

根据角色身份设计外观，避免所有角色使用相似的脸型、发型、服装和配色。

重点考虑：
- 年龄、体型、面容、发型
- 符合该世界观和文明的服装材质、款式、颜色和装饰
- 武器、工具及身份标志
- 姿态、神情和人物气质
- 伤痕、磨损、义肢、纹章等体现经历的细节

### 3. 角色素材与模板规则

- **按需设计**：核心角色、重要剧情 NPC、Boss 等需要参与游戏剧情、地图交互或战斗的角色，才独立设计立绘并创建/复用 NPC 模板。
- **立绘入库不代表必须创建 NPC 模板**：只有当角色确实需要参与游戏剧情、地图交互或战斗时，才创建或复用 NPC 模板。
- **路人与通用角色**：临时路人、城镇群体角色允许使用通用素材，无需为每个过客单独生成立绘和模板。
- **优先复用本人素材**：已有角色优先复用本人已有的立绘和 NPC 模板。
- **禁止冒充**：不允许用其他角色的专属立绘冒充新角色。

### 4. 生成要求

- 单角色、全身立绘。
- 人物完整，不裁切头部、手脚及武器。
- 背景使用便于后续去背景的纯色（如纯白、纯绿、纯灰）。
- 人物轮廓清晰，避免复杂背景干扰。
- 不添加文字、水印、边框和 UI。
- 服装、配饰和武器细节完整。

## 二、Stitch 生成

默认使用 Stitch 项目：

`11287778428665999906`

项目仅作为素材设计容器，不代表固定世界观或美术风格。

调用 Stitch MCP：
- Endpoint：`https://stitch.googleapis.com/mcp`
- Tool：`generate_screen_from_text`
- deviceType：`AGNOSTIC`

根据角色设定编写具体的生成提示词，明确人物身份、外观、服装、姿态、表情、画面构图、背景要求以及符合当前地图世界观的美术风格。

生成后检查人物是否符合设计要求。不合格则调整提示词重新生成。

## 三、下载与去背景（调用自动化脚本）

项目已经提供自动化脚本：

`scripts/download_and_process.py`（位于本 Skill 目录下的 `scripts/`）

**Agent 必须直接调用该脚本，绝不能自行编写重复的下载、转码和抠图逻辑。**

脚本会自动完成：
1. 读取环境变量 `STITCH_API_KEY`，校验鉴权凭据。
2. 从 Stitch 下载原始图片数据并进行校验。
3. Base64 解码并保存 JPG。
4. 使用 macOS `sips` 转换为 PNG（注：该转换方案依赖 macOS 系统工具）。
5. 自动定位项目根目录下的 `frontend/public/assets/combat/process_transparent.py`。
6. 执行四角自动采样洪水填充与边缘羽化去背景。
7. 生成最终透明立绘 `hero_<key>_trans.png`。

### 运行环境与解释器说明

- 脚本完全基于 Python 3 标准库（`struct`、`zlib`、`base64` 等）与 macOS 原生 `sips` 工具，**不需要安装第三方 PIL / Pillow**。
- 推荐解释器路径：系统默认 `/usr/bin/python3`（或 `python3`）。若其他脚本明确依赖 Pillow，可使用已内置该依赖的解释器 `/Users/wjb/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3`，或运行 `pip3 install pillow`。
- **现成脚本运行失败时必须立即上报原始错误，严禁自行重写同功能脚本。**

### 使用方法

确保已设置环境变量：
```bash
export STITCH_API_KEY="your_stitch_api_key"
```

获取 Stitch 图片的 `downloadUrl`，指定唯一的英文标识 `character_key`（仅允许字母、数字、下划线和连字符），执行：

```bash
python3 .agents/skills/character-sprite-design/scripts/download_and_process.py \
  --url "<downloadUrl>" \
  --key "<character_key>"
```

支持的参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--key` | 必填 | 角色英文唯一标识，仅允许 `[A-Za-z0-9_-]` |
| `--threshold` | 26 | 抠图色差容差 |
| `--feather` | 1 | 边缘羽化半径 |
| `--bg` | auto | 背景色（`r,g,b` 或 `auto`） |
| `--force` | false | 覆盖保护已启用，若需强制覆盖同名文件需传入此选项 |

脚本内置同名文件防覆盖保护，若已存在 `hero_<key>.*` 文件会自动拦截并报错。

### 素材保存位置

`frontend/public/assets/combat/characters/`

- `hero_<key>.jpg`：原始素材
- `hero_<key>.png`：PNG 格式
- `hero_<key>_trans.png`：最终透明立绘

## 四、登记立绘资源

修改：

`admin/src/constants/characterSprites.ts`

将新角色添加到 `CHARACTER_SPRITE_OPTIONS`。

字段参考：

```typescript
{
  url: '/assets/combat/characters/hero_<key>_trans.png',
  name: '角色名称',
  subtitle: '角色身份或称号',
  faction: 'ENEMY' // 可选: HERO / ENEMY / DEFAULT
}
```

根据角色实际身份选择 `faction`，不要随意新增枚举。

## 五、按需创建 NPC 模板与装配技能

**注意：立绘入库不代表必须创建 NPC 模板。**
仅当该角色是核心剧情角色、重要 NPC、Boss，或用户明确要求创建/复用 NPC 模板时才执行。

### 1. 施法技能 API（自定义技能库）

当需要为角色赋予独特的施法技能时，通过施法技能管理 API 创建自定义技能：

- **新增施法技能**：`POST http://localhost:8787/api/admin/skills`
- **查询技能列表**：`GET http://localhost:8787/api/admin/skills`
- **修改技能**：`PUT http://localhost:8787/api/admin/skills/:skillKey`

请求示例（新增自定义技能）：
```bash
curl -s -X POST "http://localhost:8787/api/admin/skills" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_key": "skill_tian_gang_flame",
    "name": "天罡玄火咒",
    "description": "引动九天离火真精，对敌方单体造成高额烈焰法术伤害。",
    "cost_mp": 80,
    "target_type": "SINGLE_ENEMY",
    "skill_kind": "DAMAGE",
    "power": 1.5,
    "icon": "flame",
    "sort_order": 20,
    "is_enabled": 1
  }'
```

参数规范：
- `skill_key`：唯一技能标识（如 `skill_xxx`）
- `name`：技能名称（必填）
- `target_type`：目标类型，可选 `SINGLE_ENEMY` / `ALL_ENEMIES` / `SINGLE_ALLY` / `ALL_ALLIES` / `SELF`
- `skill_kind`：技能机制，可选 `DAMAGE`（伤害攻击）/ `HEAL`（回春疗伤）/ `BUFF`（灵气增益）/ `DEBUFF`（减益禁制）
- `cost_mp`：释放法力/内力消耗（默认 0）
- `power`：伤害/治疗倍率（如 1.2）

### 2. 创建 NPC 模板并绑定技能

调用：

`POST http://localhost:8787/api/admin/npc-templates`

在创建 NPC 模板时，通过 `skills` 字段（或 `skills_json` 字符串）直接绑定自定义技能标识数组：

```bash
curl -s -X POST "http://localhost:8787/api/admin/npc-templates" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tpl_huochiyan",
    "key": "huochiyan",
    "name": "火炽炎",
    "title": "离火门首席",
    "badge": "火",
    "avatar": "/assets/combat/characters/hero_huochiyan_trans.png",
    "quality": "RARE",
    "growth_template": "mage",
    "role": "DPS",
    "skills": ["skill_tian_gang_flame"],
    "description": "精通离火真诀的修仙门徒。"
  }'
```

字段说明：
- `id` / `key` / `name` / `title` / `badge`：基础身份信息
- `avatar`：指向立绘路径（如 `/assets/combat/characters/hero_<key>_trans.png`）
- `quality`：品质，可选 `COMMON` / `UNCOMMON` / `RARE` / `EPIC` / `LEGENDARY`
- `growth_template`：成长模板，可选 `warrior` / `guardian` / `assassin` / `mage` / `priest` / `balanced`
- `role`：战斗定位（`DPS` / `TANK` / `HEALER` / `SUPPORT`）
- `skills`：绑定的技能 Key 列表（如 `["skill_tian_gang_flame"]`），系统会自动存入模板的 `skills_json` 并使 NPC 在战斗中生效施法


## 六、完成检查

完成后检查：

1. Stitch 生成的角色是否符合所属地图的独立世界观和角色身份。
2. 图片是否完整，人物轮廓是否清晰。
3. JPG、PNG 和透明 PNG 是否真实生成，**必须校验文件存在且大于 0 字节**（严禁下载静默失败）。
4. 透明背景是否干净，有无明显白边、残留背景或人物缺损，**必须实际查看图片**。
5. `CHARACTER_SPRITE_OPTIONS` 是否登记正确。
6. 资源路径是否能够正常访问。
7. 如果创建了 NPC 模板，确认后台能够正常显示。

需要验证后台时执行：

```bash
cd admin && yarn build
```

后台 NPC 模板页面：

`http://localhost:3001/npc-templates`

Stitch 项目：

`https://stitch.withgoogle.com/projects/11287778428665999906`

## 执行约束

- 严格遵循当前地图世界观，不得固定使用仙侠、水墨等风格。
- 不得为了统一风格而强行统一不同地图的角色设计。
- 严禁自行重复实现下载、转码与去背景逻辑，必须调用脚本；现成脚本失败时报告错误，不得自行重写。
- 下载处理后必须严格校验文件存在且大于 0 字节，并实际查看图片确认完整。
- 绝不使用其他角色的专属立绘冒充新角色，已有角色优先复用本人素材。
- 不要覆盖已有角色素材（除非显式指定 `--force`）。
- 绝不在没有真实 Stitch API Key 或真实下载环境时虚报生成成功。

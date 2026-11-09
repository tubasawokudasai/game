# Skills

本目录存放可被 Agent 直接加载的 Skill。

> [!IMPORTANT] 核心原则：地图独立世界观与多元题材
> **游戏中的每张地图都可以拥有完全独立的世界观，绝不存在统一的仙侠题材限制。**
> 不同地图可以分别采用东方仙侠/武侠/玄幻、西方奇幻/中世纪/魔法文明、现代都市/赛博朋克/科幻世界、末日废土/蒸汽朋克/机械文明、神话/历史架空/异星文明等。不得为了统一游戏风格而强行统一不同地图的建筑、服装、种族、文明、道具和美术风格。

---

## 1. character-sprite-design（角色设计与立绘入库）

根据当前地图的世界观、角色身份和剧情定位，使用 Google Stitch 设计并生成高质量游戏角色立绘，直接调用项目脚本自动下载、转换格式、去背景，并登记到游戏角色立绘库。

- Skill 入口：`.agents/skills/character-sprite-design/SKILL.md`
- 脚本工具：`.agents/skills/character-sprite-design/scripts/download_and_process.py`
- 去背景算法：`frontend/public/assets/combat/process_transparent.py`
- 后台立绘登记：`admin/src/constants/characterSprites.ts`

- 适用场景：
  - 通过提示词在 Google Stitch 中设计/生成符合当前地图世界观的角色立绘
  - Agent 直接调用 `download_and_process.py` 脚本完成下载、转码与四角自动采样洪水填充羽化去背景（不重复实现）
  - 将处理后的立绘登记入管理后台基础立绘库（`CHARACTER_SPRITE_OPTIONS`）
  - 按需通过技能 API 创建自定义施法技能（`POST /api/admin/skills`）
  - 按需通过后台 API 创建对应的 NPC 模板并绑定技能（`POST /api/admin/npc-templates`，传入 `skills`）

规则统一：
- 立绘入库不代表必须创建 NPC 模板。核心角色、重要 NPC、Boss 需要参与游戏剧情、地图交互或战斗时才创建或复用模板。
- 临时路人、群体角色允许使用通用素材。
- 已有角色优先复用本人已有素材和模板，严禁用其他角色的专属立绘冒充新角色。

---

## 2. map-background-design（地图场景底图设计与生成）

根据游戏世界观、区域文化、地理环境和剧情，自主设计并使用 Google Stitch MCP 生成具有独特视觉风格和叙事表现力的游戏地图底图。

- Skill 入口：`.agents/skills/map-background-design/SKILL.md`

适用场景：
- 为新建的各级场景生成专属底图（支持大世界地图、城镇、街区、建筑内部、野外、秘境、地宫、战场、科幻设施等）
- 自由选择正俯视、斜俯视、高空全景、等距轴测等视角，保证空间结构清晰合理
- 下载并存入 `frontend/public/assets/maps/<scene_key>_bg.png`（底图保留完整环境，无需去背景）
- 为创建场景的必填字段 `background_url` 提供正源图片

---

## 3. map-scene-authoring（地图场景与地标锚点配置）

通过后台 HTTP API 增删改查游戏大地图地标与场景锚点，配置场景所属层级、父子关系、坐标、图标与场景描述；并支持在场景中摆放地图 NPC。

- Skill 入口：`.agents/skills/map-scene-authoring/SKILL.md`

适用场景：
- 新建地图场景 / 地标锚点（`POST /api/admin/scenes`，**必填 background_url**）
- 修改已有场景的坐标、图标、层级、父节点、描述等（`PUT /api/admin/scenes/:id`）
- 删除场景锚点（`DELETE /api/admin/scenes/:id`）
- 在场景中新增/关联地图 NPC（`POST /api/admin/npcs`），指定所属场景并挂载剧情剧本

> [!IMPORTANT] 地图场景架构与州域隔离约束
> 1. **严格的州域树形闭环（只能在自己的州域玩）**：创建地图必须先创建 **1 级州域父节点**（`level: 1`，`parent_id: "scene_jiuzhou_world"`）。其后所有的 2 级都城必须显式挂载在此 1 级州域下，3 级坊市/设施挂载在 2 级都城下。严禁不设父节点让所有点位全部散开平铺。
> 2. **场景底图强制校验**：新增场景时 `background_url` 为后端必填项，进入每个场景（1级州域、2级都城、3级坊市）都必须有专属地图底图显示。
> 3. **字段区分**：`zone_id`（区域分区）与 `parent_id`（父级场景 ID）是不同字段，不得混淆。
> 4. **严禁越级或平铺挂载**：2 级都城必须指定对应的 1 级州域 ID，不得直接留空。

---

## 4. dialogue-script-authoring（剧情剧本自动化配置）

通过后台 HTTP API 自动创建/修改剧情剧本，包括多段台词、线性直连、分支选项、战斗遭遇选项、条件与奖励动作。

- Skill 入口：`.agents/skills/dialogue-script-authoring/SKILL.md`
- 完整 API 文档：`docs/dialogue-script-authoring.md`
- 快速接口索引：`.agents/skills/dialogue-script-authoring/references/api.md`
- 可复制示例：`.agents/skills/dialogue-script-authoring/references/examples.md`

适用场景：
- 新建/修改剧本、节点、分支选项
- 节点内多段台词（Pages）与线性直连（Direct Next）
- 战斗遭遇选项（`START_ENCOUNTER` 单人遭遇 / 多人战阵）
- 查询地图、NPC 模板、地图 NPC、战斗配置、道具目录
- 节点触发器与系统邮件（`SEND_NOTIFICATION` 带 `grants`）

---

## 5. Skills 之间的标准协作编排流程

若需要从零创造一个完整的游戏世界场景与剧情链路，标准协作编排流程如下：

```text
地图世界观与区域规划
        ↓
地图底图设计（map-background-design，生成并存入 /assets/maps/）
        ↓
地图场景与层级创建（map-scene-authoring，配置坐标与必填 background_url）
        ↓
角色设计与立绘入库（character-sprite-design，按需调用 Stitch + 脚本处理）
        ↓
NPC 模板创建（按需 POST /api/admin/npc-templates）
        ↓
剧情剧本编写（dialogue-script-authoring，配置节点、选项与战斗）
        ↓
NPC 实例放置与剧情绑定（map-scene-authoring，POST /api/admin/npcs）
        ↓
完整性检查与验证
```

### 编排协作规范：
1. **按需执行，避免冗余**：
   - 常见协作流程并非所有任务都需要从头执行。
   - 已有场景、角色、底图和 NPC 模板应**优先复用**。
   - 不需要新角色时不执行角色设计；不需要新地图时不执行底图生成；临时路人使用通用素材。
2. **职责清晰，分工明确**：
   - 角色素材处理统一由 `character-sprite-design/scripts/download_and_process.py` 负责，其他 Skill 严禁重复实现。
   - 场景与 NPC 放置由 `map-scene-authoring` 负责。
   - 剧情与遭遇战逻辑由 `dialogue-script-authoring` 负责。
3. **真实性原则**：
   - 不要在没有真实环境和有效 Key 时假装已经生成或入库素材。
   - 验证必须以实际接口查询为准（如 `GET /api/admin/dialogues/packages/:id`、`GET /api/admin/scenes`）。


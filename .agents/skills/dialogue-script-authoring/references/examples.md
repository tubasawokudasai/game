# 可复制示例

## 1. 线性直连（3 页台词 → 下一节点）

```http
// 1. 剧本
POST /api/admin/dialogues/packages
{
  "id": "pkg_agent_linear",
  "name": "Agent · 线性对话",
  "category": "MAIN"
}

// 2. 目标节点（先建）
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_linear_end",
  "package_id": "pkg_agent_linear",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 终章",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“此间事了，后会有期。”" }
  ],
  "direct_next_node_id": null
}

// 3. 起点节点（直连目标）
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_linear_start",
  "package_id": "pkg_agent_linear",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 起点",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“少侠留步。”" },
    { "speaker_id": "player", "content": "“仙长有何指教？”" },
    { "speaker_id": "narrator", "content": "山风掠过，剑意渐起。" }
  ],
  "direct_next_node_id": "node_agent_linear_end"
}

// 4. 显式根节点
PUT /api/admin/dialogues/packages/pkg_agent_linear
{
  "default_root_node_id": "node_agent_linear_start"
}
```

---

## 2. 分支 + 战斗遭遇选项

```http
// 剧本
POST /api/admin/dialogues/packages
{
  "id": "pkg_agent_battle",
  "name": "Agent · 战斗分支",
  "category": "BRANCH"
}

// 胜利节点
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_win",
  "package_id": "pkg_agent_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 胜利",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "speaker", "content": "“果然英雄出少年。”" }]
}

// 失败节点
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_lose",
  "package_id": "pkg_agent_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 失败",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "narrator", "content": "你眼前一黑，退出了战阵。" }]
}

// 起点节点
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_start",
  "package_id": "pkg_agent_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 起点",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "speaker", "content": "“前方战阵凶险，少侠可敢一战？”" }
  ]
}

// 战斗选项（encounter 直接定义战斗角色，不要引用地图 NPC）
POST /api/admin/dialogues/options
{
  "id": "opt_agent_fight",
  "node_id": "node_agent_start",
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
        "templateId": "tpl_luoqinghan",
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
      "winNodeId": "node_agent_win",
      "loseNodeId": "node_agent_lose"
    }
  ]
}

// 告辞选项
POST /api/admin/dialogues/options
{
  "id": "opt_agent_leave",
  "node_id": "node_agent_start",
  "sort_order": 2,
  "text": "告辞离去",
  "action_label": "作罢",
  "style_type": "GRAY",
  "next_node_id": null,
  "show_conditions": [],
  "enable_conditions": [],
  "actions": []
}

// 根节点
PUT /api/admin/dialogues/packages/pkg_agent_battle
{
  "default_root_node_id": "node_agent_start"
}
```

---

## 3. 纯结束节点

```json
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_end",
  "package_id": "pkg_agent_demo",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 结束",
  "scene_id": "kunwu",
  "pages": [
    { "speaker_id": "narrator", "content": "故事到此结束。" }
  ],
  "direct_next_node_id": null
}
```

- 不要创建 options。
- 运行时显示“告辞”，玩家进度标记 `COMPLETED`，剧情 NPC 对该玩家隐藏。

---

## 4. 带条件与奖励的选项

```json
{
  "id": "opt_agent_reward",
  "node_id": "node_agent_start",
  "sort_order": 1,
  "text": "领取谢礼",
  "action_label": "领取",
  "style_type": "GOLD",
  "next_node_id": "node_agent_end",
  "show_conditions": [
    { "type": "MIN_LEVEL", "level": 5 }
  ],
  "enable_conditions": [
    { "type": "HAS_FLAG", "key": "flag_agent_quest_done", "expectedValue": 1 }
  ],
  "actions": [
    { "type": "GIVE_ITEM", "itemId": "item_healing_dan", "count": 1 },
    { "type": "ADD_EXP_OR_GOLD", "exp": 500, "gold": 100 },
    { "type": "SET_FLAG", "key": "flag_agent_reward_taken", "value": 1 }
  ]
}
```

---

## 5. 跨场景（默认让玩家自行前往）

```json
{
  "id": "opt_agent_goto_pharmacy",
  "node_id": "node_agent_start",
  "sort_order": 1,
  "text": "前往悬壶馆请教苏仙子",
  "action_label": "前往悬壶馆",
  "style_type": "NORMAL",
  "next_node_id": "node_agent_pharmacy",
  "show_conditions": [],
  "enable_conditions": [],
  "actions": []
}
```

- `actions` 留空：运行时返回 `CLOSE` + `sceneChanged: true`，剧情推进、剧情 NPC 换图，**玩家留在原地自行前往**。
- 目标节点 `node_agent_pharmacy` 的 `scene_id` 应为 `pharmacy`（用 `GET /api/admin/scenes` 的真实 ID）。
- 仅当人类明确要求“点击就传送”时，才把 `actions` 换成：

```json
[{ "type": "TELEPORT", "areaId": "pharmacy" }]
```

`next_node_id` 仍要保留，否则剧情进度不推进。

---

## 6. 节点触发器：完成时发奖励邮件

```http
POST /api/admin/dialogues/nodes
{
  "id": "node_agent_win",
  "package_id": "pkg_agent_battle",
  "npc_id": "tpl_luoqinghan",
  "chapter_title": "示例 · 胜利",
  "scene_id": "kunwu",
  "pages": [{ "speaker_id": "speaker", "content": "“果然英雄出少年。”" }],
  "direct_next_node_id": null,
  "on_enter_actions": [],
  "on_complete_actions": [
    {
      "type": "SEND_NOTIFICATION",
      "title": "悬赏达成",
      "content": "少侠力挫强敌，悬赏奖励请查收。",
      "grants": [
        { "type": "ITEM", "itemId": "item_healing_dan", "quantity": 2 }
      ],
      "once": true
    }
  ]
}
```

- `grants` 非空 → 即时通知 + 系统邮件（带附件）；为空 → 只有 toast。
- `once` 默认 `true`；重复触发不会重复发放。
- `SEND_NOTIFICATION` 只能放节点触发器，**不能放选项 `actions`**。

---

## 7. 验证

```http
GET /api/admin/dialogues/packages/:id
```

重点检查：

```text
package.default_root_node_id
nodes[].pages
nodes[].direct_next_node_id
nodes[].options[].text/style_type/next_node_id/actions
nodes[].options[].actions[].type === "START_ENCOUNTER" 时必须有 encounter
跨场景选项 actions === []（未要求自动传送时不应有 TELEPORT）
```

再把每个 option 的 `GET` 结果原样 `POST` 一次：200 表示动作能通过保存校验；400 会直接指出第几项、哪个字段不合法。

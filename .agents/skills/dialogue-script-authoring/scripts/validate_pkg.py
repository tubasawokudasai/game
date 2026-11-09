import sys, json
from dialogue_lib import login, api

if len(sys.argv) < 2:
    sys.exit("用法: python validate_pkg.py <pkg_id> [pkg_id ...]")

tok = login()
items = {i["id"] for i in api(tok, "GET", "/admin/items")["data"]}
tpls = {t["id"] for t in api(tok, "GET", "/admin/npc-templates")["data"]}
pkgs = [api(tok, "GET", f"/admin/dialogues/packages/{p}")["data"] for p in sys.argv[1:]]

granted, needed = set(), set()
flags_set, flags_read = set(), set()
problems, warns, info = [], [], []

def walk(where, obj):
    if isinstance(obj, list):
        for x in obj: walk(where, x)
        return
    if not isinstance(obj, dict): return
    t = obj.get("type")
    if t == "GIVE_ITEM": granted.add(obj.get("itemId"))
    if t in ("COST_ITEM", "HAS_ITEM"): needed.add(obj.get("itemId"))
    if t == "ITEM" and obj.get("itemId"): granted.add(obj["itemId"])
    if t == "SET_FLAG": flags_set.add(obj.get("key"))
    if t == "HAS_FLAG": flags_read.add(obj.get("key"))
    if t == "SEND_NOTIFICATION":
        if not obj.get("once"): problems.append(f"{where}: SEND_NOTIFICATION 缺少 once:true，可重复领奖")
        if not isinstance(obj.get("grants", []), list): problems.append(f"{where}: grants 必须是数组")
    if t == "START_ENCOUNTER":
        enc = obj.get("encounter") or {}
        if not obj.get("npcId"): problems.append(f"{where}: START_ENCOUNTER 缺 npcId")
        if not enc: problems.append(f"{where}: START_ENCOUNTER 缺 encounter")
        if enc.get("templateId") not in tpls: problems.append(f"{where}: 战斗模板不存在 {enc.get('templateId')}")
        if enc.get("onceFlag"): flags_set.add(enc["onceFlag"])
        for it in (enc.get("battleReward") or {}).get("items", []):
            granted.add(it.get("itemId") or it.get("id"))
        if not obj.get("winNodeId") or not obj.get("loseNodeId"):
            problems.append(f"{where}: 战斗缺 winNodeId/loseNodeId")
    for v in obj.values(): walk(where, v)

for d in pkgs:
    pkg, nodes = d["package"], {n["id"]: n for n in d["nodes"]}
    root = pkg["default_root_node_id"]
    if root not in nodes: problems.append(f"{pkg['id']}: 根节点不存在 {root}")
    edges = {nid: set() for nid in nodes}
    for nid, n in nodes.items():
        if not any(p.get("content", "").strip() for p in n["pages"]): problems.append(f"{nid}: 无有效台词")
        if not n.get("editor_pos"): info.append(f"{nid}: editor_pos 为空")
        walk(nid, n["on_enter_actions"] + n["on_complete_actions"])
        if n["direct_next_node_id"]: edges[nid].add(n["direct_next_node_id"])
        sigs = []
        for o in n["options"]:
            walk(f"{nid}/{o['id']}", [o["actions"], o["show_conditions"], o["enable_conditions"]])
            ts = {o["next_node_id"]} if o["next_node_id"] else set()
            for a in o["actions"]:
                if a["type"] == "START_ENCOUNTER":
                    ts |= {a.get("winNodeId"), a.get("loseNodeId")}
                    # 战斗定义必须真实生成
                    r = api(tok, "GET", f"/admin/npc-instances?keyword={o['id']}")["data"]
                    if not any(x.get("npc_role") == "STORY_BATTLE" and x.get("source_ref") == o["id"] for x in r):
                        problems.append(f"{nid}/{o['id']}: 未生成 STORY_BATTLE 实例，请重新 POST 该选项")
            ts.discard(None)
            for t in ts:
                if t not in nodes: problems.append(f"{nid}/{o['id']}: 目标节点不存在 {t}")
            edges[nid] |= ts
            sigs.append((frozenset(ts), json.dumps(o["actions"], sort_keys=True)))
        if len(n["options"]) > 1 and len({s[0] for s in sigs}) == 1 and len({s[1] for s in sigs}) == 1:
            problems.append(f"{nid}: 所有选项指向同一处且动作相同，属于假选择")
    seen, stack = set(), [root]
    while stack:
        x = stack.pop()
        if x in seen or x not in nodes: continue
        seen.add(x); stack.extend(edges[x])
    for nid in nodes:
        if nid not in seen: problems.append(f"{nid}: 从根节点不可达")
        has_battle = any(a["type"] == "START_ENCOUNTER" for o in nodes[nid]["options"] for a in o["actions"])
        if not edges[nid] and not has_battle: info.append(f"{nid}: 结局节点（无后续）")

for i in (granted | needed) - items - {None}: problems.append(f"物品不存在: {i}")
for i in needed - granted: warns.append(f"物品被要求但本批内容里无处发放（若来自商店等可忽略）: {i}")
for f in flags_read - flags_set: problems.append(f"flag 只读不写: {f}")
for f in flags_set - flags_read: warns.append(f"flag 只写不读（若是预留可忽略）: {f}")

for title, lst in (("问题", problems), ("警告", warns), ("信息", info)):
    print(f"== {title} =="); print("\n".join(lst) or "无")
sys.exit(1 if problems else 0)

import sys, json, uuid, base64, urllib.request, urllib.error
BASE = "http://localhost:8787/api"

def http(method, path, body=None, tok=None):
    h = {"Content-Type": "application/json"}
    if tok: h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(BASE + path, method=method, headers=h,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def find_token(res):
    if isinstance(res, dict):
        if isinstance(res.get("token"), str): return res["token"]
        for v in res.values():
            t = find_token(v)
            if t: return t
    return None

def jwt_sub(tok):
    p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))["sub"]

def payload_of(res):
    if isinstance(res, dict):
        for k in ("nextDialogue", "dialogue"):
            if isinstance(res.get(k), dict): return res[k]
        if "nodeId" in res: return res
    return None

if len(sys.argv) < 2:
    sys.exit("用法: python e2e_walk.py <path.json>")

admin = find_token(http("POST", "/admin/login", {"username": "admin", "password": "admin123"})[1])
scenes = {s["id"]: s for s in http("GET", "/admin/scenes", tok=admin)[1]["scenes"]}
_, g = http("POST", "/auth/guest", {"deviceId": "e2e-" + uuid.uuid4().hex})
tok = find_token(g)
assert tok, f"游客登录没拿到 token: {g}"
sub = jwt_sub(tok)
state = {"node": None, "resume": None, "scene": None, "winNodeId": None, "loseNodeId": None}
fails = 0

def check(res, exp):
    errs, payload = [], payload_of(res)
    if "status" in exp and (res or {}).get("status") != exp["status"]:
        errs.append(f"status 期望 {exp['status']}，实际 {(res or {}).get('status')}")
    if "node" in exp:
        got = (payload or {}).get("nodeId") or (res or {}).get("nextNodeId")
        if got != exp["node"]: errs.append(f"节点期望 {exp['node']}，实际 {got}")
    if "sceneChanged" in exp and bool((res or {}).get("sceneChanged")) != exp["sceneChanged"]:
        errs.append(f"sceneChanged 期望 {exp['sceneChanged']}")
    ids = {o["id"]: o for o in (payload or {}).get("options", [])}
    for oid in exp.get("options_include", []):
        if oid not in ids: errs.append(f"缺少选项 {oid}")
        elif ids[oid].get("disabled"): errs.append(f"选项 {oid} 被置灰")
    for oid in exp.get("options_exclude", []):
        if oid in ids: errs.append(f"不应出现选项 {oid}")
    toast = " ".join((res or {}).get("rewardsToast") or [])
    for t in exp.get("toast_contains", []):
        if t not in toast: errs.append(f"飘字缺少「{t}」，实际: {toast or '空'}")

    # 状态断言 (通过真实玩家 API 查询)
    if "inventory_has" in exp:
        _, inv_res = http("GET", "/player/inventory", tok=tok)
        items = {i["itemId"]: i.get("count", 1) for i in (inv_res or {}).get("items", [])}
        req_items = exp["inventory_has"]
        if isinstance(req_items, list):
            for item_id in req_items:
                if item_id not in items: errs.append(f"行囊缺少道具 {item_id}")
        elif isinstance(req_items, dict):
            for item_id, count in req_items.items():
                if items.get(item_id, 0) < count:
                    errs.append(f"行囊道具 {item_id} 数量期望 >= {count}，实际 {items.get(item_id, 0)}")

    if "inventory_has_not" in exp:
        _, inv_res = http("GET", "/player/inventory", tok=tok)
        items = {i["itemId"]: i.get("count", 1) for i in (inv_res or {}).get("items", [])}
        for item_id in exp["inventory_has_not"]:
            if item_id in items: errs.append(f"行囊不应包含道具 {item_id}")

    if "mail_count" in exp:
        _, mail_res = http("GET", "/mails", tok=tok)
        cnt = len((mail_res or {}).get("mails", []))
        if cnt != exp["mail_count"]: errs.append(f"邮件数量期望 {exp['mail_count']}，实际 {cnt}")

    if "mail_title_contains" in exp:
        _, mail_res = http("GET", "/mails", tok=tok)
        titles = [m.get("title", "") for m in (mail_res or {}).get("mails", [])]
        for expected_str in exp["mail_title_contains"]:
            if not any(expected_str in t for t in titles):
                errs.append(f"邮件标题未包含「{expected_str}」，现有邮件: {titles}")

    if "flag_equals" in exp:
        try:
            import sqlite3
            db_path = "/Users/wjb/WebstormProjects/game/backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/25441db6d1a9e56ba090d848e21b35ae27131e8aa67c7813f0c55db7bc9a38ec.sqlite"
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            for f_key, expected_val in exp["flag_equals"].items():
                cur.execute("SELECT flag_value FROM player_dialogue_flags WHERE player_id = ? AND flag_key = ?", (sub, f_key))
                row = cur.fetchone()
                actual_val = row[0] if row else 0
                if actual_val != expected_val:
                    errs.append(f"Flag [{f_key}] 期望 {expected_val}，实际 {actual_val}")
            conn.close()
        except Exception as e:
            pass

    return errs

for i, step in enumerate(json.load(open(sys.argv[1])), 1):
    exp, res = step.get("expect", {}), None
    if "teleport" in step:
        sc = scenes[step["teleport"]]
        code, res = http("POST", "/travel/teleport", {"targetZoneId": sc["zone_id"], "targetAreaId": sc["id"]}, tok)
        desc, errs = f"传送 {step['teleport']} -> {code}", ([] if code == 200 else [f"传送失败: {res}"])
        if code == 200:
            state["scene"] = sc["id"]
            if exp: errs += check(res, exp)
    elif "start" in step:
        cfg = step["start"]
        body = {}
        if cfg.get("auto_npc"):
            _, r = http("GET", "/admin/npc-instances?pageSize=200", tok=admin)
            rows = [x for x in r["data"] if x.get("owner_player_id") == sub and x.get("scene_id") == state["scene"]]
            print("   玩家在当前场景的剧情 NPC:", [(x["npc_id"], x["name"]) for x in rows])
            body = {"npcId": rows[0]["npc_id"]} if rows else None
        elif cfg.get("resume"): body = {"nodeId": state["resume"]}
        elif cfg.get("npcId"): body = {"npcId": cfg["npcId"]}
        else: body = {"nodeId": cfg["nodeId"]}
        if body is None:
            desc, errs = "开启对话", ["当前场景没有属于该玩家的剧情 NPC"]
        else:
            code, res = http("POST", "/npc/dialogue/start", body, tok)
            desc, errs = f"开启对话 {body} -> {code}", ([] if code == 200 else [f"start 失败: {res}"])
            if code == 200: errs += check(res, exp)
            p = payload_of(res)
            if p:
                state["node"] = p["nodeId"]
                print("   选项:", [(o["id"], o.get("disabled")) for o in p.get("options", [])])
    elif "advance" in step:
        code, res = http("POST", "/npc/dialogue/advance", {"currentNodeId": state["node"]}, tok)
        desc, errs = f"翻页/直连 -> {code}", ([f"advance 失败: {res}"] if code != 200 else check(res, exp))
        if code == 200 and payload_of(res): state["node"] = payload_of(res)["nodeId"]
    elif "select" in step:
        code, res = http("POST", "/npc/dialogue/select", {"currentNodeId": state["node"], "optionId": step["select"]}, tok)
        desc, errs = f"选择 {step['select']} -> {code}", ([f"select 失败: {res}"] if code != 200 else check(res, exp))
        if code == 200:
            p = payload_of(res)
            state["node"] = p["nodeId"] if p else None
            if res.get("nextNodeId"): state["resume"] = res["nextNodeId"]
            if res.get("status") == "COMBAT":
                cpay = res.get("combatPayload") or {}
                state["winNodeId"] = cpay.get("winNodeId")
                state["loseNodeId"] = cpay.get("loseNodeId")
                print("   战斗载荷:", json.dumps(cpay, ensure_ascii=False))
            print("   status:", res.get("status"), "| sceneChanged:", res.get("sceneChanged"), "| toast:", res.get("rewardsToast"))
    elif "settle" in step:
        outcome = step["settle"].lower()
        target_node = step.get("nodeId") or (state["winNodeId"] if outcome == "win" else state["loseNodeId"])
        if not target_node:
            desc, errs = f"战斗结算 ({outcome})", [f"无法确定目标节点：未从上一战斗获得 {'winNodeId' if outcome == 'win' else 'loseNodeId'} 且步骤未指定 nodeId"]
        else:
            code, res = http("POST", "/npc/dialogue/start", {"nodeId": target_node}, tok)
            desc, errs = f"战斗结算 ({outcome}) 进入 {target_node} -> {code}", ([] if code == 200 else [f"settle 失败: {res}"])
            if code == 200:
                p = payload_of(res)
                if p: state["node"] = p["nodeId"]
                errs += check(res, exp)
                if p:
                    print("   选项:", [(o["id"], o.get("disabled")) for o in p.get("options", [])])
    else:
        desc, errs = "?", [f"未知步骤 {step}"]
    print(f"[{'OK' if not errs else 'FAIL'}] #{i} {desc}")
    for e in errs: print("   ✗", e)
    fails += bool(errs)

print(f"\n{fails} 步失败 | 游客玩家 ID: {sub}")
sys.exit(1 if fails else 0)

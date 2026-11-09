import json, urllib.request, urllib.error
BASE = "http://localhost:8787/api"

class ApiError(Exception): pass

def login(user="admin", pwd="admin123"):
    r = urllib.request.Request(f"{BASE}/admin/login", method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"username": user, "password": pwd}).encode())
    return json.loads(urllib.request.urlopen(r).read())["token"]

def api(tok, method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise ApiError(f"{method} {path} -> {e.code}: {e.read().decode()}")

def item_grant(item_id, qty=1):
    return {"type": "ITEM", "itemId": item_id, "quantity": qty}

def currency_grant(silver=0, ingot=0, copper=0):
    return {"type": "CURRENCY", "silver": silver, "ingot": ingot, "copper": copper}

def notify(title, content, grants=(), once=True):
    # grants 必须是数组；不支持经验
    return {"type": "SEND_NOTIFICATION", "title": title, "content": content,
            "grants": list(grants), "once": once}

def encounter(opt_id, template_id, win, lose, level=1, exp=0, gold=0, items=(), once_flag=None):
    # battleReward.items 字段名已验证使用 {id, count}
    return {"type": "START_ENCOUNTER", "npcId": f"npcinst_storybattle_{opt_id}",
            "encounter": {"templateId": template_id, "battleMode": "SOLO", "battleGroupId": None,
                          "battleLevel": level, "battleMemberLevels": {},
                          "battleReward": {"exp": exp, "gold": gold, "silver": 0, "items": list(items)},
                          "respawnSeconds": 0, "onceFlag": once_flag},
            "winNodeId": win, "loseNodeId": lose}

def set_root(tok, pkg_id, node_id):
    return api(tok, "PUT", f"/admin/dialogues/packages/{pkg_id}", {"default_root_node_id": node_id})

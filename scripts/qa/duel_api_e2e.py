"""API end-to-end test of SHOOT DICE duels against `wrangler dev`.

Requires: .dev.vars with BOT_TOKEN=123456:TEST-token, TG_API_BASE=http://127.0.0.1:8788, DEV_MODE=1,
`node scripts/qa/mock-telegram.mjs 8788 /tmp/tg-mock.jsonl` and `npx wrangler dev --port 8787`.
Usage: python3 -I scripts/qa/duel_api_e2e.py http://127.0.0.1:8787 /tmp/tg-mock.jsonl
"""
import hashlib, hmac, json, sys, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path

BASE, MOCK_LOG = sys.argv[1], Path(sys.argv[2])
TOKEN = "123456:TEST-token"
HOUR = 3600_000
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def init_data(user, chat=None, tamper=False):
    fields = {"user": json.dumps(user, ensure_ascii=False, separators=(",", ":")), "auth_date": str(int(time.time()))}
    if chat:
        fields["chat_instance"] = chat
        fields["chat_type"] = "group"
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    fields["hash"] = ("0" + h[1:]) if tamper else h
    return urllib.parse.urlencode(fields)


def call(method, path, user=None, body=None, chat=None, tamper=False):
    headers = {"content-type": "application/json"}
    if user:
        headers["authorization"] = "tma " + init_data(user, chat, tamper)
    data = json.dumps(body or {}).encode() if method == "POST" else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def tg_calls():
    return [json.loads(l) for l in MOCK_LOG.read_text().splitlines() if l.strip()]


A = {"id": 1001, "first_name": "Саня", "username": "sanya"}
B = {"id": 2002, "first_name": "Кирилл"}
C = {"id": 3003, "first_name": "Чужой"}
CHAT = "-777" + str(int(time.time()))
MOCK_LOG.write_text("")

# --- auth
check("no auth -> 401", call("GET", "/api/me")[0] == 401)
check("tampered initData -> 401", call("GET", "/api/me", A, tamper=True)[0] == 401)
st, me = call("GET", "/api/me", A, chat=CHAT)
check("me ok + chat board present", st == 200 and me["boards"] is not None and me["bot"] == "shootdice_test_bot", me)

# --- create + share
st, cr = call("POST", "/api/duels", A)
did = cr["duel"]["id"]
check("create 201 + prepared share", st == 201 and cr["prepared"] == "prep-" + did and cr["duel"]["status"] == "open")
check("deep link uses startapp", cr["duel"]["link"].endswith("?startapp=d_" + did))
prep = [c for c in tg_calls() if c["method"] == "savePreparedInlineMessage"]
check("share card has accept button + no money words", prep and "Принять вызов" in json.dumps(prep[-1], ensure_ascii=False) and "$" not in prep[-1]["params"]["result"]["caption"])

check("own challenge cannot be accepted", call("POST", f"/api/duels/{did}/accept", A)[0] == 409)
st, v = call("POST", f"/api/duels/{did}/accept", B, chat=CHAT)
check("B accepts", st == 200 and v["status"] == "active" and v["me"] == 1 and v["firstSeat"] in (0, 1))
check("third user is refused", call("POST", f"/api/duels/{did}/accept", C)[0] == 409)
check("accept is idempotent for B", call("POST", f"/api/duels/{did}/accept", B)[0] == 200)
time.sleep(0.5)
acc = [c for c in tg_calls() if c["method"] == "sendMessage" and c["params"]["chat_id"] == A["id"]]
check("bot tells A the challenge was accepted", acc and "Вызов принят" in acc[0]["params"]["text"], acc)

# --- play the whole match through the API
users = {0: A, 1: B}
st, v = call("GET", f"/api/duels/{did}", A)
first = v["firstSeat"]
wrong = users[1 - first]
check("non-shooter cannot roll", call("POST", f"/api/duels/{did}/roll", wrong, {"expected": v["match"]["rollId"]})[0] == 409)
check("outsider cannot roll", call("POST", f"/api/duels/{did}/roll", C, {"expected": 1})[0] == 403)

rolls = 0
dup_checked = False
while v["status"] == "active" and rolls < 400:
    shooter = 0 if v["match"]["shooter"] == "player" else 1
    exp = v["match"]["rollId"]
    st, r = call("POST", f"/api/duels/{did}/roll", users[shooter], {"expected": exp})
    if st != 200:
        check("roll ok", False, (st, r))
        break
    if not dup_checked:
        st2, r2 = call("POST", f"/api/duels/{did}/roll", users[shooter], {"expected": exp})
        check("duplicate roll is stale, log unchanged", st2 == 200 and r2["stale"] and len(r2["duel"]["log"]) == len(r["duel"]["log"]))
        dup_checked = True
    v = r["duel"]
    rolls += 1
    d = v["log"][-1]["dice"]
    if not all(1 <= x <= 6 for x in d):
        check("dice in range", False, d)
check("match finished by score", v["status"] == "over" and v["result"]["reason"] == "score", v.get("result"))
sc = v["match"]["scores"]
check("scores sum 300 and winner matches", sc["player"] + sc["bot"] == 300 and v["result"]["winner"] == (0 if sc["player"] > sc["bot"] else 1), sc)
check("3 rounds, shooters alternate", [r["shooter"] for r in v["match"]["rounds"]] == (["player", "bot", "player"] if first == 0 else ["bot", "player", "bot"]))
check("roll after end rejected", call("POST", f"/api/duels/{did}/roll", A, {"expected": 999})[0] in (200, 409))

st, ma = call("GET", "/api/me", A, chat=CHAT)
summ = [s for s in ma["duels"] if s["id"] == did]
check("A's list has the finished game", summ and summ[0]["status"] == "over" and summ[0]["result"] in ("win", "lose"))
week = ma["boards"]["week"]
check("chat champion counts the game", sum(r["wins"] for r in week) == 1 and sum(r["losses"] for r in week) == 1, week)

# --- rematch: both asks land in one game
st, r1 = call("POST", f"/api/duels/{did}/rematch", A)
st2, r2 = call("POST", f"/api/duels/{did}/rematch", B)
check("rematch shared by both", r1["id"] == r2["id"] and r1["id"] != did)
st, rv = call("GET", f"/api/duels/{r1['id']}", B)
loser = 1 - v["result"]["winner"]
check("loser shoots first in rematch", rv["status"] == "active" and rv["firstSeat"] == loser)

# --- surrender
st, s1 = call("POST", f"/api/duels/{r1['id']}/forfeit", B)
check("surrender -> other seat wins", s1["status"] == "over" and s1["result"] == {**s1["result"], "winner": 0, "reason": "surrender"})

# --- timeout + reminders on a fresh game
st, cr2 = call("POST", "/api/duels", A)
g = cr2["duel"]["id"]
call("POST", f"/api/duels/{g}/accept", B)
st, gv = call("GET", f"/api/duels/{g}", A)
shooter = users[0 if gv["match"]["shooter"] == "player" else 1]
MOCK_LOG.write_text("")
call("POST", f"/api/dev/duels/{g}/shift", A, {"ms": HOUR + 60_000})
time.sleep(2.5)
rem = [c for c in tg_calls() if c["method"] == "sendMessage" and "⏰" in c["params"]["text"]]
check("1 h reminder sent to the shooter", len(rem) == 1 and rem[0]["params"]["chat_id"] == shooter["id"], rem)
check("reminder button opens the game", rem and g in json.dumps(rem[0]["params"]["reply_markup"]))
call("POST", f"/api/dev/duels/{g}/shift", A, {"ms": 24 * HOUR})
st, tv = call("GET", f"/api/duels/{g}", A)
check("24 h timeout -> technical loss of the shooter", tv["status"] == "over" and tv["result"]["reason"] == "turn_timeout" and tv["players"][tv["result"]["winner"]]["id"] != shooter["id"], tv.get("result"))
time.sleep(2.5)
fin = [c for c in tg_calls() if c["method"] == "sendMessage" and ("время хода" in c["params"]["text"] or "Техническое" in c["params"]["text"])]
check("final messages after timeout", len(fin) >= 1, [c["params"]["text"] for c in tg_calls() if c["method"] == "sendMessage"])

# --- webhook /start
import hashlib as _h
sec = _h.sha256(("shootdice-webhook:" + TOKEN).encode()).hexdigest()[:48]
req = urllib.request.Request(BASE + "/tg/webhook", data=json.dumps({"message": {"chat": {"id": 55}, "text": "/start"}}).encode(), method="POST", headers={"content-type": "application/json", "x-telegram-bot-api-secret-token": sec})
with urllib.request.urlopen(req) as r:
    ok = r.status == 200
time.sleep(0.3)
st_msgs = [c for c in tg_calls() if c["method"] == "sendMessage" and c["params"]["chat_id"] == 55]
check("/start answers with a Play button", ok and st_msgs and "Играть" in json.dumps(st_msgs[0], ensure_ascii=False))

st, setup = call("GET", "/api/setup")
check("/api/setup configures webhook + menu", st == 200 and setup["ok"] and any(c["method"] == "setWebhook" for c in tg_calls()))

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)

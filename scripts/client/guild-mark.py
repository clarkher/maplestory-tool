# 台服經典版客戶端（Unity）切公會徽章：底圖 31 種、圖案 113 種，每種最多 16 色，全部 17×17。
# 2026-11-08 v1.81 公會徽章模擬器（/plan/guild）用，設計見 docs/superpowers/specs/2026-11-08-guild-mark-design.md「圖從哪來」「資料管線」。
#
# 用法（要 Python 3.11 + UnityPy、numpy、Pillow：pip install --user UnityPy numpy Pillow；還要 node）：
#   python -E -P scripts/client/guild-mark.py [客戶端資料夾，預設 D:/屁哥/maplestory_classic]
# 只讀客戶端，不寫進遊戲資料夾。寫出：
#   public/assets/guild-mark/marks-<圖集 sha256 前 10 碼>.png（舊的 marks-*.png 會刪掉）
#   src/lib/guild-mark/marks.json（索引，前端照這份找格子）
# 任何檢查不過就停下來（sys.exit），一個檔都不寫。
#
# 做法：
# 1. spritesheet_1023f33d….bundle 有整張 1024×1024 的 GuildMark_0 貼圖，跟 MonoBehaviour「GuildMark.wzspritesheet」；
#    後者原始資料從 0xe4 起 2273 筆、每筆 16 bytes：x, y, 寬, 高（int32；y 由下往上量，所以上緣 = 1024 - y - 高）。
#    2273 比 canvas 數（2289）少：完全一樣的圖共用同一格。
# 2. json_fc4e161b….bundle 的「GuildMark.wzjson」是 WZJS 樹，交給 scripts/client/guild-mark-tree.mjs（wzjs.mjs 的 decodeBody）列 canvas 路徑：
#    BackGround/<8 碼 id>/<顏色 1～16>、Mark/<分類>/<8 碼 id>/<顏色>。
# 3. 哪一格是哪個 canvas，客戶端裡我們沒解出對照表，改拿舊版（GMS v83）同路徑的圖當答案卷：
#    maplestory.io api/wz/GMS/83/UI/GuildMark.img/<路徑>，快取在 %TEMP%/guild-mark-gms/（檔名把 / 換成 _），沒有的才去抓。
#    答案卷裁掉透明邊後，在同尺寸的格子裡找像素完全一樣（差 0）的那格；裁掉的左上角就是這格放回 17×17 的位置。
#    圖用台服的，舊版只拿來對位置。2026-11-08 第一次跑：2289 個 canvas 全部差 0、2273 格全用到。
# 4. 圖集：每種底圖／圖案一列（底圖 31 列在前，再來動物、植物、花紋、文字、其他，各自照 id 排），第（顏色−1）欄，
#    沒有那個顏色的格子全透明。寬 16×17、高 144×17。
# 5. 色票：底圖取 BackGround/00001000 每色 17×17 正中那點；圖案取文字分類第一個圖案每色出現最多的不透明顏色。
import base64
import hashlib
import io
import json
import os
import struct
import subprocess
import sys
import tempfile
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
import UnityPy
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
REPO = Path(__file__).resolve().parents[2]
root = sys.argv[1] if len(sys.argv) > 1 else "D:/屁哥/maplestory_classic"
AA = f"{root}/Maplestory_Classic_Data/StreamingAssets/aa/w"
SHEET_BUNDLE = f"{AA}/spritesheet_1023f33d7803aa6ebdb0af33806e9a14.bundle"
JSON_BUNDLE = f"{AA}/json_fc4e161bd2228c7902b6ad307a5548ba.bundle"
CACHE = Path(os.environ.get("TEMP") or tempfile.gettempdir()) / "guild-mark-gms"
GMS = "https://maplestory.io/api/wz/GMS/83/UI/GuildMark.img/"
OUT_DIR = REPO / "public" / "assets" / "guild-mark"
OUT_JSON = REPO / "src" / "lib" / "guild-mark" / "marks.json"

CELL = 17
SHEET_SIZE = 1024
RECT_OFF = 0xE4
RECT_COUNT = 2273
CATEGORIES = ["Animal", "Plant", "Pattern", "Letter", "Etc"]
# 數量跟設計文件 Global Constraints 一樣；客戶端改版數量變了就停下來先看
EXPECT = {"BackGround": 31, "Animal": 21, "Plant": 7, "Pattern": 22, "Letter": 36, "Etc": 27}
ONE_COLOUR = {9026}  # 其他分類最後一個只有 1 色


def container_asset(bundle, suffix):
    env = UnityPy.load(bundle)
    for path, obj in env.container.items():
        if path.endswith(suffix):
            return obj
    sys.exit(f"{bundle} 裡找不到 {suffix}：客戶端改版、檔名可能換了，到 aa/w 找有 GuildMark 的那一包")


# 1. 貼圖跟格子表
texture = container_asset(SHEET_BUNDLE, "GuildMark_0.png").read().image.convert("RGBA")
if texture.size != (SHEET_SIZE, SHEET_SIZE):
    sys.exit(f"GuildMark_0 應該是 1024×1024，讀到 {texture.size}")
sheet = np.asarray(texture).astype(np.int32)
sheet_raw = container_asset(SHEET_BUNDLE, "GuildMark.wzspritesheet").deref().get_raw_data()
if b"GuildMark" not in sheet_raw[:0x40] or len(sheet_raw) < RECT_OFF + RECT_COUNT * 16:
    sys.exit("GuildMark.wzspritesheet 的格式變了（名字或長度對不上）")
rects = []  # (x, top, w, h)
for i in range(RECT_COUNT):
    x, y, w, h = struct.unpack_from("<4i", sheet_raw, RECT_OFF + i * 16)
    top = SHEET_SIZE - y - h
    if w <= 0 or h <= 0 or w > CELL or h > CELL or x < 0 or top < 0 or x + w > SHEET_SIZE or top + h > SHEET_SIZE:
        sys.exit(f"第 {i} 格 x={x} y={y} 寬={w} 高={h} 不合理：0xe4 起的格子表格式可能變了")
    rects.append((x, top, w, h))
by_size = {}
for i, (x, top, w, h) in enumerate(rects):
    by_size.setdefault((w, h), []).append(i)

# 2. canvas 路徑
wz_raw = container_asset(JSON_BUNDLE, "GuildMark.wzjson").deref().get_raw_data()
with tempfile.TemporaryDirectory() as tmp:
    raw_file = Path(tmp) / "guild-mark-wz.bin"
    raw_file.write_bytes(wz_raw)
    res = subprocess.run(["node", str(REPO / "scripts" / "client" / "guild-mark-tree.mjs"), str(raw_file)],
                         capture_output=True, text=True, encoding="utf-8")
if res.returncode != 0:
    sys.exit("guild-mark-tree.mjs 失敗：\n" + res.stderr)
canvases = json.loads(res.stdout)

entries = {"BackGround": {}}  # 分類 → { id 字串: [顏色...] }
for c in CATEGORIES:
    entries[c] = {}
for p in canvases:
    parts = p.split("/")
    if parts[0] == "BackGround" and len(parts) == 3:
        entries["BackGround"].setdefault(parts[1], []).append(int(parts[2]))
    elif parts[0] == "Mark" and len(parts) == 4 and parts[1] in CATEGORIES:
        entries[parts[1]].setdefault(parts[2], []).append(int(parts[3]))
    else:
        sys.exit(f"沒看過的 canvas 路徑 {p}")
for k, n in EXPECT.items():
    if len(entries[k]) != n:
        sys.exit(f"{k} 應該 {n} 種，讀到 {len(entries[k])}")
for k, ids in entries.items():
    for id_, cols in ids.items():
        want = [1] if int(id_) in ONE_COLOUR else list(range(1, 17))
        if sorted(cols) != want:
            sys.exit(f"{k}/{id_} 的顏色是 {sorted(cols)}，應該 {want}")


# 3. 對答案卷
def answer(p):
    f = CACHE / (p.replace("/", "_") + ".png")
    if not f.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(GMS + p, timeout=30) as r:
            f.write_bytes(base64.b64decode(json.load(r)["value"]))
    return np.asarray(Image.open(f).convert("RGBA")).astype(np.int32)


placed = {}  # 路徑 → (格子編號, 放回 17×17 的 x, y)
fetched_before = sum(1 for _ in CACHE.glob("*.png")) if CACHE.exists() else 0
for p in canvases:
    g = answer(p)
    if g.shape[0] > CELL or g.shape[1] > CELL:
        sys.exit(f"舊版 {p} 是 {g.shape[1]}×{g.shape[0]}，超過 17×17")
    ys, xs = np.where(g[..., 3] > 0)
    if not len(ys):
        sys.exit(f"舊版 {p} 是全透明")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    gc = g[y0:y1, x0:x1]
    hit = None
    for i in by_size.get((x1 - x0, y1 - y0), []):
        x, top, w, h = rects[i]
        c = sheet[top:top + h, x:x + w]
        m = (gc[..., 3] > 0) | (c[..., 3] > 0)
        if not np.abs(gc - c)[m].any():
            hit = i
            break
    if hit is None:
        sys.exit(f"{p} 在台服格子表裡找不到像素完全一樣的格子")
    placed[p] = (hit, int(x0), int(y0))
used = {v[0] for v in placed.values()}
if len(used) != RECT_COUNT:
    sys.exit(f"台服 {RECT_COUNT} 格只用到 {len(used)} 格：有圖沒對上 canvas")
fetched = sum(1 for _ in CACHE.glob("*.png")) - fetched_before


def tile(p):
    i, ox, oy = placed[p]
    x, top, w, h = rects[i]
    t = Image.new("RGBA", (CELL, CELL))
    # 直接貼（不拿自己當遮罩），半透明的邊才不會被乘兩次
    t.paste(texture.crop((x, top, x + w, top + h)), (ox, oy))
    return t


# 4. 圖集
order = [("BackGround", sorted(entries["BackGround"], key=int))] + [(c, sorted(entries[c], key=int)) for c in CATEGORIES]
rows = sum(len(ids) for _, ids in order)
atlas = Image.new("RGBA", (16 * CELL, rows * CELL))
index = {}
row = 0
for k, ids in order:
    index[k] = []
    for id_ in ids:
        cols = sorted(entries[k][id_])
        box = None  # 各色看得到的點合起來的範圍 [x, y, 寬, 高]（17×17 裡），前端拿來置中；下載照遊戲位置不用它
        for col in cols:
            p = f"BackGround/{id_}/{col}" if k == "BackGround" else f"Mark/{k}/{id_}/{col}"
            t = tile(p)
            atlas.paste(t, ((col - 1) * CELL, row * CELL))
            b = t.getchannel("A").getbbox()
            if b:
                box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        if box is None:
            sys.exit(f"{k}/{id_} 每一色都是空的")
        index[k].append({"id": int(id_), "row": row, "colours": cols, "box": [box[0], box[1], box[2] - box[0], box[3] - box[1]]})
        row += 1

# 5. 色票
hexc = lambda px: "#%02x%02x%02x" % tuple(px[:3])
bg_swatches = [hexc(tile(f"BackGround/00001000/{k}").getpixel((8, 8))) for k in range(1, 17)]
first_letter = sorted(entries["Letter"], key=int)[0]
mark_swatches = []
for k in range(1, 17):
    t = np.asarray(tile(f"Mark/Letter/{first_letter}/{k}"))
    opaque = [tuple(int(v) for v in px[:3]) for px in t.reshape(-1, 4) if px[3] == 255]
    if not opaque:
        sys.exit(f"Mark/Letter/{first_letter}/{k} 沒有不透明的點，拿不到色票")
    mark_swatches.append(hexc(Counter(opaque).most_common(1)[0][0]))

# 全部過了才寫檔
buf = io.BytesIO()
atlas.save(buf, "PNG", optimize=True)
png = buf.getvalue()
name = f"marks-{hashlib.sha256(png).hexdigest()[:10]}.png"
OUT_DIR.mkdir(parents=True, exist_ok=True)
for old in OUT_DIR.glob("marks-*.png"):
    if old.name != name:
        old.unlink()
(OUT_DIR / name).write_bytes(png)
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
data = {
    "atlas": f"/assets/guild-mark/{name}",
    "cell": CELL,
    "backgrounds": index["BackGround"],
    "marks": {c: index[c] for c in CATEGORIES},
    "bgSwatches": bg_swatches,
    "markSwatches": mark_swatches,
}
# 一種一行，改版重跑時 diff 看得懂
one = lambda v: json.dumps(v, separators=(", ", ": "))
lines = ["{", f'  "atlas": {one(data["atlas"])},', f'  "cell": {CELL},', '  "backgrounds": [']
lines += [f"    {one(e)}," for e in data["backgrounds"]]
lines[-1] = lines[-1].rstrip(",")
lines += ["  ],", '  "marks": {']
for ci, c in enumerate(CATEGORIES):
    lines.append(f'    "{c}": [')
    lines += [f"      {one(e)}," for e in data["marks"][c]]
    lines[-1] = lines[-1].rstrip(",")
    lines.append("    ]" + ("," if ci < len(CATEGORIES) - 1 else ""))
lines += ["  },", f'  "bgSwatches": {one(bg_swatches)},', f'  "markSwatches": {one(mark_swatches)}', "}"]
text = "\n".join(lines) + "\n"
if json.loads(text) != data:
    sys.exit("marks.json 排版後內容跟資料對不上")
OUT_JSON.write_text(text, encoding="utf-8")
print(f"canvas {len(canvases)} 個全部對上（差 0），台服 {len(used)} 格全用到；答案卷這次新抓 {fetched} 張")
print(f"寫出 {OUT_DIR / name}（{atlas.size[0]}×{atlas.size[1]}，{len(png):,} bytes）、{OUT_JSON}")

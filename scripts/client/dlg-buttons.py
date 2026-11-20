# 台服經典版客戶端（Unity）抽 NPC 對話框的按鈕圖（UI/UIWindow/UtilDlgEx 的 BtClose 停止對話、BtQNo 拒絕、BtQYes 接受、BtNext 下頁），
# 每顆抽 normal／mouseOver／pressed 三張，寫到 public/rename/bt-{close,no,yes,next}{,-hover,-down}.png。
# 2026-11-20 v2.44「名字變怪物」（/plan/rename）的 NPC 對話框用。
#
# 用法（要 Python 3.11 + UnityPy：pip install --user UnityPy）：
#   python -E -P scripts/client/dlg-buttons.py [客戶端資料夾，預設 D:/屁哥/maplestory_classic] [輸出資料夾，預設 public/rename]
# 只讀客戶端，不寫進遊戲資料夾。
#
# 做法：spriteset_34723d2991abcb4eaf4361c175a47e52.bundle 裡的 MonoBehaviour「…/UI/UIWindow/UtilDlgEx/<Bt>.asset」沒有 typetree，
# 原始資料裡每張圖是 12 bytes（fileID int32 + pathID int64）指到同一包的 Sprite。順序不固定，所以每 4 bytes 掃一次、
# 指得到 Sprite 的就收，再用 Sprite 自己的名字（normal／mouseOver／pressed／disabled）分。
import pathlib
import struct
import sys

import UnityPy

root = sys.argv[1] if len(sys.argv) > 1 else "D:/屁哥/maplestory_classic"
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "public/rename")
bundle = f"{root}/Maplestory_Classic_Data/StreamingAssets/aa/w/spriteset_34723d2991abcb4eaf4361c175a47e52.bundle"

BUTTONS = {"BtClose": "close", "BtQNo": "no", "BtQYes": "yes", "BtNext": "next"}
STATES = {"normal": "", "mouseOver": "-hover", "pressed": "-down"}

env = UnityPy.load(bundle)
by_id = {o.path_id: o for o in env.objects}
out.mkdir(parents=True, exist_ok=True)

for bt, short in BUTTONS.items():
    target = next((obj for path, obj in env.container.items() if path.endswith(f"UI/UIWindow/UtilDlgEx/{bt}.asset")), None)
    if target is None:
        sys.exit(f"找不到 UtilDlgEx/{bt}.asset（客戶端改版了？）")
    raw = target.deref().get_raw_data()
    found = {}
    for off in range(0, len(raw) - 12, 4):
        path_id = struct.unpack_from("<q", raw, off + 4)[0]
        o = by_id.get(path_id)
        if o is None or o.type.name != "Sprite":
            continue
        sprite = o.read()
        if sprite.m_Name in STATES and sprite.m_Name not in found:
            found[sprite.m_Name] = sprite.image.convert("RGBA")
    missing = [s for s in STATES if s not in found]
    if missing:
        sys.exit(f"{bt} 少了 {missing}")
    for state, suffix in STATES.items():
        img = found[state]
        fn = out / f"bt-{short}{suffix}.png"
        img.save(fn)
        print(f"{fn}  {img.width}x{img.height}")

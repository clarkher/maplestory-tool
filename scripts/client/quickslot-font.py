# 台服經典版客戶端（Unity）抽快捷鍵／道具數量用的數字（UI/Basic/ItemNo，0～9 十張小圖），產生 src/lib/speed/quickslot-font.ts。
# 2026-10-29 v1.20 練功測速「藥水用量」用：讀右下角快捷鍵每一格的道具數量。
#
# 用法（要 Python 3.11 + UnityPy：pip install --user UnityPy）：
#   python -E -P scripts/client/quickslot-font.py [客戶端資料夾，預設 D:/屁哥/maplestory_classic] > src/lib/speed/quickslot-font.ts
# 只讀客戶端，不寫進遊戲資料夾。
#
# 做法：spriteset_b70292fe87e9beb015e88611a397645a.bundle 裡的 MonoBehaviour「Assets/WzAssets/SpriteSet/Common/UI/Basic/ItemNo.asset」
# 沒有 typetree，原始資料是：…名字（ItemNo）、0x2c 一個 int（張數 10）、接著每張 12 bytes（fileID int32 + pathID int64）指到同一包的 Sprite。
# 照順序就是 0～9。每張小圖：透明＝「.」、黑框＝「+」、亮的字身＝「#」（字身由上往下是白→淡藍的漸層，十個字每一列顏色都一樣）。
import struct
import sys

import UnityPy

root = sys.argv[1] if len(sys.argv) > 1 else "D:/屁哥/maplestory_classic"
bundle = f"{root}/Maplestory_Classic_Data/StreamingAssets/aa/w/spriteset_b70292fe87e9beb015e88611a397645a.bundle"
env = UnityPy.load(bundle)
by_id = {o.path_id: o for o in env.objects}
target = next(obj for path, obj in env.container.items() if path.endswith("UI/Basic/ItemNo.asset"))
raw = target.deref().get_raw_data()
if raw[0x20:0x26] != b"ItemNo":
    sys.exit("ItemNo 的格式變了（名字不在 0x20）")
count = struct.unpack_from("<i", raw, 0x2C)[0]
if count != 10:
    sys.exit(f"ItemNo 應該是 10 張，讀到 {count}")

glyphs = []
row_rgb = {}
for i in range(count):
    _, path_id = struct.unpack_from("<iq", raw, 0x30 + 12 * i)
    sprite = by_id[path_id].read()
    image = sprite.image.convert("RGBA")
    px = image.load()
    w, h = image.size
    rows = []
    for y in range(h):
        line = ""
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                line += "."
            elif r + g + b < 120:
                line += "+"
            else:
                line += "#"
                if row_rgb.setdefault(y, (r, g, b)) != (r, g, b):
                    sys.exit(f"字 {i} 第 {y} 列顏色 {(r, g, b)} 跟別的字不一樣 {row_rgb[y]}")
        rows.append(line)
    glyphs.append((str(i), sprite.m_Name, rows))

height = len(glyphs[0][2])
out = []
out.append("// src/lib/speed/quickslot-font.ts")
out.append("// 這個檔是 scripts/client/quickslot-font.py 產生的，不要手改。")
out.append("/**")
out.append(" * 快捷鍵格子裡的道具數量用的點陣字，從台服經典版客戶端抽出來的原圖：")
out.append(" * spriteset_b70292fe87e9beb015e88611a397645a.bundle 的 UI/Basic/ItemNo（0～9 十張小圖，白→淡藍漸層的字身＋一圈黑框）。")
out.append(" * 2026-10-29 跟基準截圖（__fixtures__/window-1364.png）快捷鍵的 702、279、141、0、2 逐格比過：1 倍原尺寸、字跟字不重疊（下一個字從上一個字的寬度後面接著畫）、")
out.append(" * 數字靠格子左邊；截圖裡字身的顏色比原圖淡一點（例：原圖 221,238,255 → 截圖 232,234,240），黑框一樣。")
out.append(" * 狀態列的字是另一套（status-font.ts），不要混用。")
out.append(" * 「#」＝字身、「+」＝黑框、「.」＝透明（露出格子裡的圖示）。所有字一樣高、上緣對齊。")
out.append(" */")
out.append("export const QUICKSLOT_FONT: Record<string, string[]> = {")
for ch, name, rows in glyphs:
    out.append(f'  "{ch}": [{", ".join(chr(34) + r + chr(34) for r in rows)}],')
out.append("};")
out.append("")
out.append("/** 字身每一列的顏色（原圖，由上往下；黑框那兩列沒有字身，照上下一列補） */")
colors = []
for y in range(height):
    near = row_rgb.get(y) or row_rgb.get(y + 1) or row_rgb.get(y - 1)
    colors.append(f"[{near[0]}, {near[1]}, {near[2]}]")
out.append(f"export const QUICKSLOT_FONT_RGB: Array<[number, number, number]> = [{', '.join(colors)}];")
out.append("")
out.append(f"/** 字高（含上下黑框） */")
out.append(f"export const QUICKSLOT_FONT_H = {height};")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
print("\n".join(out))

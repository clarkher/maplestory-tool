import { itemImage } from "@/lib/asset-paths";
import { dateOfDay, LEAF_DAYS, LEAF_LAST_SHOP_DAY, WEEKDAYS } from "@/lib/leaf-planner/calendar";
import type { LeafWeapon } from "@/lib/leaf-planner/weapons";
import { dayStatus, itemTitle, missNote, type Row } from "./labels";

/**
 * 下載行程表（v2.18 使用者要的）：把日曆畫成一張 PNG，存到電腦或手機，打遊戲時開在旁邊看。
 * 固定淺色、跟畫面上同一份 5 週日曆；道具圖畫得上去就畫（同網域），畫不上去也照樣出圖。
 */

const W = 1400;
const PAD = 40;
const HEAD = 170;
const COL = (W - PAD * 2) / 7;
const ROW = 150;
const WEEK_HEAD = 36;
const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
const C = { paper: "#f5f6f8", card: "#ffffff", deep: "#eceef2", edge: "#dcdfe6", ink: "#14171d", soft: "#4f5765", maple: "#a8360a" };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadSchedule({ weapon, rows, tries, title, summary }: { weapon: LeafWeapon; rows: Row[]; tries: number | null; title: string; summary: string }) {
  const firstCell = 1 - dateOfDay(1).weekday;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = HEAD + WEEK_HEAD + ROW * 5 + PAD + 40;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const ids = [weapon.id, weapon.scrolls[100], weapon.scrolls[70], weapon.scrolls[15]];
  const images = new Map<number, HTMLImageElement | null>(await Promise.all(ids.map(async id => [id, await loadImage(itemImage(id))] as const)));

  const draw = (withImages: boolean) => {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.ink;
    ctx.font = `900 40px ${FONT}`;
    ctx.fillText(`楓葉商會行程表・${weapon.name}`, PAD, PAD + 36);
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = C.soft;
    ctx.fillText(`${title}${summary ? `　${summary}` : ""}`, PAD, PAD + 76);
    ctx.font = `400 18px ${FONT}`;
    ctx.fillText(tries !== null ? "虛線＝前面的 15% 沒中才換；中了那把留著，隔天起每天一張 70% 衝滿 7 次。" : "每天打滿 100 枚，當天換、當天衝。", PAD, PAD + 106);

    ctx.textAlign = "center";
    ctx.font = `700 20px ${FONT}`;
    WEEKDAYS.forEach((w, i) => ctx.fillText(w, PAD + COL * i + COL / 2, HEAD + 24));
    ctx.textAlign = "left";

    for (let i = 0; i < 35; i++) {
      const day = firstCell + i;
      const x = PAD + COL * (i % 7) + 3;
      const y = HEAD + WEEK_HEAD + ROW * Math.floor(i / 7) + 3;
      const w = COL - 6;
      const h = ROW - 6;
      const list = rows.filter(r => r.day === day);
      ctx.fillStyle = day >= 1 && day <= LEAF_DAYS ? C.card : C.deep;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 2;
      ctx.setLineDash(list.length && list.every(r => r.ifMiss) ? [8, 6] : []);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      const d = dateOfDay(day);
      ctx.fillStyle = day >= 1 && day <= LEAF_LAST_SHOP_DAY + 1 ? C.ink : C.soft;
      ctx.font = `900 22px ${FONT}`;
      ctx.fillText(`${d.month}/${d.date}`, x + 10, y + 28);
      if (day >= 1 && day <= LEAF_DAYS) {
        ctx.fillStyle = C.soft;
        ctx.font = `400 16px ${FONT}`;
        ctx.fillText(`DAY ${day}`, x + w - 70, y + 27);
      }

      let line = y + 44;
      for (const row of list.slice(0, 3)) {
        const id = row.kind === "weapon" ? weapon.id : weapon.scrolls[row.rate!];
        const img = withImages ? images.get(id) : null;
        if (img) ctx.drawImage(img, x + 10, line, 28, 28);
        ctx.fillStyle = C.ink;
        ctx.font = `700 19px ${FONT}`;
        ctx.fillText(itemTitle(row, weapon), x + (img ? 44 : 10), line + 21);
        const note = missNote(row, rows, tries);
        if (note && list.length === 1) {
          ctx.fillStyle = C.soft;
          ctx.font = `400 15px ${FONT}`;
          ctx.fillText(note, x + (img ? 44 : 10), line + 44);
        }
        line += list.length === 1 ? 54 : 32;
      }
      if (list.length > 3) {
        ctx.fillStyle = C.soft;
        ctx.font = `400 15px ${FONT}`;
        ctx.fillText(`還有 ${list.length - 3} 樣`, x + 10, line + 18);
      }
      if (!list.length) {
        const status = dayStatus(day, rows.length ? rows[rows.length - 1].day : 0);
        if (status) {
          ctx.fillStyle = day === LEAF_LAST_SHOP_DAY + 1 ? C.maple : C.soft;
          ctx.font = `${day === LEAF_LAST_SHOP_DAY + 1 ? 700 : 400} 17px ${FONT}`;
          ctx.fillText(status, x + 10, y + 62);
        }
      }
    }
    ctx.fillStyle = C.soft;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText("楓谷幫手 maplehelper.tw/plan/leaf", PAD, canvas.height - 24);
  };

  const save = (blob: Blob | null) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `楓葉商會行程表-${weapon.name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  draw(true);
  try {
    canvas.toBlob(save, "image/png");
  } catch {
    // 圖片不同網域讓畫布不能匯出：不畫道具圖再出一次
    draw(false);
    canvas.toBlob(save, "image/png");
  }
}

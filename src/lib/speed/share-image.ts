// 練功測速分享圖：內容（純函式，可測）與 canvas 畫法（瀏覽器才跑）。
// 版型照 S1 白天紙張（docs/superpowers/specs/assets/2026-10-29-speed-live-extras）。

export type ShareCard = {
  title: string; // 例：冰雷巫師 Lv.46・森林迷宮Ⅲ（日期另放）
  exp10: number;
  second: { label: "淨賺楓幣" | "這段拿到"; value: string };
  eta: string;
  monsterSrc: string | null;
  date: string; // 2026/10/29
};

export type ShareColors = {
  paper: string;
  paperDeep: string;
  ink: string;
  maple: string;
  edge: string;
};

const nf = (n: number) => Math.abs(Math.round(n)).toLocaleString("en-US");

/** 純數字才加千分位；淨賺加 +、負數用「−」。其他字串原樣。 */
function fmtSecond(label: ShareCard["second"]["label"], value: string): string {
  const v = value.trim();
  if (!/^[+\-−]?\d+$/.test(v)) return value;
  const n = Number(v.replace("−", "-"));
  if (!Number.isFinite(n)) return value;
  if (n < 0) return `−${nf(n)}`;
  return label === "淨賺楓幣" ? `+${nf(n)}` : nf(n);
}

export function shareLines(card: ShareCard): {
  heading: string;
  big: string;
  bottom: [string, string][];
} {
  return {
    heading: `${card.title}・${card.date}`,
    big: Number.isFinite(card.exp10) && card.exp10 >= 0 ? nf(card.exp10) : "—",
    bottom: [
      [card.second.label, fmtSecond(card.second.label, card.second.value)],
      ["升級還要", card.eta],
    ],
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // 3 秒載不到就當沒有怪圖
    const timer = setTimeout(() => resolve(null), 3000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 畫 1200×630（600×315 版型放大 2 倍）。字型載好才畫；怪圖載失敗就不放。 */
export async function drawShareImage(
  card: ShareCard,
  colors: ShareColors,
  font: string,
): Promise<HTMLCanvasElement> {
  const W = 600;
  const H = 315;
  const S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const { heading, big, bottom } = shareLines(card);

  // 字型：Noto Sans TC 依 unicode-range 切成很多子集，fonts.ready 不會等沒被要求的子集，
  // 所以每個字重都要拿「實際會畫的每一串字」去 load，再等 ready，免得第一次畫成備用字
  const sample = (px: number, w: string, text: string) => document.fonts.load(`${w} ${px}px ${font}`, text);
  try {
    await Promise.all([
      sample(14, "700", heading),
      sample(15, "800", "10 分鐘經驗"),
      sample(64, "900", big),
      ...bottom.flatMap(([label, value]) => [sample(15, "800", label), sample(28, "800", value)]),
      sample(13, "800", "楓谷幫手・練功測速"),
    ]);
    await document.fonts.ready;
  } catch {
    // 字型載不到就用備用字畫
  }
  const img = card.monsterSrc ? await loadImage(card.monsterSrc) : null;

  ctx.scale(S, S);

  // 紙張底＋圓角＋細框（框內縮半格，免得被圓角切掉）
  // 對齊 CSS 135deg：沿右下斜 45 度，線長 (W+H)·sin45，以中心對稱
  const half = ((W + H) * Math.SQRT1_2) / 2;
  const d = Math.SQRT1_2;
  const grad = ctx.createLinearGradient(W / 2 - d * half, H / 2 - d * half, W / 2 + d * half, H / 2 + d * half);
  grad.addColorStop(0, colors.paper);
  grad.addColorStop(1, colors.paperDeep);
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 16);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.edge;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 16);
  ctx.clip();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const X = 30;

  // 怪：右上、高 120、保持比例、不平滑（像素圖）
  if (img && img.naturalHeight > 0) {
    const h = 120;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(img, W - 28 - w, 70, w, h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
  }

  ctx.fillStyle = colors.ink;

  ctx.globalAlpha = 0.75;
  ctx.font = `700 14px ${font}`;
  ctx.fillText(heading, X, 42);

  ctx.globalAlpha = 0.8;
  ctx.font = `800 15px ${font}`;
  ctx.fillText("10 分鐘經驗", X, 81);

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.maple;
  ctx.font = `900 64px ${font}`;
  ctx.fillText(big, X, 141);

  // 下排兩欄：欄寬取標籤與數值較寬者，欄距 36
  ctx.fillStyle = colors.ink;
  let x = X;
  for (const [label, value] of bottom) {
    ctx.font = `800 15px ${font}`;
    const wl = ctx.measureText(label).width;
    ctx.fillText(label, x, 185);
    ctx.font = `800 28px ${font}`;
    const wv = ctx.measureText(value).width;
    ctx.fillText(value, x, 221);
    x += Math.max(wl, wv) + 36;
  }

  ctx.globalAlpha = 0.7;
  ctx.font = `800 13px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText("楓谷幫手・練功測速", W - 30, H - 24);
  ctx.globalAlpha = 1;
  ctx.restore();

  return canvas;
}

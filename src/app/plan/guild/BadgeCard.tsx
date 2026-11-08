"use client";

/**
 * 徽章卡：棋盤格舞台上放大 8 倍的徽章（底圖、圖案兩層疊），下面一行「遊戲裡實際大小」17×17，再來三顆按鈕。
 * 舞台高度、徽章尺寸都寫死，圖集還沒載到版面也不跳。
 */
import type { CSSProperties } from "react";
import { type Badge, bgEntry, cellStyle, markEntry } from "@/lib/guild-mark/badge";

const STAGE_BG: CSSProperties = {
  backgroundColor: "var(--paper)",
  backgroundImage:
    "linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%),linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,8px 8px",
};

/** 底圖＋圖案兩層；scale＝放大倍數（17 的倍數） */
export function BadgeLayers({ badge, scale }: { badge: Badge; scale: number }) {
  const bg = bgEntry(badge.b);
  const mark = markEntry(badge.m)?.entry;
  const size = 17 * scale;
  const layer: CSSProperties = { position: "absolute", left: 0, top: 0, imageRendering: "pixelated" };
  return (
    <span className="relative block flex-none" style={{ width: size, height: size }}>
      {bg ? <span data-layer="bg" style={{ ...layer, ...cellStyle(bg.row, badge.bc, scale) }} /> : null}
      {mark ? <span data-layer="mark" style={{ ...layer, ...cellStyle(mark.row, badge.mc, scale) }} /> : null}
    </span>
  );
}

const BTN =
  "flex min-h-11 items-center justify-center rounded-[14px] border text-[14px] font-extrabold transition-colors active:scale-[0.98]";
const BTN_PLAIN = `${BTN} border-[color:var(--paper-edge)] bg-[color:var(--paper)] text-[color:var(--ink)]`;
const BTN_PRIMARY = `${BTN} border-[color:var(--maple)] bg-[color:var(--maple)] text-[color:var(--on-accent)]`;

export function BadgeCard({
  badge,
  onRandom,
  onDownload,
  onShare,
}: {
  badge: Badge;
  onRandom: () => void;
  onDownload: () => void;
  onShare: () => void;
}) {
  return (
    <section className="glass-solid min-w-0 rounded-[var(--radius-card)] p-3.5">
      <div
        data-stage
        role="img"
        aria-label="公會徽章放大圖"
        className="flex h-[190px] items-center justify-center rounded-[14px] border border-[color:var(--paper-edge)]"
        style={STAGE_BG}
      >
        <BadgeLayers badge={badge} scale={8} />
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[13px] ink-soft">
        遊戲裡實際大小
        <span
          data-actual
          role="img"
          aria-label="公會徽章實際大小"
          className="inline-flex items-center rounded-md p-1"
          style={{ background: "rgb(0 0 0 / 0.62)" }}
        >
          <BadgeLayers badge={badge} scale={1} />
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <button type="button" className={BTN_PLAIN} onClick={onRandom}>
          隨機一個
        </button>
        <button type="button" className={BTN_PLAIN} onClick={onDownload}>
          下載
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={onShare}>
          分享
        </button>
      </div>
    </section>
  );
}

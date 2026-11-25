"use client";

/**
 * 冒險者登記書：3:2 的簽名格，手指／滑鼠／觸控筆都能寫（pointer events、touch-action: none＋收下觸控，不讓頁面跟著捲）。
 * 筆畫存畫面座標（CSS px），交出去前由 RenameGame 切段＋正規化，所以格子大小不影響比對。
 * 畫布照 devicePixelRatio 開解析度，格子大小變了（轉向、縮放）就照存的筆畫重畫。
 * debug（網址 ?debug=1）多一顆「匯出筆畫」：把原始筆畫（切段前）JSON 複製到剪貼簿，Task 8 校正用。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Pt, Stroke } from "@/lib/rename/strokes";

const INK = "#2b2b2b";

const BTN =
  "flex min-h-11 items-center justify-center rounded-[10px] border text-[15px] font-extrabold transition-colors active:scale-[0.98]";
export const BTN_PRIMARY = `${BTN} border-2 border-[color:var(--maple-soft)] bg-[color:var(--maple-wash)] text-[color:var(--maple)]`;
/** 實心橘：一個畫面只有一顆（發影片到社群；錄不了影片的是傳給朋友） */
export const BTN_SEND = `${BTN} border-[color:var(--maple)] bg-[color:var(--maple)] text-[color:var(--on-accent)]`;
export const BTN_PLAIN = `${BTN} border-[color:var(--paper-edge)] bg-[color:var(--paper)] text-[color:var(--ink)]`;

export function SignPad({ onSubmit, debug }: { onSubmit: (strokes: Stroke[]) => void; debug: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<{ id: number; stroke: Stroke } | null>(null);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState("");

  const lineWidth = (c: HTMLCanvasElement) => Math.max(3, c.clientWidth * 0.012);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.strokeStyle = INK;
    ctx.lineWidth = lineWidth(c);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawing.current ? [...strokes.current, drawing.current.stroke] : strokes.current;
    for (const s of all) {
      if (s.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0], s[0][1]);
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.01, s[0][1]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
      ctx.stroke();
    }
  }, []);

  // 格子大小變了就重開解析度、重畫
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  // 手指碰到格子就把觸控收下：touch-action 只擋得住瀏覽器自己的捲動，
  // App 內建瀏覽器外面那層（下拉關閉、下拉更新）要看 preventDefault。React 的 onTouch 是 passive，要自己掛
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const take = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    c.addEventListener("touchstart", take, { passive: false });
    c.addEventListener("touchmove", take, { passive: false });
    return () => {
      c.removeEventListener("touchstart", take);
      c.removeEventListener("touchmove", take);
    };
  }, []);

  const at = (e: PointerEvent | ReactPointerEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
  };

  /** 只畫最後一小段，不用每點都整張重畫 */
  const segment = (a: Pt, b: Pt) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lineWidth(c);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0] === a[0] && b[1] === a[1] ? b[0] + 0.01 : b[0], b[1]);
    ctx.stroke();
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawing.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    drawing.current = { id: e.pointerId, stroke: [p] };
    segment(p, p);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = at(ev);
      const last = d.stroke[d.stroke.length - 1];
      if (last[0] === p[0] && last[1] === p[1]) continue;
      d.stroke.push(p);
      segment(last, p);
    }
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    strokes.current = [...strokes.current, d.stroke];
    setCount(strokes.current.length);
  };

  const clear = () => {
    strokes.current = [];
    drawing.current = null;
    setCount(0);
    redraw();
  };

  const exportStrokes = async () => {
    const json = JSON.stringify(strokes.current);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(`已複製 ${strokes.current.length} 筆`);
    } catch {
      // 剪貼簿被擋（非 https、沒權限）：印在主控台給人手動複製
      console.log(json);
      setCopied("剪貼簿被擋，已印在主控台");
    }
  };

  return (
    <section data-signpad className="rounded-[var(--radius-card)] border border-[#d8ccb4] bg-[#fbf6ea] p-3.5 text-[#3c3028]">
      <h2 className="text-[17px] font-black tracking-wide">冒險者登記書</h2>
      <p className="mt-1 text-[14px]">請在下面簽上你的 ID</p>
      <div className="relative mt-2 aspect-[3/2] w-full overflow-hidden rounded-[8px] border border-dashed border-[#c9b892] bg-white/60">
        {/* 簽名線 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-[6%] bottom-[22%] border-b border-[#c9b892]" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-[23%] left-[6%] text-[12px] text-[#b3a27e]">
          簽名
        </span>
        <canvas
          ref={canvasRef}
          data-pad
          aria-label="簽名格，用手指或滑鼠寫你的 ID"
          className="absolute inset-0 h-full w-full cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
      <p className="mt-2 text-[12px] text-[#7a6a58]">你寫的字只在這支手機上算；按分享才會放進連結。</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-act="submit" className={BTN_PRIMARY} onClick={() => onSubmit(strokes.current)}>
          簽好了
        </button>
        <button type="button" data-act="clear" className={BTN_PLAIN} onClick={clear} disabled={count === 0}>
          擦掉重寫
        </button>
      </div>
      {debug ? (
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <button type="button" data-act="export" className="rounded-md border border-[#c9b892] px-2 py-1" onClick={exportStrokes}>
            匯出筆畫
          </button>
          <span>{copied}</span>
        </div>
      ) : null}
    </section>
  );
}

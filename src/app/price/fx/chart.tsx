"use client";

/**
 * 楓幣匯率頁的圖：日 K（5、20 日均線、十字線，K 棒全部實心）、收盤掛單數、漲跌三角形、某一天的讀數。
 * 全部自己用 SVG 畫，寬度照容器量（字不會跟著縮放）。漲跌色是 globals.css 的 --fx-* 變數。
 */

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  candleDir, dayChange, dayLabel, dirWord, fmtPct, fmtWan, fmtYuan, niceTicks, priceDomain, wanPerNtd,
  type Day, type Direction,
} from "@/lib/fx/fx";

export const toneText = (dir: Direction) =>
  dir === "up" ? "text-[color:var(--fx-up-text)]" : dir === "down" ? "text-[color:var(--fx-down-text)]" : "ink-soft";

/** 漲跌三角形（不用字元）；持平不畫記號（橫線看起來像國字「一」），只寫字 */
export function Tri({ dir, size = 10, className = "" }: { dir: Direction; size?: number; className?: string }) {
  if (dir === "flat") return null;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className={`inline-block shrink-0 ${className}`}>
      <path d={dir === "up" ? "M5 1 L9.6 9 H0.4 Z" : "M5 9 L9.6 1 H0.4 Z"} fill="currentColor" />
    </svg>
  );
}

/** 一段漲跌：三角形＋「漲／跌／持平」字＋元數＋百分比（顏色之外再用字和形狀分，色盲看得懂） */
export function Change({ dir, diff, pct, size = 10, className = "" }: { dir: Direction; diff: number; pct: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${toneText(dir)} ${className}`}>
      <Tri dir={dir} size={size} />
      {dir === "flat" ? "持平" : `${dirWord(dir)} ${fmtYuan(Math.abs(diff))} 元（${fmtPct(pct)}）`}
    </span>
  );
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 兩張圖（K 線、掛單數）共用的橫向座標：右邊留給價格刻度 */
export function xFrame(width: number, count: number, right = 46) {
  const plotW = Math.max(40, width - right - 4);
  const slot = plotW / count;
  return { left: 4, plotW, slot, x: (index: number) => 4 + slot * (index + 0.5), right };
}

function dateTicks(days: Day[], slot: number) {
  const step = Math.max(1, Math.ceil(52 / slot));
  return days.map((day, index) => ({ index, label: dayLabel(day.date).md })).filter(({ index }) => (days.length - 1 - index) % step === 0);
}

/** 圖上的指標事件：手指或滑鼠找最近的一天（count 是圖上畫的天數，start 是第一天在全部天數裡的位置，active／rest 都用全部天數的索引），離開就回到預設那天 */
function usePointer(count: number, start: number, frame: ReturnType<typeof xFrame>, setActive: (index: number | null) => void, rest: number | null) {
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - frame.left) / frame.slot);
    setActive(start + Math.min(count - 1, Math.max(0, index)));
  };
  return {
    onPointerMove: pick,
    onPointerDown: pick,
    onPointerLeave: () => setActive(rest),
  };
}

function keyNav(active: number | null, start: number, total: number, setActive: (index: number | null) => void, onMove: (index: number) => void) {
  return (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const from = active ?? total - 1;
    const next = Math.min(total - 1, Math.max(start, from + (event.key === "ArrowLeft" ? -1 : 1)));
    setActive(next);
    onMove(next);
  };
}

/** 給讀螢幕軟體念的一句話：「10/14（三）收 3,704 元，漲 370 元」 */
function daySummary(days: Day[], index: number) {
  const { md, week } = dayLabel(days[index].date);
  const change = dayChange(days, index);
  const tail = !change ? "，第一天" : change.dir === "flat" ? "，持平" : `，${dirWord(change.dir)} ${fmtYuan(Math.abs(change.diff))} 元`;
  return `${md}（${week}）收 ${fmtYuan(days[index].close)} 元${tail}`;
}

/** days、ma5、ma20 是全部天數（均線要用全部天數算）；start 是圖從第幾天開始畫；active、rest 也是全部天數的索引 */
export type KChartProps = {
  days: Day[];
  ma5: (number | null)[];
  ma20: (number | null)[];
  start: number;
  width: number;
  height?: number;
  active: number | null;
  setActive: (index: number | null) => void;
  rest: number | null;
  label: string;
};

export function KChart({ days: allDays, ma5: allMa5, ma20: allMa20, start, width, height = 220, active: allActive, setActive, rest, label }: KChartProps) {
  const days = allDays.slice(start), ma5 = allMa5.slice(start), ma20 = allMa20.slice(start);
  const active = allActive !== null && allActive >= start ? allActive - start : null;
  const frame = xFrame(width, days.length);
  const top = 10, bottom = 24;
  const plotH = height - top - bottom;
  const [lo, hi] = priceDomain(days, [ma5, ma20]);
  const y = (value: number) => top + ((hi - value) / (hi - lo)) * plotH;
  const last = days.at(-1)!;
  // 最後收盤價的標籤貼在右邊刻度上（高 18）：太靠近它的刻度不畫，免得數字疊在一起
  const ticks = niceTicks(lo, hi, 4).filter(tick => tick >= lo && tick <= hi && Math.abs(y(tick) - y(last.close)) >= 11);
  const body = Math.max(3, Math.min(18, frame.slot * 0.56));
  const pointer = usePointer(days.length, start, frame, setActive, rest);
  const [said, setSaid] = useState("");
  const line = (series: (number | null)[]) =>
    series.map((value, index) => (value === null ? null : `${frame.x(index).toFixed(1)},${y(value).toFixed(1)}`)).filter(Boolean).join(" ");

  if (!width) return <div style={{ height }} />;
  return (
    <div className="relative" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}，可用左右鍵換天`}
        tabIndex={0}
        className="block touch-pan-y select-none"
        onKeyDown={keyNav(allActive, start, allDays.length, setActive, index => setSaid(daySummary(allDays, index)))}
        onBlur={() => setActive(rest)}
        {...pointer}
      >
        {ticks.map(tick => (
          <g key={tick}>
            <line x1={frame.left} x2={frame.left + frame.plotW} y1={y(tick)} y2={y(tick)} stroke="var(--fx-grid)" strokeWidth={1} />
            <text x={width - 2} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="var(--ink-faint)" className="tabular-nums">{fmtYuan(tick)}</text>
          </g>
        ))}
        {dateTicks(days, frame.slot).map(({ index, label: text }) => (
          <text key={index} x={frame.x(index)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-faint)" className="tabular-nums">{text}</text>
        ))}
        {active !== null && <line x1={frame.x(active)} x2={frame.x(active)} y1={top - 6} y2={top + plotH} stroke="var(--fx-cross)" strokeWidth={1} />}
        {days.map((day, index) => {
          const dir = candleDir(day);
          const color = dir === "up" ? "var(--fx-up)" : dir === "down" ? "var(--fx-down)" : "var(--ink-soft)";
          const cx = frame.x(index);
          const yo = y(day.open), yc = y(day.close);
          const bodyTop = Math.min(yo, yc), bodyH = Math.abs(yo - yc);
          return (
            <g key={day.date} opacity={active === null || active === index ? 1 : 0.55}>
              <line x1={cx} x2={cx} y1={y(day.high)} y2={y(day.low)} stroke={color} strokeWidth={1.25} />
              {/* 漲、跌都是實心；收盤跟開盤一樣是灰色短橫線 */}
              {dir === "flat" || bodyH < 2 ? (
                <rect x={cx - body / 2} y={yc - 1} width={body} height={2} rx={1} fill={color} />
              ) : (
                <rect x={cx - body / 2} y={bodyTop} width={body} height={bodyH} rx={1.5} fill={color} />
              )}
            </g>
          );
        })}
        {[ma20, ma5].map((series, n) => {
          const points = line(series);
          if (!points) return null;
          const color = n === 0 ? "var(--fx-ma20)" : "var(--fx-ma5)";
          const count = points.split(" ").length;
          return count > 1 ? (
            <polyline key={n} points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : (
            <circle key={n} cx={+points.split(",")[0]} cy={+points.split(",")[1]} r={4} fill={color} />
          );
        })}
        {active !== null && <circle cx={frame.x(active)} cy={y(days[active].close)} r={4} fill="var(--fx-cross)" stroke="var(--fx-surface-local, var(--fx-surface))" strokeWidth={2} />}
        <g>
          <rect x={width - frame.right + 2} y={y(last.close) - 9} width={frame.right - 2} height={18} rx={4} fill="var(--ink)" />
          <text x={width - 4} y={y(last.close) + 4} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--paper)" className="tabular-nums">{fmtYuan(last.close)}</text>
        </g>
      </svg>
      {/* 用左右鍵換天時，讀螢幕軟體會念出換到哪天（滑鼠、手指不念） */}
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}

/** 掛單數：每天收盤時的筆數。有記到的天數不到 2 天就照實說「累積中」，不畫線 */
export function ListingsChart({ days: allDays, start, width, height = 76, active: allActive, setActive, rest, label }: { days: Day[]; start: number; width: number; height?: number; active: number | null; setActive: (index: number | null) => void; rest: number | null; label: string }) {
  const days = allDays.slice(start);
  const active = allActive !== null && allActive >= start ? allActive - start : null;
  const frame = xFrame(width, days.length);
  const top = 16, bottom = 20;
  const plotH = height - top - bottom;
  const values = days.map(day => day.listings);
  const known = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...known);
  const pointer = usePointer(days.length, start, frame, setActive, rest);
  // 每天的位子夠寬（24px 以上）才每根柱子都寫筆數；不夠寬就只寫選到的那天和最後一天，免得數字疊在一起
  const allLabels = frame.slot >= 24;
  const bar = Math.max(3, Math.min(18, frame.slot * 0.56));
  const firstKnown = days.findIndex(day => day.listings !== null);
  if (!width) return <div style={{ height }} />;
  return (
    <div className="relative" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y select-none" {...pointer}>
        <line x1={frame.left} x2={frame.left + frame.plotW} y1={top + plotH} y2={top + plotH} stroke="var(--fx-grid)" strokeWidth={1} />
        {/* 十字線只畫到數字下面（柱頂），不穿過那天的筆數 */}
        {active !== null && known.length >= 2 && (
          <line
            x1={frame.x(active)} x2={frame.x(active)}
            y1={days[active].listings === null ? 2 : top + plotH - Math.max(2, ((days[active].listings ?? 0) / max) * plotH)}
            y2={top + plotH} stroke="var(--fx-cross)" strokeWidth={1}
          />
        )}
        {days.map((day, index) => {
          if (day.listings === null) return null;
          const h = Math.max(2, (day.listings / max) * plotH);
          const cx = frame.x(index);
          return (
            <g key={day.date}>
              <path d={`M${cx - bar / 2} ${top + plotH} V${top + plotH - h + 4} q0 -4 4 -4 H${cx + bar / 2 - 4} q4 0 4 4 V${top + plotH} Z`} fill="var(--fx-ma5)" />
              {(allLabels || index === active || index === days.length - 1) && (
                <text x={cx} y={top + plotH - h - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink-soft)" className="tabular-nums">{day.listings}</text>
              )}
            </g>
          );
        })}
        {dateTicks(days, frame.slot).map(({ index, label: text }) => (
          <text key={index} x={frame.x(index)} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--ink-faint)" className="tabular-nums">{text}</text>
        ))}
      </svg>
      {known.length < 2 && firstKnown >= 0 && (
        <p className="pointer-events-none absolute left-1 top-1 max-w-[62%] text-[12px] leading-snug ink-soft">
          {dayLabel(days[firstKnown].date).md} 起才開始記，累積中（{known.length} 天），多記幾天才看得出變化
        </p>
      )}
      {known.length === 0 && <p className="pointer-events-none absolute left-1 top-1 text-[12px] ink-soft">還沒記到掛單數，累積中</p>}
    </div>
  );
}

/** 某一天的完整讀數：一排格子（手機 3 欄、桌機 5 欄），每格上面元／億、下面萬／元，加收盤掛單 */
export function DayReadout({ days, index }: { days: Day[]; index: number }) {
  const day = days[index];
  const change = dayChange(days, index);
  const { md, week } = dayLabel(day.date);
  const rows: [string, number][] = [["開", day.open], ["高", day.high], ["低", day.low], ["收", day.close]];
  return (
    <div className="text-[12px] leading-snug" data-fx-readout>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <b className="whitespace-nowrap text-[13px]">{md}（{week}）</b>
        {change ? <Change {...change} size={9} className="whitespace-nowrap text-[12px]" /> : <span className="ink-faint">第一天</span>}
        <span className="w-full text-[11px] ink-faint sm:ml-auto sm:w-auto">每格上面是 1 億楓幣幾元、下面是 1 元換幾萬</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5 tabular-nums sm:grid-cols-5">
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt className="text-[11px] ink-faint">{name}</dt>
            <dd className="font-bold">{fmtYuan(value)} 元</dd>
            <dd className="ink-soft">{fmtWan(wanPerNtd(value))} 萬</dd>
          </div>
        ))}
        <div>
          <dt className="text-[11px] ink-faint">收盤掛單</dt>
          <dd className="font-bold">{day.listings === null ? "沒記到" : `${day.listings} 筆`}</dd>
        </div>
      </dl>
    </div>
  );
}

/** 均線讀數：5 日線 3,333　20 日線 還要 13 天（線段當圖例，字用字色） */
export function MaLegend({ ma5, ma20, need5, need20, index, className = "" }: { ma5: (number | null)[]; ma20: (number | null)[]; need5: number; need20: number; index: number; className?: string }) {
  const item = (name: string, color: string, value: number | null, need: number) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="4" aria-hidden><line x1="1" x2="13" y1="2" y2="2" stroke={color} strokeWidth={2} strokeLinecap="round" /></svg>
      <span className="ink-soft">{name}</span>
      <span className="font-bold tabular-nums">{value !== null ? fmtYuan(value) : need > 0 ? `還要 ${need} 天` : "這天還沒有"}</span>
    </span>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] ${className}`}>
      {item("5 日線", "var(--fx-ma5)", ma5[index], need5)}
      {item("20 日線", "var(--fx-ma20)", ma20[index], need20)}
    </div>
  );
}

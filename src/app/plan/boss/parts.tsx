"use client";

// 野王計時的畫面小零件（不碰存檔、不碰網路，資料都由 BossTimer 傳進來）
import { useState } from "react";
import { monsterImage } from "@/lib/data";
import type { BossDef, ChannelState } from "@/lib/boss/types";

/** 每種狀態的底色與字色（膠囊、60 格共用） */
export const STATE_STYLE: Record<ChannelState["kind"], string> = {
  none: "border border-dashed border-[color:var(--paper-edge)] text-[color:var(--ink-faint)]",
  wait: "border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]",
  since: "border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]",
  maybe: "border-[1.5px] border-[color:var(--gold)] bg-[color:var(--gold-wash)] text-[color:var(--gold)]",
  sure: "border-[1.5px] border-[color:var(--leaf)] bg-[color:var(--leaf-wash)] text-[color:var(--leaf)]",
  empty: "border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] text-[color:var(--ink-faint)]",
};

/** 大卡外框、大字的顏色：第一名的狀態色 */
const BIG_COLOR: Record<ChannelState["kind"], string> = {
  none: "var(--ink)",
  wait: "var(--ink)",
  since: "var(--ink)",
  maybe: "var(--gold)",
  sure: "var(--leaf)",
  empty: "var(--ink)",
};

export const CARD = "rounded-[var(--radius-card)] glass-solid p-4";

/** 王的重生時間（卡片上那行） */
export function respawnText(boss: BossDef): string {
  if (boss.min === null || boss.max === null) return "還沒有台服實測";
  return boss.min === boss.max ? `約 ${boss.min} 分` : `${boss.min}～${boss.max} 分`;
}

/** 兩張圖輪流的王：「巫婆森林Ⅰ或Ⅱ」 */
export function mapText(maps: string[]): string {
  if (maps.length < 2) return maps[0] ?? "";
  const [a, b] = maps;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `${a}或${b.slice(i)}`;
}

/** 經過幾分鐘（無條件捨去） */
export const mins = (s: ChannelState) => Math.floor(s.minutes);

/** 列表右邊那行：打死的寫打死多久；沒王的時間已經在膠囊裡（「沒王 N 分前」），右邊不寫 */
export function agoText(s: ChannelState): string {
  return s.kind === "empty" ? "" : `打死 ${mins(s)} 分前`;
}

export function StatePill({ s }: { s: ChannelState }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] font-extrabold ${STATE_STYLE[s.kind]}`}>
      {s.label}
    </span>
  );
}

export function BossChip({ boss, on, onClick }: { boss: BossDef; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-boss={boss.id}
      className={[
        "flex w-[92px] shrink-0 touch-manipulation flex-col items-center rounded-[14px] px-1.5 py-2 text-center transition-colors",
        on
          ? "border-2 border-[color:var(--maple)] bg-[color:var(--maple-wash)]"
          : "border border-[color:var(--paper-edge)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 怪物小圖是像素圖，原尺寸直接放，不用最佳化 */}
      <img
        src={monsterImage(boss.id)}
        alt=""
        width={76}
        height={44}
        className="h-11 w-auto max-w-[76px] object-contain [image-rendering:pixelated]"
      />
      <span className="mt-0.5 text-[13px] font-extrabold">{boss.name}</span>
      <span className="text-[11px] ink-soft">{respawnText(boss)}</span>
    </button>
  );
}

/** 選中那隻王的說明：地圖、實測筆數（可看出處）、本站回報 */
export function BossInfo({ boss, stat }: { boss: BossDef; stat?: { n: number; median: number } }) {
  const [open, setOpen] = useState(false);
  const measured = boss.min !== null && boss.max !== null;
  return (
    <div className="space-y-1 px-1 text-[13px] leading-relaxed ink-soft">
      <p>
        <b className="text-[color:var(--ink)]">{boss.name}</b>・{mapText(boss.maps)}
        {boss.note ? `（${boss.note}）` : ""}
      </p>
      <p>
        {measured ? `重生 ${respawnText(boss)}・台服玩家實測，${boss.samples.toLocaleString("en-US")} 筆` : boss.samples > 0 ? `台服實測只有 ${boss.samples} 筆，還算不出重生時間` : "還沒有台服實測"}
        {boss.confidence === "中" ? "（筆數較少，參考就好）" : ""}
        {boss.sources.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="ml-2 font-bold text-[color:var(--maple)] underline underline-offset-2"
          >
            {open ? "收起出處" : "看出處"}
          </button>
        )}
      </p>
      {open && (
        <ul className="list-disc pl-5">
          {boss.sources.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[color:var(--sky)] underline">
                {url}
              </a>
            </li>
          ))}
        </ul>
      )}
      {stat && (
        <p>
          本站玩家回報：{stat.n.toLocaleString("en-US")} 筆，中位數 {stat.median} 分
        </p>
      )}
    </div>
  );
}

/** 「再來是 5 頻、20 頻（一定出了），1 頻（可能出了）」：同樣的狀態字併在一起 */
function nextLine(rest: ChannelState[]): string {
  const groups: { label: string; chs: number[] }[] = [];
  for (const s of rest) {
    const label = s.label;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.chs.push(s.ch);
    else groups.push({ label, chs: [s.ch] });
  }
  return `再來是 ${groups.map((g) => `${g.chs.map((c) => `${c} 頻`).join("、")}（${g.label}）`).join("，")}`;
}

/** 大卡上狀態那行 */
function headline(s: ChannelState): string {
  if (s.kind === "empty" || s.kind === "since") return s.label;
  return `${s.label}・打死 ${mins(s)} 分了`;
}

export function NextCard({ boss, ranked, ready }: { boss: BossDef; ranked: ChannelState[]; ready: boolean }) {
  const measured = boss.min !== null && boss.max !== null;
  const top = ranked[0];
  const color = top && measured ? BIG_COLOR[top.kind] : "var(--paper-edge)";
  return (
    <section className={`${CARD} border-2`} style={{ borderColor: color }} aria-label="下一個去這裡">
      <div className="text-[13px] font-bold ink-soft">下一個去這裡</div>
      {!ready ? (
        <p className="mt-2 text-[15px] ink-soft">讀取你的紀錄…</p>
      ) : !measured ? (
        <p className="mt-2 text-[15px] font-bold leading-relaxed">這隻還沒有台服實測，只能幫你記打死多久了</p>
      ) : !top ? (
        <p className="mt-2 text-[15px] font-bold leading-relaxed">還沒有紀錄：打死王時輸入頻道，按「剛打死」。</p>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1" style={{ color: BIG_COLOR[top.kind] }}>
            <b className="text-[40px] leading-none">{top.ch} 頻</b>
            <span className="text-[15px] font-extrabold">{headline(top)}</span>
          </div>
          {ranked.length > 1 && <p className="mt-1.5 text-[13px] leading-relaxed ink-soft">{nextLine(ranked.slice(1, 5))}</p>}
        </>
      )}
    </section>
  );
}

/** 有記錄的頻道一列：點開有「剛打死」「沒王」「刪掉」 */
export function ChannelRow({
  s,
  open,
  onToggle,
  onKill,
  onEmpty,
  onDelete,
}: {
  s: ChannelState;
  open: boolean;
  onToggle: () => void;
  onKill: () => void;
  onEmpty: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="border-t border-[color:var(--paper-edge)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[52px] w-full touch-manipulation items-center gap-3 py-2 text-left"
      >
        <b className="w-14 shrink-0 text-[20px]">{s.ch} 頻</b>
        {s.kind !== "since" && <StatePill s={s} />}
        <span className="ml-auto text-[13px] ink-soft">{agoText(s)}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 pb-3">
          <ActionButton solid onClick={onKill}>剛打死</ActionButton>
          <ActionButton onClick={onEmpty}>沒王</ActionButton>
          <ActionButton onClick={onDelete}>刪掉</ActionButton>
        </div>
      )}
    </li>
  );
}

export function ActionButton({
  solid,
  onClick,
  children,
  type = "button",
}: {
  solid?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={[
        "tap-safe inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[15px] font-bold transition-colors",
        solid
          ? "bg-[color:var(--maple)] text-[color:var(--on-accent)] hover:brightness-110"
          : "border border-[color:var(--paper-edge)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** 60 格：每格頻道號＋狀態字 */
export function ChannelGrid({ states }: { states: ChannelState[] }) {
  return (
    <ul className="mt-3 grid grid-cols-5 gap-1.5" aria-label="60 頻一覽">
      {states.map((s) => (
        <li
          key={s.ch}
          className={`flex min-h-[58px] flex-col items-center justify-center gap-px rounded-xl px-1 py-1.5 ${STATE_STYLE[s.kind]}`}
        >
          <b className={`text-[17px] ${s.kind === "none" ? "text-[color:var(--ink-faint)]" : "text-[color:var(--ink)]"}`}>{s.ch}</b>
          <span className="text-center text-[11px] font-bold leading-tight">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

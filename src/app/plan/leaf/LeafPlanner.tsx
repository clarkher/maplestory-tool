"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchSelect } from "@/components/SearchSelect";
import { OPTION_ON } from "@/components/option-style";
import { track } from "@/lib/analytics";
import { itemImage } from "@/lib/asset-paths";
import {
  affordable, buildPlan, COIN_DAYS, DAILY_COINS, evaluate, PAID_MESO, SCROLL_COINS, SLOTS, sortItems, statsOf, toItems, TOTAL_COINS,
  type Dist, type Plan, type PlanItem, type PlanStep, type Rate, type Strategy,
} from "@/lib/leaf-planner/calc";
import { dateOfDay, dayOf, LEAF_DAYS, LEAF_FIRST_SHOP_DAY, LEAF_LAST_SHOP_DAY, WEEKDAYS } from "@/lib/leaf-planner/calendar";
import { DEFAULT_WEAPON, findWeapon, LEAF_WEAPONS, type LeafWeapon } from "@/lib/leaf-planner/weapons";
import { CoinFarm } from "./CoinFarm";
import { downloadSchedule } from "./download";
import { CIRCLED, dayStatus, itemTitle, md, missNote, type Row } from "./labels";

/**
 * 楓葉武器衝卷規劃器（v2.18，11/12 使用者拍板 1C 3A 4C 5A）：
 * 選一把武器、選一種衝法，真實日曆寫每天換什麼，旁邊看最後攻擊。
 * 使用者看完改口「要可以自訂跟清空，清空要有確認，要能下載行程表」：衝法當起點，點任何一天可以加、拿掉；
 * 一改就變「自己排」（推薦衝法的「沒中才換」改成照排的全部換、全部衝，結果取最好那把），存在這台裝置。
 * 結果只寫「衝到這個攻擊以上的機會」（「剛好／至少」使用者看不懂）。設計稿 docs/superpowers/specs/2026-11-12-leaf-scroll-planner-design.md。
 */

type Mode = Strategy | "custom";

const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";
const SELECT = "min-w-0 max-w-full truncate rounded-[6px] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-2.5 py-2 text-[15px] font-bold";
const BTN = "inline-flex min-h-9 items-center justify-center rounded-[6px] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-3 text-[14px] font-bold disabled:opacity-40";
const MAX_WEAPONS = 10;
/** 日曆從 11/19 那週的星期日（11/15）排到 12/17 那週的星期六（12/19） */
const FIRST_CELL = 1 - dateOfDay(1).weekday;
const CELLS = 35;
/** 結果卡標出來的門檻：+12 以上（攻略文用的同一條線） */
const MARK = 12;
const STORE_KEY = "ms-leaf";

const STRATEGIES: { key: Strategy; title: string; sub: string }[] = [
  { key: "pick", title: "楓谷幫手推薦", sub: "先賭兩張 15%，沒中換一把" },
  { key: "s70", title: "穩穩衝 70%", sub: "一把 7 張全 70%" },
  { key: "s100", title: "保底 100%", sub: "一把 7 張全 100%，不用楓幣" },
];

function parseMode(raw: string | null): Mode {
  return raw === "s70" || raw === "s100" || raw === "custom" ? raw : "pick";
}

const one = (n: number) => (Math.round(n * 10) / 10).toString();

function pct(p: number): string {
  const n = Math.round(p * 100);
  if (p > 0 && n === 0) return "不到 1%";
  if (p < 1 && n === 100) return "99%";
  return `${n}%`;
}

function wan(meso: number): string {
  return `${Math.round(meso / 10_000).toLocaleString()} 萬`;
}

function loadCustom(): PlanItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is PlanItem => x && Number.isInteger(x.day) && x.day >= LEAF_FIRST_SHOP_DAY && x.day <= LEAF_LAST_SHOP_DAY && (x.kind === "weapon" || (x.kind === "scroll" && [100, 70, 15].includes(x.rate))) && Number.isInteger(x.target));
  } catch {
    return [];
  }
}

function saveCustom(items: PlanItem[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    // 私密視窗、存不了：這次還是照排的算，只是下次不會記得
  }
}

function Icon({ id, size }: { id: number; size: number }) {
  return <img src={itemImage(id)} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }} />;
}

export function LeafPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const weapon = findWeapon(Number(params.get("w"))) ?? findWeapon(DEFAULT_WEAPON)!;
  const mode = parseMode(params.get("s"));
  const [today, setToday] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState<PlanItem[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  // 今天是 DAY 幾、自己排過的：靜態頁建置時不知道，畫好後再讀
  useEffect(() => {
    setToday(dayOf(Date.now()));
    setCustom(loadCustom());
  }, []);

  const plans = useMemo(() => Object.fromEntries(STRATEGIES.map(s => [s.key, buildPlan(s.key, weapon.cost)])) as Record<Strategy, Plan>, [weapon.cost]);
  const plan = mode === "custom" ? null : plans[mode];
  const rows: Row[] = useMemo(() => (plan ? plan.steps.map(({ coins: _coins, ...rest }: PlanStep) => rest) : sortItems(custom)), [plan, custom]);
  const ev = useMemo(() => (mode === "custom" ? evaluate(custom, weapon.cost) : null), [mode, custom, weapon.cost]);
  const outcome: Dist | null = plan ? plan.outcome : ev!.outcome;
  const stats = useMemo(() => (outcome ? statsOf(outcome) : null), [outcome]);
  const byDay = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const row of rows) map.set(row.day, [...(map.get(row.day) ?? []), row]);
    return map;
  }, [rows]);
  const lastDay = rows.length ? rows[rows.length - 1].day : 0;
  const invalid = useMemo(() => new Set(ev?.invalid ?? []), [ev]);
  const tries = plan && mode === "pick" ? plan.tries : null;

  const go = (next: { w?: number; s?: Mode }) => {
    const q = new URLSearchParams();
    const w = next.w ?? weapon.id;
    const s = next.s ?? mode;
    if (w !== DEFAULT_WEAPON) q.set("w", String(w));
    if (s !== "pick") q.set("s", s);
    const qs = q.toString();
    router.replace(qs ? `/plan/leaf?${qs}` : "/plan/leaf", { scroll: false });
    track("calc_result", { tool: "leaf", weapon: findWeapon(w)?.name ?? "", strategy: s });
  };

  /** 改一下：推薦衝法先整份搬成自己排的，再改 */
  const edit = (change: (items: PlanItem[]) => PlanItem[]) => {
    const base = mode === "custom" ? custom : toItems(plans[mode].steps);
    const next = change(sortItems(base));
    setCustom(next);
    saveCustom(next);
    if (mode !== "custom") go({ s: "custom" });
  };

  const clearAll = () => {
    setCustom([]);
    saveCustom([]);
    setConfirmClear(false);
    if (mode !== "custom") go({ s: "custom" });
  };

  const weaponOptions = useMemo(() => LEAF_WEAPONS.map(w => ({ value: w.id, label: `${w.name}（${w.job}・${w.lv} 級・${w.magic ? "魔攻" : "攻擊"} ${w.atk}）` })), []);
  const atkWord = weapon.magic ? "魔攻" : "攻擊";
  const focus = picked ?? (today !== null && today >= LEAF_FIRST_SHOP_DAY && today <= LEAF_LAST_SHOP_DAY ? today : rows[0]?.day ?? LEAF_FIRST_SHOP_DAY);
  const customStats = useMemo(() => {
    const out = evaluate(custom, weapon.cost).outcome;
    return out ? statsOf(out) : null;
  }, [custom, weapon.cost]);
  const modeTitle = mode === "custom" ? "自己排" : STRATEGIES.find(s => s.key === mode)!.title;

  return (
    <>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold ink-soft">武器</span>
          <SearchSelect label="楓葉武器" className={SELECT} value={weapon.id} options={weaponOptions} placeholder="打武器名字找" onSelect={id => id && go({ w: id })} />
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2" role="radiogroup" aria-label="衝法">
          {[...STRATEGIES.map(s => ({ ...s, st: statsOf(plans[s.key].outcome) })), { key: "custom" as const, title: "自己排", sub: "點日曆任何一天加、拿掉", st: customStats }].map(s => {
            const on = s.key === mode;
            return (
              <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => go({ s: s.key })}
                className={`min-w-0 rounded-[var(--radius-card)] border px-2.5 py-2 text-left sm:px-3 sm:py-2.5 ${on ? OPTION_ON : "border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)]"}`}>
                <span className="block text-[14px] font-black leading-snug sm:text-[15px]">{s.title}</span>
                <span className="block text-[12px] leading-snug ink-soft">{s.sub}</span>
                <span className="mt-1 block text-[12px] tabular-nums text-[color:var(--ink)] sm:text-[13px]">
                  {s.st ? <>平均 <b>+{one(s.st.mean)}</b>・{weapon.atk + MARK} 以上 <b>{pct(s.st.atLeast(MARK))}</b></> : "還沒排"}
                </span>
              </button>
            );
          })}
        </div>

        <section className={CARD} aria-label="每天換什麼">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-black">每天換什麼</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {confirmClear ? (
                <>
                  <span className="text-[13px] font-bold">清空整個行程？</span>
                  <button type="button" className={`${BTN} border-[color:var(--maple)] text-[color:var(--maple)]`} onClick={clearAll}>確定清空</button>
                  <button type="button" className={BTN} onClick={() => setConfirmClear(false)}>取消</button>
                </>
              ) : (
                <button type="button" className={BTN} disabled={!rows.length} onClick={() => setConfirmClear(true)}>全部清空</button>
              )}
              <button type="button" className={BTN} disabled={!rows.length} onClick={() => {
                downloadSchedule({ weapon, rows, tries, title: modeTitle, summary: stats ? `平均${atkWord} ${one(weapon.atk + stats.mean)}（+${one(stats.mean)}）・${weapon.atk + MARK} 以上 ${pct(stats.atLeast(MARK))}` : "" });
                track("calc_result", { tool: "leaf", weapon: weapon.name, strategy: `download_${mode}` });
              }}>下載行程表</button>
            </div>
          </div>
          <p className="mt-1 text-[12px] ink-soft">{mode === "pick" ? "虛線＝前面沒中才換。" : ""}點一天可以加或拿掉{mode === "custom" ? "。自己排的照排的全部換、全部衝（不會「中了就改衝別的」），結果算最好那把" : "，一改就變成「自己排」"}。</p>
          <div className="mt-2.5 grid grid-cols-7 gap-[3px] md:gap-1.5">
            {WEEKDAYS.map(w => <div key={w} className="text-center text-[12px] font-bold ink-soft">{w}</div>)}
            {Array.from({ length: CELLS }, (_, i) => {
              const day = FIRST_CELL + i;
              return <DayCell key={day} day={day} rows={byDay.get(day) ?? []} allRows={rows} weapon={weapon} tries={tries} lastDay={lastDay} invalid={invalid}
                short={ev?.short?.day === day} today={today === day} picked={focus === day} onPick={() => setPicked(day)} />;
            })}
          </div>
          {mode === "pick" && (
            <p className="mt-3 rounded-[6px] bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
              <b>15% 中了：</b>那把留著，隔天起每天換一張 70% 衝它，衝滿 7 次就收工，不用再換新武器。
            </p>
          )}
          <DayEditor day={focus} today={today} rows={byDay.get(focus) ?? []} allRows={rows} weapon={weapon} tries={tries} invalid={invalid} onEdit={edit} />
        </section>
      </div>

      <aside className={`${CARD} mt-3.5 lg:sticky lg:top-[calc(var(--header-offset)+12px)] lg:mt-0`} aria-label="最後拿到的武器">
        <h2 className="text-[16px] font-black">最後拿到的{ev && ev.weapons.length > 1 ? "最好那把" : ""}{weapon.name}</h2>
        <p className="text-[12px] ink-soft">原本{atkWord} {weapon.atk}・失敗只扣次數、不會爆{ev && ev.weapons.length > 1 ? `・${ev.weapons.length} 把各自衝，算最高那把` : ""}</p>
        {stats ? (
          <>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              <Stat label={`平均${atkWord}`} value={one(weapon.atk + stats.mean)} sub={`+${one(stats.mean)}`} />
              <Stat label="最常拿到" value={String(weapon.atk + stats.mode)} sub={`+${stats.mode}・${pct(stats.modeP)}`} />
              <MesoStat plan={plan} paid={ev?.paidScrolls ?? 0} />
            </div>
            <h3 className="mt-4 text-[15px] font-black">衝到這個{atkWord}以上的機會</h3>
            <AtLeastList stats={stats} base={weapon.atk} />
          </>
        ) : (
          <p className="mt-3 text-[14px] ink-soft">還沒換武器。點日曆的一天，按「換一把」開始排。</p>
        )}
        <CoinLine plan={plan} ev={ev} lastDay={lastDay} />
        <p className="mt-2 text-[12px] leading-relaxed ink-soft">精確算出來的，不是模擬。只算{atkWord}，卷軸順帶加的屬性不算。</p>
      </aside>
    </div>
    <CoinFarm />
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-[color:var(--paper-edge)] px-2 py-2">
      <div className="text-[12px] font-bold ink-soft">{label}</div>
      <div className="text-[22px] font-black tabular-nums leading-tight">{value}</div>
      <div className="text-[12px] tabular-nums ink-soft">{sub}</div>
    </div>
  );
}

function MesoStat({ plan, paid }: { plan: Plan | null; paid: number }) {
  const max = plan ? plan.paidScrolls.max : paid;
  if (!max) return <Stat label="要準備楓幣" value="不用" sub="100% 卷只要硬幣" />;
  const mean = plan ? plan.paidScrolls.mean : paid;
  return <Stat label="要準備楓幣" value={wan(max * PAID_MESO)} sub={mean < max ? `平均 ${wan(mean * PAID_MESO)}` : `${max} 張 × 30 萬`} />;
}

function CoinLine({ plan, ev, lastDay }: { plan: Plan | null; ev: ReturnType<typeof evaluate> | null; lastDay: number }) {
  if (ev?.short) {
    const have = DAILY_COINS * Math.min(ev.short.day, COIN_DAYS);
    return (
      <p className="mt-3 rounded-[6px] border border-[color:var(--maple)] bg-[color:var(--maple-wash)] px-3 py-2 text-[13px] font-bold text-[color:var(--maple)]" role="alert">
        硬幣不夠：到 {md(ev.short.day)}（DAY {ev.short.day}）最多存到 {have.toLocaleString()} 枚，排的東西差 {ev.short.lack} 枚。把那天的東西往後挪。
      </p>
    );
  }
  const used = plan ? plan.coinsMax : ev!.coinsUsed;
  if (!used) return null;
  return (
    <p className="mt-3 rounded-[6px] bg-[color:var(--leaf-wash)] px-3 py-2 text-[13px] font-bold text-[color:var(--leaf)]">
      硬幣夠：每天打滿 100 枚，{plan ? "最慢 " : ""}{md(lastDay)}（DAY {lastDay}）換完，用 {used.toLocaleString()} 枚
      {used < TOTAL_COINS ? `，剩 ${(TOTAL_COINS - used).toLocaleString()} 枚可以換別的` : ""}
    </p>
  );
}

/** 由高到低「X 以上 幾 %」，排到 99% 那列就停 */
function AtLeastList({ stats, base }: { stats: ReturnType<typeof statsOf>; base: number }) {
  const rows: { k: number; p: number }[] = [];
  for (const k of stats.values) {
    const p = stats.atLeast(k);
    rows.push({ k, p });
    if (Math.round(p * 100) >= 99) break;
  }
  const example = rows.find(r => r.k === MARK) ?? rows[Math.min(rows.length - 1, Math.floor(rows.length / 2))];
  return (
    <>
      <ul className="mt-1.5 space-y-1.5" data-testid="at-least">
        {rows.map(({ k, p }) => (
          <li key={k} className={`grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-2 ${k === MARK ? "-mx-1.5 rounded-[6px] bg-[color:var(--maple-wash)] px-1.5 py-0.5" : ""}`}>
            <span className="text-[15px] font-black tabular-nums">{base + k} 以上 <span className="text-[12px] font-normal ink-soft">+{k}</span></span>
            <span className="h-3 overflow-hidden rounded-[3px] bg-[color:var(--paper-deep)]"><span className="block h-full bg-[color:var(--maple)]" style={{ width: `${p * 100}%` }} /></span>
            <span className="text-right text-[15px] font-black tabular-nums">{pct(p)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] leading-relaxed ink-soft">
        例：「{base + example.k} 以上 {pct(example.p)}」＝照這樣衝，最後有 {pct(example.p)} 的機會拿到 {base + example.k} 或更高。最好 {base + stats.best}、最糟 {base + stats.worst}。
      </p>
    </>
  );
}

function DayCell({ day, rows, allRows, weapon, tries, lastDay, invalid, short, today, picked, onPick }: {
  day: number; rows: Row[]; allRows: Row[]; weapon: LeafWeapon; tries: number | null; lastDay: number; invalid: Set<PlanItem>; short: boolean; today: boolean; picked: boolean; onPick: () => void;
}) {
  // DAY 1 只能存幣，鎖死點不開（使用者 11/12）
  const shop = day >= LEAF_FIRST_SHOP_DAY && day <= LEAF_LAST_SHOP_DAY;
  const active = day >= 1 && day <= LEAF_DAYS;
  const dashed = rows.length > 0 && rows.every(r => r.ifMiss);
  const status = rows.length ? null : dayStatus(day, lastDay);
  const expire = day === LEAF_LAST_SHOP_DAY + 1;
  const border = short || today ? "border-2 border-[color:var(--maple)]" : picked ? "border border-[color:var(--maple)]" : "border border-[color:var(--paper-edge)]";
  const bg = picked && shop ? "bg-[color:var(--maple-wash)]" : shop && active ? "bg-[color:var(--glass-strong)]" : "bg-[color:var(--paper-deep)]";
  return (
    <button type="button" onClick={onPick} disabled={!shop} aria-label={`${md(day)}${active ? ` DAY ${day}` : ""}${rows.length ? `：${rows.map(r => itemTitle(r, weapon)).join("、")}` : ""}`} aria-pressed={picked} data-day={day}
      className={`relative min-h-[60px] min-w-0 rounded-[6px] p-[3px] text-center md:min-h-[92px] md:px-2 md:py-1.5 md:text-left ${border} ${dashed ? "border-dashed" : ""} ${bg}`}>
      {today && <span className="absolute -top-2 right-0.5 rounded-[4px] bg-[color:var(--maple)] px-1 text-[10px] font-black leading-[16px] text-[color:var(--on-accent)] md:left-2 md:right-auto">今天</span>}
      <span className="flex flex-col items-center md:items-start">
        <span className={`text-[11px] font-black tabular-nums md:text-[13px] ${!shop && !expire ? "ink-soft" : ""}`}>{md(day)}</span>
        {active && <span className="text-[9px] leading-tight tabular-nums ink-soft md:text-[11px]">DAY {day}</span>}
      </span>
      {rows.map((row, i) => {
        const note = missNote(row, allRows, tries);
        const bad = invalid.has(row);
        return (
          <span key={i} className="mt-0.5 flex justify-center md:mt-1 md:items-center md:justify-start md:gap-1">
            <Icon id={row.kind === "weapon" ? weapon.id : weapon.scrolls[row.rate!]} size={22} />
            <span className={`hidden min-w-0 text-[12px] font-bold leading-snug md:block ${bad ? "text-[color:var(--maple)] line-through" : ""}`}>
              {/* 格子窄：卷軸只寫「70% ④」（旁邊就是卷軸圖），點開的那天寫全名 */}
              <span className="whitespace-nowrap">{itemTitle(row, weapon).replace(" 卷 ", " ")}</span>
              {note && <span className="block text-[11px] font-normal ink-soft">{note}</span>}
            </span>
          </span>
        );
      })}
      {status && <span className={`mt-1 block text-[10px] leading-tight md:text-[12px] ${expire ? "font-bold text-[color:var(--maple)]" : "ink-soft"}`}>
        <span className="md:hidden">{expire ? "失效" : day > LEAF_DAYS ? "只能換" : day < LEAF_FIRST_SHOP_DAY ? "存幣" : status}</span>
        <span className="hidden md:inline">{status}</span>
      </span>}
    </button>
  );
}

/** 點一天：寫那天換什麼（手機格子只有圖），可以拿掉、加武器或卷 */
function DayEditor({ day, today, rows, allRows, weapon, tries, invalid, onEdit }: {
  day: number; today: number | null; rows: Row[]; allRows: Row[]; weapon: LeafWeapon; tries: number | null; invalid: Set<PlanItem>; onEdit: (change: (items: PlanItem[]) => PlanItem[]) => void;
}) {
  const d = dateOfDay(day);
  // 這天（含）以前換到的武器才衝得到；預設衝最新那把
  const owned = [...new Set(allRows.filter(r => r.kind === "weapon" && r.day <= day).map(r => r.target))].sort((a, b) => a - b);
  const [target, setTarget] = useState<number | null>(null);
  const aim = target !== null && owned.includes(target) ? target : owned[owned.length - 1];
  const used = (t: number) => allRows.filter(r => r.kind === "scroll" && r.target === t).length;
  const weaponCount = new Set(allRows.filter(r => r.kind === "weapon").map(r => r.target)).size;
  const nextTarget = Math.max(0, ...allRows.map(r => r.target)) + 1;
  const spentBefore = allRows.filter(r => r.day < day).reduce((sum, r) => sum + (r.kind === "weapon" ? weapon.cost : SCROLL_COINS), 0);
  const coins = DAILY_COINS * Math.min(day, COIN_DAYS) - spentBefore;

  // 拿掉：allRows 跟 edit 收到的清單都照 sortItems 排，用同一個位置找；拿掉武器時衝它的卷一起拿掉
  const remove = (row: Row) => onEdit(items => {
    const index = allRows.indexOf(row);
    const victim = items[index];
    return items.filter((item, i) => i !== index && !(victim.kind === "weapon" && item.kind === "scroll" && item.target === victim.target));
  });
  const addScroll = (rate: Rate) => aim !== undefined && onEdit(items => [...items, { day, kind: "scroll", rate, target: aim }]);
  const full = aim === undefined || used(aim) >= SLOTS;
  // 幣不夠就不給按：連後面排好的一起算，這天再換會害哪天不夠也不行
  const canWeapon = affordable(allRows, { day, kind: "weapon", target: nextTarget }, weapon.cost);
  const canScroll = aim !== undefined && affordable(allRows, { day, kind: "scroll", rate: 100, target: aim }, weapon.cost);

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-[color:var(--maple)] p-3" aria-live="polite" data-testid="day-editor">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[15px] font-black">
          {d.month}/{d.date}（{WEEKDAYS[d.weekday]}）{day <= LEAF_DAYS ? ` DAY ${day}` : ""}{day === today ? "・今天" : ""}
        </div>
        <div className="text-[13px] tabular-nums ink-soft">這天身上 {Math.max(0, coins).toLocaleString()} 枚{day > LEAF_DAYS ? "（不再掉幣）" : ""}</div>
      </div>
      {rows.length ? rows.map((row, i) => {
        const note = missNote(row, allRows, tries);
        const bad = invalid.has(row);
        return (
          <div key={i} className="mt-2 flex items-center gap-2">
            <Icon id={row.kind === "weapon" ? weapon.id : weapon.scrolls[row.rate!]} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">{itemTitle(row, weapon)}</div>
              <div className={`text-[12px] ${bad ? "font-bold text-[color:var(--maple)]" : "ink-soft"}`}>
                {bad ? (owned.includes(row.target) ? "這把已經衝滿 7 次，這張不算" : "這把這天還沒換到，這張不算") : [note, row.kind === "weapon" ? `${weapon.cost} 枚` : row.rate === 100 ? "100 枚" : "100 枚＋30 萬楓幣"].filter(Boolean).join("・")}
              </div>
            </div>
            <button type="button" className={BTN} onClick={() => remove(row)} aria-label={`拿掉${itemTitle(row, weapon)}`}>拿掉</button>
          </div>
        );
      }) : <p className="mt-1 text-[14px] ink-soft">這天沒換東西。</p>}

      <div className="mt-3 border-t border-[color:var(--paper-edge)] pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={BTN} disabled={weaponCount >= MAX_WEAPONS || !canWeapon} onClick={() => onEdit(items => [...items, { day, kind: "weapon", target: nextTarget }])}>
            ＋換一把（{weapon.cost} 枚）
          </button>
          {([100, 70, 15] as Rate[]).map(rate => (
            <button key={rate} type="button" className={BTN} disabled={full || !canScroll} onClick={() => addScroll(rate)}>＋{rate}% 卷</button>
          ))}
        </div>
        {owned.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="卷軸衝哪一把">
            <span className="text-[13px] font-bold ink-soft">卷軸衝</span>
            {owned.map(t => (
              <button key={t} type="button" role="radio" aria-checked={t === aim} onClick={() => setTarget(t)}
                className={`${BTN} min-w-10 ${t === aim ? OPTION_ON : ""}`}>{CIRCLED[t] ?? t}</button>
            ))}
          </div>
        )}
        {!canWeapon && (
          <p className="mt-2 text-[12px] font-bold text-[color:var(--maple)]">
            {canScroll ? `幣不夠再換一把（${weapon.cost} 枚）` : "幣不夠，這天不能再換"}：先拿掉別的，或改排到後面的日子。
          </p>
        )}
        <p className="mt-2 text-[12px] ink-soft">
          {aim === undefined ? "這天以前還沒換武器，先換一把才有東西衝。" : full ? `${CIRCLED[aim]}已經衝滿 7 次。` : `卷軸衝 ${CIRCLED[aim]}，還能衝 ${SLOTS - used(aim)} 次。`}
        </p>
      </div>
    </div>
  );
}

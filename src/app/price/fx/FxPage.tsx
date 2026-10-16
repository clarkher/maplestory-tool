"use client";

import { useEffect, useState } from "react";
import {
  daysUntil, fmtInt, fmtWan, fmtYuan, freshnessOf, isManualLatest, ladderBook, ladderNote, ladderTotal, loadFx, movingAverage, pinIndex, prevWord,
  quoteOf, REF_NAME, REF_SITE, visibleWindow,
  type Day, type Freshness, type FxData, type LadderRow, type Quote,
} from "@/lib/fx/fx";
import { Change, DayReadout, KChart, ListingsChart, MaLegend, useWidth, xFrame } from "./chart";

type Model = {
  fx: FxData;
  days: Day[];
  quote: Quote;
  ma5: (number | null)[];
  ma20: (number | null)[];
  need5: number;
  need20: number;
  total: number;
  pin: number | null;
};

function build(fx: FxData, pin: string | null): Model {
  const days = fx.daily.days;
  return {
    fx,
    days,
    quote: quoteOf(fx),
    ma5: movingAverage(days, 5),
    ma20: movingAverage(days, 20),
    need5: daysUntil(days, 5),
    need20: daysUntil(days, 20),
    total: ladderTotal(fx.latest),
    pin: pinIndex(days, pin),
  };
}

/** 「最後更新…・8591 賣家開價（參考站整理），不是成交價」：超過 12 小時照實寫；最新一筆是手動補的就只寫「手動輸入」 */
function UpdateLine({ fresh, manual, className = "" }: { fresh: Freshness; manual: boolean; className?: string }) {
  if (manual) {
    return (
      <p className={`text-[12px] leading-relaxed ${fresh.stale ? "font-bold text-[color:var(--maple)]" : "ink-soft"} ${className}`}>
        {fresh.text}・手動輸入
      </p>
    );
  }
  return (
    <p className={`text-[12px] leading-relaxed ${fresh.stale ? "font-bold text-[color:var(--maple)]" : "ink-soft"} ${className}`}>
      {fresh.text}・8591 賣家開價（
      <a href={REF_SITE} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">{REF_NAME}</a>
      {" "}整理），不是成交價
    </p>
  );
}

function HowItWorks({ className = "" }: { className?: string }) {
  return (
    <ul className={`space-y-2 text-[13px] leading-relaxed ${className}`}>
      <li><b>這是開價，不是成交價。</b>8591 上賣家掛出來想賣的價格，實際成交可能更低或更高。</li>
      <li><b>市價怎麼取：</b>先排除代練、引流單和離譜的價格，再把匯率最好（同樣的錢換到最多楓幣）的那四分之一掛單拿出來，取中間那一筆。</li>
      <li>
        <b>資料從哪來：</b>8591 公開掛單，由{" "}
        <a href={REF_SITE} target="_blank" rel="noreferrer" className="font-bold text-[color:var(--sky)] underline underline-offset-2">{REF_NAME}</a>{" "}
        每 2 小時整理一次；我們每 2 小時記一次，一天的第一筆、最高、最低、最後一筆就是那天的開高低收。
      </li>
      <li><b>參考站停更時：</b>我們可能手動補一筆，那一筆會標「手動輸入」，當天的讀數會寫「含手動輸入」。</li>
      <li><b>換算：</b>1 億楓幣幾元 ＝ 1,000,000 ÷ 100 元換到的萬數；1 元換幾萬 ＝ 100 元換到的萬數 ÷ 100。</li>
    </ul>
  );
}

/** ?pin=2026-10-12 讓十字線停在那天、?broken=1 看讀不到資料的畫面：只給驗收用，頁面上不提。在瀏覽器裡讀網址，頁面才能維持靜態 */
export function FxPage() {
  const [state, setState] = useState<{ model: Model } | { error: true } | null>(null);

  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams(window.location.search);
    const pin = query.get("pin");
    loadFx(query.get("broken") === "1")
      .then(fx => alive && setState({ model: build(fx, pin) }))
      .catch(() => alive && setState({ error: true }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div data-fx-ready={state ? "1" : "0"}>
      {state === null ? (
        <p className="py-24 text-center text-[15px] ink-soft">正在載入匯率…</p>
      ) : "error" in state ? (
        <div className="mx-auto my-16 max-w-md rounded-[var(--radius-card)] glass wood-frame p-6 text-center">
          <h1 className="text-[18px] font-black">讀不到匯率資料，等一下再過來</h1>
          <p className="mt-2 text-[13px] ink-soft">這裡只放真的掛單資料，讀不到就不顯示數字。</p>
        </div>
      ) : (
        <Board m={state.model} />
      )}
    </div>
  );
}

/** 看盤 App 版面：頂部報價列、深一階的圖區（讀數＋均線＋K 線＋掛單數）、委賣檔位表 */
function Board({ m }: { m: Model }) {
  const [active, setActive] = useState<number | null>(m.pin);
  const [ref, width] = useWidth<HTMLDivElement>();
  // 更新時間每 5 分鐘重算一次：頁面開著開著，「最後更新」會自己走，超過 12 小時變成沒更新的警告
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);
  const fresh = freshnessOf(m.fx.latest, now);
  // 圖只畫最近 N 天（每天至少 10px）；均線已經用全部天數算好了，這裡只決定從哪天開始畫
  const start = visibleWindow(m.days.length, xFrame(width, 1).plotW);
  const shown = active !== null && active >= start ? active : m.days.length - 1;
  const word = prevWord(m.quote, m.fx.latest);
  const book = ladderBook(m.fx.latest);
  const bookNote = ladderNote(m.fx.latest);
  const maxCount = Math.max(...book.head.map(row => row.count), 1);

  return (
    <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="space-y-3">
        {/* 報價列 */}
        <section className="rounded-2xl glass-solid p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-[17px] font-black">楓幣／台幣<span className="ink-soft">・雪吉拉</span></h1>
            <span className="text-[12px] ink-faint">賣家開價</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12px] ink-soft">1 億楓幣</p>
              <p className="text-[32px] font-black leading-tight sm:text-[40px]">{fmtYuan(m.quote.yuan)}<span className="ml-1 text-[15px] font-bold">元</span></p>
            </div>
            <div>
              <p className="text-[12px] ink-soft">1 元換</p>
              <p className="text-[32px] font-black leading-tight sm:text-[40px]">{fmtWan(m.quote.wan)}<span className="ml-1 text-[15px] font-bold">萬楓幣</span></p>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            <Change dir={m.quote.dir} diff={m.quote.diffYuan} pct={m.quote.pct} />
            {m.quote.prev && <span className="ink-soft">跟{word}收盤 {fmtYuan(m.quote.prev.close)} 元比</span>}
          </div>
          <UpdateLine fresh={fresh} manual={isManualLatest(m.fx.latest)} className="mt-2 border-t border-[color:var(--paper-edge)] pt-2" />
        </section>

        {/* 圖區：比頁面深一階 */}
        <section className="rounded-2xl border border-[color:var(--paper-edge)] bg-[color:var(--fx-panel)] p-3 [--fx-surface-local:var(--fx-panel)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-black">日 K<span className="ml-1.5 text-[12px] font-normal ink-soft">元／1 億楓幣</span></h2>
            <span className="text-[11px] ink-faint">按住圖左右滑，或用左右鍵，看每一天</span>
          </div>
          <div className="mt-2 rounded-xl border border-[color:var(--paper-edge)] px-2.5 py-2">
            <DayReadout days={m.days} index={shown} />
          </div>
          <MaLegend ma5={m.ma5} ma20={m.ma20} need5={m.need5} need20={m.need20} index={shown} className="mt-2.5 px-0.5" />
          <div ref={ref} className="mt-1">
            <KChart days={m.days} ma5={m.ma5} ma20={m.ma20} start={start} width={width} height={230} active={active} setActive={setActive} rest={m.pin} label="雪吉拉楓幣日 K 線" />
          </div>
          <CandleLegend />
          <h3 className="mt-2 border-t border-[color:var(--paper-edge)] pt-2 text-[12px] font-bold ink-soft">收盤掛單數（筆）</h3>
          <ListingsChart days={m.days} start={start} width={width} active={active} setActive={setActive} rest={m.pin} label="每天收盤時的掛單數" />
        </section>
      </div>

      <div className="space-y-3">
        {/* 委賣檔位 */}
        <section className="rounded-2xl glass-solid p-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-black">委賣檔位</h2>
            {!bookNote && <span className="text-[12px] ink-soft">現在 {fmtInt(m.total)} 筆掛單</span>}
          </div>
          {bookNote ? (
            <p className="mt-2 rounded-xl border border-[color:var(--paper-edge)] px-3 py-4 text-center text-[13px] ink-soft" data-fx-ladder-note>{bookNote}</p>
          ) : (
            <>
              <p className="mt-0.5 text-[12px] ink-faint">由上往下：楓幣由便宜到貴</p>
              <div className="mt-2 text-[13px] tabular-nums">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_3rem] gap-2 px-1.5 py-1 text-[11px] ink-faint">
                  <span>100 元換</span>
                  <span className="text-right">1 億楓幣約</span>
                  <span className="text-right">筆數</span>
                </div>
                {book.head.map(row => <BookRow key={row.lo} row={row} max={maxCount} />)}
                {book.rest && (
                  <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_3rem] gap-2 border-t border-[color:var(--paper-edge)] px-1.5 py-1.5 ink-soft">
                    <span>更貴的（100 元換不到 200 萬）</span>
                    <span className="text-right font-bold">{book.rest.count}</span>
                  </div>
                )}
              </div>
              {book.head.some(row => row.market) && <p className="mt-2 text-[12px] ink-soft">標「市價」的那一格：現在的市價 100 元換 {fmtInt(m.quote.ask100)} 萬，落在這裡。</p>}
            </>
          )}
        </section>

        <section className="rounded-2xl glass-solid p-3.5">
          <h2 className="text-[15px] font-black">怎麼算的</h2>
          <HowItWorks className="mt-2" />
        </section>
      </div>
    </div>
  );
}

/** K 線下面的一行圖例：顏色之外也用字說明（漲跌也都有「漲／跌」字和三角形） */
function CandleLegend() {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[12px] ink-soft">
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0"><path d="M5 1 L9.6 9 H0.4 Z" fill="var(--fx-up)" /></svg>
        紅＝漲
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0"><path d="M5 9 L9.6 1 H0.4 Z" fill="var(--fx-down)" /></svg>
        綠＝跌
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden className="shrink-0"><rect x="0" y="1" width="12" height="2" rx="1" fill="var(--ink-soft)" /></svg>
        灰色短橫＝收盤跟開盤一樣
      </span>
    </p>
  );
}

function BookRow({ row, max }: { row: LadderRow; max: number }) {
  // 深度條從右邊長出來（像委賣檔位），市價那格整列打底色
  return (
    <div className={`relative grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-2 overflow-hidden rounded-md px-1.5 py-1.5 ${row.market ? "border-l-[3px] border-[color:var(--ink)] bg-[color:var(--fx-market)] font-bold" : ""}`}>
      <span aria-hidden className="absolute inset-y-0.5 right-0 rounded-l-[4px] bg-[color:var(--sky-wash)]" style={{ width: `${(row.count / max) * 100}%` }} />
      <span className="relative">
        {row.lo}～{row.lo + 9} 萬
        {row.market && <span className="ml-1.5 rounded bg-[color:var(--ink)] px-1 py-px text-[10px] font-bold text-[color:var(--paper)]">市價</span>}
      </span>
      <span className="relative text-right">{fmtYuan(row.yuanLo)}～{fmtYuan(row.yuanHi)} 元</span>
      <span className="relative text-right font-bold">{row.count}</span>
    </div>
  );
}

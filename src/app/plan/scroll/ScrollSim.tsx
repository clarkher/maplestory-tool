"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { loadScrollSim, peekScrollSim } from "@/lib/data";
import { simTable } from "@/lib/scroll-sim/calc";
import { defaultScroll, findScroll, scrollsFor } from "@/lib/scroll-sim/pick";
import type { ScrollSimData, SimEquip, SimScroll } from "@/lib/scroll-sim/types";
import {
  CARD, PickRow, Picker, PriceField, ResultTable, Switch, equipItems, equipNote, mesoText, parsePrice, scrollItems, scrollNote,
} from "./parts";

/** 網址的 id：只認正整數 */
function idParam(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** 這張卷能不能衝這件 */
function fits(scroll: SimScroll, equip: SimEquip): boolean {
  return (scroll.slot !== null && scroll.slot === equip.s) || (scroll.only?.includes(equip.id) ?? false);
}

type Selection = { equip: SimEquip | null; scroll: SimScroll | null };

/**
 * 網址 → 現在挑的裝備跟卷軸。id 不存在、不是這類東西、卷軸跟裝備對不上：當作沒帶（不壞頁）。
 * 只帶裝備：卷軸挑預設那張；只帶卷軸：裝備留空。
 */
function resolve(data: ScrollSimData, eqRaw: string | null, scRaw: string | null): Selection {
  const eqId = idParam(eqRaw);
  const scId = idParam(scRaw);
  const equip = eqId === null ? null : (data.equips.find((e) => e.id === eqId) ?? null);
  let scroll = scId === null ? null : findScroll(data, scId);
  if (equip && scroll && !fits(scroll, equip)) scroll = null;
  if (equip && !scroll) scroll = defaultScroll(scrollsFor(data, equip));
  return { equip, scroll };
}

type Open = { kind: "equip" | "scroll"; from: HTMLElement } | null;

export function ScrollSim() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<ScrollSimData | null>(peekScrollSim);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const [white, setWhite] = useState(false);
  const [whiteRate, setWhiteRate] = useState<10 | 20>(10);
  const [scrollPrice, setScrollPrice] = useState("");
  const [equipPrice, setEquipPrice] = useState("");
  const [whitePrice, setWhitePrice] = useState("");
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (data) return;
    loadScrollSim().then(setData, () => setError(true));
  }, [data]);

  const eqRaw = params.get("eq");
  const scRaw = params.get("sc");
  const sel = useMemo<Selection>(() => (data ? resolve(data, eqRaw, scRaw) : { equip: null, scroll: null }), [data, eqRaw, scRaw]);

  const go = useCallback(
    (equip: SimEquip | null, scroll: SimScroll | null) => {
      const next = new URLSearchParams();
      if (equip) next.set("eq", String(equip.id));
      if (scroll) next.set("sc", String(scroll.id));
      const qs = next.toString();
      router.replace(qs ? `/plan/scroll?${qs}` : "/plan/scroll", { scroll: false });
    },
    [router],
  );

  const close = useCallback(() => {
    setOpen(null);
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, []);

  const pickEquip = (id: number) => {
    if (!data) return;
    const equip = data.equips.find((e) => e.id === id) ?? null;
    if (!equip) return;
    const keep = sel.scroll && fits(sel.scroll, equip) ? sel.scroll : defaultScroll(scrollsFor(data, equip));
    go(equip, keep);
    close();
  };
  const pickScroll = (id: number) => {
    if (!data) return;
    go(sel.equip, findScroll(data, id));
    close();
  };

  const rows = useMemo(() => {
    const { equip, scroll } = sel;
    if (!equip || !scroll) return null;
    return simTable(equip.tuc, scroll.rate, scroll.boom, white ? whiteRate : undefined);
  }, [sel, white, whiteRate]);

  const prices = {
    scroll: parsePrice(scrollPrice),
    equip: parsePrice(equipPrice),
    white: white ? parsePrice(whitePrice) : null,
  };
  const anyPrice = prices.scroll !== null || prices.equip !== null || prices.white !== null;

  // 挑選清單的內容
  const pickerItems = useMemo(() => {
    if (!data || !open) return [];
    if (open.kind === "equip") {
      const list = sel.scroll && !sel.equip ? data.equips.filter((e) => fits(sel.scroll!, e)) : data.equips;
      return equipItems(list);
    }
    return sel.equip ? scrollItems(scrollsFor(data, sel.equip), false) : scrollItems(data.scrolls, true);
  }, [data, open, sel]);

  if (error) {
    return (
      <Shell>
        <p className={`${CARD} text-center text-[15px] ink-soft`}>卷軸資料讀不到，等一下再過來重新整理。</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <LoadingBlock label="載入卷軸資料…" />
      </Shell>
    );
  }

  const { equip, scroll } = sel;
  const lastRow = rows ? rows[rows.length - 1] : null;

  return (
    <Shell>
      <section className={CARD} aria-label="挑裝備跟卷軸">
        <div className="grid gap-2.5">
          <PickRow
            label="裝備"
            id={equip?.id ?? null}
            name={equip?.n ?? null}
            note={equip ? equipNote(equip) : null}
            empty="先挑一件裝備"
            onOpen={(el) => {
              opener.current = el;
              setOpen({ kind: "equip", from: el });
            }}
          />
          <PickRow
            label="卷軸"
            id={scroll?.id ?? null}
            name={scroll?.n ?? null}
            note={scroll ? scrollNote(scroll) : null}
            empty="先挑一張卷軸"
            onOpen={(el) => {
              opener.current = el;
              setOpen({ kind: "scroll", from: el });
            }}
          />
        </div>
        <div className="mt-2">
          <Switch label="失敗就用白衣卷軸補回次數" on={white} onChange={setWhite} />
        </div>
        {white ? (
          <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="白衣卷軸成功率">
            {data.white.map((w) => {
              const on = whiteRate === w.rate;
              return (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setWhiteRate(w.rate === 20 ? 20 : 10)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[14px] font-extrabold ${on ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)]"}`}
                >
                  {w.n}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2.5 [&>*]:basis-[calc(50%-0.35rem)] [&>*]:grow">
          <PriceField label="卷軸單價（楓幣）" value={scrollPrice} onChange={setScrollPrice} />
          <PriceField label="裝備單價（楓幣）" value={equipPrice} onChange={setEquipPrice} />
          {white ? <PriceField label="白衣卷軸單價（楓幣）" value={whitePrice} onChange={setWhitePrice} /> : null}
        </div>
      </section>

      <section className={CARD} aria-label="結果">
        {rows && scroll && equip && lastRow ? (
          <>
            <h2 className="text-[15px] font-black">要成功幾張，各要準備多少</h2>
            <ResultTable rows={rows} scroll={scroll} prices={prices} white={white} />
            <div className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed ink-soft">
              {anyPrice ? (
                <p>
                  {lastRow.tiny || lastRow.scrolls90 === null || lastRow.items90 === null
                    ? `全部 ${lastRow.k} 張都成功幾乎衝不到，算不出要準備多少錢`
                    : `九成機率要準備的錢：約 ${mesoText(
                        lastRow.scrolls90 * (prices.scroll ?? 0) + lastRow.items90 * (prices.equip ?? 0) + (white ? lastRow.avgWhite * (prices.white ?? 0) : 0),
                      )}（卷軸 ${lastRow.scrolls90} 張＋裝備 ${lastRow.items90} 件）${white ? "（白衣照平均張數算）" : ""}`}
                  {prices.scroll === null || prices.equip === null || (white && prices.white === null) ? "；沒填的單價當 0 算" : ""}
                </p>
              ) : (
                <p>填了單價就算得出總共要花多少</p>
              )}
              <p>從全新裝備算；剩下的次數不夠衝到就換一件，不浪費卷軸。成功率照遊戲裡卷軸說明。</p>
              {scroll.boom > 0 ? (
                <p>{scroll.boom >= 1 ? "失敗一定爆掉，爆掉那件就沒了" : `失敗有 ${Math.round(scroll.boom * 100)}% 機率爆掉，爆掉那件就沒了`}</p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-[15px] font-bold ink-soft">
            {!equip && scroll ? "先挑一件裝備" : "先挑一件裝備跟一張卷軸"}
          </p>
        )}
      </section>

      {open ? (
        <Picker
          title={open.kind === "equip" ? "挑裝備" : "挑卷軸"}
          items={pickerItems}
          selected={open.kind === "equip" ? (equip?.id ?? null) : (scroll?.id ?? null)}
          hint={
            open.kind === "equip" && scroll && !equip
              ? `只列「${scroll.n}」能衝的裝備`
              : open.kind === "scroll" && equip
                ? `只列「${equip.n}」能用的卷軸`
                : undefined
          }
          onPick={open.kind === "equip" ? pickEquip : pickScroll}
          onClose={close}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">衝卷模擬</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">選裝備跟卷軸，算衝到想要的張數要準備多少。</p>
      </header>
      {children}
    </div>
  );
}

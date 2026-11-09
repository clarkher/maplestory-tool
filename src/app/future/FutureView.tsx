"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronRight } from "@/components/Icons";
import { itemImage } from "@/lib/asset-paths";
import { COMPARE, COMPARE_SOURCES, FORECAST_UPDATED, FOURTH_JOBS, RISKS, STATIONS, fourthJobOf, isLate, staleNotice, type Certainty, type Source, type Station } from "@/lib/future/forecast";
import { useStoredProfile } from "@/lib/profile";
import type { FutureCraft, FutureData, FutureNotNow } from "@/lib/types";

const CERTAINTY_CLASS: Record<Certainty, string> = {
  官方: "bg-[color:var(--leaf-wash)] text-[color:var(--leaf)]",
  推估: "bg-[color:var(--gold-wash)] text-[color:var(--gold)]",
  猜測: "bg-[color:var(--sky-wash)] text-[color:var(--sky)]",
};

const nextStation = STATIONS.find(station => station.id === "next") as Station;
const noSubscribe = () => () => {};

/** 現在幾點，對齊到分鐘（每次讀到的值要一樣，不然 React 會一直重畫）。伺服器回 0 不判斷：第一格跟伺服器一樣，不會閃錯的字 */
const nowByMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
function useNow(): number {
  return useSyncExternalStore(noSubscribe, nowByMinute, () => 0);
}

function SourceLinks({ sources }: { sources: Source[] }) {
  return (
    <p className="text-xs leading-relaxed ink-faint">
      依據：
      {sources.map((source, index) => (
        <span key={source.href}>
          {index ? "、" : ""}
          <a href={source.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[color:var(--maple)]">{source.label}</a>
        </span>
      ))}
    </p>
  );
}

/** 一件道具一行：圖、名字＋用途、怎麼拿 */
function ItemRow({ id, name, count, use, how, href }: { id: number; name: string; count?: string; use: string; how: string; href?: string }) {
  const title = (
    <span className="font-bold">
      {name}
      {count ? <span className="font-medium ink-soft"> {count}</span> : null}
    </span>
  );
  return (
    <li className="flex items-center gap-3 border-t border-dashed border-[color:var(--paper-edge)] py-2 first:border-t-0">
      <Image src={itemImage(id)} alt="" width={32} height={32} className="size-8 shrink-0 object-contain [image-rendering:pixelated]" unoptimized />
      <span className="min-w-0 flex-1 text-sm leading-snug">
        {href ? <Link href={href} prefetch={false} className="hover:text-[color:var(--maple)]">{title}</Link> : title}
        <span className="block text-[13px] ink-soft">{use}</span>
        <span className="block text-[13px] font-bold text-[color:var(--maple)]">{how}</span>
      </span>
    </li>
  );
}

function CraftList({ crafts, notNow, itemHrefs }: { crafts: FutureCraft[]; notNow: FutureNotNow[]; itemHrefs: Record<number, string> }) {
  return (
    <div className="rounded-[var(--radius-card)] glass p-4">
      <h3 className="font-black">現在先囤：還沒開的城鎮做裝備要用的材料</h3>
      <p className="mt-1 text-[13px] leading-relaxed ink-soft">遊戲資料裡玩具城、神木村、武陵的配方，用到最多次的材料。練功掉了先別賣。</p>
      <ul className="mt-2">
        {crafts.map(row => (
          <ItemRow key={row.id} id={row.id} name={row.n} use={`${row.recipes} 個配方會用到`} how={row.how.map(how => how.text).join("／")} href={itemHrefs[row.id]} />
        ))}
      </ul>
      {notNow.length ? (
        <p className="mt-2 border-t border-[color:var(--paper-edge)] pt-2 text-[13px] leading-relaxed ink-soft">
          <b className="text-[color:var(--ink)]">現在囤也沒用：</b>{notNow.map(row => row.n).join("、")}，現在開放的地區拿不到。
        </p>
      ) : null}
    </div>
  );
}

function FourthJobCard({ fourthJob, itemHrefs }: { fourthJob: FutureData["fourthJob"]; itemHrefs: Record<number, string> }) {
  const { profile, loaded } = useStoredProfile();
  const mine = loaded ? fourthJobOf(profile.job) : null;
  const [picked, setPicked] = useState<number | null>(null);
  const job = picked ?? mine;
  const needs = job ? fourthJob[String(job)] : undefined;
  return (
    <div className="rounded-[var(--radius-card)] glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black">你的四轉任務會用到</h3>
        <label className="text-[13px] font-bold ink-soft">
          <span className="sr-only">選四轉職業</span>
          <select
            value={job ?? ""}
            onChange={event => setPicked(Number(event.target.value) || null)}
            className="tap-safe rounded-full border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-1.5 text-sm font-bold text-[color:var(--ink)]"
          >
            <option value="">選職業</option>
            {FOURTH_JOBS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed ink-soft">現在的版本還沒有四轉任務，這份是舊版遊戲資料，正式開放可能會改。下面這些現在拿得到，練功碰到可以先留。</p>
      {needs ? (
        <>
          <ul className="mt-2">
            {needs.now.map(row => (
              <ItemRow key={row.id} id={row.id} name={row.n} count={`× ${row.c}`} use={`任務：${row.quests.join("、")}`} how={row.how.map(how => how.text).join("／")} href={itemHrefs[row.id]} />
            ))}
          </ul>
          {needs.later.length ? (
            <p className="mt-2 border-t border-[color:var(--paper-edge)] pt-2 text-[13px] leading-relaxed ink-soft">
              另外還有 {needs.later.length} 樣現在拿不到，等開放再說，例如{needs.later.slice(0, 3).map(row => row.n).join("、")}。
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm ink-soft">選一個四轉職業，看現在就能準備哪些材料。</p>
      )}
    </div>
  );
}

function StationBlock({ station, now, crafts, notNow, fourthJob, itemHrefs }: {
  station: Station;
  now: number;
  crafts: FutureCraft[];
  notNow: FutureNotNow[];
  fourthJob: FutureData["fourthJob"];
  itemHrefs: Record<number, string>;
}) {
  const late = now > 0 && isLate(station, now);
  return (
    <li className="relative pl-6">
      <span aria-hidden="true" className="absolute left-[-7px] top-1.5 size-3 rounded-full bg-[color:var(--maple)]" />
      <div className="space-y-3">
        <header className="space-y-1">
          <p className="text-[15px] font-black text-[color:var(--maple)]">
            {station.when}
            {station.range ? <span className="ml-1.5 text-[13px] font-medium ink-soft">{station.range}</span> : null}
          </p>
          <h2 className="text-lg font-black leading-snug">
            <span className={`mr-2 inline-block rounded-full px-2 py-0.5 align-[2px] text-xs font-bold ${CERTAINTY_CLASS[station.certainty]}`}>{station.certainty}</span>
            {station.title}
          </h2>
          {late ? <p className="text-sm font-bold text-[color:var(--maple)]">已經過了預估時間，官方還沒開放，這一站可能更晚。</p> : null}
          <p className="text-sm leading-relaxed ink-soft">{station.why}</p>
          <SourceLinks sources={station.sources} />
        </header>

        {station.crafts ? <CraftList crafts={crafts} notNow={notNow} itemHrefs={itemHrefs} /> : null}

        {station.prep ? (
          <div className="rounded-[var(--radius-card)] glass p-4">
            <h3 className="font-black">現在先準備</h3>
            <ul className="mt-2">
              {station.prep.map(prep => (
                <ItemRow key={prep.item} id={prep.item} name={prep.name} count={prep.count} use={prep.use} how={prep.how} />
              ))}
            </ul>
            <div className="mt-2"><p className="text-xs ink-faint">用途是 Artale 的做法，台服可能不同。</p><SourceLinks sources={[...new Map(station.prep.map(prep => [prep.source.href, prep.source])).values()]} /></div>
          </div>
        ) : null}

        {station.fourthJob ? <FourthJobCard fourthJob={fourthJob} itemHrefs={itemHrefs} /> : null}

        {station.quests ? (
          <div className="rounded-[var(--radius-card)] glass p-4">
            <h3 className="font-black">開放後的關鍵任務</h3>
            <ul className="mt-2 space-y-2">
              {station.quests.map(quest => (
                <li key={quest.title} className="text-sm leading-relaxed">
                  <b>{quest.title}</b>
                  <span className="block ink-soft">{quest.body}</span>
                  <a href={quest.source.href} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-2 ink-faint">{quest.source.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function FutureView({ crafts, notNow, fourthJob, itemHrefs }: {
  crafts: FutureCraft[];
  notNow: FutureNotNow[];
  fourthJob: FutureData["fourthJob"];
  itemHrefs: Record<number, string>;
}) {
  const now = useNow();
  const stale = now > 0 ? staleNotice(now) : null;
  return (
    <div className="space-y-6 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">未來視</span>
      </nav>

      <header className="space-y-1.5">
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">未來視</h1>
        <p className="text-[15px] leading-relaxed ink-soft">下一版大概什麼時候、會開什麼，現在先把東西準備好。官方還沒公布，下面都是推估，有消息就換掉。常提到的 Artale 是另一個早就開到四轉的經典服，台服不一定照它。</p>
        <p className="text-xs ink-faint">整理於 {FORECAST_UPDATED.replaceAll("-", "/")}</p>
      </header>

      {stale ? <p role="status" className="rounded-[var(--radius-card)] bg-[color:var(--maple-wash)] px-4 py-3 text-sm font-bold text-[color:var(--maple)]">{stale}</p> : null}

      <section aria-label="先看結論" className="rounded-[var(--radius-card)] glass p-4 text-sm leading-relaxed">
        <p><b>下一版：</b>{nextStation.when}，{nextStation.title.replace("下一版：", "")}（{nextStation.certainty}）</p>
        <p><b>現在先留：</b>{crafts.slice(0, 3).map(row => row.n).join("、")}，練功掉了先別賣</p>
        <p><b>別一次囤太多：</b><a href="#h-risk" className="underline underline-offset-2 hover:text-[color:var(--maple)]">別的版本價格跌過、也被鎖過</a></p>
      </section>

      <ol className="ml-1.5 space-y-8 border-l-[3px] border-[color:var(--wood)]">
        {STATIONS.map(station => (
          <StationBlock key={station.id} station={station} now={now} crafts={crafts} notNow={notNow} fourthJob={fourthJob} itemHrefs={itemHrefs} />
        ))}
      </ol>

      <section aria-labelledby="h-risk" className="space-y-3">
        <h2 id="h-risk" className="text-lg font-black">囤之前先想想</h2>
        <p className="text-sm leading-relaxed ink-soft">查不到完整的開放前後價格紀錄，所以這頁不寫會漲多少。別的版本發生過這些事：</p>
        <ul className="space-y-2">
          {RISKS.map(risk => (
            <li key={risk.title} className="rounded-[var(--radius-card)] glass p-4 text-sm leading-relaxed">
              <b>{risk.title}</b>
              <span className="block ink-soft">{risk.body}</span>
              <a href={risk.source.href} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-2 ink-faint">{risk.source.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-how" className="space-y-3">
        <h2 id="h-how" className="text-lg font-black">時間怎麼算的</h2>
        <p className="text-sm leading-relaxed ink-soft">開服之後過多久開。Artale 開服就有的內容多，只能看大概。</p>
        <div className="scroll-x rounded-[var(--radius-card)] glass p-3">
          <table className="w-full min-w-[340px] text-left text-[13px]">
            <thead className="ink-soft">
              <tr><th className="py-1 pr-2 font-bold">內容</th><th className="py-1 pr-2 font-bold">2005 台服</th><th className="py-1 pr-2 font-bold">Artale</th><th className="py-1 font-bold">這裡</th></tr>
            </thead>
            <tbody>
              {COMPARE.map(row => (
                <tr key={row.what} className="border-t border-[color:var(--paper-edge)]">
                  <td className="py-1.5 pr-2 font-bold">{row.what}</td><td className="py-1.5 pr-2">{row.old}</td><td className="py-1.5 pr-2">{row.artale}</td><td className="py-1.5 font-bold">{row.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceLinks sources={COMPARE_SOURCES} />
      </section>
    </div>
  );
}

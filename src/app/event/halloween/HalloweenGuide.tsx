"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "@/components/Icons";
import { itemImage, monsterImage, npcImage } from "@/lib/data";
import { HALLOWEEN, halloweenChapterFor, type HalloweenChapter, type HalloweenHunt, type HalloweenNpc } from "@/lib/halloween";

/** 打勾記在這支裝置（localStorage）：活動做好幾天，關掉分頁還要在 */
const DONE_KEY = "ms-event:halloween:done";

function readDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function HalloweenGuide() {
  const [chapterNo, setChapterNo] = useState<1 | 2 | 3>(() => halloweenChapterFor(Date.now()));
  const [done, setDone] = useState<Record<string, boolean>>({});

  // 讀本機儲存要在 effect 裡（不然跟伺服器畫出來的不一樣）；#ch1～#ch3 的連結直接開那一章
  useEffect(() => {
    setDone(readDone());
    const fromHash = () => {
      const no = /^#ch([123])$/.exec(location.hash)?.[1];
      if (no) setChapterNo(Number(no) as 1 | 2 | 3);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const toggle = (id: string, value: boolean) => {
    setDone(prev => {
      const next = { ...prev, [id]: value };
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        // 寫不進去（隱私模式）就只記這次
      }
      return next;
    });
  };

  const chapter = HALLOWEEN.chapters[chapterNo - 1];
  const steps = chapter.legs.flatMap(leg => leg.steps);
  const doneCount = steps.filter(s => done[s.id]).length;

  return (
    <div className="space-y-6 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">萬聖節攻略</span>
      </nav>

      <header className="space-y-1.5">
        <p className="text-xs font-bold tracking-[0.12em] text-[color:var(--maple)]">雪原的面具祭典 · 到 11/11 23:59</p>
        <h1 className="text-[26px] font-black tracking-tight [text-wrap:balance] sm:text-[32px]">萬聖節任務攻略</h1>
        <p className="text-[15px] leading-relaxed ink-soft">三章照順序列好，要打的怪附地圖，做完一段打一個勾。</p>
      </header>

      <Dailies />

      <div role="tablist" aria-label="章節" className="grid grid-cols-3 gap-2">
        {HALLOWEEN.chapters.map(c => (
          <button
            key={c.no}
            type="button"
            role="tab"
            id={`tab-ch${c.no}`}
            aria-selected={c.no === chapterNo}
            aria-controls="chapter-panel"
            onClick={() => {
              setChapterNo(c.no);
              history.replaceState(history.state, "", `#ch${c.no}`);
            }}
            className={[
              "tap-safe rounded-xl px-2 py-2 text-center text-sm font-bold leading-tight",
              c.no === chapterNo
                ? "bg-[color:var(--maple)] text-[color:var(--on-accent)] shadow-sm"
                : "glass text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]",
            ].join(" ")}
          >
            第{"一二三"[c.no - 1]}章
            <span className="block text-[11px] font-medium opacity-85">Lv.{c.level}・{c.opens.slice(5, 7).replace(/^0/, "")}/{c.opens.slice(8, 10)} 起</span>
          </button>
        ))}
      </div>

      <section id="chapter-panel" role="tabpanel" aria-labelledby={`tab-ch${chapterNo}`} className="space-y-6">
        <ChapterHead chapter={chapter} total={steps.length} />

        {chapter.hunts.length ? (
          <section aria-labelledby="h-hunt" className="space-y-3">
            <h2 id="h-hunt" className="text-lg font-black">要打的怪、去哪打</h2>
            {chapter.hunts.map(hunt => (
              <HuntCard key={hunt.questId} hunt={hunt} no={steps.findIndex(s => s.id === hunt.questId) + 1} name={steps.find(s => s.id === hunt.questId)?.name ?? ""} />
            ))}
          </section>
        ) : null}

        <section aria-labelledby="h-route" className="space-y-4">
          <h2 id="h-route" className="text-lg font-black">完整路線（{steps.length} 段）</h2>
          <div className="sticky top-[var(--header-offset)] z-[5] transition-[top] duration-200 ease-out flex items-center gap-3 bg-[color:var(--paper)] py-2">
            <span className="text-sm font-bold tabular-nums">{doneCount} / {steps.length}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--paper-edge)]">
              <span className="block h-full rounded-full bg-[color:var(--leaf)]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </span>
            <button
              type="button"
              className="tap-safe rounded-full border border-[color:var(--paper-edge)] px-3 py-1 text-[13px] font-bold ink-soft"
              onClick={() => {
                const next = steps.find(s => !done[s.id]);
                if (next) document.getElementById(`step-${next.id}`)?.scrollIntoView({ behavior: "instant", block: "center" });
              }}
            >
              下一段
            </button>
          </div>
          {chapter.legs.map(leg => (
            <div key={leg.title} className="space-y-2">
              <div className="border-b-2 border-[color:var(--paper-edge)] pb-1.5">
                <h3 className="font-black">{leg.title}</h3>
                <p className="text-[13px] font-bold text-[color:var(--sky)]">{leg.place}</p>
              </div>
              <ol className="space-y-2">
                {leg.steps.map(s => {
                  const no = steps.indexOf(s) + 1;
                  const checked = Boolean(done[s.id]);
                  return (
                    <li
                      key={s.id}
                      id={`step-${s.id}`}
                      className={[
                        "flex scroll-mt-32 gap-3 rounded-xl border bg-[color:var(--glass-strong)] px-3 py-2.5",
                        s.hunt ? "border-[color:var(--maple-soft)]" : "border-[color:var(--paper-edge)]",
                        checked ? "opacity-55" : "",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        id={`done-${s.id}`}
                        checked={checked}
                        onChange={event => toggle(s.id, event.target.checked)}
                        className="mt-0.5 size-[22px] shrink-0 accent-[color:var(--leaf)]"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <label htmlFor={`done-${s.id}`} className="flex flex-wrap items-baseline gap-x-2 font-bold">
                          <span className={checked ? "line-through" : ""}>{s.name}</span>
                          <span className="text-[13px] font-medium ink-faint tabular-nums">第 {no} 段</span>
                          {s.daily ? <span className="rounded bg-[color:var(--gold-wash)] px-1.5 text-xs text-[color:var(--gold)]">每日</span> : null}
                          {s.hunt ? (
                            <a href={`#hunt-${s.id}`} className="rounded border border-current px-1.5 text-xs text-[color:var(--maple)]">
                              打怪：看去哪打
                            </a>
                          ) : null}
                        </label>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ink-soft">
                          <NpcChip label="接" npc={s.from} />
                          {s.to ? (
                            <>
                              <span aria-hidden="true">→</span>
                              <NpcChip label="交" npc={s.to} />
                            </>
                          ) : (
                            <span>不用交</span>
                          )}
                        </p>
                        <p className="text-sm leading-relaxed">{s.what}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>

        <section aria-labelledby="h-unsure" className="space-y-2 rounded-[var(--radius-card)] glass px-4 py-3.5">
          <h2 id="h-unsure" className="font-black">還不確定的地方</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed ink-soft">
            {chapter.unsure.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </section>

      <p className="text-[13px] leading-relaxed ink-faint">
        任務順序、要交的東西照遊戲資料；怪在哪張圖、幾隻用楓谷幫手的怪物資料。第三章行李、粉末、筋腱是實際玩過確認的。打勾只存在這支裝置。
      </p>
    </div>
  );
}

function ChapterHead({ chapter, total }: { chapter: HalloweenChapter; total: number }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-black [text-wrap:balance]">{chapter.title}</h2>
      <p className="text-sm ink-soft">
        Lv.{chapter.level} 以上・{total} 段・打怪 {chapter.hunts.length} 段，其他都是跑腿對話
      </p>
      {chapter.no === 3 ? (
        <p className="rounded-xl bg-[color:var(--maple-wash)] px-3 py-2 text-sm leading-relaxed">
          <b className="text-[color:var(--maple)]">先看這句：</b>第 14 段要打 55～58 等的狼，這段沒交，後面 12 段都接不到。40 出頭打不動就找高等朋友帶。
        </p>
      ) : null}
      <ul className="space-y-1 rounded-xl glass px-3 py-2 text-sm leading-relaxed">
        {chapter.rewards.map(line => (
          <li key={line}>
            <b className="text-[color:var(--maple)]">獎勵</b>　{line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NpcChip({ label, npc }: { label: string; npc: HalloweenNpc }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      <Image src={npcImage(npc.npc)} alt="" width={26} height={26} className="size-[26px] rounded-full bg-[#ece3d3] object-contain" unoptimized />
      <span className="font-bold text-[color:var(--ink)]">{npc.name}</span>
      <span className="text-xs ink-faint">{npc.place}</span>
    </span>
  );
}

function HuntCard({ hunt, no, name }: { hunt: HalloweenHunt; no: number; name: string }) {
  return (
    <article id={`hunt-${hunt.questId}`} className="space-y-3 rounded-[var(--radius-card)] glass px-4 py-3.5 scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-black">
          第 {no} 段　{name}
        </h3>
        <span className="text-[13px] ink-faint">{hunt.giver}給的</span>
      </div>
      <ul className="space-y-1.5">
        {hunt.needs.map(need => (
          <li key={`${need.kind}${need.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <Image
              src={need.kind === "mob" ? monsterImage(need.id) : itemImage(need.id)}
              alt=""
              width={40}
              height={32}
              className="h-8 w-10 object-contain [image-rendering:pixelated]"
              unoptimized
            />
            <b>{need.name}</b>
            {need.level ? <span className="text-xs ink-faint">Lv.{need.level}</span> : null}
            {need.count ? <b className="text-[color:var(--maple)] tabular-nums">× {need.count}</b> : null}
            {need.from ? <span className="ink-soft">：{need.from}</span> : null}
          </li>
        ))}
      </ul>
      {hunt.maps.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {hunt.maps.map(map => (
            <figure key={map.id} className="space-y-1">
              <Image
                src={`/${map.image ?? `minimaps/${map.id}.png`}`}
                alt={`${map.name}小地圖`}
                width={map.image ? 591 : 240}
                height={map.image ? 282 : 110}
                className="h-auto max-h-[150px] w-auto max-w-full rounded-lg border border-[color:var(--paper-edge)] bg-[#0b1320] [image-rendering:pixelated]"
                unoptimized
              />
              <figcaption className="text-[13px]">
                <b>{map.name}</b>
                <span className="block ink-soft">{map.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      <p className="rounded-xl bg-[color:var(--maple-wash)] px-3 py-2 text-sm leading-relaxed">{hunt.tip}</p>
      <a href={`#step-${hunt.questId}`} className="inline-block text-[13px] font-bold text-[color:var(--sky)] hover:underline">
        回到路線第 {no} 段
      </a>
    </article>
  );
}

function Dailies() {
  return (
    <details className="group rounded-[var(--radius-card)] glass px-4 py-3">
      <summary className="tap-safe flex cursor-pointer list-none items-center justify-between gap-2 font-black">
        <span>
          每天要做的兩個
          <span className="block text-[13px] font-medium ink-soft">打狼人、交燃料，拿萬聖節硬幣跟禮物箱</span>
        </span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2">
      <ul className="space-y-2 text-sm leading-relaxed">
        {HALLOWEEN.dailies.map(daily => (
          <li key={daily.name}>
            <b>{daily.name}</b>
            <span className="ink-faint">（{daily.unlock}後開放）</span>
            <span className="block">{daily.what}</span>
            <span className="block text-[color:var(--maple)]">拿：{daily.reward}</span>
          </li>
        ))}
      </ul>
      <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed ink-soft">
        {HALLOWEEN.dailyNotes.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      </div>
    </details>
  );
}

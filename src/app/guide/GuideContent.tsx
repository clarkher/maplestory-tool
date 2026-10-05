"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ChevronDown, ChevronRight } from "@/components/Icons";
import { GoButton } from "@/components/PlanShell";
import { monsterImage } from "@/lib/data";
import {
  COMMON_ROUTE, GUIDE_SOURCES, GUIDE_UPDATED_AT, JOB_GUIDES, type GuideStep, type JobGuide,
} from "@/lib/guide-data";
import {
  KpqAnswerTable, KpqBarrelDiagram, MoonBunnySeedDiagram, PqEntryBanner, PqStageList,
} from "./PqVisuals";

export function GuideContent() {
  const [job, setJob] = useState<string>("warrior");
  const current = JOB_GUIDES.find(entry => entry.key === job) ?? JOB_GUIDES[0];

  return (
    <div className="space-y-6 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">1–30 懶人包</span>
      </nav>

      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">1–30 懶人包</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed ink-soft">
          網路攻略整理成一條路：<strong className="text-[color:var(--ink)]">
          新手任務 → 轉職 → 月妙刷到 21 → 超綠刷到 30</strong>。
          選你的職業，看轉職去哪、點什麼技能，每一站都能直接導航。
        </p>
        <p className="mt-1.5 text-xs ink-faint">
          彙整自巴哈姆特、波波攻略島等社群攻略（出處在頁尾）· 更新於 {GUIDE_UPDATED_AT}
        </p>
      </header>

      <section aria-label="選擇職業" className="space-y-3">
        <div className="scroll-x -mx-1 flex gap-1.5 px-1">
          {JOB_GUIDES.map(entry => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setJob(entry.key)}
              aria-pressed={entry.key === job}
              className={[
                "tap-safe shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors",
                entry.key === job
                  ? "bg-[color:var(--maple)] text-white shadow-sm"
                  : "glass wood-frame hover:bg-[color:var(--maple-wash)]",
              ].join(" ")}
            >
              {entry.name}
            </button>
          ))}
        </div>

        <JobCard guide={current} />
      </section>

      <section aria-label="路線" className="space-y-2.5">
        <h2 className="px-1 text-[15px] font-black">共通路線（五個職業都一樣）</h2>
        <ol className="space-y-2">
          {COMMON_ROUTE.map((step, index) => (
            <StepCard key={index} step={step} index={index} total={COMMON_ROUTE.length} jobKey={current.key} />
          ))}
        </ol>
      </section>

      <section className="rounded-[var(--radius-card)] glass wood-frame p-4">
        <h2 className="mb-2 text-[15px] font-black">出處</h2>
        <p className="mb-2 text-[13px] leading-relaxed ink-soft">
          這頁是社群攻略的整理，不是本站從遊戲資料推導的。標
          <span className="mx-1 rounded-full bg-[color:var(--leaf-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--leaf)]">台服實測</span>
          的是經典版上線後社群實際驗證過的；標
          <span className="mx-1 rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[11px] font-bold ink-soft">舊版經驗</span>
          的是沿用 2005 年代舊版的通識，實際數字以遊戲內為準。
        </p>
        <ul className="space-y-1">
          {GUIDE_SOURCES.map(source => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-bold text-[color:var(--sky)] hover:underline"
              >
                {source.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** 月妙圖解：入口 → 種子位置圖 → 三步流程 → 年糕帽提示 */
function MoonBunnyGuide() {
  return (
    <div className="space-y-3">
      <PqEntryBanner
        npcId={1012112}
        npcName="達爾利"
        place="邱比特公園"
        party="3~6 人"
        exp="1,600 經驗／場"
        time="熟練約 2.5~4.5 分鐘"
      />
      <PqStageList
        stages={[
          { n: "1", title: "打花草怪收種子", text: "地圖下方敲花草怪，掉六種顏色的種子。" },
          { n: "2", title: "照位置種種子", text: "六個平台各有指定顏色，照下面這張圖種。" },
        ]}
      />
      <MoonBunnySeedDiagram />
      <PqStageList
        stages={[
          { n: "3", title: "保護月妙搗年糕", text: "月妙被怪打到會停下來哭、不搗年糕——這是最常見的失敗原因。清好周圍的怪，搗滿 10 個。", npcId: 1012114, npcName: "興兒" },
          { n: "4", title: "交年糕給興兒", text: "拿 10 個年糕給地圖下方的老虎興兒，結算 1,600 經驗。" },
        ]}
      />
      <p className="rounded-xl bg-[color:var(--sky-wash)] px-3 py-2 text-[13px] leading-relaxed">
        累積 20 個年糕可以換「頭頂上的一個年糕」帽子（+50 HP）。
        組隊訣竅：頻道 1 揪人、組好一起換頻道，避開排隊人潮。
      </p>
    </div>
  );
}

/** 超綠圖解：入口 → 五關流程（含每關經驗）→ 答題表 → 跳桶圖 → 注意事項 */
function KpqGuide() {
  return (
    <div className="space-y-3">
      <PqEntryBanner
        npcId={9020000}
        npcName="拉克里斯"
        place="墮落城市"
        party="4 人（全隊 21~30 等）"
        exp="4,800 經驗／場"
        time="建議 25 等後再下場"
      />
      <PqStageList
        stages={[
          { n: "1", title: "打鱷魚收優惠券＋答題", text: "依克魯特的題目繳對應張數的優惠券，對照表在下面。", exp: 700 },
          { n: "2", title: "爬繩找組合", text: "三人各找一條繩子爬上去；錯了就順時針輪到隔壁的空繩再試。", exp: 300 },
          { n: "3", title: "站平台找組合", text: "跟爬繩同邏輯，每人一輪移動兩次逐步排除。", exp: 500 },
          { n: "4", title: "跳木桶", text: "三人站上正確的三個桶。照下面的金字塔圖與順序試。", exp: 800 },
          { n: "5", title: "王關：超級綠水靈", text: "清完小怪打王。需要 10 張票券。", exp: 2500 },
        ]}
      />
      <KpqAnswerTable />
      <KpqBarrelDiagram />
      <div className="space-y-1.5 rounded-xl bg-[color:var(--maple-wash)] px-3 py-2.5 text-[13px] leading-relaxed">
        <p className="font-bold text-[color:var(--maple)]">三件會翻車的事</p>
        <p>死亡會吞掉身上的優惠券——進王關前先把券丟在地上。</p>
        <p>王關 BOSS 有機率掉「黏稠稠鞋子」（浮動素質），不是通關必得，同隊先講好分配。</p>
        <p>板上有「超綠不收劍士」的風氣（打飛行怪吃命中，無官方限制）——被拒收就找只刷第一關的逃課團。</p>
      </div>
    </div>
  );
}

function JobCard({ guide }: { guide: JobGuide }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-[color:var(--gold-wash)] p-3">
          <p className="text-[11px] font-bold ink-faint">轉職（{guide.advancement.level}）</p>
          <p className="mt-1 font-bold leading-relaxed">
            {guide.advancement.place} 找 <span className="text-[color:var(--gold)]">{guide.advancement.npc}</span>
          </p>
          <p className="mt-0.5 text-[13px] ink-soft">素質門檻：{guide.advancement.stat}</p>
          {guide.advancement.mapId ? (
            <div className="mt-2">
              <GoButton to={guide.advancement.mapId} label="帶我去轉職" />
            </div>
          ) : null}
        </div>
        <div className="rounded-xl bg-[color:var(--paper-deep)] p-3">
          <p className="text-[11px] font-bold ink-faint">素質配點</p>
          <p className="mt-1 text-[14px] leading-relaxed">{guide.build}</p>
        </div>
      </div>

      <div className="rounded-xl bg-[color:var(--paper-deep)] p-3">
        <p className="text-[11px] font-bold ink-faint">一轉技能加點順序</p>
        <p className="mt-1 text-[14px] leading-relaxed">{guide.skills}</p>
      </div>

      {guide.notes ? (
        <p className="rounded-xl bg-[color:var(--sky-wash)] px-3 py-2.5 text-[13px] leading-relaxed">
          {guide.notes}
        </p>
      ) : null}
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  jobKey,
}: {
  step: GuideStep;
  index: number;
  total: number;
  jobKey: string;
}) {
  const [open, setOpen] = useState(index === 0);
  // 法師 8 等轉職，出島那步對法師顯示不同重點；其他步驟共通
  void jobKey;
  // 組隊任務的段落有固定的 id（#pq-moon、#pq-kerning），首頁的「看打法」跳過來時直接展開
  const anchor = step.pq ? `pq-${step.pq}` : undefined;
  useEffect(() => {
    if (anchor && window.location.hash === `#${anchor}`) setOpen(true);
  }, [anchor]);

  return (
    <li id={anchor} className="scroll-mt-20 overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="tap-safe flex w-full items-center gap-3 p-3.5 text-left sm:p-4"
      >
        <span className="flex shrink-0 flex-col items-center">
          <span
            className="grid size-9 place-items-center rounded-full text-sm font-black tabular-nums"
            style={{
              backgroundColor: index === total - 1 ? "var(--maple)" : "var(--leaf-wash)",
              color: index === total - 1 ? "#fff" : "var(--leaf)",
            }}
          >
            {index + 1}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[11px] font-bold tabular-nums ink-soft">
              Lv.{step.range}
            </span>
            <span className="text-[16px] font-black leading-tight">{step.title}</span>
            {step.verified === "tw" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--leaf-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--leaf)]">
                <CheckIcon size={11} />
                台服實測
              </span>
            ) : (
              <span className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[11px] font-bold ink-soft">
                舊版經驗
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm leading-relaxed ink-soft">{step.what}</span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[color:var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]/50 p-3.5">
          {step.pq === "moon" ? <MoonBunnyGuide /> : null}
          {step.pq === "kerning" ? <KpqGuide /> : null}
          {step.detail ? (
            <p className="text-sm leading-relaxed">{step.detail}</p>
          ) : null}

          {step.mobs?.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {step.mobs.map(mob => (
                <li key={mob.id}>
                  <Link
                    href={`/db/monsters?id=${mob.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[color:var(--maple-wash)]"
                  >
                    <Image src={monsterImage(mob.id)} alt="" width={22} height={22} className="size-[22px] object-contain" unoptimized />
                    <span className="text-[13px] font-bold">{mob.name}</span>
                    <span className="text-[11px] tabular-nums ink-faint">Lv{mob.lv}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {step.mapId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] ink-soft">{step.mapName}</span>
              <GoButton to={step.mapId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

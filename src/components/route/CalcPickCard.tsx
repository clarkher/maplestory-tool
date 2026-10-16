"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GoButton } from "@/components/PlanShell";
import { useBuildChoice } from "@/lib/build-choice";
import { AOE_TIERS, calcPick, goalText, type CalcPick, type CalcPickRow } from "@/lib/calc-pick";
import { HEAL } from "@/lib/damage-skills";
import { loadGear, loadSkills, mapName, monsterImage, peekGear, peekSkills } from "@/lib/data";
import { tenMinuteText } from "@/lib/damage-view";
import { isMagicJob, type GearData } from "@/lib/gear";
import type { HomeData } from "@/lib/home-data";
import { useBeforeV002 } from "@/lib/release";
import { boatText } from "@/lib/route";
import { sessionMemo } from "@/lib/session-memo";
import type { GuideJob, Skill } from "@/lib/types";
import { Chip, Sprite } from "./bits";

/** 群體三段的總範圍，寫成「2～5」 */
const AOE_RANGE = `${AOE_TIERS[0][0]}～${AOE_TIERS[AOE_TIERS.length - 1][1]}`;

/** 找不到圖時寫要找的是哪一種圖：「雙飛斬兩下打得死的練功圖」「群體治癒約 2～5 下打得死的不死系練功圖」 */
function goalPhrase(pick: CalcPick): string {
  if (pick.mode === "aoe") return `${pick.skillName}約 ${AOE_RANGE} 下打得死的${pick.skillId === HEAL ? "不死系" : ""}練功圖`;
  return `${pick.skillName}兩下打得死的練功圖`;
}

/** 最下面小字寫找的是哪種怪（跟上面每一行對得上：穩穩兩下補位、群體治癒照範圍內 1 隻算都寫出來） */
function goalNote(pick: CalcPick): string {
  if (pick.mode === "single") return "單體攻擊推三隻：先放差一點兩下打得死的，不夠再用穩穩兩下的補";
  const tiers = AOE_TIERS.map(([from, to]) => `${from}～${to}`).join("、");
  if (pick.skillId === HEAL) return `群體治癒照範圍內只有 1 隻算（怪多每隻分到的會變少），${tiers} 下打得死的不死系各推一隻`;
  return `${pick.skillName}一次打好幾隻，${tiers} 下打得死的怪各推一隻`;
}

/** 卡上的一行：段落標籤、怪、地圖、怎麼打、10 分鐘經驗、去 */
function Row({ row, pick, level, maps }: { row: CalcPickRow; pick: CalcPick; level: number; maps: HomeData["maps"] }) {
  const option = row.option;
  return (
    <li className="flex items-center gap-2.5 border-t border-[color:var(--paper-edge)] pt-2.5 first:border-0 first:pt-0">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
        {option ? <Sprite src={monsterImage(option.lead.id)} size={40} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-black text-[color:var(--maple)]">{row.label}</p>
        {option ? (
          <>
            <p className="text-[15px] font-black leading-tight">{option.title}</p>
            <p className="text-[12px] ink-soft">
              {option.lead.n} Lv{option.lead.lv ?? "?"}×{option.mobs[0]?.[1] ?? 0}・{goalText({ ...pick, goal: row.goal }, option.kills)}
            </p>
            {option.tenMinute ? <p className="text-[12px] font-bold text-[color:var(--leaf)]">{tenMinuteText(option.tenMinute, level)}</p> : null}
            {option.hops && option.town ? <p className="text-[11px] ink-faint">從{mapName(maps, option.town)}走 {option.hops} 張圖{option.boat ? `（${boatText(option.town, maps)}）` : ""}</p> : null}
          </>
        ) : (
          <p className="text-[13px] ink-soft">這個等級沒有合適的圖</p>
        )}
      </div>
      {option ? <GoButton to={option.map} label="去" /> : null}
    </li>
  );
}

type Extra = { gear: GearData; skillList: Skill[] };

/** 這次瀏覽已經載過技能表跟裝備表（站內換頁回首頁）就直接拿，第一格就是整張卡 */
function peekExtra(): Extra | null {
  const gear = peekGear();
  const skillList = peekSkills();
  return gear && skillList ? { gear, skillList } : null;
}

/**
 * 首頁「照傷害算的推薦」（v0.92，使用者拍板 1A：主推卡下面多一張，攻略推薦照舊）。
 * 自己載技能表跟裝備表（首頁原本不載技能檔），載不到只影響這張卡；計算在 lib/calc-pick.ts，
 * 算過的記在這次瀏覽裡（session-memo），換頁回來不重算。第一次載的時候放一個差不多高的骨架，下面的卡不會被往下推。
 */
export function CalcPickCard({ job, level, home, guides, guideStatus }: {
  job: number;
  level: number;
  home: HomeData;
  /** 這條職業線的攻略（技能點法要用來估技能等級） */
  guides: Map<number, GuideJob>;
  /** 攻略還在載就先放骨架；載不到就不出這張卡（技能等級會被當成最高等級，數字不可信） */
  guideStatus: "loading" | "ready" | "failed";
}) {
  const beforeOpen = useBeforeV002();
  const [buildTab] = useBuildChoice(Math.max(job, 0));
  const [extra, setExtra] = useState<Extra | null>(peekExtra);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (extra) return;
    let cancelled = false;
    Promise.all([loadGear(), loadSkills()])
      .then(([gear, skillList]) => {
        if (!cancelled) setExtra({ gear, skillList });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [extra]);

  // 換頁回來 guides 會是新的 Map，依賴用裡面的攻略本身（同一份就不重算）
  const guideList = useMemo(() => [...guides.entries()].sort((a, b) => a[0] - b[0]), [guides]);
  const pick = useMemo(() => {
    if (!extra || guideStatus !== "ready") return undefined;
    const deps = [calcPick, extra.gear, extra.skillList, home.monsters, home.maps, home.training, home.common, home.graph, home.nearestTown, beforeOpen, job, level, buildTab, ...guideList.flat()];
    return sessionMemo("home:calc-pick", deps, () =>
      calcPick({
        data: {
          gear: extra.gear,
          skills: new Map(extra.skillList.map(skill => [skill.id, skill])),
          guides: Object.fromEntries(guideList),
          monsters: home.monsters,
          maps: home.maps,
          training: home.training,
          expToNext: home.common.expTable.toNext,
          beforeOpen,
        },
        job,
        level,
        buildTab,
        graph: home.graph,
        nearestTown: home.nearestTown,
      }),
    );
  }, [extra, guideStatus, guideList, home, beforeOpen, job, level, buildTab]);

  // 算不出來（初心者、還沒點攻擊技能、攻略載不到）不出這張卡
  if (pick === null || guideStatus === "failed") return null;
  if (failed) {
    return <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">傷害資料讀取失敗，「照傷害算的推薦」先不顯示；上面的推薦不受影響。</p>;
  }
  if (pick === undefined) {
    return (
      <section aria-label="照傷害算的推薦" aria-busy="true" className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
        <h2 className="text-[15px] font-black">照傷害算的推薦</h2>
        <div className="mt-2.5 h-[16.5rem] animate-pulse rounded-xl bg-[color:var(--paper-deep)]" />
        <p className="mt-2 text-[12px] ink-faint">算你打得動的怪…</p>
      </section>
    );
  }

  return (
    <section aria-label="照傷害算的推薦" className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-[15px] font-black">照傷害算的推薦</h2>
        <Chip tone="gold">舊版公式，台服沒驗證</Chip>
      </header>
      {pick.options.length ? (
        <ul className="mt-2.5 space-y-2.5">
          {pick.rows.map(row => <Row key={row.label + (row.option?.map ?? "")} row={row} pick={pick} level={level} maps={home.maps} />)}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] ink-soft">照你的傷害，這個等級找不到{goalPhrase(pick)}，先照上面的推薦練。</p>
      )}
      <p className="mt-2.5 text-[11px] leading-relaxed ink-faint">
        假設{pick.weapon.n}衝 {pick.plus} 張 100% 卷（{isMagicJob(job) ? "魔攻" : "攻擊"} +{pick.plus}）、能力值照「能力值與裝備」的點法；{goalNote(pick)}。
        <Link href="/plan/damage" className="ml-1 font-bold text-[color:var(--sky)]">用傷害計算機算自己的</Link>
      </p>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RouteIcon } from "@/components/Icons";
import { useBuildChoice } from "@/lib/build-choice";
import { calcPick, goalText, type CalcPick } from "@/lib/calc-pick";
import { HEAL } from "@/lib/damage-skills";
import { loadGear, loadSkills, mapName, monsterImage } from "@/lib/data";
import { tenMinuteText } from "@/lib/damage-view";
import { formatNumber } from "@/lib/format";
import { isMagicJob, type GearData } from "@/lib/gear";
import type { HomeData } from "@/lib/home-data";
import { useBeforeV002 } from "@/lib/release";
import type { GuideJob, Skill } from "@/lib/types";
import { Chip, Sprite } from "./bits";

/** 找不到圖時寫要找的是哪一種怪 */
function goalPhrase(pick: CalcPick): string {
  if (pick.mode === "aoe") return `${pick.skillName}約 5～6 下打死${pick.skillId === HEAL ? "的不死系" : ""}`;
  return `${pick.skillName}兩下打得死`;
}

/**
 * 首頁「照傷害算的推薦」（v0.92，使用者拍板 1A：主推卡下面多一張，攻略推薦照舊）。
 * 自己載技能表跟裝備表（首頁原本不載技能檔），載不到只影響這張卡；計算在 lib/calc-pick.ts。
 */
export function CalcPickCard({ job, level, home, guides, guidesReady }: {
  job: number;
  level: number;
  home: HomeData;
  /** 這條職業線的攻略（技能點法要用來估技能等級） */
  guides: Map<number, GuideJob>;
  /** 攻略載完才算（還在載就先等，免得先用技能最高等級算一次又換掉） */
  guidesReady: boolean;
}) {
  const beforeOpen = useBeforeV002();
  const [buildTab] = useBuildChoice(Math.max(job, 0));
  const [extra, setExtra] = useState<{ gear: GearData; skills: Map<number, Skill> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGear(), loadSkills()])
      .then(([gear, skills]) => {
        if (!cancelled) setExtra({ gear, skills: new Map(skills.map(skill => [skill.id, skill])) });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = useMemo(() => {
    if (!extra || !guidesReady) return undefined;
    return calcPick({
      data: {
        gear: extra.gear,
        skills: extra.skills,
        guides: Object.fromEntries(guides),
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
    });
  }, [extra, guidesReady, guides, home, beforeOpen, job, level, buildTab]);

  if (pick === null) return null;
  const option = pick?.options[0];
  const others = pick?.options.slice(1) ?? [];
  const record = option ? home.maps[String(option.map)] : undefined;

  return (
    <section aria-label="照傷害算的推薦" className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-[15px] font-black">照傷害算的推薦</h2>
        <Chip tone="gold">舊版公式，台服沒驗證</Chip>
      </header>
      {failed ? <p className="mt-2 text-[13px] ink-soft">傷害資料讀取失敗，重新整理一次試試。上面的推薦不受影響。</p> : null}
      {!failed && pick === undefined ? <p className="mt-2 text-[13px] ink-faint">算你打得動的怪…</p> : null}
      {pick && option ? (
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
              <Sprite src={monsterImage(option.lead.id)} size={44} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[18px] font-black leading-tight">{option.title}</h3>
              <p className="text-[13px] ink-soft">
                {[record?.st, `${option.lead.n} Lv${option.lead.lv ?? "?"}×${option.mobs[0]?.[1] ?? 0}`].filter(Boolean).join("・")}
              </p>
            </div>
          </div>
          <p className="text-[14px] font-bold">{goalText(pick, option.kills)}</p>
          {option.tenMinute ? <p className="text-[13px] font-bold text-[color:var(--leaf)]">{tenMinuteText(option.tenMinute, level)}</p> : null}
          <p className="text-[12px] ink-soft">
            清一輪 {formatNumber(option.row.exp1)} 經驗・{option.row.sp} 隻怪
            {option.hops && option.town ? `・從${mapName(home.maps, option.town)}走 ${option.hops} 張圖${option.boat ? "（要搭船或搭車過去）" : ""}` : null}
          </p>
          <Link
            href={`/go?to=${option.map}`}
            className="tap-safe flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--sky)] text-[14px] font-bold text-[color:var(--sky)]"
          >
            <RouteIcon size={16} />
            帶我去 {option.title}
          </Link>
          {others.length ? (
            <p className="text-center text-[13px]">
              <span className="ink-faint">差不多的：</span>
              <b>{others.map(other => other.title).join("、")}</b>
            </p>
          ) : null}
        </div>
      ) : null}
      {pick && !option ? <p className="mt-2 text-[13px] ink-soft">照你的傷害，這個等級找不到{goalPhrase(pick)}的練功圖，先照上面的推薦練。</p> : null}
      {pick ? (
        <p className="mt-2.5 text-[11px] leading-relaxed ink-faint">
          假設{pick.weapon.n}衝 {pick.plus} 張 100% 卷（{isMagicJob(job) ? "魔攻" : "攻擊"} +{pick.plus}）、能力值照「能力值與裝備」的點法；
          {pick.mode === "single" ? "單體攻擊找差一點兩下打得死的怪" : `${pick.skillName}一次打好幾隻，找 5～6 下打得死的怪`}。
          <Link href="/plan/damage" className="ml-1 font-bold text-[color:var(--sky)]">用傷害計算機算自己的</Link>
        </p>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { loadSkills, peekSkills } from "@/lib/data";
import { skillJobGroups, stageJob } from "@/lib/jobs";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import { changedParts, reachableLevel, reachText, skillEffect, skillIcon, skillLevels } from "@/lib/skill-view";
import type { Skill } from "@/lib/types";
import { isV002Skill } from "@/lib/v002";

export function SkillDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [skills, setSkills] = useState<Skill[] | null>(peekSkills);
  const [error, setError] = useState<string | null>(null);
  // "" 是全部職業，其餘存職業代碼的字串（跟 <select> value 同型，比對時不用再轉數字）。
  // null 是還沒自己選過：存了角色就先篩你現在這一轉的職業（Lv.50 選了龍騎士 → 槍騎兵），沒存就全部（v0.78）
  const [chosenJob, setChosenJob] = useRemembered<string | null>("db:技能:job", null);
  const { profile, isComplete } = useStoredProfile();
  const jobFilter = chosenJob ?? (isComplete ? String(stageJob(profile.job, profile.level)) : "");
  const notOpenYet = useBeforeV002();

  useEffect(() => {
    loadSkills().then(setSkills).catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const skillIndex = useMemo(
    () => new Map((skills ?? []).map(skill => [String(skill.id), skill])),
    [skills],
  );
  // 卡片算「你點得到第幾級」時找所需技能用
  const findSkill = useCallback((id: number) => skillIndex.get(String(id)), [skillIndex]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!skills) return [];
    return skills
      .filter(skill => !jobFilter || String(skill.job) === jobFilter)
      .map(skill => ({
        id: String(skill.id),
        name: skill.n,
        note: skill.adv,
        image: skillIcon(skill.id),
        keywords: `${skill.jobName} ${skill.group}`,
        badge: isV002Skill(skill) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : undefined,
      }));
  }, [skills, jobFilter, notOpenYet]);

  return (
    <DbBrowser
      title="技能"
      lead="每個技能每一級的實際數值，不用自己算。"
      entries={entries}
      loading={!skills}
      error={error}
      filters={
        <select
          value={jobFilter}
          onChange={event => setChosenJob(event.target.value)}
          className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[color:var(--maple)]"
          aria-label="職業分類"
        >
          <option value="">全部職業</option>
          <option value="0">初心者</option>
          {skillJobGroups().map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(option => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      }
      renderDetail={id => {
        const skill = skillIndex.get(id);
        if (!skill) return null;
        return <SkillDetail skill={skill} find={findSkill} />;
      }}
    />
  );
}

/**
 * 各等級數值表的外框。表格放得下時表頭黏在上面（手機在「收起」那一列下面、桌機在右邊那一欄頂端），
 * 往下捲到 30 級還看得到每一欄是什麼；放不下（欄位太多）才改成左右滑，這時表頭不黏——
 * 會左右滑的框是捲動容器，表頭黏不出去。overflow: clip 不算捲動容器，所以放得下時用它切圓角（兩個方向都切，圓角才切得到）。
 * 手機上表頭要黏在「收起」那一列下面：量那一列實際多高（字放大、有「10/15 開放」標籤時會變高）寫進 --stuck-h。
 */
function TableFrame({ children }: { children: (sticky: boolean) => React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [stuckHeight, setStuckHeight] = useState(44);
  useLayoutEffect(() => {
    const box = frame.current;
    const table = box?.querySelector("table");
    if (!box || !table) return;
    // 黏住的那一列：清單裡展開的那一列，或卡片放在清單最上面時的那顆「收起」（DbBrowser）
    const bar = box.closest("li")?.querySelector(":scope > button") ?? document.querySelector("#db-top > button");
    const check = () => {
      setFits(table.scrollWidth <= box.clientWidth + 1);
      if (bar) setStuckHeight(Math.round(bar.getBoundingClientRect().height));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(box);
    observer.observe(table);
    if (bar) observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={frame}
      style={{ "--stuck-h": `${stuckHeight}px` } as React.CSSProperties}
      className={`rounded-xl border border-[color:var(--paper-edge)] ${fits ? "overflow-clip" : "scroll-x"}`}
    >
      {children(fits)}
    </div>
  );
}

/**
 * 表頭格子的樣式。黏住時要自己有底色（不然底下的列會透出來）；手機黏在導覽列＋「收起」那一列（--stuck-h）下面，
 * 導覽列收起來時跟著往上（--header-offset 變 0，同樣 0.2 秒）；桌機右邊那一欄自己會捲，黏在它頂端
 */
const headCell = (sticky: boolean, extra = "") =>
  [
    "px-3 py-2 text-left font-bold bg-[color:var(--paper-deep)]",
    sticky
      ? "sticky top-[calc(var(--header-offset)+var(--stuck-h,44px))] z-[1] transition-[top] duration-200 ease-out lg:top-0 shadow-[0_1px_0_var(--paper-edge)]"
      : "",
    extra,
  ].join(" ");

/** 存了角色、技能在你的職業線上：標出你現在最多點得到的那一列（reachableLevel；點數還不夠付所需技能時 level 是 0，不標） */
const rowProps = (index: number, mark: number | undefined) => ({
  className: `border-t border-[color:var(--paper-edge)]${mark === index + 1 ? " bg-[color:var(--maple-wash)]" : ""}`,
  "aria-current": mark === index + 1 ? ("true" as const) : undefined,
});

type FindSkill = (id: number) => Skill | undefined;

function SkillDetail({ skill, find }: { skill: Skill; find: FindSkill }) {
  const notOpenYet = useBeforeV002();
  const { profile, isComplete } = useStoredProfile();
  const levels = useMemo(() => skillLevels(skill), [skill]);
  const effect = useMemo(() => skillEffect(skill), [skill]);
  // 所需技能要花的點數一起扣（找所需技能用 find）
  const reach = isComplete ? reachableLevel(skill, profile, find) : null;
  const icon = skillIcon(skill.id);
  const max = skill.levels?.length ?? 0;
  const reachNote = reach ? (
    <p className="text-xs ink-soft">
      你 Lv.{profile.level}：{reachText(reach, max)}
    </p>
  ) : null;

  return (
    <DetailCard>
      <header className="flex items-start gap-3">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={40} height={40} className="size-10 object-contain" />
        ) : (
          // 圖是壞的、又找不到可靠替代（木妖的弱點攻擊）：不放圖，標題照樣對齊
          <span aria-hidden="true" className="size-10 shrink-0" />
        )}
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-tight">
            {skill.n}
            {isV002Skill(skill) && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
          </h2>
          <p className="mt-0.5 text-sm ink-soft">
            {skill.group} · {skill.jobName} · {skill.adv}
            {skill.max ? ` · 上限 ${skill.max} 級` : ""}
            <span className="ml-2 text-xs ink-faint">#{skill.id}</span>
          </p>
        </div>
      </header>

      {skill.desc ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed ink-soft">{skill.desc}</p>
      ) : null}

      {skill.req?.length ? (
        // 從說明尾巴拆出來的「所需技能」：找得到那個技能的做成連結，點了右邊（手機在原地）換成那一筆
        <p className="text-sm ink-soft">
          <span className="ink-faint">所需技能：</span>
          {skill.req.map((req, index) => (
            <span key={`${req.name}-${index}`}>
              {index > 0 ? "、" : ""}
              {req.id ? (
                <Link href={`/db/skills?id=${req.id}`} className="font-bold text-[color:var(--ink)] underline decoration-[color:var(--paper-edge)] underline-offset-4 hover:text-[color:var(--maple)]">
                  {req.name}
                </Link>
              ) : (
                req.name
              )}
              {` ${req.level} 級以上`}
            </span>
          ))}
        </p>
      ) : null}

      {effect ? (
        <p className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2 text-sm">
          <span className="ink-faint">{effect.label}：</span>
          {effect.text}
        </p>
      ) : null}

      {levels.kind === "table" ? (
        <Section title="各等級數值" extra={`${levels.rows.length} 級`}>
          {reachNote}
          <TableFrame>
            {sticky => (
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={headCell(sticky, "rounded-tl-xl")}>等級</th>
                    {levels.fields.map((field, column) => (
                      <th
                        key={field.key}
                        scope="col"
                        className={headCell(sticky, column === levels.fields.length - 1 ? "rounded-tr-xl" : "")}
                      >
                        {field.label}
                        {field.unit ? `（${field.unit}）` : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {levels.rows.map((row, index) => {
                    // 整列沒有數值、遊戲有那一級的原文（隱身術 20 級）：整列放原文，不寫一排「—」
                    const text = levels.rowText?.[index + 1];
                    return (
                      <tr key={index} {...rowProps(index, reach?.level)}>
                        <th scope="row" className="px-3 py-1.5 text-left font-bold tabular-nums">{index + 1}</th>
                        {text ? (
                          <td colSpan={row.length} className="px-3 py-1.5">{text}</td>
                        ) : (
                          row.map((value, column) => (
                            <td key={levels.fields[column].key} className="px-3 py-1.5 tabular-nums">{value ?? "—"}</td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableFrame>
        </Section>
      ) : levels.kind === "text" ? (
        <Section title="各等級數值" extra={`${levels.rows.length} 級`}>
          {reachNote}
          <TableFrame>
            {sticky => (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={headCell(sticky, "w-16 rounded-tl-xl")}>等級</th>
                    <th scope="col" className={headCell(sticky, "rounded-tr-xl")}>效果</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.rows.map((text, index) => (
                    <tr key={index} {...rowProps(index, reach?.level)}>
                      <th scope="row" className="px-3 py-1.5 text-left align-top font-bold tabular-nums">{index + 1}</th>
                      <td className="px-3 py-1.5">
                        {text === null
                          ? "—"
                          : // 跟上一級不一樣的數字加粗，往下掃就看得出升這一級多了什麼
                            changedParts(index > 0 ? levels.rows[index - 1] : null, text).map((part, at) =>
                              part.changed ? <b key={at} className="font-black">{part.text}</b> : part.text,
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableFrame>
        </Section>
      ) : levels.kind === "sameText" ? (
        <Section title="各等級數值" extra={`${levels.count} 級`}>
          <p className="text-xs ink-faint">
            遊戲資料這 {levels.count} 級寫的都是同一句
            {effect?.text === levels.text ? "（上面的效果）" : `「${levels.text}」`}，沒有每一級的數字。
          </p>
        </Section>
      ) : levels.kind === "noLevels" ? (
        <Section title="各等級數值">
          <p className="text-xs ink-faint">
            遊戲資料沒有這個技能每一級的數值{skill.desc ? "，效果以上面的說明為準" : ""}。
          </p>
        </Section>
      ) : null}
    </DetailCard>
  );
}

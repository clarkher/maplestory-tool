"use client";

import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { loadSkills, peekSkills } from "@/lib/data";
import { skillJobGroups } from "@/lib/jobs";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import { skillEffect, skillLevels } from "@/lib/skill-view";
import type { Skill } from "@/lib/types";
import { isV002Skill } from "@/lib/v002";

export function SkillDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [skills, setSkills] = useState<Skill[] | null>(peekSkills);
  const [error, setError] = useState<string | null>(null);
  // "" 是全部職業，其餘存職業代碼的字串（跟 <select> value 同型，比對時不用再轉數字）
  const [jobFilter, setJobFilter] = useRemembered("db:技能:jobFilter", "");
  const notOpenYet = useBeforeV002();

  useEffect(() => {
    loadSkills().then(setSkills).catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const skillIndex = useMemo(
    () => new Map((skills ?? []).map(skill => [String(skill.id), skill])),
    [skills],
  );

  const entries = useMemo<DbEntry[]>(() => {
    if (!skills) return [];
    return skills
      .filter(skill => !jobFilter || String(skill.job) === jobFilter)
      .map(skill => ({
        id: String(skill.id),
        name: skill.n,
        note: skill.adv,
        image: `/assets/skills/${skill.id}.png`,
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
          onChange={event => setJobFilter(event.target.value)}
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
        return <SkillDetail skill={skill} />;
      }}
    />
  );
}

function SkillDetail({ skill }: { skill: Skill }) {
  const notOpenYet = useBeforeV002();
  const levels = useMemo(() => skillLevels(skill), [skill]);
  const effect = useMemo(() => skillEffect(skill), [skill]);

  return (
    <DetailCard>
      <header className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/assets/skills/${skill.id}.png`} alt="" width={40} height={40} className="size-10 object-contain" />
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

      {effect ? (
        <p className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2 text-sm">
          <span className="ink-faint">{effect.label}：</span>
          {effect.text}
        </p>
      ) : null}

      {levels.kind === "table" ? (
        <Section title="各等級數值" extra={`${levels.rows.length} 級`}>
          <div className="scroll-x rounded-xl border border-[color:var(--paper-edge)]">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-[color:var(--paper-deep)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-bold">等級</th>
                  {levels.fields.map(field => (
                    <th key={field.key} scope="col" className="px-3 py-2 text-left font-bold">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {levels.rows.map((row, index) => {
                  // 整列沒有數值、遊戲有那一級的原文（隱身術 20 級）：整列放原文，不寫一排「—」
                  const text = levels.rowText?.[index + 1];
                  return (
                    <tr key={index} className="border-t border-[color:var(--paper-edge)]">
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
          </div>
        </Section>
      ) : levels.kind === "text" ? (
        <Section title="各等級數值" extra={`${levels.rows.length} 級`}>
          <div className="scroll-x rounded-xl border border-[color:var(--paper-edge)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--paper-deep)]">
                <tr>
                  <th scope="col" className="w-16 px-3 py-2 text-left font-bold">等級</th>
                  <th scope="col" className="px-3 py-2 text-left font-bold">效果</th>
                </tr>
              </thead>
              <tbody>
                {levels.rows.map((text, index) => (
                  <tr key={index} className="border-t border-[color:var(--paper-edge)]">
                    <th scope="row" className="px-3 py-1.5 text-left align-top font-bold tabular-nums">{index + 1}</th>
                    <td className="px-3 py-1.5">{text ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

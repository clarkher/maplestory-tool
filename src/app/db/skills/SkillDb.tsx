"use client";

import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { loadSkills } from "@/lib/data";
import { skillJobGroups } from "@/lib/jobs";
import { useBeforeV002 } from "@/lib/release";
import type { Skill } from "@/lib/types";
import { isV002Skill } from "@/lib/v002";

export function SkillDb() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "" 是全部職業，其餘存職業代碼的字串（跟 <select> value 同型，比對時不用再轉數字）
  const [jobFilter, setJobFilter] = useState("");
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
          className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm"
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
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const level of skill.levels) for (const key of Object.keys(level)) keys.add(key);
    return [...keys];
  }, [skill]);

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

      {skill.formula ? (
        <p className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2 text-sm">
          <span className="ink-faint">效果：</span>
          {skill.formula}
        </p>
      ) : null}

      {skill.levels.length && fields.length ? (
        <Section title="各等級數值" extra={`${skill.levels.length} 級`}>
          <div className="scroll-x rounded-xl border border-[color:var(--paper-edge)]">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-[color:var(--paper-deep)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-bold">等級</th>
                  {fields.map(field => (
                    <th key={field} scope="col" className="px-3 py-2 text-left font-bold">
                      {skill.labels?.[field] ?? field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skill.levels.map((level, index) => (
                  <tr key={index} className="border-t border-[color:var(--paper-edge)]">
                    <th scope="row" className="px-3 py-1.5 text-left font-bold tabular-nums">{index + 1}</th>
                    {fields.map(field => (
                      <td key={field} className="px-3 py-1.5 tabular-nums">{level[field] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </DetailCard>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLinks, SeoPage, SeoSection, SeoStats } from "@/components/SeoPage";
import { jobLabel } from "@/lib/item-view";
import { breadcrumbLd, clip, skillSummary, webPageLd } from "@/lib/seo";
import { skillEffect, skillIcon } from "@/lib/skill-view";
import { staticModified, staticSkills } from "@/lib/static-data";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticSkills().map(skill => ({ id: String(skill.id) }));
}

function find(id: string) {
  return staticSkills().find(skill => String(skill.id) === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const skill = find((await params).id);
  if (!skill) return {};
  const path = `/db/skills/${skill.id}`;
  const job = jobLabel(skill.job) ?? skill.jobName;
  const description = clip(skillSummary(skill));
  return {
    title: `${skill.n}｜${job}技能效果、每級數值`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${skill.n}｜楓谷幫手`, description, url: path },
  };
}

export default async function Page({ params }: Props) {
  const skill = find((await params).id);
  if (!skill) notFound();
  const path = `/db/skills/${skill.id}`;
  const summary = skillSummary(skill);
  const effect = skillEffect(skill);
  const desc = skill.desc?.replace(/^\[[^\]]*\]\s*/, "").trim();
  const job = jobLabel(skill.job) ?? skill.jobName;
  // 同職業的其他技能，互相連
  const siblings = staticSkills().filter(other => other.job === skill.job && other.id !== skill.id);

  return (
    <SeoPage
      trail={[{ name: "查資料・技能", path: "/db/skills" }, { name: skill.n, path }]}
      title={skill.n}
      lead={summary}
      image={skillIcon(skill.id)}
      toolHref={`/db/skills?id=${skill.id}`}
      toolLabel="在查資料裡看每一級數值"
      jsonLd={[
        breadcrumbLd([{ name: "技能", path: "/db/skills" }, { name: skill.n, path }]),
        webPageLd({ name: `${skill.n}｜技能資料`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      <SeoStats
        rows={[
          ["職業", job],
          ["轉職", skill.adv],
          ...(skill.max ? [["最高等級", `${skill.max} 級`] as [string, string]] : []),
        ]}
      />
      {desc ? (
        <SeoSection title="遊戲說明">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{desc}</p>
        </SeoSection>
      ) : null}
      {effect ? (
        <SeoSection title={effect.label}>
          <p className="text-sm leading-relaxed">{effect.text}</p>
        </SeoSection>
      ) : null}
      {skill.req?.length ? (
        <SeoSection title="所需技能">
          <SeoLinks
            links={skill.req.map(req => ({
              href: req.id ? `/db/skills/${req.id}` : "/db/skills",
              text: req.name,
              note: `${req.level} 級以上`,
            }))}
          />
        </SeoSection>
      ) : null}
      {siblings.length ? (
        <SeoSection title={`${job}的其他技能`}>
          <SeoLinks links={siblings.map(other => ({ href: `/db/skills/${other.id}`, text: other.n }))} />
        </SeoSection>
      ) : null}
    </SeoPage>
  );
}

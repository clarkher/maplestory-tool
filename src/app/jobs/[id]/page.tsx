import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeoLinks, SeoPage, SeoSection } from "@/components/SeoPage";
import { levelRange, sourceLabels } from "@/lib/format";
import { breadcrumbLd, clip, jobGuideSummary, webPageLd } from "@/lib/seo";
import { staticGuide, staticGuideJobs, staticModified, staticMonsters, staticSkills } from "@/lib/static-data";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticGuideJobs().map(job => ({ id: String(job) }));
}

function find(id: string) {
  return staticGuideJobs().includes(Number(id)) ? staticGuide(Number(id)) : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = find((await params).id);
  if (!guide) return {};
  const path = `/jobs/${guide.job}`;
  const description = clip(jobGuideSummary(guide));
  return {
    title: `${guide.name}攻略｜配點、技能點法、各等級練功地圖`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${guide.name}攻略｜楓谷幫手`, description, url: path },
  };
}

/** 一段攻略後面的出處小字 */
function Sources({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  const labels = sourceLabels(urls);
  return (
    <span className="ml-1 text-xs ink-faint">
      （出處：
      {urls.map((url, index) => (
        <span key={url}>
          {index ? "、" : ""}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{labels[index]}</a>
        </span>
      ))}
      ）
    </span>
  );
}

export default async function Page({ params }: Props) {
  const guide = find((await params).id);
  if (!guide) notFound();
  const path = `/jobs/${guide.job}`;
  const summary = jobGuideSummary(guide);
  const monsterNames = new Map(staticMonsters().map(monster => [monster.id, monster.n]));
  const skills = staticSkills().filter(skill => skill.job === guide.job);
  const others = staticGuideJobs().filter(job => job !== guide.job).map(job => staticGuide(job));

  return (
    <SeoPage
      trail={[{ name: "職業攻略", path: "/guide" }, { name: guide.name, path }]}
      title={`${guide.name}攻略`}
      lead={summary}
      toolHref="/"
      toolLabel="填等級，看我現在去哪練"
      jsonLd={[
        breadcrumbLd([{ name: "職業攻略", path: "/guide" }, { name: guide.name, path }]),
        webPageLd({ name: `${guide.name}攻略`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      {guide.stat.length ? (
        <SeoSection title="素質怎麼配">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {guide.stat.map(row => (
              <li key={row.t}>{row.t}<Sources urls={row.s} /></li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {guide.builds.map(build => (
        <SeoSection key={build.label} title={`技能點法：${build.label}`}>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            {build.steps.map((step, index) => (
              <li key={`${step.name}-${index}`}>
                {step.id ? (
                  <Link href={`/db/skills/${step.id}`} className="font-bold underline decoration-[color:var(--paper-edge)] underline-offset-4 hover:text-[color:var(--maple)]">{step.name}</Link>
                ) : (
                  <span className="font-bold">{step.name}</span>
                )}
                {" "}點到 {step.to}
                {step.note ? <span className="ink-soft">：{step.note}</span> : null}
              </li>
            ))}
          </ol>
          <Sources urls={build.s} />
        </SeoSection>
      ))}

      {guide.train.length ? (
        <SeoSection title="每個等級去哪練">
          <ul className="space-y-2.5 text-sm leading-relaxed">
            {guide.train.map((row, index) => (
              <li key={`${row.from}-${row.name}-${index}`} className="rounded-xl bg-[color:var(--paper-deep)] p-3">
                <p className="font-bold">
                  {levelRange(row.from, row.to)} {row.kind === "party" ? "組隊" : "單練"}：
                  {row.map ? <Link href={`/go?to=${row.map}`} className="underline underline-offset-4 hover:text-[color:var(--maple)]">{row.name}</Link> : row.name}
                </p>
                {row.why ? <p className="mt-1">{row.why}<Sources urls={row.s} /></p> : null}
                {row.mobs.some(id => monsterNames.has(id)) ? (
                  <p className="mt-1 ink-soft">
                    打：
                    {row.mobs.filter(id => monsterNames.has(id)).map((id, mobIndex) => (
                      <span key={id}>
                        {mobIndex ? "、" : ""}
                        <Link href={`/db/monsters/${id}`} className="underline underline-offset-4 hover:text-[color:var(--maple)]">{monsterNames.get(id)}</Link>
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {guide.notes.length ? (
        <SeoSection title="其他要注意的">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {guide.notes.map(note => (
              <li key={note.t}>{note.t}<Sources urls={note.s} /></li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {skills.length ? (
        <SeoSection title={`${guide.name}的技能`}>
          <SeoLinks links={skills.map(skill => ({ href: `/db/skills/${skill.id}`, text: skill.n }))} />
        </SeoSection>
      ) : null}

      <SeoSection title="其他職業攻略">
        <SeoLinks links={others.map(other => ({ href: `/jobs/${other.job}`, text: other.name }))} />
      </SeoSection>
    </SeoPage>
  );
}

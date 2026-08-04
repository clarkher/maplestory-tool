"use client";

import Image from "next/image";
import Link from "next/link";
import { itemImage, mapName, npcImage } from "@/lib/data";
import { rewardSummary } from "@/lib/format";
import type { MapRecord, Quest, QuestRef } from "@/lib/types";

/**
 * 任務細節。任務規劃與任務資料庫共用同一份，避免兩邊顯示的東西不一樣。
 *
 * 這裡刻意把三段敘述（可接前／進行中／完成後）完整攤出來——
 * 那是任務唯一交代「為什麼要做這件事」的地方，先前因為型別寫錯整段沒顯示。
 */
export function QuestDetailBody({
  quest,
  maps,
  questNames,
}: {
  quest: Quest;
  maps: Record<string, MapRecord>;
  questNames?: Map<string, string>;
}) {
  const reward = rewardSummary(quest.exp, quest.money, quest.pop);

  return (
    <div className="space-y-3.5 text-sm">
      {quest.texts?.length ? (
        <section className="space-y-2">
          {quest.texts.map((text, index) => (
            <div key={`${text.k}-${index}`} className="rounded-xl bg-[color:var(--paper-deep)] p-3">
              <p className="mb-1 text-[11px] font-bold ink-faint">{text.label}</p>
              <p className="whitespace-pre-wrap leading-relaxed">{text.text}</p>
            </div>
          ))}
        </section>
      ) : null}

      {quest.island ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          這是楓之島的任務。離開楓之島之後就回不去了，只有還沒轉職的初心者接得到。
        </p>
      ) : null}

      {quest.startItems?.length || quest.startSkills?.length || quest.pre?.length ? (
        <Block title="接得到的條件">
          <div className="space-y-1.5">
          {quest.pre?.length ? (
            <p className="mb-1.5">
              <span className="ink-faint">要先完成：</span>
              {quest.pre.map((id, index) => (
                <span key={`${id}-${index}`}>
                  {index > 0 ? "、" : ""}
                  <Link href={`/db/quests?id=${id}`} className="font-bold hover:text-[color:var(--maple)]">
                    {questNames?.get(id) ?? `任務 ${id}`}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          {quest.startItems?.length ? (
            <div className="mb-1.5">
              <span className="ink-faint">身上要有：</span>
              <ItemChips rows={quest.startItems} />
            </div>
          ) : null}
          {quest.startSkills?.length ? (
            <p className="ink-soft">要先學會指定技能（{quest.startSkills.length} 個）</p>
          ) : null}
          </div>
        </Block>
      ) : null}

      {quest.needMobs?.length ? (
        <Block title="要打的怪">
          <ul className="flex flex-wrap gap-1.5">
            {quest.needMobs.map((mob, index) => (
              <li key={`${mob.id}-${index}`}>
                <Link
                  href={`/db/monsters?id=${mob.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] px-3 py-1 text-[13px] font-bold hover:bg-[color:var(--maple-wash)]"
                >
                  {mob.n}
                  {mob.c ? <span className="tabular-nums text-[color:var(--maple)]">×{mob.c}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {quest.needItems?.length ? (
        <Block title="要交的東西">
          <ItemChips rows={quest.needItems} linkToFarm />
        </Block>
      ) : null}

      {reward || quest.rewardItems?.length || quest.rewardSkills?.length ? (
        <Block title="完成後拿到">
          <div className="space-y-1.5">
          {reward ? <p className="font-bold text-[color:var(--gold)]">{reward}</p> : null}
          {quest.rewardItems?.length ? <ItemChips rows={quest.rewardItems} /> : null}
          {quest.rewardSkills?.length ? (
            <p className="ink-soft">附贈技能 {quest.rewardSkills.length} 個</p>
          ) : null}
          </div>
        </Block>
      ) : null}

      {quest.startGiven?.length ? (
        <Block title="接下任務當下就給">
          <ItemChips rows={quest.startGiven} />
        </Block>
      ) : null}

      {quest.npcs?.length ? (
        <Block title="還會碰到的 NPC">
          <ul className="space-y-1">
            {quest.npcs.map((npc, index) => (
              <li key={`${npc.id}-${index}`} className="flex items-center gap-2 rounded-lg bg-[color:var(--paper-deep)] px-2 py-1.5">
                <Image src={npcImage(npc.id)} alt="" width={26} height={26} className="size-[26px] object-contain" unoptimized />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{npc.n}</span>
                  {npc.map ? <span className="block truncate text-[11px] ink-faint">{mapName(maps, npc.map)}</span> : null}
                </span>
                {npc.map ? (
                  <Link
                    href={`/go?to=${npc.map}`}
                    className="shrink-0 text-[12px] font-bold text-[color:var(--maple)] hover:underline"
                  >
                    路線
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {quest.medal ? (
        <p className="ink-soft">完成可獲得勳章分類：<strong>{quest.medal}</strong></p>
      ) : null}
    </div>
  );
}

/**
 * 這個 Block 只收單一子元素。
 * 傳多個並列子元素時 React 會把它們視為沒有 key 的動態陣列而發出警告，
 * 所以呼叫端要自己用一個容器包起來。
 */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[13px] font-black">{title}</h4>
      {children}
    </section>
  );
}

function ItemChips({ rows, linkToFarm = false }: { rows: QuestRef[]; linkToFarm?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map((row, index) => (
        <li key={`${row.id}-${index}`}>
          <Link
            href={linkToFarm ? `/plan/farm?want=${row.id}` : `/db/items?id=${row.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[color:var(--maple-wash)]"
            title={linkToFarm ? "看這個道具去哪打" : undefined}
          >
            <Image src={itemImage(row.id)} alt="" width={22} height={22} className="size-[22px] object-contain" unoptimized />
            <span className="text-[13px] font-bold">{row.n}</span>
            {row.c && row.c > 1 ? (
              <span className="text-[11px] tabular-nums text-[color:var(--maple)]">×{row.c}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

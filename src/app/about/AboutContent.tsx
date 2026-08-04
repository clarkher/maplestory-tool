"use client";

import { useEffect, useState } from "react";
import { loadMeta } from "@/lib/data";
import type { Meta } from "@/lib/types";

/**
 * 資料來源與限制寫在明處。
 * 站上每個數字都要能追到出處，做不到的事情也要講清楚，不能讓人以為我們算得出來。
 */
export function AboutContent() {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <article className="space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">資料從哪來</h1>
      <p className="text-[15px] leading-relaxed ink-soft">
        站上的每個數字都有出處。這頁把來源、更新方式、還有我們做不到的事情一次講清楚。
      </p>

      {meta ? (
        <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-black">目前這份資料</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Row label="遊戲版本" value={meta.gameVersion ?? "—"} />
            <Row label="資料產生時間" value={meta.dataGeneratedAtText ?? "—"} />
            <Row label="取得方式" value={meta.ingest?.origin === "local" ? "本機客戶端抽檔" : "上游資料庫同步"} />
            <Row label="地圖資料" value={meta.mapSource.source} />
          </dl>
          <ul className="mt-3 grid gap-1.5 text-sm ink-soft sm:grid-cols-2">
            <li>怪物 {meta.counts.monsters} 隻</li>
            <li>道具 {meta.counts.items.toLocaleString()} 個</li>
            <li>任務 {meta.counts.quests} 個</li>
            <li>技能 {meta.counts.skills} 個</li>
            <li>地圖 {meta.counts.maps.toLocaleString()} 張</li>
            <li>傳送門路線 {meta.counts.portalEdges.toLocaleString()} 條</li>
          </ul>
        </section>
      ) : null}

      <Block title="遊戲數值：來自客戶端匯出">
        <p>
          怪物數值、掉落清單、道具、任務、技能全部來自遊戲客戶端資產檔的匯出，
          所以中文名稱與數字跟你在遊戲裡看到的一致。
        </p>
        <p className="mt-2">
          更新走雙軌：優先使用本機從客戶端抽出的資料；沒有的時候，改跟公開的上游資料庫同步，
          排程比對版本，一有變動就自動重建整站。
        </p>
      </Block>

      <Block title="地圖路線：來自 v83 地圖檔">
        <p>
          客戶端匯出的資料沒有傳送門連線，所以路線是從 v83 版本的 Map.wz 抽出來的，
          包含每個傳送門通往哪張圖、每個刷怪點的位置與回生秒數。
        </p>
        <p className="mt-2">
          我們比對過：站上用到的地圖編號在該版本裡全部存在。但那畢竟是另一個版本的檔案，
          如果經典版改過某張圖的通道，路線就可能不同。走不通請寫信告訴我們。
        </p>
      </Block>

      <Block title="我們不提供的東西">
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <strong>掉落機率</strong>：官方沒有公開，客戶端資料裡也沒有。與其編一個數字，
            不如告訴你哪張圖同時掉最多你要的東西、怪有多密。
          </li>
          <li>
            <strong>每小時經驗</strong>：那取決於你的裝備與清怪速度，我們不知道。
            提供的是可查證的事實——一輪清完的總經驗、刷怪點數、回生秒數，以及據此換算的相對指數。
          </li>
          <li>
            <strong>跨大陸的走法</strong>：楓之谷跨大陸要搭船或計程車，那不是傳送門，
            所以遇到跨區我們會直接說「這段要自己搭車」，不會編一條路線。
          </li>
        </ul>
      </Block>

      <Block title="命中需求怎麼算的">
        <p>
          用的是經典版社群通用的命中公式：
          <code className="mx-1 rounded bg-[color:var(--paper-deep)] px-1.5 py-0.5 text-[13px]">
            命中率 = 命中 ÷ ((1.84 + 0.07 × 等級差) × 怪物迴避 + 1)
          </code>
          反推出「打到不會 miss 需要多少命中」，等級差只計算怪比你高的部分。
        </p>
        <p className="mt-2">這不是官方公開的公式，是社群長年驗證的通用式，僅供參考。</p>
      </Block>

      <Block title="地圖名稱為什麼有些是英文">
        客戶端匯出的資料只替出現過怪物或任務 NPC 的地圖命名，其餘沒有中文名。
        那些地圖我們改顯示 v83 檔案裡的英文原名，並在卡片上標註——總比顯示「未命名地圖 106021500」好。
      </Block>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      <h2 className="mb-2 text-lg font-black">{title}</h2>
      <div className="text-[15px] leading-relaxed ink-soft">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2">
      <dt className="text-[11px] ink-faint">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

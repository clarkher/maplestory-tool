// 傷害計算機下面的問答（v2.55）：伺服器就畫好（沒有 "use client"），不跑 JavaScript 的爬蟲也讀得到，
// 跟 boss/RespawnTable 同一個做法。計算機本身要等程式，伺服器吐的正文本來只有「整理資料中…」。
import { JOB_OPTIONS } from "@/lib/jobs";

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "楓之谷經典版打一下多痛怎麼算？",
    a: "選職業、武器、能力值、技能，就算出能力視窗攻擊力、技能每一下多少、打怪幾下打死，還有每種爆擊情況的機率。",
  },
  {
    q: "兩套點法、兩把武器差多少？",
    a: "左右兩組各設一套，並排看差多少，換武器或洗點前先比。",
  },
  {
    q: "哪些怪一下、兩下就打死？",
    a: "選好會列出穩穩一下、兩下打死的怪，也列出運氣好才打得死的；有屬性的招式可以只看怕那個屬性的怪。",
  },
  {
    q: "哪些職業能算？",
    a: `劍士、法師、弓箭手、盜賊、海盜，一轉到三轉 ${JOB_OPTIONS.length} 個職業都能選。少數招式資料不夠、算不出來的，會寫原因。`,
  },
  {
    q: "算出來準嗎？",
    a: "能力視窗攻擊力照玩家整理的客戶端算式，技能倍率照舊版公式。打怪、爆擊、命中用的是舊版國際服公式，台服經典版還沒人實測，可能不準，數字旁邊都有標。",
  },
];

export function DamageFaq() {
  return (
    <section aria-label="常見問題" className="mx-auto max-w-3xl space-y-3 rounded-[var(--radius-card)] glass-solid px-3 py-3 sm:px-4">
      {QUESTIONS.map(({ q, a }) => (
        <div key={q}>
          <h2 className="text-[15px] font-black">{q}</h2>
          <p className="mt-0.5 text-[14px] leading-relaxed ink-soft">{a}</p>
        </div>
      ))}
    </section>
  );
}

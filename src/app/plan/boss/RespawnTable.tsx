// 各野王重生時間表（v1.90）：伺服器就畫好（沒有 "use client"），不跑 JavaScript 的爬蟲也讀得到，
// 從 ChatGPT、搜尋點進來的人第一屏就看到答案。數字只來自台服玩家實測（data/boss/respawn.json）。
import { RESPAWN_STATS_UNTIL, respawnRows } from "@/lib/boss/respawn-table";

export function RespawnTable() {
  const rows = respawnRows();
  return (
    <section aria-labelledby="respawn-table-title" className="rounded-[var(--radius-card)] glass-solid px-3 py-2.5 sm:px-4">
      <h2 id="respawn-table-title" className="text-[15px] font-black">
        各野王重生時間
      </h2>
      <table className="mt-1 w-full border-collapse text-left text-[14px] leading-snug">
        <thead>
          <tr className="text-[12px] ink-soft">
            <th scope="col" className="py-1 pr-2 font-bold">野王</th>
            <th scope="col" className="py-1 pr-2 font-bold">地圖</th>
            <th scope="col" className="py-1 text-right font-bold">重生間隔</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[color:var(--paper-edge)]">
              <th scope="row" className="whitespace-nowrap py-1 pr-2 font-bold">{row.name}</th>
              <td className="py-1 pr-2 ink-soft">{row.map}</td>
              <td className={`whitespace-nowrap py-1 text-right ${row.measured ? "font-bold" : "text-[13px] ink-soft"}`}>{row.respawn}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[12px] leading-relaxed ink-soft">
        台服玩家實測統計{RESPAWN_STATS_UNTIL ? `（到 ${RESPAWN_STATS_UNTIL}）` : ""}，不是遊戲檔裡的數字。沒寫時間的實測還不夠，下面只幫你記打死多久了。
      </p>
    </section>
  );
}

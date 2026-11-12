import type { Metadata } from "next";
import { respawnSummary } from "@/lib/boss/respawn-table";
import { BossTimer } from "./BossTimer";
import { RespawnTable } from "./RespawnTable";
import { withOpenGraph } from "@/lib/seo";

// v1.90：description 開頭直接講各王多久重生（ChatGPT 帶進來的人平均 2 秒就走，要一眼看到答案）
export const metadata: Metadata = withOpenGraph({
  title: "野王計時｜打死就記，算哪個頻道快出了",
  description: `野王重生時間（台服玩家實測）：${respawnSummary()}。打死野王按一下，自動算每個頻道還要多久重生、下一個該去哪一頻；可以開房間跟隊友一起記，快出時響聲提醒。`,
  alternates: { canonical: "/plan/boss" },
});

export default function Page() {
  return <BossTimer respawnTable={<RespawnTable />} />;
}

import type { Metadata } from "next";
import { BossTimer } from "./BossTimer";

export const metadata: Metadata = {
  title: "野王計時｜打死就記，算哪個頻道快出了",
  description: "打死野王按一下，自動算出每個頻道還要多久重生、下一個該去哪一頻；重生時間是台服玩家實測，可以開房間跟隊友一起記，快出時響聲提醒。",
  alternates: { canonical: "/plan/boss" },
};

export default function Page() {
  return <BossTimer />;
}

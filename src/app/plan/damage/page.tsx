import type { Metadata } from "next";
import { DamageCalculator } from "./DamageCalculator";

export const metadata: Metadata = {
  title: "傷害計算機｜兩套點法、兩把武器並排比打怪",
  description: "選職業、技能、武器跟能力值，算能力視窗攻擊力、技能每一下多少、打怪幾下打死；兩組並排看差多少，列出一下、兩下打得死的怪。",
  alternates: { canonical: "/plan/damage" },
};

export default function Page() {
  return <DamageCalculator />;
}

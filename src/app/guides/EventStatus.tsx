"use client";

import { useEffect, useState } from "react";
import { halloweenOn } from "@/lib/halloween";

/** 活動卡上那行字：結束後不拿掉卡片（頁面是建置時產的，拿掉會讓下面的東西往上跳），只換字 */
export function eventStatus(now: number): string {
  return halloweenOn(now) ? "到 11/11 23:59" : "活動已結束，攻略留著參考";
}

/** 建置時的字先畫，進來後照看的人的時間再對一次 */
export function EventStatus({ builtAt }: { builtAt: number }) {
  const [text, setText] = useState(() => eventStatus(builtAt));
  useEffect(() => setText(eventStatus(Date.now())), []);
  return <>{text}</>;
}

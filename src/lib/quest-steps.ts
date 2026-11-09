/**
 * 任務單獨頁（/db/quests/[id]）的「一步一步怎麼解」：全部從站上已有的資料組出來，不手寫。
 * 1. 去哪接（地圖、NPC、接取等級、從最近城鎮怎麼走）
 * 2. 要打的怪（幾隻、刷怪點最多的幾張開放地圖）
 * 3. 要交的道具（幾個、哪些怪會掉／哪裡買／哪個任務給）
 * 4. 回去交給誰
 * 5. 獎勵
 * 沒有資料的那一步就不寫，也不補猜；句子只在名字、地名都有的時候才組（不會出現「找的某某接」）。
 * 49 等以下（或沒寫接取等級）的任務不推要過傑夫的路線、不推傑夫後面的練功圖（maplebook-jeff-gate）。
 */
import { mapRoute } from "./atlas-view";
import { formatNumber, payText, rewardSummary } from "./format";
import { monsterMaps } from "./monster-view";
import { npcLevelNote } from "./portal-text";
import { belowGate } from "./route";
import { levelText } from "./seo";
import type { Item, MapRecord, Monster, PortalEdge, Quest, QuestNpc } from "./types";

/** 一段文字：純文字或連結。道具單獨頁的連結要用一般 <a>（只留 html），畫面那邊看 href 決定 */
export type StepSeg = string | { t: string; href: string };

export type QuestStep = {
  kind: "start" | "mobs" | "items" | "return" | "reward";
  title: string;
  /** 每一行是一段話，畫成一個 <p> */
  lines: StepSeg[][];
  /** 「帶我去」按鈕（/go?to=<圖>）：NPC 在城鎮裡、寫不出路線那一步才有 */
  go?: string;
};

export type QuestStepContext = {
  graph: Record<string, PortalEdge[]>;
  maps: Record<string, MapRecord>;
  nearestTown: Record<string, [number, number]>;
  monster: (id: number) => Pick<Monster, "n" | "lv" | "sp" | "maps"> | undefined;
  item: (id: number) => Pick<Item, "dm" | "sp" | "qr"> | undefined;
  questName: (id: string) => string | undefined;
  /** 有地圖單獨頁才連，沒有連 /go */
  mapHref: (id: number) => string;
  /** 有 NPC 單獨頁才有連結 */
  npcHref: (id: number) => string | undefined;
  /** 有怪物單獨頁才有連結 */
  monsterHref: (id: number) => string | undefined;
  /** 有道具單獨頁才有連結 */
  itemHref: (id: number) => string | undefined;
};

/** 每隻怪列幾張圖、每個道具列幾隻掉的怪 */
const MOB_MAPS = 3;
const ITEM_DROPS = 3;
/** 傑夫的門檻：比這低的任務不推傑夫後面 */
const NO_LEVEL = 1;

const link = (t: string, href: string | undefined): StepSeg => (href ? { t, href } : t);

/** 「A、B、C」：每個元素之間插頓號 */
function joined(parts: StepSeg[][]): StepSeg[] {
  return parts.flatMap((part, index) => (index ? ["、", ...part] : part));
}

/** 任務等級：算路線、擋傑夫用。沒寫接取等級的當 1 等（誰都接得到，不能假設 50 等） */
export function questLevel(quest: Pick<Quest, "minLv">): number {
  return quest.minLv ?? NO_LEVEL;
}

/** 「到冰原雪域找楓之谷GM」：NPC 名字一定有；圖名有才寫「到…」 */
function npcAt(npc: QuestNpc, ctx: QuestStepContext): StepSeg[] {
  const name = npc.mapName || (npc.map ? ctx.maps[String(npc.map)]?.zh : undefined);
  const who = link(npc.n, ctx.npcHref(npc.id));
  return name && npc.map ? ["到", link(name, ctx.mapHref(npc.map)), "找", who] : ["找", who];
}

/** 從最近城鎮走到 NPC 那張圖；要過傑夫的補一句舊版資料 */
function routeLine(map: number | undefined, level: number, ctx: QuestStepContext): StepSeg[] | null {
  if (!map) return null;
  const route = mapRoute(map, ctx.graph, ctx.maps, ctx.nearestTown, level);
  if (!route) return null;
  return [route.gate ? `${route.text}${npcLevelNote(route.gate.npc, route.gate.minLevel)}` : route.text];
}

/**
 * NPC 在城鎮裡（寫不出「從哪出發」的路線）就給一顆「帶我去」，連 /go?to=<圖>（跟 NPC 頁、地圖頁的帶我去同一個網址）。
 * 有路線、沒圖、圖沒中文名、不是城鎮、等級不夠走到（傑夫後面）都不給。
 */
function goHref(map: number | undefined, hasRoute: boolean, level: number, ctx: QuestStepContext): string | undefined {
  if (!map || hasRoute) return undefined;
  const record = ctx.maps[String(map)];
  if (!record?.zh || !record.t || belowGate(record, level)) return undefined;
  return `/go?to=${map}`;
}

function startStep(quest: Quest, ctx: QuestStepContext): QuestStep | null {
  if (!quest.sNpc) return null;
  const level = levelText(quest.minLv, quest.maxLv);
  const lines: StepSeg[][] = [[...npcAt(quest.sNpc, ctx), `接任務${level ? `（${level}${/以[上下]$/.test(level) ? "" : " "}可接）` : ""}。`]];
  const route = routeLine(quest.sNpc.map, questLevel(quest), ctx);
  if (route) lines.push(route);
  const go = goHref(quest.sNpc.map, Boolean(route), questLevel(quest), ctx);
  return go ? { kind: "start", title: "去哪接", lines, go } : { kind: "start", title: "去哪接", lines };
}

function mobStep(quest: Quest, ctx: QuestStepContext): QuestStep | null {
  if (!quest.needMobs?.length) return null;
  const level = questLevel(quest);
  const lines = quest.needMobs.map(mob => {
    const line: StepSeg[] = [link(mob.n, ctx.monsterHref(mob.id)), mob.c ? ` ${formatNumber(mob.c)} 隻` : ""];
    const monster = ctx.monster(mob.id);
    if (!monster) return [...line, "。"];
    // 49 等以下不推傑夫後面的圖（maps.json 的 g）
    const rows = monsterMaps(monster, ctx.maps).rows.filter(row => !belowGate(ctx.maps[String(row.id)], level)).slice(0, MOB_MAPS);
    if (!rows.length) return [...line, "。"];
    // 只照怪多到少排，不寫隻數（新手看不懂「同時幾隻」）
    const places = rows.map(row => [link(ctx.maps[String(row.id)].zh, ctx.mapHref(row.id))]);
    if (places.length === 1) return [...line, "：去", ...places[0], "。"];
    return [...line, "：最多的圖是", ...places[0], "，其次", ...joined(places.slice(1)), "。"];
  });
  return { kind: "mobs", title: "要打的怪", lines };
}

/** 道具從哪拿：怪掉（等級低的排前面）、常駐楓幣店、別的任務給；都沒有就只寫名字跟數量 */
function itemSources(id: number, quest: Quest, ctx: QuestStepContext): StepSeg[][] {
  const item = ctx.item(id);
  if (!item) return [];
  const sources: StepSeg[][] = [];
  const drops = (item.dm ?? [])
    .map(mobId => ({ id: mobId, monster: ctx.monster(mobId) }))
    .filter((row): row is { id: number; monster: NonNullable<ReturnType<QuestStepContext["monster"]>> } => Boolean(row.monster))
    .sort((a, b) => (a.monster.lv ?? 0) - (b.monster.lv ?? 0) || a.id - b.id);
  if (drops.length) {
    const level = questLevel(quest);
    const hunted = new Set((quest.needMobs ?? []).map(mob => mob.id));
    // 怪後面括號寫刷怪點最多的那張開放圖；任務本來就要打的怪上一步寫過了，不重複
    const shown = drops.slice(0, ITEM_DROPS).map(row => {
      const top = hunted.has(row.id)
        ? undefined
        : monsterMaps(row.monster, ctx.maps).rows.find(place => !belowGate(ctx.maps[String(place.id)], level));
      const name = link(row.monster.n, ctx.monsterHref(row.id));
      return top ? [name, "（", link(ctx.maps[String(top.id)].zh, ctx.mapHref(top.id)), "）"] : [name];
    });
    sources.push([...joined(shown), drops.length > ITEM_DROPS ? `等 ${drops.length} 種怪會掉` : "會掉"]);
  }
  // 常駐的楓幣店（活動店過期就沒了，跟道具單獨頁同一個判斷）
  const shops = (item.sp ?? []).filter(row => !row.e && !row.u);
  if (shops.length) {
    const places = [...new Set(shops.map(row => row.p))];
    const head = places.slice(0, 2).join("、");
    sources.push([`${head}${places.length > 2 ? `等 ${places.length} 個地方` : ""}買得到${shops.some(row => row.o === 1) ? "（參考舊版資料）" : ""}`]);
  }
  const givers = (item.qr ?? []).filter(other => other !== quest.id).flatMap(other => {
    const name = ctx.questName(other);
    return name ? [[link(`「${name}」`, `/db/quests/${encodeURIComponent(other)}`)]] : [];
  });
  if (givers.length) sources.push(["任務", ...joined(givers.slice(0, 2)), givers.length > 2 ? `等 ${givers.length} 個任務會給` : "會給"]);
  return sources;
}

function itemStep(quest: Quest, ctx: QuestStepContext): QuestStep | null {
  if (!quest.needItems?.length) return null;
  const lines = quest.needItems.map(row => {
    const line: StepSeg[] = [link(row.n, ctx.itemHref(row.id)), row.c ? ` ${formatNumber(row.c)} 個` : ""];
    const sources = itemSources(row.id, quest, ctx);
    if (!sources.length) return [...line, "。"];
    return [...line, "：", ...sources.flatMap((source, index) => (index ? ["；", ...source] : source)), "。"];
  });
  return { kind: "items", title: "要交的道具", lines };
}

function returnStep(quest: Quest, ctx: QuestStepContext): QuestStep | null {
  const end = quest.eNpc;
  if (!end) return null;
  const pay = payText(quest.money, Boolean(quest.needItems?.length));
  const payLine: StepSeg[][] = pay ? [[`交任務時${pay}。`]] : [];
  const start = quest.sNpc;
  if (start && start.id === end.id) {
    // 同一個人：中間有事要做才寫「回去」，不然就是說完話直接完成
    if (!quest.needMobs?.length && !quest.needItems?.length && !pay) return null;
    return { kind: "return", title: "回去交任務", lines: [["做完回去找", link(end.n, ctx.npcHref(end.id)), "交任務。"], ...payLine] };
  }
  const lines: StepSeg[][] = [[...npcAt(end, ctx), "交任務", start ? `（不是接任務的${start.n}）` : "", "。"], ...payLine];
  // 回報的人在另一張圖才補路線
  if (end.map && end.map !== start?.map) {
    const route = routeLine(end.map, questLevel(quest), ctx);
    if (route) lines.push(route);
    const go = goHref(end.map, Boolean(route), questLevel(quest), ctx);
    if (go) return { kind: "return", title: "回去交給誰", lines, go };
  }
  return { kind: "return", title: "回去交給誰", lines };
}

function rewardStep(quest: Quest, ctx: QuestStepContext): QuestStep | null {
  const lines: StepSeg[][] = [];
  const summary = rewardSummary(quest.exp, quest.money, quest.pop);
  if (summary) lines.push([`${summary}。`]);
  const items = quest.rewardItems ?? [];
  const fixed = items.filter(row => !row.rand);
  const random = items.filter(row => row.rand);
  const itemRow = (row: (typeof items)[number]) => [link(row.n, ctx.itemHref(row.id)), row.c && row.c > 1 ? ` ×${row.c}` : "", row.job ? "（職業限定）" : ""];
  if (fixed.length) lines.push(["道具：", ...joined(fixed.map(itemRow)), "。"]);
  if (random.length) lines.push(["從這幾樣隨機給一樣：", ...joined(random.map(itemRow)), "。"]);
  if (quest.rewardSkillNames?.length) lines.push([`學會技能：${quest.rewardSkillNames.join("、")}。`]);
  return lines.length ? { kind: "reward", title: "獎勵", lines } : null;
}

export function questSteps(quest: Quest, ctx: QuestStepContext): QuestStep[] {
  return [startStep(quest, ctx), mobStep(quest, ctx), itemStep(quest, ctx), returnStep(quest, ctx), rewardStep(quest, ctx)].filter(
    (step): step is QuestStep => step !== null,
  );
}

/**
 * 任務單獨頁下面的卡片（QuestDetailBody）哪幾塊已經被步驟寫過、不用再列：
 * 要打的怪＝有打怪那步；要交的東西＝道具有那步、要付的楓幣有回報那步寫；完成後拿到＝有獎勵那步。
 */
export function coveredBlocks(quest: Quest, steps: QuestStep[]): { mobs: boolean; needItems: boolean; rewards: boolean } {
  const has = (kind: QuestStep["kind"]) => steps.some(step => step.kind === kind);
  const pay = payText(quest.money, Boolean(quest.needItems?.length));
  return {
    mobs: has("mobs"),
    needItems: (!quest.needItems?.length || has("items")) && (!pay || has("return")),
    rewards: has("reward"),
  };
}

/** 整步的純文字（測試、統計用） */
export function stepText(step: QuestStep): string[] {
  return step.lines.map(line => line.map(seg => (typeof seg === "string" ? seg : seg.t)).join(""));
}

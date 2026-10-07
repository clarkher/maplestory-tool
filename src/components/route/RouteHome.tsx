"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { itemImage, loadGuide, monsterImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import {
  cachedGuides, guideJobs, guidesFor, loadHomeData, peekHomeData, settleGuides, type GuideState, type HomeData,
} from "@/lib/home-data";
import { isSecondJob, isThirdJob, jobOption, jobTier, normalizeJob, previousJob, stageJob } from "@/lib/jobs";
import { effectiveLevels, longRunNow, mainPick, nowQuests, pqJustClosed, townRoute } from "@/lib/now-plan";
import { useProfile } from "@/lib/profile";
import { sessionMemo } from "@/lib/session-memo";
import { useBeforeV002 } from "@/lib/release";
import { bandOf, bandsFor, isIslandMap } from "@/lib/route-planner";
import { CharacterBar } from "./CharacterBar";
import { GearCard } from "./GearCard";
import { NowCard, NowCardSkeleton } from "./NowCard";
import { Panel, SourceTag, Sprite } from "./bits";
import { RouteTimeline } from "./RouteTimeline";
import { SkillStrip } from "./SkillStrip";
import { TodoList } from "./TodoList";

export type GuideStatus = GuideState["status"];

/**
 * 硬重新整理時、React 接手之前就先跑（伺服器畫的版本裡的一小段 script，排在大標前面）：本機存過完整的角色（職業＋等級）
 * 就在 <html> 標 data-profile="saved"，讓「你現在幾等、什麼職業？」看不見。<html> 本來就有 suppressHydrationWarning
 * （深色模式也是這樣先標上去），不會跟 React 對不起來。站內換頁一開始就讀得到角色，不會畫這段。
 */
const SAVED_PROFILE_HINT = `try{var p=JSON.parse(localStorage.getItem("ms-profile")||"null");if(p&&p.level>0&&p.job>=0)document.documentElement.dataset.profile="saved"}catch(e){}`;

export function RouteHome() {
  const showV002Banner = useBeforeV002();
  // 站內換頁進來時角色、遊戲資料、攻略都同步拿（這次瀏覽載過的）：第一個畫面就是完整路線，不先畫讀取中、骨架
  const { profile: stored, setProfile, loaded } = useProfile();
  const profile = useMemo(() => ({ level: stored.level, job: normalizeJob(stored.job) }), [stored]);
  const [data, setData] = useState<HomeData | null>(peekHomeData);
  const [guideState, setGuideState] = useState<GuideState>(() => ({ job: profile.job, ...guidesFor(profile.job, new Map()) }));
  const [error, setError] = useState<string | null>(null);

  // 換職業的那一次渲染就把攻略換好（React「props 變了就在渲染時調整 state」的寫法）：載過的直接用、沒載過的先放骨架，
  // 不會先拿上一個職業的攻略狀態畫一張不對的主推卡
  let shownGuides = guideState;
  if (shownGuides.job !== profile.job) {
    shownGuides = { job: profile.job, ...guidesFor(profile.job, guideState.guides) };
    setGuideState(shownGuides);
  }
  const { guides, status: guideStatus } = shownGuides;

  useEffect(() => {
    // 一開始就拿到了（這次瀏覽載過）就不用再載
    if (data) return;
    loadHomeData()
      .then(setData)
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  // 載整條職業線的攻略：路線前面幾段用的是上一轉的內容（三轉 111 → 111、110、100）；都載過的上面已經直接用了。
  // 快速切換職業時，晚回來的舊請求不能蓋掉新的；攻略載不到也不擋遊戲資料那部分。
  useEffect(() => {
    const job = profile.job;
    const wanted = guideJobs(job);
    if (cachedGuides(wanted).size === wanted.length) {
      // 都載過了：畫面若還停在讀取中、讀取失敗（剛好在這次渲染之後才載好、或被選單的預載重抓成功），換成載好的
      setGuideState(previous => settleGuides(previous, job));
      return;
    }
    let cancelled = false;
    Promise.all(wanted.map(code => loadGuide(code).then(guide => [code, guide] as const)))
      .then(entries => {
        if (cancelled) return;
        setGuideState(previous => (previous.job === job ? { job, guides: new Map([...previous.guides, ...entries]), status: "ready" } : previous));
      })
      .catch(() => {
        if (!cancelled) setGuideState(previous => (previous.job === job ? { ...previous, status: "failed" } : previous));
      });
    return () => {
      cancelled = true;
    };
  }, [profile.job]);

  const ready = loaded && profile.level > 0 && profile.job >= 0;
  const stage = stageJob(profile.job, profile.level);
  const stageGuide = stage ? guides.get(stage) : undefined;
  // 一轉攻略常同時有好幾條主流（海盜分打手線、槍手線），選了二轉或三轉就挑那條二轉的
  const secondJob = isThirdJob(profile.job) ? previousJob(profile.job) : isSecondJob(profile.job) ? profile.job : 0;
  const branchName = secondJob ? jobOption(secondJob)?.name : undefined;
  // 等級段只跟職業有關；固定同一個陣列，升級路線的標籤 memo 才不會每次重算
  const bands = useMemo(() => bandsFor(profile.job), [profile.job]);

  // 推算記在這次瀏覽裡（session-memo）：換頁離開首頁再回來，資料跟角色沒變就直接拿上次算好的，慢手機換頁比較快。
  // 用到的函式本身也放進依賴：開發時改了 now-plan.ts，熱更新換成新函式就會重算，不會拿舊程式算的結果（正式版函式不會變）
  const effective = useMemo(
    () => (data ? sessionMemo("home:effective", [effectiveLevels, data.quests, data.monsters, data.common], () => effectiveLevels(data.quests, data.monsters, data.common)) : null),
    [data],
  );
  // 先解展開任務細節時，「要先完成」寫前置任務的名字
  const questNames = useMemo(() => new Map((data?.quests ?? []).map(quest => [quest.id, quest.n])), [data]);

  // 城鎮走得到才給「去」（跟主推卡的「帶我去」同一個條件）；同一張圖只算一次
  const canGo = useMemo(() => {
    const cache = new Map<number, boolean>();
    return (map: number) => {
      if (!data) return false;
      if (!cache.has(map)) cache.set(map, townRoute(map, data.graph, data.maps, data.nearestTown).hops !== undefined);
      return cache.get(map) as boolean;
    };
  }, [data]);
  // 這一轉的攻略還在載入（主推卡放骨架）；升級路線也先不照主推寫標籤，免得先寫一張遊戲資料的圖又換掉
  const guideLoading = stage > 0 && !stageGuide && guideStatus === "loading";

  const plan = useMemo(() => {
    if (!data || !ready || !effective) return null;
    // 主推卡、先解、長線也記在這次瀏覽裡：資料、攻略、等級、職業都一樣就直接拿上次的
    const deps = [
      mainPick, nowQuests, longRunNow, pqJustClosed,
      data.quests, data.monsters, data.common, data.training, data.maps, data.graph, data.nearestTown, effective, stageGuide, profile.level, profile.job,
    ];
    return sessionMemo("home:plan", deps, () => {
      const monsterIndex = new Map(data.monsters.map(monster => [monster.id, monster]));
      const pick = mainPick({
        level: profile.level,
        job: profile.job,
        guide: stageGuide,
        common: data.common,
        training: data.training,
        monsters: data.monsters,
        maps: data.maps,
        graph: data.graph,
        nearestTown: data.nearestTown,
      });
      const todo = nowQuests({
        level: profile.level,
        job: profile.job,
        quests: data.quests,
        monsters: data.monsters,
        common: data.common,
        maps: data.maps,
        effective,
      });
      // 長線跟先解同一批候選（實際等級、過期都套），規則在 now-plan 的 longRunNow
      const longRun = longRunNow({
        level: profile.level,
        job: profile.job,
        quests: data.quests,
        monsters: data.monsters,
        common: data.common,
        maps: data.maps,
        effective,
      }).slice(0, 3);
      // 組隊任務剛過遊戲上限（超綠 30 等）時，主推卡說一聲
      const pqClosed = pqJustClosed(data.common, profile.job, profile.level, data.quests);
      return { monsterIndex, pick, todo, longRun, pqClosed };
    });
  }, [data, ready, effective, profile, stageGuide]);

  if (error) {
    return <p className="py-10 text-center text-sm ink-soft">資料讀取失敗：{error}。重新整理一次試試。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      {/* V002 內容現在就上線，但要等官方 2026/10/15 開機才能玩；10/15 一到自動不再標，不用重新部署 */}
      {showV002Banner ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          已經照 10/15 改版排好：三轉、Lv.120、天空之城／冰原雪域／廢礦區，要 2026/10/15 開機後才能去。
        </p>
      ) : null}

      {/* 硬重新整理那一下，伺服器畫的版本還不知道你有沒有存角色：畫面畫出來之前先看本機（SAVED_PROFILE_HINT），
          存過角色的人「你現在幾等、什麼職業？」看不見、位置照留（頁面不會跳），才不會以為角色被清掉；第一次來的人照常第一時間看到 */}
      {loaded ? null : <script dangerouslySetInnerHTML={{ __html: SAVED_PROFILE_HINT }} />}
      {!ready ? (
        <header className={loaded ? "px-1 pt-2 text-center" : "px-1 pt-2 text-center [[data-profile=saved]_&]:invisible"}>
          <h1 className="text-[26px] font-black leading-tight sm:text-[34px]">你現在幾等、什麼職業？</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed ink-soft">
            選好之後，直接告訴你現在去哪練、先解哪些任務、技能點哪個。
          </p>
        </header>
      ) : (
        <h1 className="sr-only">我的升級路線</h1>
      )}

      {loaded ? <CharacterBar profile={profile} onChange={setProfile} /> : <LoadingBlock label="讀取你的角色…" />}

      {/* 至少佔一個螢幕高：從捲到底的長頁換過來時，首頁頂端被推出畫面，Next 才會捲回頂端。只比螢幕高一點的話，
          位置被截在頁底、頁尾也在畫面裡，路線長出來時瀏覽器的捲動錨定會把畫面一路推到頁底 */}
      {ready && !data ? (
        <div className="min-h-dvh">
          <LoadingBlock label="幫你排路線…" />
        </div>
      ) : null}

      {ready && data && plan ? (
        <>
          {/* 這一轉的攻略還在載入：先放骨架，不先推一張遊戲資料的圖、攻略到了又換掉 */}
          {guideLoading ? (
            <NowCardSkeleton label={`Lv.${profile.level} ${jobOption(profile.job)?.name ?? "初心者"}・現在去這裡`} />
          ) : plan.pick ? (
            <NowCard
              pick={plan.pick}
              level={profile.level}
              jobName={jobOption(profile.job)?.name ?? "初心者"}
              maps={data.maps}
              monsters={plan.monsterIndex}
              routable={data.routable}
              pqClosed={plan.pqClosed}
            />
          ) : (
            <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">這個等級目前找不到適合的練功圖。</p>
          )}

          {/* 換職業或等級時重新掛載，「還有 N 個任務」的展開狀態不帶到別的角色 */}
          <TodoList key={`${profile.job}:${profile.level}`} items={plan.todo} routable={data.routable} maps={data.maps} questNames={questNames} />

          {stageGuide ? (
            <SkillStrip guide={stageGuide} job={stage} level={profile.level} prefer={branchName} leftover={jobTier(stage) === 3 ? null : data.common.spLeftover} />
          ) : null}
          {stage && !stageGuide && guideStatus === "failed" ? (
            <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">技能點法讀取失敗，重新整理一次試試。上面的練功圖跟任務不受影響。</p>
          ) : null}

          {/* 能力值點多少、拿哪把武器、衝什麼卷：只講你這個等級；自己載 gear.json，載不到只影響這張卡 */}
          <GearCard job={stage} level={profile.level} maps={data.maps} routable={data.routable} />

          {plan.longRun.length ? (
            <Panel title="長線，有空再刷" aside={<SourceTag kind="data" />}>
              <ul className="space-y-2">
                {plan.longRun.map(entry => {
                  const dropper = entry.droppers.map(id => plan.monsterIndex.get(id)).find(Boolean);
                  return (
                    <li key={`${entry.kind}:${entry.id}`} className="flex items-center gap-2.5 text-[13px]">
                      {dropper ? <Sprite src={monsterImage(dropper.id)} size={34} /> : <Sprite src={itemImage(entry.id)} size={28} />}
                      <span className="min-w-0 flex-1 leading-snug">
                        <b>{entry.kind === "kill" ? `打${entry.n}` : entry.n}</b> 累計 {formatNumber(entry.c)} {entry.kind === "kill" ? "隻" : "個"}
                        <span className="block text-[12px] ink-soft">
                          {entry.quests.length} 個任務共 {formatNumber(entry.exp)} 經驗
                          {entry.kind === "item" && dropper ? ` · ${dropper.n} 會掉` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          <section aria-label="升級路線" className="space-y-2.5 pt-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[16px] font-black">升級路線</h2>
              <span className="text-[12px] ink-faint">點開每一段看練功、技能、必解、先存</span>
            </div>
            <RouteTimeline
              key={`${profile.job}:${bandOf(bands, profile.level).from}`}
              job={profile.job}
              prefer={branchName}
              guideStatus={guideStatus}
              level={profile.level}
              bands={bands}
              guides={guides}
              quests={data.quests}
              monsters={data.monsters}
              monsterIndex={plan.monsterIndex}
              maps={data.maps}
              training={data.training.filter(row => !isIslandMap(row.m))}
              common={data.common}
              effective={effective!}
              pick={guideLoading ? undefined : plan.pick}
              canGo={canGo}
            />
          </section>

          <p className="px-1 pt-2 text-[12px] leading-relaxed ink-faint">
            遊戲資料：版本 {data.meta.gameVersion ?? "—"}（{data.meta.dataGeneratedAtText?.slice(0, 10) ?? "—"}）；
            點法、練功點與必解任務整理自巴哈姆特、波波攻略島、楓錄等玩家攻略（{data.common.researchedAt}），每一條都附出處。
            想看全部地圖或任務，去
            <Link href="/db" className="mx-1 font-bold text-[color:var(--sky)]">查資料</Link>。
          </p>
        </>
      ) : null}
    </div>
  );
}

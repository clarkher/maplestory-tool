/**
 * 名字變怪物：演出一開始就在背後把影片錄好（v2.74），按［發影片到社群］時檔案已經在手上，
 * 系統分享才趕得上那次點擊（等 6 秒再叫會被瀏覽器擋）。
 *
 *   const stop = startRoundVideo({ record, hidden, watch, onState }); stop()
 *
 * 錄影照牆上時間錄，分頁切走時畫面會停住：切走就丟掉這次，回來重錄。錄不出來（null、例外）回 failed、不重試。
 * 只管什麼時候錄、結果算不算數，畫面怎麼畫由 record 決定（useRoundVideo.ts）；純函式、有測試。
 */
export type VideoState = { status: "recording" } | { status: "ready"; blob: Blob } | { status: "failed" };

export type RoundVideoDeps = {
  /** 錄一次；signal 取消就停，回什麼都不算 */
  record: (signal: AbortSignal) => Promise<Blob | null>;
  hidden: () => boolean;
  /** 分頁切走、回來時叫 cb；回傳取消監聽 */
  watch: (cb: () => void) => () => void;
  onState: (s: VideoState) => void;
};

export function startRoundVideo({ record, hidden, watch, onState }: RoundVideoDeps): () => void {
  let take: AbortController | null = null;
  let settled = false;

  const settle = (blob: Blob | null) => {
    take = null;
    settled = true;
    onState(blob ? { status: "ready", blob } : { status: "failed" });
  };
  const begin = () => {
    const ac = new AbortController();
    take = ac;
    const mine = (blob: Blob | null) => {
      if (take === ac) settle(blob);
    };
    record(ac.signal).then(mine, () => mine(null));
  };
  const drop = () => {
    const ac = take;
    take = null;
    ac?.abort();
  };

  const unwatch = watch(() => {
    if (settled) return;
    if (hidden()) drop();
    else if (!take) begin();
  });
  onState({ status: "recording" });
  if (!hidden()) begin();

  return () => {
    settled = true;
    unwatch();
    drop();
  };
}

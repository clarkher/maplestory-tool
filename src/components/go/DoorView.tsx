import { LABEL_MAX, RING, doorLayout, doorViewport, viewPercent } from "@/lib/go-view";

/** 圖框比例（寬／高）。固定比例＋全部用百分比定位：不用量寬度，圖還沒載完框也不會動 */
const ASPECT = 7 / 4;

/**
 * 地圖導航每一段的圖（v2.10，版面 B）：整張地圖畫面放大到出口附近，出口畫橘圈＋「往 X」。
 * 進來的位置剛好在畫面裡就畫白點；角落小圖是整張地圖，橘框是現在看的這一塊（整張都看得到時不放）。
 */
export function DoorView({
  src,
  bounds,
  exit,
  entry,
  mapName,
  nextName,
}: {
  src: string;
  bounds: [number, number, number, number];
  exit: [number, number];
  entry: [number, number] | null;
  mapName: string;
  nextName: string;
}) {
  const [left, top, width, height] = bounds;
  const view = doorViewport(bounds, exit, ASPECT);
  const door = viewPercent(view, exit);
  const from = entry ? viewPercent(view, entry) : null;
  const whole = view.w >= width && view.h >= height;
  // 角落小圖：寬 30%，直的地圖改用高 45% 定大小（不然比圖框還高）。圈、標籤、小圖怎麼擺不互相蓋到在 doorLayout
  const tall = width / height < (30 * ASPECT) / 45;
  const overview = whole ? null : tall ? { w: (45 / ASPECT) * (width / height), h: 45 } : { w: 30, h: (30 * ASPECT) / (width / height) };
  const layout = doorLayout(door, ASPECT, nextName.length + 2, overview);
  const corner = layout.corner;

  return (
    <figure className="sm:max-w-[520px]">
      <div
        className="relative overflow-hidden rounded-xl border border-[color:var(--paper-edge)] bg-black"
        style={{ aspectRatio: `${ASPECT}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${mapName}的地圖畫面，圈起來的是往${nextName}的傳送門`}
          loading="lazy"
          decoding="async"
          className="absolute block max-w-none"
          style={{
            left: `${(-(view.x - left) / view.w) * 100}%`,
            top: `${(-(view.y - top) / view.h) * 100}%`,
            width: `${(width / view.w) * 100}%`,
            height: `${(height / view.h) * 100}%`,
          }}
        />

        {from?.inside ? (
          <span
            title="你從這裡進來"
            className="absolute z-[1] -ml-[6px] -mt-[6px] size-3 rounded-full border-2 border-[#222] bg-white"
            style={{ left: `${from.left}%`, top: `${from.top}%` }}
          />
        ) : null}

        <span
          data-go-door
          className="absolute z-[2] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[color:var(--maple)] shadow-[0_0_0_2px_#000a,0_0_12px_var(--maple)]"
          style={{ left: `${door.left}%`, top: `${door.top}%`, width: `${RING}%` }}
        />
        <span
          className="absolute z-[3] overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[color:var(--maple)] px-2 py-0.5 text-[13px] font-black leading-snug text-[color:var(--on-accent)] shadow-[0_1px_4px_#000a]"
          style={{
            left: `${door.left}%`,
            top: `${layout.labelTop}%`,
            maxWidth: `${LABEL_MAX}%`,
            // 橫向照門的位置往回推（靠右往左長、靠左往右長），不超出圖框；貼著圈的上緣，放不下就貼下緣
            transform: `translate(-${door.left}%, ${layout.labelBelow ? "0" : "-100%"})`,
          }}
        >
          往 {nextName}
        </span>

        {overview && corner ? (
          <span
            data-go-overview
            className="absolute z-[4] overflow-hidden rounded border border-white/60 bg-black shadow-[0_1px_4px_#000a]"
            style={{
              width: `${overview.w}%`,
              height: `${overview.h}%`,
              [corner.endsWith("left") ? "left" : "right"]: "2%",
              [corner.startsWith("top") ? "top" : "bottom"]: `${2 * ASPECT}%`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" decoding="async" className="block size-full opacity-75" />
            <span
              className="absolute rounded-[2px] border-2 border-[color:var(--maple)]"
              style={{
                left: `${((view.x - left) / width) * 100}%`,
                top: `${((view.y - top) / height) * 100}%`,
                width: `${(view.w / width) * 100}%`,
                height: `${(view.h / height) * 100}%`,
              }}
            />
          </span>
        ) : null}
      </div>
      {overview && corner ? <figcaption className="mt-1 text-xs ink-faint">角落小圖是整張地圖，橘框是現在看的這一塊</figcaption> : null}
    </figure>
  );
}

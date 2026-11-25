import { afterEach, describe, expect, it, vi } from "vitest";
import { canRecordVideo, canSendVideo, pickVideoType, recordVideo, sendText, sendVideo, shareableFile, shareFile, shareLink, shareUrl, VIDEO } from "../share";
import { liveShapeIds, shareOgTitle, sharePageIds, sharePageName } from "../share-pages";
import { decodeShare, type Stroke } from "../strokes";
import shapesJson from "../shapes.json";

const all: Stroke[] = [
  [[8, 8], [30, 10]],
  [[30, 10], [32, 40]],
  [[10, 20], [12, 50], [20, 55]],
];

describe("shareUrl", () => {
  it("怪物：/plan/rename/m/<id>#r=...，解得回同一輪", () => {
    const url = shareUrl({ id: 210100, score: 73, all, kept: [0, 2] });
    expect(url).toMatch(/^\/plan\/rename\/m\/210100#r=[A-Za-z0-9_-]+$/);
    const back = decodeShare(url.split("#r=")[1]);
    expect(back?.id).toBe(210100);
    expect(back?.score).toBe(73);
    expect(back?.kept).toEqual([0, 2]);
    expect(back?.all.length).toBe(3);
  });
  it("一坨：/plan/rename/m/poop#r=...", () => {
    const url = shareUrl({ id: "poop", score: 12, all, kept: [] });
    expect(url).toMatch(/^\/plan\/rename\/m\/poop#r=[A-Za-z0-9_-]+$/);
    expect(decodeShare(url.split("#r=")[1])?.id).toBe("poop");
  });
});

describe("recordVideo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("沒有 MediaRecorder 回 null", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const canvas = { width: 720, height: 1280, captureStream: () => ({}) } as unknown as HTMLCanvasElement;
    await expect(recordVideo(canvas, () => {})).resolves.toBeNull();
  });
  it("畫布不能 captureStream 也回 null", async () => {
    vi.stubGlobal("MediaRecorder", class {});
    const canvas = { width: 720, height: 1280 } as unknown as HTMLCanvasElement;
    await expect(recordVideo(canvas, () => {})).resolves.toBeNull();
  });
  describe("錄到一半", () => {
    /** 假的 MediaRecorder＋手動推的 requestAnimationFrame */
    const setup = () => {
      let frame: ((t: number) => void) | null = null;
      vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => {
        frame = f;
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {
        frame = null;
      });
      vi.stubGlobal("window", { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) });
      class Rec {
        static isTypeSupported = () => true;
        state = "inactive";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        onerror = null;
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({ data: new Blob(["x"]) });
          this.onstop?.();
        }
      }
      vi.stubGlobal("MediaRecorder", Rec);
      const track = { stop: vi.fn() };
      const canvas = { captureStream: () => ({ getTracks: () => [track] }) } as unknown as HTMLCanvasElement;
      const step = (t: number) => frame?.(t);
      return { canvas, track, step, waiting: () => frame !== null };
    };
    it("播到底才有影片", async () => {
      const s = setup();
      const p = recordVideo(s.canvas, () => {});
      s.step(1000);
      s.step(1000 + VIDEO.ms + VIDEO.tail);
      expect((await p)?.type).toBe("video/mp4");
      expect(s.track.stop).toHaveBeenCalled();
    });
    it("signal 取消：回 null、不再畫、收掉串流", async () => {
      const s = setup();
      const ac = new AbortController();
      const p = recordVideo(s.canvas, () => {}, ac.signal);
      s.step(1000);
      ac.abort();
      await expect(p).resolves.toBeNull();
      expect(s.waiting()).toBe(false);
      expect(s.track.stop).toHaveBeenCalled();
    });
    it("一開始就取消了：回 null", async () => {
      const s = setup();
      await expect(recordVideo(s.canvas, () => {}, AbortSignal.abort())).resolves.toBeNull();
    });
    it("畫面卡住沒播到底：不給半截影片，回 null", async () => {
      vi.useFakeTimers();
      try {
        const s = setup();
        const p = recordVideo(s.canvas, () => {});
        s.step(1000);
        s.step(2000);
        vi.advanceTimersByTime(VIDEO.ms + VIDEO.tail + 4000);
        await expect(p).resolves.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
  it("規格：720×1280、30fps", () => {
    expect(VIDEO).toMatchObject({ w: 720, h: 1280, fps: 30 });
  });
});

describe("canRecordVideo（決定要不要放「存影片」）", () => {
  afterEach(() => vi.unstubAllGlobals());
  const canvasWith = (capture: boolean) => vi.stubGlobal("HTMLCanvasElement", { prototype: capture ? { captureStream: () => ({}) } : {} });

  it("沒有 MediaRecorder → false", () => {
    canvasWith(true);
    vi.stubGlobal("MediaRecorder", undefined);
    expect(canRecordVideo()).toBe(false);
  });
  it("有 MediaRecorder 但沒有支援的格式 → false", () => {
    canvasWith(true);
    vi.stubGlobal("MediaRecorder", Object.assign(class {}, { isTypeSupported: () => false }));
    expect(canRecordVideo()).toBe(false);
  });
  it("畫布不能 captureStream → false", () => {
    canvasWith(false);
    vi.stubGlobal("MediaRecorder", Object.assign(class {}, { isTypeSupported: () => true }));
    expect(canRecordVideo()).toBe(false);
  });
  it("都有 → true", () => {
    canvasWith(true);
    vi.stubGlobal("MediaRecorder", Object.assign(class {}, { isTypeSupported: (t: string) => t.startsWith("video/webm") }));
    expect(canRecordVideo()).toBe(true);
  });
});

describe("shareableFile（錄完影片才決定放「分享影片」還是直接下載）", () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = (touch: boolean, canShare?: (d: { files: File[] }) => boolean) => {
    vi.stubGlobal("matchMedia", () => ({ matches: touch }));
    vi.stubGlobal("navigator", canShare ? { canShare, share: async () => {} } : {});
  };
  const blob = new Blob(["x"], { type: "video/mp4" });

  it("手機、能分享檔案 → 回檔案（名字、格式照給的）", () => {
    env(true, () => true);
    const f = shareableFile(blob, "a.mp4");
    expect(f?.name).toBe("a.mp4");
    expect(f?.type).toBe("video/mp4");
  });
  it("電腦（不是手指操作）→ null，直接下載", () => {
    env(false, () => true);
    expect(shareableFile(blob, "a.mp4")).toBeNull();
  });
  it("沒有 canShare 或不收檔案 → null", () => {
    env(true);
    expect(shareableFile(blob, "a.mp4")).toBeNull();
    env(true, () => false);
    expect(shareableFile(blob, "a.mp4")).toBeNull();
  });
  it("shareFile：按取消回 cancel、其他錯誤回 error、成功回 share", async () => {
    const f = new File(["x"], "a.mp4", { type: "video/mp4" });
    vi.stubGlobal("navigator", { share: async () => {} });
    await expect(shareFile(f)).resolves.toBe("share");
    vi.stubGlobal("navigator", { share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } });
    await expect(shareFile(f)).resolves.toBe("cancel");
    vi.stubGlobal("navigator", { share: async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); } });
    await expect(shareFile(f)).resolves.toBe("error");
  });
});

describe("［發影片到社群］（v2.74）", () => {
  afterEach(() => vi.unstubAllGlobals());
  const blob = new Blob(["x"], { type: "video/mp4" });
  const caption = "換你簽 https://maplehelper.tw/plan/rename/m/poop#r=x";
  const fail = (name: string) => async () => {
    throw Object.assign(new Error("x"), { name });
  };
  /** order 記複製、分享、下載誰先誰後 */
  const env = (o: { touch?: boolean; files?: boolean; share?: () => Promise<void>; write?: () => Promise<void> }) => {
    const order: string[] = [];
    let sent: ShareData | undefined;
    vi.stubGlobal("matchMedia", () => ({ matches: o.touch ?? true }));
    vi.stubGlobal("MediaRecorder", Object.assign(class {}, { isTypeSupported: (t: string) => t.startsWith("video/mp4") }));
    vi.stubGlobal("navigator", {
      ...(o.files === undefined ? {} : { canShare: () => o.files }),
      share: (d: ShareData) => {
        order.push("share");
        sent = d;
        return (o.share ?? (async () => {}))();
      },
      clipboard: {
        writeText: (t: string) => {
          order.push(`copy:${t}`);
          return (o.write ?? (async () => {}))();
        },
      },
    });
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "textarea") throw new Error("x");
        return { click: () => order.push("download"), remove: () => {} };
      },
      body: { appendChild: () => {} },
    });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    return { order, sent: () => sent };
  };

  it("canSendVideo：手指操作而且系統分享收得了影片檔才是", () => {
    env({ files: true });
    expect(canSendVideo()).toBe(true);
    env({ files: false });
    expect(canSendVideo()).toBe(false);
    env({});
    expect(canSendVideo()).toBe(false);
    env({ touch: false, files: true });
    expect(canSendVideo()).toBe(false);
  });
  it("手機：先複製文案再叫系統分享，同一下做完；只帶影片檔", async () => {
    const e = env({ files: true });
    const p = sendVideo(blob, "a.mp4", caption);
    // 還沒等任何東西就都叫了（等了點擊就過期）
    expect(e.order).toEqual([`copy:${caption}`, "share"]);
    await expect(p).resolves.toEqual({ how: "share", copied: true });
    expect(Object.keys(e.sent()!)).toEqual(["files"]);
    expect(e.sent()!.files![0].name).toBe("a.mp4");
  });
  it("按取消：不下載，文案還是複製好了", async () => {
    const e = env({ files: true, share: fail("AbortError") });
    await expect(sendVideo(blob, "a.mp4", caption)).resolves.toEqual({ how: "cancel", copied: true });
    expect(e.order).not.toContain("download");
  });
  it("系統分享叫不出來：改下載", async () => {
    const e = env({ files: true, share: fail("NotAllowedError") });
    await expect(sendVideo(blob, "a.mp4", caption)).resolves.toEqual({ how: "download", copied: true });
    expect(e.order).toEqual([`copy:${caption}`, "share", "download"]);
  });
  it("電腦、App 內建瀏覽器：下載＋複製", async () => {
    const pc = env({ touch: false, files: true });
    await expect(sendVideo(blob, "a.mp4", caption)).resolves.toEqual({ how: "download", copied: true });
    expect(pc.order).toEqual([`copy:${caption}`, "download"]);
    const app = env({});
    await expect(sendVideo(blob, "a.mp4", caption)).resolves.toEqual({ how: "download", copied: true });
    expect(app.order).toEqual([`copy:${caption}`, "download"]);
  });
  it("複製不了照樣發影片，照實說沒複製", async () => {
    env({ files: true, write: fail("NotAllowedError") });
    await expect(sendVideo(blob, "a.mp4", caption)).resolves.toEqual({ how: "share", copied: false });
  });
});

describe("［傳給朋友］（v2.60）", () => {
  afterEach(() => vi.unstubAllGlobals());
  const data = { text: "換你簽", url: "https://maplehelper.tw/plan/rename/m/poop#r=x" };
  const env = (touch: boolean, share?: () => Promise<void>, write: () => Promise<void> = async () => {}) => {
    const sent = vi.fn(share ?? (async () => {}));
    const copied = vi.fn(write);
    vi.stubGlobal("matchMedia", () => ({ matches: touch }));
    vi.stubGlobal("navigator", { ...(share ? { share: sent } : {}), clipboard: { writeText: copied } });
    return { sent, copied };
  };
  const fail = (name: string) => async () => {
    throw Object.assign(new Error("x"), { name });
  };

  it("手機：系統分享帶那句話跟連結，不複製", async () => {
    const { sent, copied } = env(true, async () => {});
    await expect(shareLink(data)).resolves.toBe("share");
    expect(sent).toHaveBeenCalledWith(data);
    expect(copied).not.toHaveBeenCalled();
  });
  it("電腦、沒有系統分享的手機：只複製連結", async () => {
    const pc = env(false, async () => {});
    await expect(shareLink(data)).resolves.toBe("copy");
    expect(pc.sent).not.toHaveBeenCalled();
    expect(pc.copied).toHaveBeenCalledWith(data.url);
    env(true);
    await expect(shareLink(data)).resolves.toBe("copy");
  });
  it("按取消什麼都不做；面板叫不出來改複製；都不行回 error", async () => {
    const { copied } = env(true, fail("AbortError"));
    await expect(shareLink(data)).resolves.toBe("cancel");
    expect(copied).not.toHaveBeenCalled();
    env(true, fail("NotAllowedError"));
    await expect(shareLink(data)).resolves.toBe("copy");
    vi.stubGlobal("document", { createElement: () => { throw new Error("x"); } });
    env(true, fail("NotAllowedError"), fail("NotAllowedError"));
    await expect(shareLink(data)).resolves.toBe("error");
  });
  it("帶的話：出怪寫怪名、一坨寫一坨", () => {
    expect(sendText({ kind: "monster", n: "嫩寶" })).toBe("我的 ID 簽一簽變成「嫩寶」，換你簽");
    expect(sendText({ kind: "poop" })).toBe("我的 ID 測出來是一坨，換你簽");
  });
});

describe("pickVideoType", () => {
  it("支援 mp4 就用 mp4，不然 webm；都不支援回 null", () => {
    expect(pickVideoType(t => t.startsWith("video/mp4"))).toMatch(/^video\/mp4/);
    expect(pickVideoType(t => t.startsWith("video/webm"))).toMatch(/^video\/webm/);
    expect(pickVideoType(() => false)).toBeNull();
  });
});

describe("結果卡「在哪打／怎麼去」只連還在的怪（v2.44：資料更新拿掉的怪不連 404）", () => {
  it("只留 shapes.json 裡（本尊＋alt）而且還在現在資料裡的 id", () => {
    const first = (shapesJson as { shapes: { id: number; alt?: { id: number }[] }[] }).shapes[0];
    const second = (shapesJson as { shapes: { id: number }[] }).shapes[1];
    const got = liveShapeIds([first.id, 999999999, ...(first.alt ?? []).map(a => a.id)]);
    expect(got).toContain(first.id);
    for (const a of first.alt ?? []) expect(got).toContain(a.id);
    expect(got).not.toContain(999999999);
    expect(got).not.toContain(second.id);
  });
});

describe("分享靜態頁", () => {
  const shapes = (shapesJson as { shapes: { id: number; n: string; alt?: { id: number; n: string }[] }[] }).shapes;

  it("每隻怪（含換色的 alt）跟一坨都有一頁、不重複", () => {
    const ids = sharePageIds();
    expect(ids).toContain("poop");
    for (const s of shapes) {
      expect(ids).toContain(String(s.id));
      for (const a of s.alt ?? []) expect(ids).toContain(String(a.id));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("名字照 shapes.json：本尊用 n、alt 用自己的 n", () => {
    const withAlt = shapes.find(s => s.alt?.length)!;
    expect(sharePageName(String(withAlt.id))).toBe(withAlt.n);
    expect(sharePageName(String(withAlt.alt![0].id))).toBe(withAlt.alt![0].n);
    expect(sharePageName("poop")).toBeNull();
    expect(sharePageName("1")).toBeUndefined();
  });
  it("og 標題", () => {
    expect(shareOgTitle("綠水靈")).toBe("我從今天起是「綠水靈」｜名字變怪物");
    expect(shareOgTitle(null)).toBe("測出來是一坨｜名字變怪物");
  });
});

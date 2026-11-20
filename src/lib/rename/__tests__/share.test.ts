import { afterEach, describe, expect, it, vi } from "vitest";
import { canRecordVideo, pickVideoType, recordVideo, shareableFile, shareFile, shareUrl, VIDEO } from "../share";
import { shareOgTitle, sharePageIds, sharePageName } from "../share-pages";
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

describe("pickVideoType", () => {
  it("支援 mp4 就用 mp4，不然 webm；都不支援回 null", () => {
    expect(pickVideoType(t => t.startsWith("video/mp4"))).toMatch(/^video\/mp4/);
    expect(pickVideoType(t => t.startsWith("video/webm"))).toMatch(/^video\/webm/);
    expect(pickVideoType(() => false)).toBeNull();
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

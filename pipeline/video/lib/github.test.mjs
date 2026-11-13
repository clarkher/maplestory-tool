import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseExists, upsertRelease, renderVideoComment, renderSkipComment } from "./github.mjs";

const REPO = "clarkher/maplestory-tool";
const DL = (n) => `https://github.com/${REPO}/releases/download/video-84140/${n}`;

async function files() {
  const dir = await mkdtemp(join(tmpdir(), "gh-"));
  const out = [];
  for (const n of ["main.mp4", "cover.png", "youtube.txt"]) {
    const p = join(dir, n);
    await writeFile(p, n);
    out.push(p);
  }
  return out;
}

function fakeCall(existing) {
  const log = [];
  const call = async (method, url, body, opts = {}) => {
    log.push({ method, url, body, opts });
    if (method === "GET" && url.endsWith("/releases/tags/video-84140")) {
      if (!existing) throw new Error("GET … → HTTP 404：Not Found");
      return existing;
    }
    if (method === "POST" && url === `/repos/${REPO}/releases`) {
      return { id: 7, html_url: `https://github.com/${REPO}/releases/tag/video-84140`, upload_url: "https://uploads.github.com/repos/x/releases/7/assets{?name,label}", assets: [] };
    }
    if (method === "PATCH") return { ...existing, name: body.name };
    if (method === "DELETE") return null;
    if (method === "POST" && url.startsWith("https://uploads.github.com/")) {
      const name = new URL(url).searchParams.get("name");
      return { name, browser_download_url: DL(name) };
    }
    throw new Error(`沒想到的呼叫 ${method} ${url}`);
  };
  return { call, log };
}

test("upsertRelease：沒有就建 prerelease（tag video-<id>、待審｜標題、main），上傳每個檔", async () => {
  const { call, log } = fakeCall(null);
  const r = await upsertRelease("84140", "閃亮彗星", await files(), { call, repo: REPO });
  const create = log.find((c) => c.method === "POST" && c.url === `/repos/${REPO}/releases`);
  assert.equal(create.body.tag_name, "video-84140");
  assert.equal(create.body.prerelease, true);
  assert.equal(create.body.name, "待審｜閃亮彗星");
  assert.equal(create.body.target_commitish, "main");
  const ups = log.filter((c) => c.url.startsWith("https://uploads.github.com/"));
  assert.deepEqual(ups.map((c) => new URL(c.url).searchParams.get("name")), ["main.mp4", "cover.png", "youtube.txt"]);
  assert.ok(Buffer.isBuffer(ups[0].body));
  assert.equal(ups[0].opts.contentType, "video/mp4");
  assert.equal(ups[1].opts.contentType, "image/png");
  assert.equal(r.htmlUrl, `https://github.com/${REPO}/releases/tag/video-84140`);
  assert.equal(r.assetUrls["cover.png"], DL("cover.png"));
  assert.ok(!log.some((c) => c.method === "DELETE"));
});

test("upsertRelease：已存在 → 先刪同名舊資產再上傳，不同名的留著", async () => {
  const existing = {
    id: 9, html_url: `https://github.com/${REPO}/releases/tag/video-84140`,
    upload_url: "https://uploads.github.com/repos/x/releases/9/assets{?name,label}",
    assets: [{ id: 101, name: "main.mp4" }, { id: 102, name: "cover.png" }, { id: 103, name: "notes.txt" }],
  };
  const { call, log } = fakeCall(existing);
  await upsertRelease("84140", "閃亮彗星", await files(), { call, repo: REPO });
  const dels = log.filter((c) => c.method === "DELETE").map((c) => c.url);
  assert.deepEqual(dels, [`/repos/${REPO}/releases/assets/101`, `/repos/${REPO}/releases/assets/102`]);
  const firstUpload = log.findIndex((c) => c.url.startsWith("https://uploads.github.com/"));
  const lastDelete = log.findLastIndex((c) => c.method === "DELETE");
  assert.ok(lastDelete < firstUpload);
  assert.ok(!log.some((c) => c.method === "POST" && c.url === `/repos/${REPO}/releases`));
});

test("upsertRelease：GET 不是 404 的錯照丟", async () => {
  const call = async () => { throw new Error("GET → HTTP 500：boom"); };
  await assert.rejects(() => upsertRelease("84140", "x", [], { call, repo: REPO }), /HTTP 500/);
});

const row = { bullentinId: "84140", title: "【閃亮彗星】喵喵管家&軟綿綿雪兔", startDate: "2026/11/12" };

test("renderVideoComment：封面圖、標題、正片／Shorts 下載、youtube.txt 說明", () => {
  const release = {
    htmlUrl: `https://github.com/${REPO}/releases/tag/video-84140`,
    assetUrls: { "main.mp4": DL("main.mp4"), "shorts.mp4": DL("shorts.mp4"), "cover.png": DL("cover.png"), "youtube.txt": DL("youtube.txt") },
  };
  const c = renderVideoComment({ title: "閃亮彗星新外觀", row, release });
  assert.match(c, /!\[封面\]\(https:\/\/[^)]*cover\.png\)/);
  assert.match(c, /video-84140/);
  assert.ok(c.includes("閃亮彗星新外觀"));
  assert.ok(c.includes(DL("main.mp4")));
  assert.ok(c.includes(DL("shorts.mp4")));
  assert.ok(c.includes("看完上傳到楓谷幫手頻道，標題說明欄在 youtube.txt"));
  assert.ok(c.includes("https://maplestoryclassic.beanfun.com/bulletin?Bid=84140"));
});

test("renderSkipComment：寫公告、原因、手動重跑的指令", () => {
  const c = renderSkipComment(row, "只有標題，沒有內文可以做片");
  assert.ok(c.includes(row.title));
  assert.ok(c.includes("只有標題，沒有內文可以做片"));
  assert.ok(c.includes("gh workflow run announce-video.yml -f bulletin_id=84140"));
});

test("releaseExists：404 → false；四個檔都在 → true；缺檔（做到一半）→ false", async () => {
  const mk = (res) => async (method, url) => {
    assert.equal(method, "GET");
    assert.ok(url.endsWith("/releases/tags/video-9"));
    if (res === 404) throw new Error("GET → HTTP 404：Not Found");
    if (res === 500) throw new Error("GET → HTTP 500：boom");
    return res;
  };
  const full = { assets: ["main.mp4", "shorts.mp4", "cover.png", "youtube.txt"].map((name) => ({ name })) };
  assert.equal(await releaseExists("video-9", { call: mk(404), repo: REPO }), false);
  assert.equal(await releaseExists("video-9", { call: mk(full), repo: REPO }), true);
  assert.equal(await releaseExists("video-9", { call: mk({ assets: [{ name: "main.mp4" }] }), repo: REPO }), false);
  await assert.rejects(() => releaseExists("video-9", { call: mk(500), repo: REPO }), /500/);
});

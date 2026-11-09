/**
 * 上游 repo 的版本歷史：每個遊戲版本的頭尾 commit，以及把任一個 commit 的資料重建到暫存資料夾。
 * 改版比對（/updates）拿「這一版」跟「前一個不同版號」的資料相比，所以要能重建舊版。
 *
 *   versionAt(gitDir, commit)             那個 commit 的 data.js metadata.gameVersion（只讀 data.js）
 *   versionTimeline(gitDir, { since, ref }) 依版號分段，舊到新（ref：只看到這個 commit 為止，預設 HEAD）
 *   previousVersion(timeline, version)    不同版號的前一段（同版修正不算）
 *   buildAt(gitDir, commit, outDir)       重建那個 commit 的網站資料到 outDir
 *
 * git 一律用陣列參數（不經 shell）；commit 只收 7～40 碼 16 進位。
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UPSTREAM_PARTS, parseUpstreamScript, readUpstream } from "./upstream.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = /^[0-9a-f]{7,40}$/;
const MAX_BUFFER = 512 * 1024 * 1024;

function checkCommit(commit) {
  if (typeof commit !== "string" || !SHA.test(commit)) throw new Error(`commit 格式不對（${JSON.stringify(commit)}）`);
  return commit;
}

function git(gitDir, args, encoding = "utf8") {
  return execFileSync("git", ["-C", gitDir, ...args], { encoding, maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] });
}

/** 某 commit 的檔案內容（Buffer）；不存在回 null。 */
function showFile(gitDir, commit, file) {
  try {
    return git(gitDir, ["show", `${commit}:${file}`], "buffer");
  } catch {
    return null;
  }
}

export function versionAt(gitDir, commit) {
  checkCommit(commit);
  const buf = showFile(gitDir, commit, "data.js");
  if (!buf) return null;
  const spec = UPSTREAM_PARTS.find((p) => p.file === "data.js");
  const part = parseUpstreamScript(buf.toString("utf8"), spec.global, spec.file);
  const v = part?.metadata?.gameVersion;
  return typeof v === "string" && v ? v : null;
}

export function versionTimeline(gitDir, { since, ref } = {}) {
  const args = ["log", "--format=%H %cs"];
  if (since) args.push(`--since=${since}`);
  if (ref !== undefined) args.push(checkCommit(ref));
  args.push("--", "data.js");
  const lines = git(gitDir, args).split("\n").map((l) => l.trim()).filter(Boolean); // 新到舊
  const segments = []; // 新到舊
  for (const line of lines) {
    const [commit, date] = line.split(" ");
    const version = versionAt(gitDir, commit);
    if (!version) continue;
    const top = segments[segments.length - 1];
    if (top && top.version === version) top.first = { commit, date };
    else segments.push({ version, first: { commit, date }, last: { commit, date } });
  }
  return segments.reverse();
}

export function previousVersion(timeline, version) {
  const i = timeline.findIndex((e) => e.version === version);
  if (i <= 0) return null;
  return timeline[i - 1];
}

export function buildAt(gitDir, commit, outDir) {
  checkCommit(commit);
  const tag = commit.slice(0, 8);
  const fail = (why) => new Error(`上游 ${tag} 重建失敗：${why}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `maple-up-${tag}-`));
  try {
    for (const spec of UPSTREAM_PARTS) {
      const buf = showFile(gitDir, commit, spec.file);
      if (!buf) {
        if (spec.required) throw fail(`沒有 ${spec.file}`);
        continue;
      }
      fs.writeFileSync(path.join(tmp, spec.file), buf);
    }
    let payload;
    try {
      payload = readUpstream(tmp);
    } catch (error) {
      throw fail(error.message);
    }
    const artale = path.join(tmp, "artale.json");
    fs.writeFileSync(artale, JSON.stringify(payload));
    fs.mkdirSync(outDir, { recursive: true });
    const res = spawnSync(process.execPath, [path.join(ROOT, "pipeline", "build.mjs")], {
      cwd: ROOT,
      env: { ...process.env, MAPLE_ARTALE_FILE: artale, MAPLE_DATA_OUT: path.resolve(outDir) },
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    if (res.error) throw fail(res.error.message);
    if (res.status !== 0) throw fail(`build.mjs 結束碼 ${res.status}：${(res.stderr || res.stdout || "").trim().split("\n").slice(-3).join(" / ")}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

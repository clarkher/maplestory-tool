// price-data 資料分支：孤兒分支（不帶網站程式），自己帶 vercel.json 擋部署——maple-fx 10/13 實測 fx-data 推上去零部署，同一招。
// 放在「主 checkout」底下的 .price-data（從哪個 worktree 跑都接到同一個），.gitignore 擋掉。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DATA_BRANCH = "price-data";
export const VERCEL_JSON = JSON.stringify({ git: { deploymentEnabled: false } }, null, 2) + "\n";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();

function mainRoot(cwd) {
  return path.dirname(git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"));
}

export function ensureDataWorktree(cwd, remote = "origin") {
  const root = mainRoot(cwd);
  const dir = path.join(root, ".price-data");
  if (fs.existsSync(path.join(dir, ".git"))) {
    try { git(dir, "pull", "-q", "--ff-only", remote, DATA_BRANCH); } catch { /* 沒網路或遠端還沒有：用本機的 */ }
    return dir;
  }
  // 資料夾被刪掉但 git 還記著這個 worktree：不先清掉，下面的 worktree add 會一直報「missing but already registered」
  git(root, "worktree", "prune");
  const localHas = (() => { try { git(root, "rev-parse", "--verify", "-q", `refs/heads/${DATA_BRANCH}`); return true; } catch { return false; } })();
  if (localHas) {
    git(root, "worktree", "add", "-q", dir, DATA_BRANCH);
    return dir;
  }
  // 連不上遠端就丟錯：不然會在本機開一條新的孤兒分支，之後跟遠端的推不上去
  const remoteHas = git(root, "ls-remote", "--heads", remote, `refs/heads/${DATA_BRANCH}`) !== "";
  if (remoteHas) {
    git(root, "fetch", "-q", remote, `${DATA_BRANCH}:refs/remotes/${remote}/${DATA_BRANCH}`);
    git(root, "worktree", "add", "-q", "--track", "-b", DATA_BRANCH, dir, `${remote}/${DATA_BRANCH}`);
    return dir;
  }
  git(root, "worktree", "add", "-q", "--orphan", "-b", DATA_BRANCH, dir);
  fs.writeFileSync(path.join(dir, "vercel.json"), VERCEL_JSON);
  git(dir, "add", "vercel.json");
  git(dir, "commit", "-q", "-m", "price-data：開資料分支（vercel.json 擋部署）");
  return dir;
}

/** 收工：有變動就 commit，然後 push；回傳遠端是不是真的收到 */
export function publishData(dir, message, remote = "origin") {
  // 拿錯資料夾（例如主 repo）會把別的東西 commit 進去，先擋
  if (git(dir, "branch", "--show-current") !== DATA_BRANCH) throw new Error(`${dir} 不在 ${DATA_BRANCH} 分支上，不推`);
  git(dir, "add", "-A");
  const changed = git(dir, "status", "--porcelain") !== "";
  if (changed) git(dir, "commit", "-q", "-m", message);
  git(dir, "push", "-q", "-u", remote, DATA_BRANCH);
  const sha = git(dir, "rev-parse", "HEAD");
  const remoteSha = git(dir, "ls-remote", remote, `refs/heads/${DATA_BRANCH}`).split(/\s+/)[0];
  return { committed: changed, pushed: remoteSha === sha, sha };
}

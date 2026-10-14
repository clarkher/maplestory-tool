/**
 * fx-collect.yml 的 publish job：檢查 collect 的 artifact，通過才放進 fx-data 的工作目錄（git commit／push 在 workflow 裡）。
 *
 *   node pipeline/fx/publish.mjs <artifact 資料夾> <fx-data 工作目錄> <pipeline/fx/branch-files>
 */
import { checkArtifact, installArtifact } from "./lib/artifact.mjs";

const [outDir, branchDir, staticDir] = process.argv.slice(2);
if (!outDir || !branchDir || !staticDir) {
  console.error("用法：node pipeline/fx/publish.mjs <artifact 資料夾> <fx-data 工作目錄> <branch-files 資料夾>");
  process.exit(2);
}
checkArtifact(outDir, branchDir);
installArtifact(outDir, branchDir, staticDir);
console.log("artifact 檢查通過，已放進 fx-data 工作目錄");

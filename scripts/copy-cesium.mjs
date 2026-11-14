import fs from "node:fs/promises";
import path from "node:path";

const source = path.resolve("node_modules/cesium/Build/Cesium");
const target = path.resolve("dist/cesium");
for (const folder of ["Workers", "Assets", "ThirdParty"]) {
  await fs.cp(path.join(source, folder), path.join(target, folder), { recursive: true });
}
console.log("Copied Cesium runtime assets.");

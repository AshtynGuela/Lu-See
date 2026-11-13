import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { PLANETS, PHYSICAL_SOURCE } from "../engine/solar.mjs";
await fs.mkdir("public/assets/planets", { recursive: true });
execFileSync("python", ["scripts/normalize-planet-textures.py"], {
  stdio: "inherit",
});
const manifest = {
  source:
    "Owner-supplied NASA models in ../SolarSystem; rendering assets, not ephemerides",
  physicalSource: PHYSICAL_SOURCE,
  bodies: {},
};
for (const body of PLANETS) {
  const target = "public/assets/planets/" + body.id + ".glb";
  if (body.id === "earth")
    await fs.copyFile("public/assets/earth-web.glb", target);
  else {
    try {
      await fs.access(target);
    } catch {
      execFileSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        [
          "--yes",
          "@gltf-transform/cli@4.4.0",
          "meshopt",
          ".cache/planet-input/" + body.file,
          target,
          "--level",
          "high",
        ],
        { stdio: "inherit", shell: process.platform === "win32" },
      );
    }
  }
  manifest.bodies[body.id] = {
    source: body.file,
    bytes: (await fs.stat(target)).size,
    optimizedWith: "glTF Transform 4.4.0 / meshopt",
  };
}
await fs.writeFile(
  "public/assets/planets/provenance.json",
  JSON.stringify(manifest, null, 2),
);

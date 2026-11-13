import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
await fs.mkdir("public/assets", { recursive: true });
// Compress Rocky's buffers while retaining every vertex and original texture.
const rockySource = "../Rocky/Rocky-Rigged.glb";
const rockyTarget = "public/assets/rocky-web.glb";
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--yes", "@gltf-transform/cli@4.4.0", "meshopt", rockySource, rockyTarget,
    "--quantize-position", "16", "--quantize-texcoord", "14",
    "--quantize-normal", "12", "--quantize-weight", "12"],
  { stdio: "inherit", shell: process.platform === "win32" },
);
const rockyHash = createHash("sha256").update(await fs.readFile(rockyTarget)).digest("hex");
for (const [source, target, ratio, size] of [
  [
    "../SolarSystem/Earth_1_12756.glb",
    "public/assets/earth-web.glb",
    ".15",
    "1024",
  ],
]) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "--yes",
      "@gltf-transform/cli@4.4.0",
      "optimize",
      source,
      target,
      "--compress",
      "meshopt",
      "--simplify-ratio",
      ratio,
      "--simplify-error",
      ".03",
      "--simplify-lock-border",
      "false",
      "--texture-size",
      size,
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
}
const url =
    "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg",
  res = await fetch(url);
if (!res.ok) throw Error("NASA Moon imagery unavailable");
await fs.writeFile(
  "public/assets/moon.jpg",
  new Uint8Array(await res.arrayBuffer()),
);
await fs.writeFile(
  "public/assets/provenance.json",
  JSON.stringify(
    {
      moon: {
        url,
        sourcePage: "https://svs.gsfc.nasa.gov/4720/",
        purpose: "NASA LROC/LOLA rendering texture; visual only, not analysis",
      },
      earth: {
        source: "User-supplied NASA model: SolarSystem/Earth_1_12756.glb",
        optimizedWith: "glTF Transform / meshopt",
      },
      rocky: {
        source: "User-supplied Rocky/Rocky-Rigged.glb",
        servedAsset: "/assets/rocky-web.glb",
        preparation: "Meshopt with high-precision quantization; no mesh simplification or texture recompression",
        sha256: rockyHash,
        note: "Fan character asset; configurable for replacement before public release",
      },
    },
    null,
    2,
  ),
);

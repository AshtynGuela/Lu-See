import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const jobs = new Map();
let queue = Promise.resolve();

async function prune(folder, maximum) {
  const names = (await fs.readdir(folder)).filter(name => /\.(?:jpg|png)$/.test(name));
  if (names.length <= maximum) return;
  const entries = await Promise.all(names.map(async name => {
    const file = path.join(folder, name);
    return { file, used: (await fs.stat(file)).mtimeMs };
  }));
  entries.sort((a, b) => a.used - b.used);
  await Promise.all(entries.slice(0, entries.length - maximum).map(entry => fs.unlink(entry.file)));
}

export async function surfaceImagery(root, lat, lon, width) {
  const folder = path.join(root, ".cache", "surface-imagery-v3");
  const patches = path.join(folder, "patches");
  const tiles = path.join(folder, "tiles");
  const id = createHash("sha256").update(JSON.stringify([lat, lon === 180 ? -180 : lon, width])).digest("hex");
  const file = path.join(patches, id + ".jpg");
  const cached = await fs.readFile(file).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  if (cached) {
    const now = new Date();
    await fs.utimes(file, now, now).catch(() => {});
    return cached;
  }
  if (jobs.has(id)) return jobs.get(id);
  if (jobs.size >= 3) throw Error("Surface imagery is busy. Try again shortly.");
  const job = queue.then(async () => {
    await fs.mkdir(patches, { recursive: true });
    const part = file + ".part";
    try {
      await run(process.env.LUNAR_TERRAIN_PYTHON || "python", [
        path.join(root, "scripts", "surface_imagery.py"), String(lat), String(lon), String(width), part, tiles,
      ], { cwd: root, timeout: 55000, windowsHide: true });
      await fs.rename(part, file);
      const image = await fs.readFile(file);
      await Promise.all([prune(patches, 64), prune(tiles, 192)]).catch(() => {});
      return image;
    } catch {
      throw Error("NASA surface imagery is temporarily unavailable.");
    } finally {
      await fs.unlink(part).catch(() => {});
    }
  }).finally(() => jobs.delete(id));
  jobs.set(id, job);
  queue = job.catch(() => {});
  return job;
}

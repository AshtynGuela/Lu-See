import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const jobs = new Map();
const recent = new Map();
const rawGlobal = path.join(root, "data/raw/ldem_128.img");
const revision = createHash('sha256').update(await fs.readFile(path.join(root,'public/data/manifest.json')))
  .update(await fs.readFile(path.join(root,'data/terrain-regional.json')))
  .update(await fs.readFile(path.join(root,'scripts/lunar_terrain.py')))
  .update(await fs.readFile(path.join(root,'scripts/remote_dem.py'))).digest('hex').slice(0,16);
const resultDir = path.join(root,'.cache/terrain-results');
const failures = new Map();
let queue = Promise.resolve();

export async function coordinateTerrainReady() {
  if (process.env.LUNAR_TERRAIN_MODE !== 'local') return true;
  return (await fs.stat(rawGlobal).catch(() => null))?.size === 2123366400;
}

export async function terrainAt(lat, lon, retry = false) {
  // +/-180 are the same meridian. Retain the longitude at the exact poles
  // because it defines the convention for local north and east.
  const key = JSON.stringify([lat, lon === 180 ? -180 : lon]);
  if (retry) failures.delete(key);
  const failure = failures.get(key);
  if (failure && failure.until > Date.now()) throw failure.error;
  const cached = recent.get(key);
  if (cached) {
    recent.delete(key);
    recent.set(key, cached);
    return cached;
  }
  if (jobs.has(key)) return jobs.get(key);
  if (jobs.size >= 8) throw new Error("Terrain is busy. Try again shortly.");
  const job = queue.then(async () => {
    if (!(await coordinateTerrainReady())) return null;
    const file = path.join(resultDir,createHash('sha256').update(revision+key).digest('hex')+'.json');
    try {
      const cached = JSON.parse(await fs.readFile(file,'utf8')); recent.set(key,cached);
      if(recent.size>8) recent.delete(recent.keys().next().value);
      return cached;
    } catch {}
    const { stdout } = await run(process.env.LUNAR_TERRAIN_PYTHON || "python",
      [path.join(root, "scripts/lunar_terrain.py"), String(lat), String(lon)],
      { cwd: root, windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
    const terrain = JSON.parse(stdout);
    await fs.mkdir(resultDir,{recursive:true});
    await fs.writeFile(file+'.part',stdout);
    await fs.rename(file+'.part',file);
    const files = await fs.readdir(resultDir);
    if (files.length > 128) {
      const ages = await Promise.all(files.map(async name=>({name,time:(await fs.stat(path.join(resultDir,name))).mtimeMs})));
      for(const old of ages.sort((a,b)=>a.time-b.time).slice(0,files.length-128)) await fs.unlink(path.join(resultDir,old.name)).catch(()=>{});
    }
    recent.set(key, terrain);
    if (recent.size > 8) recent.delete(recent.keys().next().value);
    return terrain;
  }).catch(error => {
    const safe = new Error(error.killed ? 'NASA terrain calculation timed out. Retry after the cache has warmed.' :
      (error.stderr?.trim().split('\n').at(-1) || error.message));
    failures.set(key,{error:safe,until:Date.now()+60000});
    if(failures.size>32) failures.delete(failures.keys().next().value);
    throw safe;
  }).finally(() => jobs.delete(key));
  jobs.set(key, job);
  queue = job.catch(() => {});
  return job;
}

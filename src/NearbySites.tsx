import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DAY } from "../engine/index.mjs";
import { compareNearby, nearbyPoints } from "../engine/nearby.mjs";
import { jsonFetch, type Scenario, type Site } from "./store";

export type NearbyPoint = {
  id?: string; name: string; lat: number; lon: number; distanceKm: number;
};
export type RankedSite = NearbyPoint & {
  sunlight: number; contact: number; darkness: number; meetsLimits: boolean | null; score: number;
};
export type NearbyMission = {
  time: number; duration: number; mast: number; antenna: number; profile?: Scenario["profile"];
};
type Search = { points: NearbyPoint[]; mission: NearbyMission };
type Evaluation = Pick<RankedSite, "sunlight" | "contact" | "darkness" | "meetsLimits" | "score">;

export default function NearbySites({ center, sites, mission, close, showMap, compare }: {
  center: NearbyPoint; sites: Site[]; mission: NearbyMission; close: () => void;
  showMap: (rows: RankedSite[], mission: NearbyMission) => void;
  compare: (site: RankedSite, mission: NearbyMission) => void;
}) {
  const [radius, setRadius] = useState("20");
  const [duration, setDuration] = useState(String(mission.duration));
  const [search, setSearch] = useState<Search | null>(null);
  const [rows, setRows] = useState<RankedSite[]>([]);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!search) return;
    const { time, duration, mast, antenna, profile } = search.mission;
    const { points } = search;
    const controller = new AbortController(), { signal } = controller;
    const worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), { type: "module" });
    const results = new Map<number, (result: Evaluation | null) => void>();
    worker.onmessage = ({ data }) => {
      results.get(data.id)?.(data.nearby ?? null);
      results.delete(data.id);
    };
    worker.onerror = () => {
      for (const complete of results.values()) complete(null);
      results.clear();
      controller.abort();
      setError("The calculation stopped. Start the search again.");
    };
    let next = 0;
    const checkPoint = async () => {
      while (next < points.length && !signal.aborted) {
        const id = next++, point = points[id];
        const coords = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
        try {
          const terrainUrl = point.id && !point.id.startsWith("custom-")
            ? "/api/terrain/" + encodeURIComponent(point.id) : "/api/terrain?" + coords;
          let terrain;
          const deadline = Date.now() + 660000;
          do {
            terrain = await jsonFetch(terrainUrl, { signal });
            if (!terrain.pending) break;
            await new Promise(resolve => setTimeout(resolve, 1800));
          } while (!signal.aborted && Date.now() < deadline);
          if (signal.aborted) return;
          const mask = terrain.masks?.[String(mast)];
          if (!mask) throw Error("Terrain unavailable");
          const start = Math.floor(time / DAY) * DAY;
          const query = new URLSearchParams(coords);
          query.set("mast", String(mast));
          query.set("start", new Date(start).toISOString());
          query.set("days", String(Math.ceil((time + duration * DAY - start) / DAY)));
          query.set("siteId", point.id || "custom-0");
          const data = await jsonFetch("/api/ephemeris?" + query, { signal });
          if (!data.observer.terrainApplied || data.observer.elevationM !== terrain.elevationM)
            throw Error("Observer height unavailable");
          const result = await new Promise<Evaluation | null>(resolve => {
            results.set(id, resolve);
            worker.postMessage({ id, kind: "nearby", data, start: time, duration, mask, minAntennaEl: antenna, profile });
          });
          if (!result) throw Error("Mission coverage unavailable");
          if (!signal.aborted) setRows(current => [...current, { ...point, ...result }].sort(compareNearby));
        } catch {
          if (!signal.aborted) setFailed(count => count + 1);
        } finally {
          if (!signal.aborted) setCompleted(count => count + 1);
        }
      }
    };
    void Promise.all([checkPoint(), checkPoint()]);
    return () => {
      controller.abort();
      worker.terminate();
      for (const complete of results.values()) complete(null);
    };
  }, [search]);
  const running = search && total > completed && !error;
  const run = () => {
    const days = Number(duration), km = Number(radius);
    if (!Number.isFinite(days) || days < .1 || days > 90 || !Number.isFinite(km) || km < 1 || km > 100 ||
        mission.time + days * DAY >= Date.parse("2041-01-01")) {
      setError("Use a radius of 1–100 km and a stay of 0.1–90 Earth days within the app’s date range.");
      return;
    }
    const points: NearbyPoint[] = nearbyPoints(center, km, sites);
    setRows([]); setCompleted(0); setFailed(0); setTotal(points.length); setError("");
    setSearch({ points, mission: { ...mission, duration: days } });
  };
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="scenario-dialog landing-planner" role="dialog" aria-modal="true" aria-label="Nearby sites"
      onKeyDown={e => {
        if (e.key === "Escape") close();
        if (e.key !== "Tab") return;
        const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        if ((e.shiftKey && at === 0) || (!e.shiftKey && at === buttons.length - 1)) {
          e.preventDefault();
          (e.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
        }
      }}>
      <header><h2>Find better spots nearby</h2><button aria-label="Close nearby sites" className="icon-button" onClick={close}><X size={20} /></button></header>
      <p>{center.name} · {new Date(mission.time).toISOString().slice(0, 16).replace("T", " ")} UTC</p>
      <div className="planner-range">
        <label>Search radius (km)<input autoFocus type="number" min="1" max="100" value={radius} onChange={e => setRadius(e.target.value)} /></label>
        <label>Surface stay (Earth days)<input type="number" min=".1" max="90" step=".1" value={duration} onChange={e => setDuration(e.target.value)} /></label>
      </div>
      <p className="data-note">Checks eight sampled points and up to two nearby catalogue sites. Ranking favours sunlight, Earth contact and shorter dark periods{mission.profile ? ", with sites meeting all mission limits first" : ""}.</p>
      <button className="primary" onClick={run} disabled={!!running}>Rank nearby sites</button>
      {search && <p role="status" className="data-note">
        Checked {completed} of {total}{failed > 0 ? ` · ${failed} without complete data` : ""}
      </p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      {search && !running && !error && !rows.length && <p>No sites returned complete terrain and sky data.</p>}
      {search && rows.length > 0 && <>
        <ol className="nearby-results">
          {rows.map((row, index) => <li key={row.id || row.name}>
            <div><strong>{index + 1}. {row.name}</strong> · {row.distanceKm.toFixed(1)} km
              <p className="data-note">{row.sunlight.toFixed(1)}% sunlight · {row.contact.toFixed(1)}% contact · {row.darkness.toFixed(1)} h longest dark</p>
              {row.meetsLimits !== null && <small>{row.meetsLimits ? "Meets mission limits" : "Misses one or more limits"}</small>}
            </div>
            <button onClick={() => compare(row, search.mission)}>Compare</button>
          </li>)}
        </ol>
        <button onClick={() => showMap(rows, search.mission)}>Show ranked pins</button>
      </>}
    </section>
  </div>;
}

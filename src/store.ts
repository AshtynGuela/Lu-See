import { create } from "zustand";
import { persist } from "zustand/middleware";
export type Site = {
  id: string;
  name: string;
  region: string;
  family: string;
  lat: number;
  lon: number;
  source: string;
  description: string;
  terrainReady?: boolean;
  resolutionM?: number;
  elevationM?: number;
};
export type View =
  | "solar_system"
  | "overview"
  | "globe"
  | "polar_south"
  | "polar_north"
  | "horizon"
  | "surface";
export type Scenario = {
  id: string;
  siteId: string;
  epoch: string | "live";
  durationDays: number;
  flightProfile?: string;
  arrayMode?: string;
  arrayAzimuth?: number;
  profile?: {
    minSunlitPct: number;
    maxDarknessHours: number;
    minEarthDtePct: number;
  };
};
export type Packet = {
  sun: number[][];
  earth: number[][];
  sources: any[];
  observer: any;
  terrainPending?: boolean;
  interpolation: string;
};
export type Terrain = {
  siteId: string;
  elevationM: number;
  resolutionM: number;
  masks: Record<string, number[]>;
  obstructions?: Record<string, { distanceM: number[]; elevationM: number[] }>;
  azStepDeg?: number;
  maxDistanceM?: number;
  sources: any[];
  note: string;
  tile: { size: number; widthM: number; heightsM: number[] };
};
const terrainRequests = new Map<string, Promise<Terrain | null>>();

export function ensureTerrain(site: Site, force = false) {
  const cached = useScout.getState().terrains[site.id];
  if (cached && !force) return Promise.resolve(cached);
  const pending = terrainRequests.get(site.id);
  if (pending) return pending;
  const url = site.family === "custom"
    ? "/api/terrain?" + new URLSearchParams({ lat: String(site.lat), lon: String(site.lon) })
    : "/api/terrain/" + encodeURIComponent(site.id);
  const request = (async () => {
    const deadline = Date.now() + 360000;
    let terrain, first = true;
    do {
      terrain = await jsonFetch(url + (force && first && site.family === 'custom' ? '&retry=1' : ''));
      first = false;
      if (!terrain.pending) return terrain as Terrain;
      await new Promise(resolve=>setTimeout(resolve,1500));
    } while(Date.now() < deadline);
    throw new Error('NASA terrain is still being prepared. Retry in a moment.');
  })().then((terrain: Terrain) => {
    useScout.setState(s => ({
      terrains: { ...s.terrains, [site.id]: { ...terrain, siteId: site.id } },
    }));
    return terrain;
  }).catch(() => null).finally(() => terrainRequests.delete(site.id));
  terrainRequests.set(site.id, request);
  return request;
}
type State = {
  sites: Site[];
  custom: Site[];
  selected: string;
  time: number;
  playing: boolean;
  speed: number;
  view: View;
  mode: "plain" | "engineer";
  rail: string | null;
  trueScale: boolean;
  grid: boolean;
  markers: boolean;
  terrainLayer: boolean;
  statLayer: string | null;
  layerManifest: any;
  epochVersion: number;
  focusVersion: number;
  scenarioDialog: boolean;
  pickingSite: boolean;
  scenarios: Scenario[];
  activeScenarioId: string | null;
  compare: boolean;
  timeline: boolean;
  mastM: number;
  minAntennaEl: number;
  welcome: boolean;
  travel: { from: number; to: number; started: number; siteId: string } | null;
  landed: boolean;
  chase: boolean;
  toast: string;
  packets: Record<string, Packet>;
  terrains: Record<string, Terrain>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  set: (patch: Partial<State>) => void;
  select: (id: string) => void;
  fly: (id: string) => void;
  message: (text: string) => void;
};
export const useScout = create<State>()(
  persist(
    (set, get) => ({
      sites: [],
      custom: [],
      selected: "im1",
      time: Date.now(),
      playing: false,
      speed: 3600,
      view: "solar_system",
      mode: "plain",
      rail: null,
      trueScale: false,
      grid: false,
      markers: true,
      terrainLayer: false,
      statLayer: null,
      layerManifest: {},
      epochVersion: 0,
      focusVersion: 0,
      scenarioDialog: false,
      pickingSite: false,
      scenarios: [],
      activeScenarioId: null,
      compare: false,
      timeline: false,
      mastM: 2,
      minAntennaEl: 5,
      welcome: true,
      travel: null,
      landed: false,
      chase: true,
      toast: "",
      packets: {},
      terrains: {},
      loading: {},
      errors: {},
      set: (patch) => {
        if (
          patch.time !== undefined &&
          (!Number.isFinite(patch.time) ||
            patch.time < Date.parse("1969-01-01") ||
            patch.time >= Date.parse("2041-01-01"))
        ) {
          set({ playing: false });
          get().message("Choose a UTC date from 1969 through 2040.");
          return;
        }
        set(patch);
      },
      select: (id) =>
        set((s) => ({
          selected: id,
          focusVersion: s.focusVersion + 1,
          view: ["overview", "solar_system"].includes(s.view)
            ? "globe"
            : s.view,
          landed: false,
        })),
      fly: (id) =>
        set((s) => ({
          selected: id,
          view: "globe",
          focusVersion: s.focusVersion + 1,
          landed: false,
        })),
      message: (text) => {
        set({ toast: text });
        setTimeout(() => {
          if (get().toast === text) set({ toast: "" });
        }, 5500);
      },
    }),
    {
      name: "lunar-scouter-v1",
      partialize: (s) => ({
        custom: s.custom,
        scenarios: s.scenarios,
        activeScenarioId: s.activeScenarioId,
        mastM: s.mastM,
        minAntennaEl: s.minAntennaEl,
        mode: s.mode,
        trueScale: s.trueScale,
      }),
    },
  ),
);
export const allSites = () => [
  ...useScout.getState().sites,
  ...useScout.getState().custom,
];
export const packetKey = (id: string, mast: number) => id + ":" + mast;
export function packetFor(
  state: Pick<State, "packets" | "terrains" | "mastM" | "time">,
  id: string,
  time = state.time,
  duration = 0,
) {
  const base = packetKey(id, state.mastM);
  return Object.entries(state.packets).find(
    ([key, p]) =>
      (key === base || key.startsWith(base + ":")) &&
      p.sun[0][0] <= time &&
      p.sun.at(-1)![0] >= time + duration * 86400000 &&
      (state.terrains[id]
        ? p.observer.terrainApplied && p.observer.elevationM === state.terrains[id].elevationM
        : !p.observer.terrainApplied),
  )?.[1];
}
export async function jsonFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
export async function ensureData(
  site: Site,
  time: number,
  duration = 1,
  force = false,
) {
  const state = useScout.getState(),
    key = packetKey(site.id, state.mastM),
    packet = packetFor(state, site.id, time, duration),
    start = Math.floor(time / 86400000) * 86400000;
  const days = Math.max(33, Math.ceil(duration) + 2);
  if (
    !force &&
    packet &&
    time >= packet.sun[0][0] &&
    time + duration * 86400000 <= packet.sun.at(-1)![0] &&
    !(!packet.observer.terrainApplied && site.terrainReady)
  )
    return;
  if (state.loading[key]) return;
  if (!force && state.errors[key]) return;
  state.set({
    loading: { ...state.loading, [key]: true },
    errors: { ...state.errors, [key]: "" },
  });
  try {
    const terrain = await ensureTerrain(site);
    const q = new URLSearchParams({
      siteId: site.id,
      lat: String(site.lat),
      lon: String(site.lon),
      mast: String(state.mastM),
      start: new Date(start).toISOString(),
      days: String(days),
    });
    if (!terrain) q.set("includeTerrain", "1");
    const { terrain: recovered, ...p } = await jsonFetch("/api/ephemeris?" + q);
    useScout.setState((s) => ({
      ...(recovered ? { terrains: { ...s.terrains, [site.id]: { ...recovered, siteId: site.id } } } : {}),
      packets: {
        ...s.packets,
        [key]: p,
        [key + ":" + p.sun[0][0] + ":" + p.sun.at(-1)[0]]: p,
      },
    }));
  } catch (e) {
    useScout.setState((s) => ({ errors: { ...s.errors, [key]: e.message } }));
  } finally {
    useScout.setState((s) => ({ loading: { ...s.loading, [key]: false } }));
  }
}
export function getMask(terrain: Terrain | undefined, mast: number) {
  return terrain?.masks[String(mast)] ?? null;
}

export function selectedScenario(state = useScout.getState()) {
  return (
    state.scenarios.find(
      (s) => s.id === state.activeScenarioId && s.siteId === state.selected,
    ) || state.scenarios.find((s) => s.siteId === state.selected)
  );
}

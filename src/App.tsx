import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Orbit,
  MapPin,
  Clock3,
  Layers,
  Columns2,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Globe2,
  Compass,
  LocateFixed,
  Sun,
  Radio,
  ArrowUpRight,
  Plus,
  X,
  ExternalLink,
  Info,
  RotateCcw,
  Download,
  Keyboard,
  PanelRightClose,
  PanelRightOpen,
  Check,
  Flag,
  Focus,
} from "lucide-react";
import {
  useScout,
  selectedScenario,
  allSites,
  ensureData,
  getMask,
  jsonFetch,
  packetKey,
  packetFor,
  Site,
  Scenario,
} from "./store";
import { conditions, HOUR, DAY, durationLabel } from "../engine/index.mjs";
import {
  SkyStrip,
  TimelineLane,
  ScenarioColumn,
  EventList,
  useMetrics,
} from "./Charts";
import Rocky from "./Rocky";
import DateSlip from "./DateSlip";
import ScenarioDialog from "./LandingPlanner";
import { encodeSession, decodeSession } from "./share.mjs";
import {
  createAnalysisReport,
  missionEpoch,
  reportCsv,
} from "../engine/report.mjs";
const World = lazy(() => import("./World"));
class SceneBoundary extends Component<any, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="webgl-error">
        <h2>The 3D view could not start</h2>
        <p>{this.state.error}</p>
        <p>
          The site list and numerical analysis remain available. Use a
          WebGL2-capable browser.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
const deg = (v: number | undefined) =>
  v === undefined ? "—" : v.toFixed(2) + "°";
const utc = (t: number) =>
  new Date(t).toISOString().slice(0, 19).replace("T", " ");
const bearing = (az: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((az % 360 + 360) % 360) / 45) % 8];
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: any;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={"icon-button" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function App() {
  const state = useScout(),
    [siteFilter, setSiteFilter] = useState(""),
    [inspector, setInspector] = useState(true),
    [menu, setMenu] = useState<any>(null),
    [customDialog, setCustomDialog] = useState<any>(null),
    [customName, setCustomName] = useState(""),
    [customLat, setCustomLat] = useState(""),
    [customLon, setCustomLon] = useState(""),
    [slip, setSlip] = useState(false),
    [health, setHealth] = useState<any>(null),
    [initError, setInitError] = useState(""),
    [dateDraft, setDateDraft] = useState(""),
    [clockEditing, setClockEditing] = useState(false),
    [intro, setIntro] = useState(false),
    [help, setHelp] = useState(false),
    [sources, setSources] = useState(false),
    snapshot = useRef<() => string>(() => ""),
    menuRef = useRef<HTMLDivElement>(null);
  const sites = [...state.sites, ...state.custom],
    site = sites.find((s) => s.id === state.selected),
    key = packetKey(state.selected, state.mastM),
    packet = packetFor(state, state.selected),
    terrain = state.terrains[state.selected],
    mask = getMask(terrain, state.mastM),
    current = packet
      ? conditions(packet, state.time, mask, state.minAntennaEl)
      : null;
  const activeScenario = selectedScenario(state),
    probe = useMemo(
      () => ({
        id: "probe",
        siteId: state.selected,
        epoch: new Date(Math.floor(state.time / DAY) * DAY).toISOString(),
        durationDays: 1,
      }),
      [state.selected, Math.floor(state.time / DAY)],
    ),
    analysis = useMetrics(activeScenario || probe),
    eventAnalysis = useMetrics(probe),
    m = analysis?.metrics;
  const solar = state.view === "solar_system";
  const filteredSites = sites.filter((s) =>
    (s.name + " " + s.region).toLowerCase().includes(siteFilter.toLowerCase()),
  );
  useEffect(() => {
    jsonFetch("/layers/manifest.json")
      .then((l) =>
        state.set({ layerManifest: { ...state.layerManifest, ...l } }),
      )
      .catch(() => {});
    jsonFetch("/api/sites")
      .then((sites) => {
        state.set({ sites });
        const value = new URLSearchParams(location.search).get("session");
        if (value)
          try {
            const shared = decodeSession(value, sites);
            state.set({ ...shared, scenarios: shared.scenarios as Scenario[] });
          } catch {
            state.message(
              "This shared session is invalid or includes an unknown site.",
            );
          }
      })
      .catch((e) => setInitError(e.message));
    jsonFetch("/api/health")
      .then((h) => {
        setHealth(h);
        state.set({
          layerManifest: {
            ...useScout.getState().layerManifest,
            heightReady: h.heightReady,
          },
        });
      })
      .catch(() => {});
    const poll = setInterval(() => {
      jsonFetch("/layers/manifest.json")
        .then((l) =>
          state.set({
            layerManifest: { ...useScout.getState().layerManifest, ...l },
          }),
        )
        .catch(() => {});
      jsonFetch("/api/sites")
        .then((sites) => state.set({ sites }))
        .catch(() => {});
      jsonFetch("/api/health")
        .then((h) => {
          setHealth(h);
          state.set({
            layerManifest: {
              ...useScout.getState().layerManifest,
              heightReady: h.heightReady,
            },
          });
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(poll);
  }, []);
  useEffect(() => {
    if (!site || solar || state.travel) return;
    const timer = setTimeout(
      () => ensureData(site, state.time, activeScenario?.durationDays || 1),
      250,
    );
    return () => clearTimeout(timer);
  }, [
    site?.id,
    site?.terrainReady,
    state.mastM,
    Math.floor(state.time / DAY),
    activeScenario?.durationDays,
    state.epochVersion,
    !!terrain,
    !!state.travel,
    solar,
  ]);
  useEffect(() => {
    if (solar || state.travel) return;
    state.scenarios.forEach((s) => {
      const loc = sites.find((site) => site.id === s.siteId);
      if (loc)
        ensureData(
          loc,
          s.epoch === "live" ? state.time : Date.parse(s.epoch),
          s.durationDays,
        );
    });
  }, [
    state.scenarios,
    state.sites,
    state.mastM,
    Math.floor(state.time / DAY),
    state.packets,
    state.loading,
    !!state.travel,
    solar,
  ]);
  useEffect(() => {
    let previous = performance.now();
    const timer = setInterval(() => {
      const s = useScout.getState(),
        now = performance.now(),
        dt = Math.min(1, (now - previous) / 1000);
      previous = now;
      if (s.travel) {
        const u = Math.min(1, (now - s.travel.started) / 5500),
          ease = u * u * (3 - 2 * u);
        s.set({ time: s.travel.from + (s.travel.to - s.travel.from) * ease });
        if (u >= 1) s.set({ travel: null, view: "surface", landed: true });
      } else if (s.playing) {
        const next = s.time + dt * s.speed * 1000;
        if (next < Date.parse("2041-01-01")) s.set({ time: next });
        else s.set({ playing: false });
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")
      )
        return;
      const s = useScout.getState();
      if (e.key === "Escape") {
        setMenu(null);
        setHelp(false);
        setSources(false);
        s.set({ rail: null });
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        s.set({ playing: !s.playing });
      }
      if (e.key === ",") s.set({ time: s.time - HOUR });
      if (e.key === ".") s.set({ time: s.time + HOUR });
      if (["1", "2", "3", "4"].includes(e.key))
        s.set({ speed: [1, 60, 3600, 86400][+e.key - 1] });
      if (e.key.toLowerCase() === "c") s.set({ compare: !s.compare });
      if (e.key.toLowerCase() === "l")
        s.set({ rail: s.rail === "layers" ? null : "layers" });
      if (e.key.toLowerCase() === "t") s.set({ timeline: !s.timeline });
      if (e.key === "F10" && e.shiftKey) {
        e.preventDefault();
        setMenu({ x: innerWidth / 2, y: innerHeight / 2, siteId: s.selected });
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (menu)
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  useEffect(() => {
    if (!intro) return;
    const reveal = setTimeout(
      () =>
        state.set({
          view: "solar_system",
          focusVersion: state.focusVersion + 1,
        }),
      900,
    );
    const timer = setTimeout(() => {
      setIntro(false);
      state.set({ welcome: false });
    }, 2300);
    return () => {
      clearTimeout(timer);
      clearTimeout(reveal);
    };
  }, [intro]);
  const rail = (id: string) =>
    state.set({
      rail: state.rail === id ? null : id,
      ...(solar && id !== "clock" ? { view: "globe" as const } : {}),
    });
  const share = () => {
    try {
      const value = encodeSession(state);
      navigator.clipboard
        .writeText(location.origin + "/?session=" + encodeURIComponent(value))
        .then(() =>
          state.message(
            "Link copied, including scenarios, coordinates and analysis settings.",
          ),
        )
        .catch(() =>
          state.message("Clipboard is unavailable in this browser."),
        );
    } catch {
      state.message(
        "This session cannot be shared; check its dates and mission durations.",
      );
    }
  };
  const download = (format: "json" | "csv") => {
    let payload;
    try {
      payload = createAnalysisReport({
        site,
        time: state.time,
        mastM: state.mastM,
        minAntennaEl: state.minAntennaEl,
        current,
        packet,
        scenario: activeScenario,
        metrics: m,
        scenarioPacket:
          activeScenario &&
          packetFor(
            state,
            state.selected,
            missionEpoch(activeScenario, state.time),
            activeScenario.durationDays,
          ),
        terrain,
      });
    } catch (e) {
      state.message(e.message);
      return;
    }
    const url = URL.createObjectURL(
        new Blob(
          [
            format === "csv"
              ? reportCsv(payload)
              : JSON.stringify(payload, null, 2),
          ],
          {
            type:
              format === "csv" ? "text/csv;charset=utf-8" : "application/json",
          },
        ),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "lunar-site-analysis-" + site.id + "." + format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const saveCustom = () => {
    const lat = +customLat,
      lon = +customLon;
    if (
      !customName.trim() ||
      customName.length > 64 ||
      !customLat ||
      !customLon ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      state.message(
        "Enter a name and valid latitude (−90 to 90) and longitude (−180 to 180).",
      );
      return;
    }
    const s: Site = {
      id: "custom-" + crypto.randomUUID(),
      name: customName.trim(),
      lat,
      lon,
      region: "Custom coordinates",
      family: "custom",
      source: "User-selected coordinates",
      description: "A lunar site at your selected coordinates.",
    };
    state.set({
      custom: [...state.custom, s],
      selected: s.id,
      view: "globe",
      rail: null,
      focusVersion: state.focusVersion + 1,
    });
    setCustomDialog(null);
  };
  const openCustom = (point: any) => {
    setCustomName("");
    setCustomLat(point?.lat?.toFixed(5) || "");
    setCustomLon(point?.lon?.toFixed(5) || "");
    setCustomDialog(point || {});
    setMenu(null);
  };
  const menuItems = menu?.siteId
    ? [
        [
          "Open inspector",
          () => {
            state.select(menu.siteId);
            setInspector(true);
          },
        ],
        [
          "Plan / add to comparison",
          () => {
            state.select(menu.siteId);
            state.set({ scenarioDialog: true });
          },
        ],
        ["Fly to site", () => state.fly(menu.siteId)],
        [
          "Show horizon",
          () => {
            state.select(menu.siteId);
            state.set({ view: "horizon", rail: null });
          },
        ],
        [
          "Ask Rocky",
          () => {
            state.select(menu.siteId);
            window.dispatchEvent(new Event("ask-rocky"));
          },
        ],
        ...(state.custom.some((s) => s.id === menu.siteId)
          ? [
              [
                "Delete custom site",
                () =>
                  state.set({
                    custom: state.custom.filter((s) => s.id !== menu.siteId),
                    scenarios: state.scenarios.filter(
                      (s) => s.siteId !== menu.siteId,
                    ),
                    selected: "im1",
                  }),
              ],
            ]
          : []),
      ]
    : menu
      ? [
          ["Create site here", () => openCustom(menu)],
          [
            "Copy coordinates",
            () =>
              navigator.clipboard.writeText(
                `${menu.lat.toFixed(5)}, ${menu.lon.toFixed(5)}`,
              ),
          ],
          [
            "Reset camera",
            () =>
              state.set({
                view: "overview",
                focusVersion: state.focusVersion + 1,
              }),
          ],
        ]
      : [];
  return (
    <main
      className={
        "app" +
        (inspector && !solar ? " has-inspector" : "") +
        (solar ? " solar-mode" : "")
      }
      onPointerDown={() => menu && setMenu(null)}
    >
      <a className="skip-link" href="#site-inspector">
        Skip to site analysis
      </a>
      <SceneBoundary>
        <Suspense
          fallback={
            <div className="scene-loading">Preparing space navigation…</div>
          }
        >
          <World
            onContext={(point) => {
              if (useScout.getState().pickingSite) {
                setCustomLat(point.lat.toFixed(5));
                setCustomLon(point.lon.toFixed(5));
                setCustomDialog(point);
                state.set({ pickingSite: false });
              } else setMenu(point);
            }}
            onSnapshot={useCallback((fn) => {
              snapshot.current = fn;
            }, [])}
          />
        </Suspense>
      </SceneBoundary>
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            state.set({
              view: "solar_system",
              rail: null,
              focusVersion: state.focusVersion + 1,
            });
          }}
        >
          <Orbit size={29} strokeWidth={1.4} />
          <span>
            <strong>Lu-See</strong>
          </span>
        </a>
        <div className="top-centre">
          <span className="live-dot" />{" "}
          {solar ? "SOLAR SYSTEM" : "EARTH–MOON EXPLORER"}{" "}
          <span className="top-divider" />{" "}
          <span>
            {state.view === "overview"
              ? "Navigation"
              : state.view.replace("_", " ").replace("_", " ")}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="mode-toggle"
            onClick={() =>
              state.set({ mode: state.mode === "plain" ? "engineer" : "plain" })
            }
          >
            {state.mode === "plain" ? "Plain" : "Engineer"}
            <ChevronRight size={13} />
          </button>
          <IconButton
            label="Controls and shortcuts"
            onClick={() => setHelp((v) => !v)}
          >
            <Keyboard size={18} />
          </IconButton>
          <a
            className="challenge-link"
            href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/"
            target="_blank"
            rel="noreferrer"
          >
            The challenge <ExternalLink size={12} />
          </a>
        </div>
      </header>
      <nav className="instrument-rail" aria-label="Map tools">
        {[
          [MapPin, "sites", "Sites"],
          [Clock3, "clock", "Time"],
          [Layers, "layers", "Layers"],
          [Columns2, "compare", "Compare"],
          [SlidersHorizontal, "settings", "Settings"],
        ].map(([Icon, id, label]: any) => (
          <button
            key={id}
            className={
              (id === "compare" ? state.compare : state.rail === id)
                ? "active"
                : ""
            }
            title={label}
            aria-label={label}
            aria-pressed={id === "compare" ? state.compare : state.rail === id}
            onClick={() =>
              id === "compare"
                ? state.set({
                    compare: !state.compare,
                    ...(solar ? { view: "globe" as const } : {}),
                  })
                : rail(id)
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <IconButton
          label="Data and methodology"
          onClick={() => setSources(true)}
        >
          <Info size={19} />
        </IconButton>
      </nav>
      {state.rail && (
        <section className="flyout" aria-label={state.rail + " controls"}>
          <header>
            <h2>
              {
                {
                  sites: "Landing sites",
                  clock: "Mission clock",
                  layers: "Map layers",
                  settings: "Settings",
                }[state.rail]
              }
            </h2>
            <IconButton
              label="Close tools"
              onClick={() => state.set({ rail: null })}
            >
              <X size={17} />
            </IconButton>
          </header>
          {state.rail === "sites" && (
            <>
              <p className="muted">Find a place. Explore its possibilities.</p>
              <input
                className="site-search"
                placeholder="Search the Moon…"
                aria-label="Search lunar sites"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
              />
              <div className="site-list">
                {filteredSites.map((s, i) => (
                  <button
                    key={s.id}
                    className={state.selected === s.id ? "selected" : ""}
                    onClick={() => {
                      state.select(s.id);
                      setInspector(true);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, siteId: s.id });
                    }}
                  >
                    <span className="site-family">
                      {s.family === "apollo"
                        ? "AP"
                        : s.family === "clps"
                          ? "CL"
                          : s.family === "polar"
                            ? "SP"
                            : "CU"}
                    </span>
                    <span className="site-text">
                      <strong>{s.name}</strong>
                      <small>{s.region}</small>
                      <span>
                        {Math.abs(s.lat).toFixed(3)}°{s.lat < 0 ? "S" : "N"} ·{" "}
                        {Math.abs(s.lon).toFixed(3)}°{s.lon < 0 ? "W" : "E"}
                      </span>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {initError && (
                <p className="error-text">
                  Site catalogue unavailable: {initError}
                </p>
              )}
              <button className="add-site" onClick={() => openCustom(null)}>
                <Plus size={16} /> Add custom coordinates
              </button>
              <p className="data-note">
                Curated coordinates have source citations. A named crater centre
                is not a recommended landing zone.
              </p>
            </>
          )}
          {state.rail === "clock" && (
            <>
              <p className="muted">Every live scenario follows this clock.</p>
              <label>
                Date and time · UTC
                <input
                  type="datetime-local"
                  min="1969-01-01T00:00"
                  max="2040-12-31T23:59"
                  value={
                    clockEditing
                      ? dateDraft
                      : new Date(state.time).toISOString().slice(0, 16)
                  }
                  onFocus={() => {
                    setDateDraft(
                      new Date(state.time).toISOString().slice(0, 16),
                    );
                    setClockEditing(true);
                  }}
                  onChange={(e) => setDateDraft(e.target.value)}
                  onBlur={() => {
                    const t = Date.parse(dateDraft + "Z");
                    if (
                      Number.isFinite(t) &&
                      t >= Date.parse("1969-01-01") &&
                      t < Date.parse("2041-01-01")
                    )
                      state.set({ time: t, playing: false });
                    else
                      state.message(
                        "Choose a valid UTC date from 1969 through 2040.",
                      );
                    setClockEditing(false);
                  }}
                />
              </label>
              <div className="button-row">
                <button
                  onClick={() =>
                    state.set({ time: Date.now(), playing: false })
                  }
                >
                  Now
                </button>
                <button
                  disabled={!activeScenario || activeScenario.epoch === "live"}
                  onClick={() =>
                    state.set({ time: Date.parse(activeScenario!.epoch) })
                  }
                >
                  Landing date
                </button>
              </div>
              <h3>Playback speed</h3>
              <div className="speed-buttons">
                {[1, 60, 3600, 86400].map((s, i) => (
                  <button
                    key={s}
                    className={state.speed === s ? "active" : ""}
                    onClick={() => state.set({ speed: s })}
                  >
                    {["1×", "60×", "1 h/s", "1 d/s"][i]}
                  </button>
                ))}
              </div>
              <h3>Next crossing</h3>
              <EventList
                events={eventAnalysis?.metrics?.events || []}
                time={state.time}
              />
              <p className="data-note">
                UTC throughout. Future times use Horizons’ currently known
                leap-second assumptions.
              </p>
            </>
          )}
          {state.rail === "layers" && (
            <>
              <p className="muted">
                Explore the surface without losing context.
              </p>
              {[
                ["grid", "Coordinate graticule"],
                ["markers", "Landing-site markers"],
                ["terrainLayer", "Surface mesh"],
              ].map(([id, label]) => (
                <label className="switch-row" key={id}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={state[id]}
                    onChange={(e) => state.set({ [id]: e.target.checked })}
                  />
                </label>
              ))}
              <label className="switch-row">
                <span>True physical body sizes</span>
                <input
                  type="checkbox"
                  checked={state.trueScale}
                  onChange={(e) => state.set({ trueScale: e.target.checked })}
                />
              </label>
              <p className="data-note">
                Readable mode enlarges body sizes. Numerical distances always
                come from JPL; the display is not a trajectory solution.
              </p>
              <h3>NASA precomputed layers</h3>
              <select
                aria-label="Precomputed map overlay"
                value={state.statLayer || ""}
                onChange={(e) =>
                  state.set({
                    statLayer: e.target.value || null,
                    view: "polar_south",
                  })
                }
              >
                <option value="">Albedo base only</option>
                <option
                  value="illumination"
                  disabled={!state.layerManifest.illumination}
                >
                  Average sunlight · LOLA{" "}
                  {!state.layerManifest.illumination ? "(preparing)" : ""}
                </option>
                <option
                  value="earth_visibility"
                  disabled={!state.layerManifest.earth_visibility}
                >
                  Average Earth visibility{" "}
                  {!state.layerManifest.earth_visibility ? "(preparing)" : ""}
                </option>
              </select>
              <p className="data-note">
                Precomputed NASA Moon Trek products cover part of the south
                polar region. Their source period differs from the selected
                clock. No-data remains transparent; use the inspector for
                date-specific values.
              </p>
              <h3>Polar views</h3>
              <div className="button-row">
                <button onClick={() => state.set({ view: "polar_south" })}>
                  South pole
                </button>
                <button onClick={() => state.set({ view: "polar_north" })}>
                  North pole
                </button>
              </div>
              <p className="data-note">
                Current globe lighting is geometric. Terrain shadow maps are not
                yet available.
              </p>
            </>
          )}
          {state.rail === "settings" && (
            <>
              <label>
                Mast height above DEM
                <select
                  value={state.mastM}
                  onChange={(e) => state.set({ mastM: +e.target.value })}
                >
                  {[0, 2, 5, 10].map((m) => (
                    <option key={m} value={m}>
                      {m} m
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum antenna elevation · degrees
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={state.minAntennaEl}
                  onChange={(e) =>
                    state.set({
                      minAntennaEl: Math.max(0, Math.min(90, +e.target.value)),
                    })
                  }
                />
              </label>
              <p className="data-note">
                DTE here means geometric Earth-centre visibility above your
                elevation limit. It does not guarantee a working radio link.
              </p>
              <h3>Rocky connection</h3>
              <p className="connection">
                {health?.primaryConfigured
                  ? "Nemotron configured"
                  : "Nemotron key needed"}
                <br />
                {health?.fallbackConfigured
                  ? "GPT-OSS fallback configured"
                  : "GPT-OSS fallback key needed"}
              </p>
              <p className="data-note">
                Add keys to lunar-scout/.env on the server. The browser never
                receives them. Audio is off.
              </p>
              <button onClick={() => state.set({ welcome: true })}>
                Replay welcome
              </button>
            </>
          )}
        </section>
      )}
      <div className="view-toolbar" aria-label="View controls">
        {[
          [Orbit, "solar_system", "Solar System"],
          [Globe2, "overview", "Earth–Moon"],
          [Focus, "globe", "Moon"],
          [Compass, "polar_south", "South pole"],
        ].map(([Icon, view, label]: any) => (
          <button
            key={view}
            aria-label={label}
            className={state.view === view ? "active" : ""}
            onClick={() => state.set({ view })}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
        <IconButton
          label="Focus selected site"
          onClick={() => site && state.fly(site.id)}
        >
          <LocateFixed size={17} />
        </IconButton>
        {!solar && (
          <IconButton
            label={inspector ? "Hide inspector" : "Show inspector"}
            onClick={() => setInspector((v) => !v)}
          >
            {inspector ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </IconButton>
        )}
      </div>
      {inspector && !solar && site && (
        <aside id="site-inspector" className="inspector" tabIndex={-1}>
          <header>
            <div>
              <h1>{site.name}</h1>
              <p>{site.region}</p>
              <span className="site-kind">
                {site.family === "clps"
                  ? "Commercial lunar delivery"
                  : site.family === "apollo"
                    ? "Historic landing site"
                    : site.family === "custom"
                      ? "Custom coordinates"
                      : site.family === "international"
                        ? "International lunar mission"
                        : "Named polar feature"}
              </span>
            </div>
            <IconButton
              label="Site actions"
              onClick={() =>
                setMenu({ x: innerWidth - 80, y: 180, siteId: site.id })
              }
            >
              <SlidersHorizontal size={17} />
            </IconButton>
          </header>
          <div className="coordinates">
            <span>
              {Math.abs(site.lat).toFixed(5)}° {site.lat < 0 ? "S" : "N"}
            </span>
            <span>
              {Math.abs(site.lon).toFixed(5)}° {site.lon < 0 ? "W" : "E"}
            </span>
            <span>
              {terrain
                ? terrain.elevationM.toFixed(0) + " m"
                : "Elevation pending"}
            </span>
          </div>
          <div className={"quality " + (terrain ? "verified" : "limited")}>
            <span className="quality-dot" />
            {terrain
              ? `LOLA terrain · ${terrain.resolutionM.toFixed(0)} m grid`
              : state.loading[key]
                ? "Loading LOLA terrain"
                : packet?.terrainPending
                  ? "Terrain not included"
                  : "Terrain pending"}
            {!terrain && packet?.terrainPending && !state.loading[key] && (
              <button className="text-button" onClick={() => ensureData(
                site, state.time, activeScenario?.durationDays || 1, true,
              )}>Retry terrain</button>
            )}
            <button className="text-button" onClick={() => setSources(true)}>
              Details
            </button>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>Conditions now</h2>
              <span>
                UTC {new Date(state.time).toISOString().slice(11, 16)}
              </span>
            </div>
            {current ? (
              <>
                <SkyStrip packet={packet} time={state.time} mask={mask} />
                <div className="condition-readings">
                  <section className="condition-reading sunlight-reading">
                    <h3><Sun size={18} /> Sunlight now</h3>
                    <strong>{current.sun.visible ? "Sunlight available" : "Little or no direct sunlight"}</strong>
                    <p>{(current.sun.visibleFraction * 100).toFixed(0)}% of the Sun's disc is visible.</p>
                    <small>{current.sun.terrainVisibleFraction === 0
                      ? (mask ? "Terrain blocks the Sun." : "The Sun is below the smooth horizon.")
                      : current.sun.eclipse.state !== "none"
                        ? "Earth's shadow reduces direct sunlight."
                        : "Sunlight status uses a half-disc visibility threshold."}</small>
                    <details className="condition-geometry" open={state.mode === "engineer" ? true : undefined}><summary>Position in the sky</summary><dl><dt>Height above level horizon</dt><dd>{deg(current.sun.el)}</dd>
                      <dt>Compass bearing</dt><dd>{deg(current.sun.az)} ({bearing(current.sun.az)})</dd></dl></details>
                  </section>
                  <section className="condition-reading contact-reading">
                    <h3><Radio size={18} /> Earth contact now</h3>
                    <strong>{current.earth.dte ? "Clear line of sight" : "Direct contact blocked"}</strong>
                    <p>{!current.earth.visible
                      ? "Earth's centre is below the horizon."
                      : !current.earth.dte
                        ? `Earth clears the horizon but is below your ${state.minAntennaEl}° antenna limit.`
                        : `Earth clears the horizon and your ${state.minAntennaEl}° antenna limit.`}</p>
                    <small>{!current.earth.visible ? "Part of Earth's disc may still be visible." : "Geometry only; radio performance is not assessed."}</small>
                    <details className="condition-geometry" open={state.mode === "engineer" ? true : undefined}><summary>Position in the sky</summary><dl><dt>Height above level horizon</dt><dd>{deg(current.earth.el)}</dd>
                      <dt>Compass bearing</dt><dd>{deg(current.earth.az)} ({bearing(current.earth.az)})</dd></dl></details>
                  </section>
                </div>
                <p
                  className={
                    "eclipse-status" +
                    (current.sun.eclipse.state !== "none"
                      ? " eclipse-active"
                      : "")
                  }
                >
                  <strong>Earth shadow: {current.sun.eclipse.state}</strong>
                  {current.sun.eclipse.state !== "none" && (
                    <span>
                      {(current.sun.eclipse.blockedFraction * 100).toFixed(1)}%
                      of solar disc blocked
                    </span>
                  )}
                  <small>
                    Opaque Earth-disc geometry; atmosphere excluded.
                  </small>
                </p>
                {state.mode === "engineer" ? (
                  <details className="engineering-readings" open>
                    <summary>Observer and horizon measurements</summary>
                    <dl className="comparison-values">
                      <dt>Sun terrain horizon</dt>
                      <dd>{deg(current.sun.horizon)}</dd>
                      <dt>Earth terrain horizon</dt>
                      <dd>{deg(current.earth.horizon)}</dd>
                      <dt>Solar angular radius</dt>
                      <dd>{deg(current.sun.radius)}</dd>
                      <dt>Earth angular radius</dt>
                      <dd>{deg(current.earth.radius)}</dd>
                      <dt>Sun above terrain</dt>
                      <dd>
                        {(current.sun.terrainVisibleFraction * 100).toFixed(1)}%
                      </dd>
                      <dt>Direct solar disc visible</dt>
                      <dd>{(current.sun.visibleFraction * 100).toFixed(1)}%</dd>
                      <dt>Sun–Earth separation</dt>
                      <dd>{deg(current.sun.eclipse.separationDeg)}</dd>
                      <dt>Earth range from observer</dt>
                      <dd>{current.earth.distanceKm.toFixed(1)} km</dd>
                      <dt>Mast above DEM / sphere</dt>
                      <dd>{state.mastM} m</dd>
                      <dt>DTE elevation limit</dt>
                      <dd>{state.minAntennaEl}°</dd>
                    </dl>
                    <p className="data-note">
                      Airless topocentric angles. Terrain mask:{" "}
                      {mask
                        ? "0.5° azimuth steps, 150 km radius"
                        : "terrain not included"}
                      . Sunlight also accounts for geometric Earth occultation.
                    </p>
                  </details>
                ) : (
                  <p className="data-note">
                    Positive height means above a level horizon; negative means below.
                    Terrain can block an object even at positive height. Bearings
                    run clockwise: north 0°, east 90°, south 180°, west 270°.
                  </p>
                )}
              </>
            ) : (
              <div className="pending-data">
                <Orbit size={22} className={state.loading[key] ? "spin" : ""} />
                <p>
                  {state.errors[key]
                    ? "Could not reach NASA/JPL"
                    : state.loading[key]
                      ? "Requesting NASA/JPL ephemerides…"
                      : "Choose a site to load scientific data."}
                </p>
                {state.errors[key] && (
                  <>
                    <small>{state.errors[key]}</small>
                    <button
                      onClick={() =>
                        ensureData(
                          site,
                          state.time,
                          activeScenario?.durationDays || 1,
                          true,
                        )
                      }
                    >
                      <RotateCcw size={14} /> Retry
                    </button>
                  </>
                )}
                <span>No sample measurements are substituted.</span>
              </div>
            )}
            {current && (
              <EventList
                events={eventAnalysis?.metrics?.events || []}
                time={state.time}
              />
            )}
            <button
              className="sky-link"
              onClick={() =>
                state.set({
                  view: "horizon",
                  rail: null,
                  focusVersion: state.focusVersion + 1,
                })
              }
            >
              Open horizon view <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>
                {activeScenario ? "Over your whole mission" : "Find your landing date"}
              </h2>
              {activeScenario && <span>{activeScenario.durationDays} d</span>}
            </div>
            {activeScenario && m && (
              <p className="data-note">
                Scenario {activeScenario.id} · {utc(m.start)} → {utc(m.end)} UTC
                ·{" "}
                {activeScenario.epoch === "live"
                  ? "follows clock"
                  : "pinned landing date"}
              </p>
            )}
            {activeScenario && m ? (
              <>
                {activeScenario.profile && (
                  <p className="mission-verdict">
                    {terrain ? (analysis?.rules?.every((r: any) => r.passed)
                      ? "Meets your sunlight, darkness and contact limits."
                      : "Does not meet all your mission limits. Open comparison for details.")
                      : "Terrain not included; terrain-based viability is unavailable."}
                  </p>
                )}
                <div className="metrics-grid">
                  <div>
                    <span>Time in sunlight</span>
                    <strong>
                      {m.sunlitPct.toFixed(1)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Time with Earth contact</span>
                    <strong>
                      {m.earthDtePct.toFixed(1)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Longest darkness</span>
                    <strong>
                      {m.longestDarkH.toFixed(1)}
                      <small>h</small>
                    </strong>
                  </div>
                  <div>
                    <span>Mean power index</span>
                    <strong>{m.meanPowerIndex.toFixed(3)}</strong>
                  </div>
                </div>
                <p className="data-note">
                  Mission-average power index{" "}
                  {activeScenario.arrayMode || "horizontal"} array, relative to
                  normal solar incidence at 1 AU. Geometric Earth-shadow
                  screening included; atmospheric light excluded.
                </p>
                <p className="data-note">
                  Earth-shadow exposure while the Sun clears terrain:{" "}
                  {m.eclipseHours.toFixed(2)} h. Ten-minute integration.
                </p>
              </>
            ) : (
              <p className="muted">
                {activeScenario
                  ? analysis?.error ||
                    state.errors[key] ||
                    "Calculating the selected mission window"
                  : "Set your mission duration and requirements to calculate possible landing dates."}
              </p>
            )}
            <button
              className="primary full-width"
              onClick={() => state.set({ scenarioDialog: true })}
            >
              <Flag size={16} /> Plan landing <ArrowUpRight size={16} />
            </button>
            <div className="button-row">
              <button onClick={() => state.set({ timeline: !state.timeline })}>
                <Clock3 size={14} /> Timeline
              </button>
              <button
                aria-label="Export data as JSON"
                disabled={!current || (!!activeScenario && !m)}
                onClick={() => download("json")}
              >
                <Download size={14} /> JSON
              </button>
              <button
                aria-label="Export data as CSV"
                disabled={!current || (!!activeScenario && !m)}
                onClick={() => download("csv")}
              >
                <Download size={14} /> CSV
              </button>
            </div>
          </div>
          <div className="inspector-section">
            <button
              className="sky-link"
              onClick={() => {
                if (!activeScenario) {
                  state.set({ scenarioDialog: true });
                  state.message(
                    "Choose a mission duration before analysing date slips.",
                  );
                } else setSlip(true);
              }}
            >
              Explore a landing-date slip <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="inspector-section site-source">
            <p>{site.family === "custom" ? "A lunar site at your selected coordinates." : site.description}</p>
            {site.source.startsWith("http") && (
              <a href={site.source} target="_blank" rel="noreferrer">
                Coordinate source <ExternalLink size={12} />
              </a>
            )}
            <button className="text-button" onClick={() => setSources(true)}>
              Assumptions & provenance
            </button>
          </div>
        </aside>
      )}
      {state.timeline && !state.compare && !solar && (
        <section className="timeline-drawer">
          <header>
            <h2>{site?.name} · next 24 hours</h2>
            <IconButton
              label="Close timeline"
              onClick={() => state.set({ timeline: false })}
            >
              <X size={17} />
            </IconButton>
          </header>
          <TimelineLane siteId={state.selected} start={state.time} />
          <p className="data-note">
            Click a segment to scrub time. Patterned intervals indicate no
            visibility; gaps mean no data.
          </p>
        </section>
      )}
      {state.compare && !solar && (
        <section className="compare-tray">
          <header>
            <h2>
              Compare landing scenarios{" "}
              <span>{state.scenarios.length} / 4</span>
            </h2>
            <div className="button-row">
              <button onClick={() => state.set({ scenarioDialog: true })}>
                <Plus size={14} /> Add scenario
              </button>
              <button disabled={!state.scenarios.length} onClick={share}>
                Share
              </button>
              <IconButton
                label="Close comparison"
                onClick={() => state.set({ compare: false })}
              >
                <X size={18} />
              </IconButton>
            </div>
          </header>
          {state.scenarios.length ? (
            <div className="compare-grid">
              {state.scenarios.map((s) => (
                <ScenarioColumn key={s.id} scenario={s} />
              ))}
            </div>
          ) : (
            <div className="compare-empty">
              <Columns2 size={25} />
              <p>Same site, different date. Or a different place entirely.</p>
              <button
                className="primary"
                onClick={() => state.set({ scenarioDialog: true })}
              >
                Create your first scenario
              </button>
            </div>
          )}
        </section>
      )}
      <div className="clockbar">
        <div className="transport">
          <IconButton
            label="Step back one hour"
            onClick={() => state.set({ time: state.time - HOUR })}
          >
            <SkipBack size={16} />
          </IconButton>
          <IconButton
            label={state.playing ? "Pause time" : "Play time"}
            onClick={() => state.set({ playing: !state.playing })}
          >
            {state.playing ? <Pause size={17} /> : <Play size={17} />}
          </IconButton>
          <IconButton
            label="Step forward one hour"
            onClick={() => state.set({ time: state.time + HOUR })}
          >
            <SkipForward size={16} />
          </IconButton>
        </div>
        <button className="clock-readout" onClick={() => rail("clock")}>
          <span>{utc(state.time)}</span>
          <small>UTC</small>
        </button>
        <button
          className="speed-readout"
          onClick={() =>
            state.set({
              speed: [1, 60, 3600, 86400][
                ([1, 60, 3600, 86400].indexOf(state.speed) + 1) % 4
              ],
            })
          }
        >
          {state.speed === 3600
            ? "1 h/s"
            : state.speed === 86400
              ? "1 d/s"
              : state.speed + "×"}
        </button>
        <div className="clockbar-spacer" />
        <span className="map-status">
          {solar
            ? state.trueScale
              ? "Physical AU scale"
              : "Readable Solar System"
            : state.trueScale
              ? "True physical sizes"
              : "Body sizes enlarged"}
          {!solar &&
            current &&
            " · Earth " +
              Math.round(current.earth.distanceKm).toLocaleString() +
              " km from site"}
        </span>
        <button className="text-button" onClick={() => setSources(true)}>
          {solar
            ? "Lunar data & methodology"
            : packet
              ? "JPL Horizons"
              : "Data connecting"}{" "}
          <ExternalLink size={11} />
        </button>
      </div>
      {state.statLayer &&
        state.view === "polar_south" &&
        state.layerManifest[state.statLayer] && (
          <div className="layer-legend">
            <strong>
              {state.statLayer === "illumination"
                ? "Long-term sunlight"
                : "Long-term Earth visibility"}
            </strong>
            <span>Precomputed · not the selected date</span>
            {state.layerManifest[state.statLayer].legend && (
              <>
                <div
                  style={{
                    background: `linear-gradient(90deg,${state.layerManifest[state.statLayer].legend.low},${state.layerManifest[state.statLayer].legend.high})`,
                  }}
                />
                <small>
                  0% <span>100%</span>
                </small>
              </>
            )}
            <a
              href={
                state.layerManifest[state.statLayer].sourcePage ||
                state.layerManifest[state.statLayer].capabilities
              }
              target="_blank"
              rel="noreferrer"
            >
              Source & definition <ExternalLink size={10} />
            </a>
          </div>
        )}
      <div className="screening-note">
        Early screening · verify for mission use
      </div>
      {state.travel && (
        <div className="travel-banner">
          <Orbit className="spin" size={18} />
          <span>
            Approaching {site?.name}
            <small>Previewing the trip to your selected arrival time</small>
          </span>
          <button onClick={() => state.set({ chase: !state.chase })}>
            {state.chase ? "Free map camera" : "Follow shuttle"}
          </button>
          <button
            onClick={() =>
              state.set({
                time: state.travel!.to,
                travel: null,
                view: "surface",
                landed: true,
              })
            }
          >
            Skip travel
          </button>
        </div>
      )}
      {state.landed && (
        <div className="landing-choice">
          <span>Surface arrival</span>
          <h2>See this place from a new perspective.</h2>
          <p>
            The view uses the available LOLA terrain. Explore the sky or return
            to site analysis.
          </p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => state.set({ view: "horizon", landed: false })}
            >
              Look at the horizon
            </button>
            <button
              onClick={() => state.set({ view: "surface", landed: false })}
            >
              Overhead analysis
            </button>
          </div>
        </div>
      )}
      {slip && <DateSlip close={() => setSlip(false)} />}
      <Rocky snapshot={() => snapshot.current()} />
      {state.welcome && (
        <div className={"welcome " + (intro ? "departing" : "")}>
          <div className="welcome-content">
            <Orbit size={42} strokeWidth={1} />
            <h1>
              Lu-See<span>.</span>
            </h1>
            <p>
              A different place. A different date.
              <br />A new window to the Sun and Earth.
            </p>
            <button
              className="primary welcome-enter"
              onClick={() => {
                state.set({ rail: null, view: "solar_system" });
                if (matchMedia("(prefers-reduced-motion: reduce)").matches)
                  state.set({ welcome: false });
                else {
                  state.set({
                    view: "solar_system",
                    focusVersion: state.focusVersion + 1,
                  });
                  setIntro(true);
                }
              }}
            >
              Enter the Solar System <ArrowUpRight size={19} />
            </button>
            <span className="welcome-caption">
              Real NASA/JPL ephemerides. Lunar terrain from LOLA.
            </span>
          </div>
          <div className="welcome-bottom">
            <a
              href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/"
              target="_blank"
              rel="noreferrer"
            >
              Inspired by the NASA Space Apps lunar landing site challenge{" "}
              <ExternalLink size={12} />
            </a>
            <button onClick={() => state.set({ welcome: false })}>
              Skip introduction
            </button>
          </div>
        </div>
      )}
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          style={{
            left: Math.max(8, Math.min(menu.x, innerWidth - 245)),
            top: Math.max(8, Math.min(menu.y, innerHeight - 290)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            const buttons = Array.from(
                menuRef.current!.querySelectorAll("button"),
              ),
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
              ].focus();
            }
            if (e.key === "Escape") setMenu(null);
          }}
        >
          {menuItems.map(([label, fn]: any) => (
            <button
              role="menuitem"
              key={label}
              onClick={() => {
                fn();
                setMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {state.scenarioDialog && (
        <ScenarioDialog close={() => state.set({ scenarioDialog: false })} />
      )}
      {state.pickingSite && (
        <div className="coordinate-picker" role="status">
          <span>Click or tap a point on the Moon. Drag to rotate.</span>
          <button
            onClick={() => {
              state.set({ pickingSite: false });
              setCustomDialog({});
            }}
          >
            Cancel picking
          </button>
        </div>
      )}
      {customDialog && (
        <div className="modal-backdrop">
          <form
            className="scenario-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-title"
            onSubmit={(e) => {
              e.preventDefault();
              saveCustom();
            }}
          >
            <header>
              <h2 id="custom-title">Create a lunar site</h2>
              <IconButton
                label="Close custom site"
                onClick={() => setCustomDialog(null)}
              >
                <X size={18} />
              </IconButton>
            </header>
            <label>
              Site name
              <input
                autoFocus
                required
                maxLength={64}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setCustomDialog(null);
                state.set({
                  pickingSite: true,
                  view: "globe",
                  rail: null,
                  playing: false,
                });
              }}
            >
              Pick point on Moon
            </button>
            <p className="data-note">
              Pick a point on the globe to fill latitude and longitude, or enter
              them below. Map picking is approximate; review before saving.
            </p>
            <label>
              Latitude · north positive
              <input
                required
                type="number"
                step="any"
                min="-90"
                max="90"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
              />
            </label>
            <label>
              Longitude · east positive
              <input
                required
                type="number"
                step="any"
                min="-180"
                max="180"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
              />
            </label>
            <p className="data-note">
              The site uses the LOLA elevation and skyline at these coordinates.
            </p>
            <button className="primary">Create site</button>
          </form>
        </div>
      )}
      {(help || sources) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setHelp(false);
              setSources(false);
            }
          }}
        >
          <section
            className="info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-title"
          >
            <header>
              <h2 id="info-title">
                {help ? "Explore with confidence" : "Data & methodology"}
              </h2>
              <IconButton
                label="Close information"
                onClick={() => {
                  setHelp(false);
                  setSources(false);
                }}
              >
                <X size={20} />
              </IconButton>
            </header>
            {help ? (
              <>
                <p>
                  Drag to orbit. Scroll or pinch to zoom. Middle-drag pans. In
                  horizon view, drag or use the arrow keys to look around; the
                  observer stays fixed at the site and mast height. Click a site
                  to inspect it; right-click a marker or the lunar globe for
                  actions.
                </p>
                <dl className="shortcuts">
                  <dt>W / A / S / D</dt>
                  <dd>Free camera travel</dd>
                  <dt>Q / E</dt>
                  <dd>Move down / up</dd>
                  <dt>Shift</dt>
                  <dd>Faster camera travel</dd>
                  <dt>Space</dt>
                  <dd>Play / pause time</dd>
                  <dt>, / .</dt>
                  <dd>Step one hour</dd>
                  <dt>1 / 2 / 3 / 4</dt>
                  <dd>Playback speed</dd>
                  <dt>C / L / T</dt>
                  <dd>Compare / layers / timeline</dd>
                  <dt>Shift + F10</dt>
                  <dd>Selected site's action menu</dd>
                </dl>
              </>
            ) : (
              <>
                <p>
                  Every Sun/Earth angle comes from the NASA/JPL Horizons
                  observer API at the selected lunar latitude, longitude and
                  observer altitude. No synthetic ephemerides are substituted.
                </p>
                <h3>Geometry</h3>
                <p>
                  High-precision MEAN_ME body frame, planetocentric coordinates,
                  east-positive longitude, airless apparent azimuth and
                  elevation, apparent angular diameter and topocentric range.
                  Directions between 10-minute samples use normalized
                  unit-vector interpolation, including north-wrap and zenith
                  passages. Requests and raw responses are cached.
                </p>
                <h3>Terrain</h3>
                <p>
                  {terrain
                    ? `${terrain.resolutionM.toFixed(0)} m LOLA elevation grid; 720 azimuth rays out to 150 km, with curvature and ${state.mastM} m mast height.`
                    : "Official PDS LOLA products are being prepared. Until a mask is ready, terrain-based results are unavailable."}{" "}
                  Small obstacles, narrow ridges and terrain beyond the analysis
                  radius may be missed. The globe texture is NASA visual
                  imagery; it is not a scientific shadow map. The polar base is
                  a fixed-light cartographic hillshade derived from LOLA, not
                  current illumination.
                </p>
                <p>
                  Globe imagery uses the LROC WAC mosaic from{" "}
                  <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">NASA Moon Trek</a>.
                  Use{" "}
                  <a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">LROC QuickMap</a>
                  {" "}to compare elevation{site ? ` at ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}` : ""}
                  {" "}or inspect available regional terrain models.
                </p>
                <h3>Events and metrics</h3>
                <p>
                  Sunrise/set use terrain-horizon solar-centre crossings,
                  refined within interpolated samples. They are not eclipse
                  contact times. Solar disc fractions combine terrain clipping
                  with geometric Earth occultation. Mission percentages use
                  10-minute integration. Narrow grazing events may be missed.
                  Earth visibility uses the centre; DTE also applies the antenna
                  elevation setting. Eclipse screening uses an opaque circular
                  apparent Earth disc and a small-angle overlap approximation,
                  with JPL directions and angular sizes. It excludes atmosphere,
                  refracted/scattered light, limb darkening and Earth's
                  ellipsoidal limb. Link budgets, thermal modelling and full
                  spacecraft power budgets are not included.
                </p>
                <p>
                  <a
                    href="https://science.nasa.gov/moon/eclipses/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA: Earth’s shadow and lunar eclipses{" "}
                    <ExternalLink size={12} />
                  </a>
                </p>
                <h3>Source traceability</h3>
                <ul className="source-list">
                  <li>
                    <a
                      href="https://ssd-api.jpl.nasa.gov/doc/horizons.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NASA/JPL Horizons API documentation{" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDS / LRO LOLA elevation products{" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://svs.gsfc.nasa.gov/4720/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NASA CGI Moon Kit imagery (visual only){" "}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                  {packet?.sources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={
                          "/api/provenance/" + s.rawFile.replace(".txt", "")
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Raw {i === 0 ? "Sun" : "Earth"} response · {s.model}{" "}
                        <ExternalLink size={12} />
                      </a>
                      <small>
                        Retrieved {s.retrievedUtc}
                        <br />
                        SHA-256 {s.sha256}
                      </small>
                    </li>
                  ))}
                </ul>
                <p className="data-note">
                  Apollo coordinates use published ME/PA DE421 values. Current
                  Horizons orientation uses its high-precision Mean Earth frame;
                  small frame realisation differences remain. Confirm results
                  with mission tools before decisions.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {state.toast && (
        <div className="toast" role="status">
          {state.toast}
        </div>
      )}
    </main>
  );
}

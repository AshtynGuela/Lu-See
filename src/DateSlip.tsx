import { useEffect, useState } from "react";
import { X, LoaderCircle } from "lucide-react";
import {
  selectedScenario,
  useScout,
  ensureData,
  getMask,
  packetKey,
  packetFor,
} from "./store";
import { DAY } from "../engine/index.mjs";
export default function DateSlip({ close }: { close: () => void }) {
  const state = useScout(),
    scenario = selectedScenario(state),
    site = [...state.sites, ...state.custom].find(
      (s) => s.id === state.selected,
    ),
    [span, setSpan] = useState(7),
    [anchor] = useState(
      scenario?.epoch === "live"
        ? state.time
        : Date.parse(scenario?.epoch || new Date(state.time).toISOString()),
    ),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  const key = packetKey(state.selected, state.mastM),
    terrain = state.terrains[state.selected],
    start = anchor - span * DAY,
    end = anchor + span * DAY,
    packet = packetFor(
      state,
      state.selected,
      start,
      span * 2 + (scenario?.durationDays || 0),
    );
  useEffect(() => {
    if (!scenario || !site) return;
    ensureData(site, start, span * 2 + scenario.durationDays);
  }, [span, scenario?.id, state.mastM, state.loading, state.packets]);
  useEffect(() => {
    setRows([]);
    setError("");
    if (
      !packet ||
      !scenario ||
      start < packet.sun[0][0] ||
      end + scenario.durationDays * DAY > packet.sun.at(-1)![0]
    )
      return;
    const worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      if (e.data.error) setError(e.data.error);
      else setRows(e.data.sweep);
    };
    worker.onerror = (e) =>
      setError(e.message || "Calculation could not start.");
    worker.postMessage({
      id: "slip",
      kind: "sweep",
      data: packet,
      start,
      end,
      duration: scenario.durationDays,
      mask: getMask(terrain, state.mastM),
      minAntennaEl: state.minAntennaEl,
    });
    return () => worker.terminate();
  }, [packet, scenario?.id, span, terrain, state.mastM]);
  const values = [
    ["sunlitPct", "Sunlit"],
    ["earthDtePct", "DTE geometry"],
  ];
  return (
    <section className="slip-tray">
      <header>
        <div>
          <h2>If the landing date changes</h2>
          <p>
            {site?.name} · {scenario?.durationDays} day mission · hourly
            landing-date sweep
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Close date-slip analysis"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <label>
        Explore around the selected landing date
        <select value={span} onChange={(e) => setSpan(+e.target.value)}>
          <option value={7}>±7 days</option>
          <option value={15}>±15 days</option>
          <option value={30}>±30 days</option>
        </select>
      </label>
      {!scenario ? (
        <p>Create a landing scenario to choose the mission duration first.</p>
      ) : rows.length ? (
        <>
          <div className="slip-heatmap">
            {values.map(([id, label]) => (
              <div className="slip-row" key={id}>
                <strong>{label}</strong>
                <div>
                  {rows.map((r, i) => (
                    <button
                      key={i}
                      style={{
                        backgroundColor: `hsl(${id === "sunlitPct" ? 44 : 200} 50% ${14 + r[id] * 0.52}%)`,
                      }}
                      title={`${new Date(r.time).toISOString()} · ${label}: ${r[id].toFixed(1)}%`}
                      aria-label={`Landing ${new Date(r.time).toISOString()}, ${label} ${r[id].toFixed(1)} percent`}
                      onClick={() => state.set({ time: r.time })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="slip-labels">
            <span>
              {new Date(rows[0].time)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC
            </span>
            <span>
              {new Date(rows.at(-1).time)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC
            </span>
          </div>
          <p className="data-note">
            Hover or focus a cell for exact values; click to set the global
            clock. Brightness indicates availability. Mission integrals use
            10-minute JPL samples and{" "}
            {terrain
              ? "the LOLA horizon"
              : "a smooth horizon (terrain not included)"}
            . Pinned scenarios retain their own dates.
          </p>
        </>
      ) : (
        <div className="slip-loading">
          <LoaderCircle className="spin" size={18} />
          <span>
            {error ||
              state.errors[key] ||
              "Fetching the full date window from NASA/JPL, then computing the sweep locally…"}
          </span>
        </div>
      )}
    </section>
  );
}

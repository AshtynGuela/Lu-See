import { useId, useMemo } from "react";
import { Compass, Radio, Sun } from "lucide-react";
import { conditions, horizonAt } from "../engine/index.mjs";
import { getMask, packetFor, useScout, type Site } from "./store";

const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (az: number) => cardinals[Math.round(az / 45) % 8];
const degrees = (angle: number) => `${angle.toFixed(1)}°`;

export default function HorizonReadout({ site, bearing, imagery, terrainLighting, toggleTerrainLighting, pointAt }: {
  site: Site;
  bearing: number;
  imagery: "loading" | "ready" | "unavailable";
  terrainLighting: boolean;
  toggleTerrainLighting: () => void;
  pointAt: (az: number, el: number) => void;
}) {
  const id = useId();
  const terrain = useScout(s => s.terrains[site.id]);
  const mast = useScout(s => s.mastM);
  const antenna = useScout(s => s.minAntennaEl);
  const time = useScout(s => s.time);
  const packet = useScout(s => packetFor(s, site.id));
  const mask = getMask(terrain, mast);
  const sky = useMemo(() => packet ? conditions(packet, time, mask, antenna) : null, [packet, time, mask, antenna]);
  const obstructions = terrain?.obstructions?.[String(mast)];
  const skyline = mask ? horizonAt(mask, bearing) : null;
  const lookAlongSkyline = (az: number) => pointAt(az, mask ? horizonAt(mask, az) : 0);
  const distance = (az: number) => {
    if (!obstructions) return null;
    const i = Math.round(az / (terrain?.azStepDeg ?? .5)) % obstructions.distanceM.length;
    const meters = obstructions.distanceM[i];
    return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
  };
  return (
    <section className="horizon-readout" aria-label="Horizon controls">
      <div className="horizon-heading">
        <h2><Compass size={16} /> Horizon</h2>
        <output htmlFor={id}>{compass(bearing)} {bearing}°</output>
      </div>
      <label htmlFor={id} className="sr-only">Compass bearing</label>
      <input id={id} type="range" min="0" max="359" step="1" value={bearing}
        aria-valuetext={`${compass(bearing)} ${bearing} degrees`}
        onChange={event => lookAlongSkyline(Number(event.target.value))} />
      <div className="horizon-directions">
        {["N", "E", "S", "W"].map((dir, i) => (
          <button key={dir} type="button" onClick={() => lookAlongSkyline(i * 90)}>{dir}</button>
        ))}
      </div>
      <p className="horizon-summary">
        {skyline === null ? "Local skyline unavailable" : <>Skyline {degrees(skyline)}{distance(bearing) && ` · terrain ${distance(bearing)} away`}</>}
        <span>{mast} m mast</span>
      </p>
      {terrain && <div className="horizon-imagery">
        <span role="status">{imagery === "ready" ? "NASA Moon Trek · LOLA terrain"
          : imagery === "loading" ? "Loading Moon Trek imagery…" : "LOLA terrain"}</span>
        <button type="button" aria-pressed={!terrainLighting} onClick={toggleTerrainLighting}>Use mission lighting</button>
      </div>}
      {sky && mask && <div className="horizon-targets">
        {(["sun", "earth"] as const).map(body => {
          const sample = sky[body];
          const clearance = sample.el - sample.horizon;
          const name = body === "sun" ? "Sun" : "Earth";
          const Icon = body === "sun" ? Sun : Radio;
          return (
            <button type="button" key={body} aria-label={`Look toward ${name}`}
              onClick={() => pointAt(sample.az, sample.el)}>
              <strong><Icon size={14} className={body === "sun" ? "sun-colour" : "earth-colour"} />{name} · {compass(sample.az)} {degrees(sample.az)}</strong>
              <span>{degrees(Math.abs(clearance))} {clearance >= 0 ? "above" : "below"} skyline</span>
            </button>
          );
        })}
      </div>}
    </section>
  );
}

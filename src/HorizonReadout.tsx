import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, Compass, Radio, Sun } from "lucide-react";
import { conditions, horizonAt } from "../engine/index.mjs";
import { getMask, packetFor, useScout, type Site } from "./store";
import type { SurfaceImageState } from "./World";
import { surfaceDetail, surfaceDetailCredit } from "./surfaceDetails";

const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (az: number) => cardinals[Math.round(az / 45) % 8];
const degrees = (angle: number) => `${angle.toFixed(1)}°`;

export default function HorizonReadout({ site, bearing, imagery, terrainLighting, toggleTerrainLighting, pointAt, inspectorOpen, onExpand }: {
  site: Site;
  bearing: number;
  imagery: SurfaceImageState;
  terrainLighting: boolean;
  toggleTerrainLighting: () => void;
  pointAt: (az: number, el: number) => void;
  inspectorOpen: boolean;
  onExpand: () => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(() => innerWidth > 1000);
  useEffect(() => {
    const narrow = matchMedia("(max-width: 1000px)");
    const update = () => setExpanded(!narrow.matches);
    narrow.addEventListener("change", update);
    return () => narrow.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (inspectorOpen && innerWidth <= 1000) setExpanded(false); }, [inspectorOpen]);
  const terrain = useScout(s => s.terrains[site.id]);
  const mast = useScout(s => s.mastM);
  const antenna = useScout(s => s.minAntennaEl);
  const time = useScout(s => s.time);
  const packet = useScout(s => packetFor(s, site.id));
  const mask = getMask(terrain, mast);
  const sky = useMemo(() => packet ? conditions(packet, time, mask, antenna) : null, [packet, time, mask, antenna]);
  const obstructions = terrain?.obstructions?.[String(mast)];
  const skyline = mask ? horizonAt(mask, bearing) : null;
  const closeUp = (imagery === "detail" || imagery === "detail-terrain") ? surfaceDetail(site) : undefined;
  const lookAlongSkyline = (az: number) => pointAt(az, (mask ? horizonAt(mask, az) : 0) - 11);
  const lookTowardSurveyor = () => {
    // Surveyor 3 position from LROC's 2016 spacecraft coordinate catalogue.
    const rad = Math.PI / 180, lat = site.lat * rad, targetLat = -3.0162 * rad,
      delta = (-23.418 - site.lon) * rad;
    const east = Math.sin(delta) * Math.cos(targetLat);
    const north = Math.cos(lat) * Math.sin(targetLat) - Math.sin(lat) * Math.cos(targetLat) * Math.cos(delta);
    pointAt((Math.atan2(east, north) / rad + 360) % 360, -7);
  };
  const distance = (az: number) => {
    if (!obstructions) return null;
    const i = Math.round(az / (terrain?.azStepDeg ?? .5)) % obstructions.distanceM.length;
    const meters = obstructions.distanceM[i];
    return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
  };
  return (
    <section className="horizon-readout" aria-label="Horizon controls">
      <div className="horizon-heading">
        <h2 title={site.name}><Compass size={16} /> Horizon · {site.name}</h2>
        <output htmlFor={id}>{compass(bearing)} {bearing}°</output>
        <button type="button" className="horizon-expand" aria-label={expanded ? "Collapse horizon controls" : "Expand horizon controls"} aria-expanded={expanded} aria-controls={id + "-body"} onClick={() => {
          if (!expanded) onExpand();
          setExpanded(value => !value);
        }}><ChevronDown size={15}/></button>
      </div>
      <div id={id + "-body"} hidden={!expanded}>
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
      {(terrain || imagery === "quickmap" || imagery === "regional" || imagery === "regional-imagery") && <div className="horizon-imagery">
        <span role="status">{imagery === "quickmap" ? <a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">QuickMap terrain · LROC imagery</a> : closeUp
          ? <a href={closeUp.sourceUrl} target="_blank" rel="noreferrer">{surfaceDetailCredit(closeUp, imagery === "detail")}</a>
          : imagery === "regional-imagery" ? "Moon Trek imagery · SLDEM2015 terrain ~60 m"
          : imagery === "regional" ? "SLDEM2015 terrain ~60 m"
          : imagery === "ready" ? `Moon Trek imagery · LOLA terrain ${terrain?.resolutionM} m`
          : imagery === "loading" ? "Loading Moon Trek imagery…" : "LOLA terrain"}</span>
        <button type="button" aria-pressed={!terrainLighting} onClick={toggleTerrainLighting}>Use mission lighting</button>
        {closeUp && site.id === "apollo12" && <button type="button" onClick={lookTowardSurveyor}>Look toward Surveyor 3</button>}
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
      </div>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BoundingSphere, CameraEventType, Cartesian2, Cartesian3, Cartographic,
  CesiumTerrainProvider, Color, Credit, DirectionalLight, DistanceDisplayCondition,
  Ellipsoid, EllipsoidTerrainProvider, Entity, GeographicTilingScheme,
  HeadingPitchRange, HeightReference, JulianDate, KeyboardEventModifier,
  Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType,
  UrlTemplateImageryProvider, Viewer, sampleTerrain,
} from "cesium";
import { ArrowDown, ArrowUp, Compass, Globe2, Info, Minus, Mountain, Plus, Settings2, X } from "lucide-react";
import { conditions } from "../engine/index.mjs";
import { LUNAR_RADIUS_M, LUNAR_IMAGERY_URL, LUNAR_MAP_CREDIT, LUNAR_MAP_SOURCE } from "../engine/lunar-map.mjs";
import { getMask, packetFor, useScout } from "./store";
import { captureMap } from "./mapSnapshot";
import type { RankedSite } from "./NearbySites";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./lunar-map.css";

const moon = new Ellipsoid(LUNAR_RADIUS_M, LUNAR_RADIUS_M, LUNAR_RADIUS_M);
const angle = CesiumMath.toRadians;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
type Cursor = { lat: number; lon: number; height: number; resolution: number; distance: number };
type Props = {
  onContext: (point: { x: number; y: number; lat: number; lon: number }) => void;
  onSnapshot: (capture: () => string) => void;
  onBearing: (bearing: number) => void;
  targetBearing: { az: number; el: number } | null;
  terrainLighting: boolean;
  nearbyPins?: RankedSite[];
  nearbyCenter?: { lat: number; lon: number };
  onNearbyPin: (site: RankedSite) => void;
};

function position(lat: number, lon: number, height = 0) {
  return Cartesian3.fromDegrees(lon, lat, height, moon);
}
const meters = (value: number) => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value.toFixed(1)} m`;
function cameraClearance(v: Viewer) {
  const point = v.camera.positionCartographic;
  return Math.max(5, point.height - (v.scene.globe.getHeight(point) ?? 0));
}

export default function LunarGlobe(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const terrain = useRef<CesiumTerrainProvider | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const state = useScout();
  const selected = [...state.sites, ...state.custom].find(site => site.id === state.selected);
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [showTerrain, setShowTerrain] = useState(true);
  const [freeAxis, setFreeAxis] = useState(true);
  const [retry, setRetry] = useState(0);
  const [surfacePending, setSurfacePending] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [measurementHelp, setMeasurementHelp] = useState(false);
  const home = useCallback(() => {
    const v = viewer.current;
    if (!v) return;
    v.camera.flyTo({
      destination: position(8, 0, LUNAR_RADIUS_M * 2),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: reducedMotion() ? 0 : 1,
    });
  }, []);

  useEffect(() => {
    if (!host.current) return;
    Object.assign(window, { CESIUM_BASE_URL: "/cesium/" });
    let alive = true;
    setReady(false);
    setError("");
    const v = new Viewer(host.current, {
      ellipsoid: moon,
      baseLayer: false,
      animation: false, timeline: false, homeButton: false, geocoder: false,
      sceneModePicker: false, baseLayerPicker: false, fullscreenButton: false,
      navigationHelpButton: false, selectionIndicator: false, infoBox: false,
      skyAtmosphere: false, skyBox: false, scene3DOnly: true,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      useBrowserRecommendedResolution: false,
      contextOptions: { webgl: { alpha: false, antialias: true, preserveDrawingBuffer: true } },
    });
    viewer.current = v;
    v.resolutionScale = Math.min(devicePixelRatio, 1.5) / devicePixelRatio;
    v.scene.backgroundColor = Color.fromCssColorString("#080d12");
    v.scene.fog.enabled = false;
    if (v.scene.sun) v.scene.sun.show = false;
    if (v.scene.moon) v.scene.moon.show = false;
    v.scene.globe.baseColor = Color.fromCssColorString("#797b78");
    v.scene.globe.showGroundAtmosphere = false;
    v.scene.globe.depthTestAgainstTerrain = true;
    v.scene.globe.maximumScreenSpaceError = 3;
    v.scene.globe.tileCacheSize = 160;
    v.scene.globe.preloadAncestors = true;
    v.scene.globe.preloadSiblings = false;
    const controls = v.scene.screenSpaceCameraController;
    controls.minimumZoomDistance = 0.5;
    controls.maximumZoomDistance = LUNAR_RADIUS_M * 12;
    controls.enableCollisionDetection = true;
    controls.rotateEventTypes = [CameraEventType.LEFT_DRAG];
    controls.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH, CameraEventType.RIGHT_DRAG];
    controls.tiltEventTypes = [CameraEventType.MIDDLE_DRAG, CameraEventType.PINCH,
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL }];
    v.camera.constrainedAxis = undefined;
    v.camera.percentageChanged = 0.01;
    v.scene.globe.tileLoadProgressEvent.addEventListener(count => {
      if (alive) setPending(count);
    });
    v.camera.changed.addEventListener(() => {
      if (alive) latest.current.onBearing((Math.round(CesiumMath.toDegrees(v.camera.heading)) + 360) % 360);
    });
    const imagery = new UrlTemplateImageryProvider({
      url: LUNAR_IMAGERY_URL + "/{quickmapLevel}/{x}/{y}.jpg",
      customTags: { quickmapLevel: (_provider, _x, _y, level) => String(level + 1) },
      tilingScheme: new GeographicTilingScheme({ ellipsoid: moon }),
      tileWidth: 512, tileHeight: 512,
      maximumLevel: 17,
      credit: new Credit(LUNAR_MAP_CREDIT),
    });
    imagery.errorEvent.addEventListener(event => {
      if (alive && event.level === 0) setError("Lunar imagery could not load. Retry the connection.");
    });
    v.imageryLayers.addImageryProvider(imagery);
    home();

    CesiumTerrainProvider.fromUrl("/api/lunar-terrain/", { ellipsoid: moon }).then(provider => {
      if (!alive) return;
      terrain.current = provider;
      provider.errorEvent.addEventListener(event => {
        if (alive && event.level === 0) setError("Lunar terrain could not load. Retry the connection.");
      });
      v.terrainProvider = provider;
      v.scene.requestRender();
      setReady(true);
    }).catch(() => {
      if (alive) setError("Lunar terrain is unavailable. Retry the connection.");
    });

    const inputs = new ScreenSpaceEventHandler(v.canvas);
    let touchInspection = false;
    let lastHover = 0;
    const hit = (point: Cartesian2) => {
      if (v.scene.pickPositionSupported) {
        const rendered = v.scene.pickPosition(point);
        if (rendered) return rendered;
      }
      const ray = v.camera.getPickRay(point);
      return ray && v.scene.globe.pick(ray, v.scene);
    };
    const inspect = (endPosition: Cartesian2, pin = false) => {
      const now = performance.now();
      if (!pin && (touchInspection || now - lastHover < 70)) return;
      lastHover = now;
      const point = hit(endPosition);
      if (!point) { setCursor(null); return; }
      const ll = moon.cartesianToCartographic(point);
      const adjacent = hit(new Cartesian2(endPosition.x + 1, endPosition.y));
      const resolution = adjacent ? Cartesian3.distance(point, adjacent)
        : v.camera.getPixelSize(new BoundingSphere(point, 1), v.canvas.clientWidth, v.canvas.clientHeight);
      setCursor({
        lat: CesiumMath.toDegrees(ll.latitude), lon: CesiumMath.toDegrees(ll.longitude),
        height: ll.height, resolution, distance: Cartesian3.distance(v.camera.positionWC, point),
      });
      if (pin) {
        v.entities.removeById("terrain-inspection");
        v.entities.add({ id: "terrain-inspection", position: point,
          point: { pixelSize: 9, color: Color.fromCssColorString("#c9e787"), outlineColor: Color.fromCssColorString("#080d12"), outlineWidth: 2 } });
        v.scene.requestRender();
      }
    };
    inputs.setInputAction(({endPosition}: {endPosition: Cartesian2}) => inspect(endPosition), ScreenSpaceEventType.MOUSE_MOVE);
    const select = (point: Cartesian2, context: boolean) => {
      const ground = hit(point);
      if (!ground) return;
      inspect(point, true);
      const ll = moon.cartesianToCartographic(ground);
      const s = useScout.getState();
      if (context || s.pickingSite) {
        const rect = v.canvas.getBoundingClientRect();
        latest.current.onContext({
          x: point.x + rect.left, y: point.y + rect.top,
          lat: CesiumMath.toDegrees(ll.latitude), lon: CesiumMath.toDegrees(ll.longitude),
        });
        return;
      }
      const picked = v.scene.pick(point);
      const id = picked?.id;
      if (id instanceof Entity) {
        const nearby = latest.current.nearbyPins?.find((_item, i) => id.id === "nearby-" + i);
        if (nearby) latest.current.onNearbyPin(nearby);
        else if (id.id.startsWith("site-")) s.select(id.id.slice(5));
      }
    };
    inputs.setInputAction(({ position }: { position: Cartesian2 }) => select(position, false), ScreenSpaceEventType.LEFT_CLICK);
    inputs.setInputAction(({ position }: { position: Cartesian2 }) => select(position, true), ScreenSpaceEventType.RIGHT_CLICK);
    const leave = () => { if (!touchInspection) setCursor(null); };
    const suppressContext = (event: MouseEvent) => event.preventDefault();
    const stopFlight = (event: PointerEvent) => { touchInspection = event.pointerType === "touch"; v.camera.cancelFlight(); };
    const mouseHover = (event: PointerEvent) => { if (event.pointerType === "mouse") touchInspection = false; };
    v.canvas.addEventListener("pointerleave", leave);
    v.canvas.addEventListener("pointerdown", stopFlight);
    v.canvas.addEventListener("pointermove", mouseHover);
    v.canvas.addEventListener("contextmenu", suppressContext);
    v.canvas.tabIndex = 0;
    v.canvas.setAttribute("aria-label", "Lunar 3D terrain. Drag to pan, middle-drag to tilt, wheel to zoom. Press B for horizon, X to descend.");
    latest.current.onSnapshot(() => {
      if (v.isDestroyed()) return "";
      v.scene.render();
      return captureMap(v.canvas);
    });
    return () => {
      alive = false;
      latest.current.onSnapshot(() => "");
      v.canvas.removeEventListener("pointerleave", leave);
      v.canvas.removeEventListener("pointerdown", stopFlight);
      v.canvas.removeEventListener("pointermove", mouseHover);
      v.canvas.removeEventListener("contextmenu", suppressContext);
      inputs.destroy();
      v.destroy();
      viewer.current = null;
      terrain.current = null;
    };
  }, [home, retry]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.terrainProvider = showTerrain && terrain.current ? terrain.current : new EllipsoidTerrainProvider({ ellipsoid: moon });
    v.scene.requestRender();
  }, [ready, showTerrain]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.camera.constrainedAxis = freeAxis ? undefined : Cartesian3.UNIT_Z;
    v.scene.requestRender();
  }, [ready, freeAxis]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.entities.removeAll();
    if (state.markers) {
      for (const site of [...state.sites, ...state.custom]) {
        const active = site.id === state.selected;
        v.entities.add({
          id: "site-" + site.id,
          position: position(site.lat, site.lon, site.elevationM ?? 0),
          point: { pixelSize: active ? 10 : 6, color: Color.fromCssColorString(active ? "#c9e787" : "#edf1e9"),
            outlineColor: Color.fromCssColorString("#080d12"), outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 100000 },
          label: { text: site.name, font: '14px "D-DIN"', fillColor: Color.fromCssColorString("#edf1e9"),
            showBackground: true, backgroundColor: Color.fromCssColorString("#101920"),
            pixelOffset: new Cartesian2(0, -20), heightReference: HeightReference.CLAMP_TO_GROUND,
            distanceDisplayCondition: new DistanceDisplayCondition(0, active ? 1200000 : 180000) },
        });
      }
      for (const [i, site] of (props.nearbyPins ?? []).entries()) {
        v.entities.add({
          id: "nearby-" + i, position: position(site.lat, site.lon),
          point: {pixelSize: 10, color: Color.fromCssColorString("#c9e787"), heightReference: HeightReference.CLAMP_TO_GROUND},
          label: {text: String(i+1), font: '14px "D-DIN"', pixelOffset: new Cartesian2(0,-18),
            heightReference: HeightReference.CLAMP_TO_GROUND},
        });
      }
    }
    v.scene.requestRender();
  }, [ready, state.sites, state.custom, state.selected, state.markers, props.nearbyPins]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    const polar = state.view === "polar_south" || state.view === "polar_north";
    const isGround = state.view === "horizon" || state.view === "surface";
    if (!polar && !selected) return;
    if (state.view === "globe" && state.focusVersion === 0) { home(); return; }
    let active = true;
    const destination = polar ? { lat: state.view === "polar_south" ? -90 : 90, lon: 0 } : selected!;
    const fly = (height: number, pitch: number) => {
      if (!active) return;
      v.camera.flyTo({
        destination: position(destination.lat, destination.lon, height),
        orientation: { heading: 0, pitch, roll: 0 }, duration: reducedMotion() ? 0 : 1,
      });
    };
    if (isGround && terrain.current) {
      setSurfacePending(true);
      const carto = Cartographic.fromDegrees(destination.lon, destination.lat);
      sampleTerrain(terrain.current, 16, [carto], true).then(([point]) => {
        if (!Number.isFinite(point.height)) throw new Error("Missing terrain elevation");
        fly(point.height + (state.view === "horizon" ? Math.max(2, state.mastM) : 900), state.view === "horizon" ? angle(-3) : angle(-42));
      }).catch(() => {
        if (!active) return;
        const height = selected?.elevationM;
        if (Number.isFinite(height)) fly(height! + (state.view === "horizon" ? Math.max(2, state.mastM) : 900), angle(-8));
        else setError("The surface height could not load. Retry before descending.");
      }).finally(() => { if (active) setSurfacePending(false); });
    } else {
      setSurfacePending(false);
      fly(polar ? LUNAR_RADIUS_M * .9 : 140000, -Math.PI / 2);
    }
    return () => { active = false; };
  }, [ready, state.view, state.selected, state.focusVersion, state.mastM]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !props.targetBearing || state.view !== "horizon") return;
    v.camera.setView({ orientation: { heading: angle(props.targetBearing.az), pitch: angle(props.targetBearing.el), roll: v.camera.roll } });
  }, [props.targetBearing, state.view]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.clock.currentTime = JulianDate.fromDate(new Date(state.time));
    const packet = packetFor(state, state.selected);
    const terrainRecord = state.terrains[state.selected];
    const sky = packet && conditions(packet, state.time, getMask(terrainRecord, state.mastM), state.minAntennaEl);
    const missionLighting = !props.terrainLighting && !!sky && !!selected;
    v.scene.globe.enableLighting = missionLighting;
    if (missionLighting && sky && selected) {
      const lat = angle(selected.lat), lon = angle(selected.lon);
      const az = angle(sky.sun.az), el = angle(sky.sun.el);
      const east = new Cartesian3(-Math.sin(lon), Math.cos(lon), 0);
      const north = new Cartesian3(-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat));
      const up = Cartesian3.normalize(position(selected.lat,selected.lon),new Cartesian3());
      const light = Cartesian3.add(
        Cartesian3.multiplyByScalar(east,Math.sin(az)*Math.cos(el),new Cartesian3()),
        Cartesian3.multiplyByScalar(north,Math.cos(az)*Math.cos(el),new Cartesian3()),new Cartesian3());
      Cartesian3.add(light,Cartesian3.multiplyByScalar(up,Math.sin(el),new Cartesian3()),light);
      v.scene.light = new DirectionalLight({ direction: Cartesian3.negate(light,light),
        color: Color.WHITE, intensity: 2 * sky.sun.visibleFraction });
    }
    v.scene.requestRender();
  }, [ready, state.time, state.selected, state.packets, state.terrains, state.mastM, state.minAntennaEl, props.terrainLighting]);

  const look = useCallback((pitch: number) => {
    const v = viewer.current;
    if (!v) return;
    v.camera.setView({ orientation: { heading: v.camera.heading, pitch, roll: v.camera.roll } });
  }, []);
  const zoom = (factor: number) => {
    const v = viewer.current;
    if (!v) return;
    const height = cameraClearance(v);
    v.camera.zoomIn(height * factor);
    v.scene.requestRender();
  };
  useEffect(() => {
    const keys = new Set<string>();
    const down = (event: KeyboardEvent) => {
      if (event.repeat || (event.target as HTMLElement).closest("input,textarea,select,[role=dialog],[role=menu]")) return;
      const code = event.code;
      const v = viewer.current;
      if (!v) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyA","KeyZ","KeyE","KeyD","KeyS","KeyF","KeyT","KeyG","KeyU","KeyH","KeyO","KeyP"].includes(code)) {
        keys.add(code); event.preventDefault(); event.stopImmediatePropagation();
      } else if (code === "KeyB") {
        event.preventDefault(); event.stopImmediatePropagation(); look(v.camera.pitch < angle(-45) ? angle(-3) : -Math.PI/2);
      } else if (code === "KeyV") {
        event.preventDefault(); event.stopImmediatePropagation();
        v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC, new Cartesian3()), Math.max(50,cameraClearance(v))); v.scene.requestRender();
      } else if (code === "KeyX") {
        event.preventDefault(); event.stopImmediatePropagation();
        const s = useScout.getState();
        const site = [...s.sites,...s.custom].find(site=>site.id===s.selected);
        if (site) s.set({view:"horizon",focusVersion:s.focusVersion+1});
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    let before = performance.now();
    const tick = setInterval(() => {
      const v = viewer.current, now = performance.now();
      const seconds = Math.min(.1,(now-before)/1000); before=now;
      if (!v || document.hidden || !keys.size) return;
      const step = cameraClearance(v) * seconds;
      for (const key of keys) {
        switch (key) {
          case "ArrowUp": v.camera.moveUp(step); break;
          case "ArrowDown": v.camera.moveDown(step); break;
          case "ArrowLeft": v.camera.moveLeft(step); break;
          case "ArrowRight": v.camera.moveRight(step); break;
          case "KeyA": v.camera.zoomIn(step); break;
          case "KeyZ": v.camera.zoomOut(step); break;
          case "KeyE": v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC,new Cartesian3()),step); break;
          case "KeyD": v.camera.move(moon.geodeticSurfaceNormal(v.camera.positionWC,new Cartesian3()),-step); break;
          case "KeyS": v.camera.lookLeft(seconds*.5); break;
          case "KeyF": v.camera.lookRight(seconds*.5); break;
          case "KeyT": case "KeyU": v.camera.lookUp(seconds*.5); break;
          case "KeyG": case "KeyH": v.camera.lookDown(seconds*.5); break;
          case "KeyO": v.camera.twistLeft(seconds*.5); break;
          case "KeyP": v.camera.twistRight(seconds*.5); break;
        }
      }
      v.scene.requestRender();
    }, 33);
    const clear = () => keys.clear();
    window.addEventListener("keydown",down,true);
    window.addEventListener("keyup",up);
    window.addEventListener("blur",clear);
    return () => { clearInterval(tick); window.removeEventListener("keydown",down,true); window.removeEventListener("keyup",up);window.removeEventListener("blur",clear); };
  }, [look]);

  return <>
    <div ref={host} className="lunar-canvas" />
    <nav className="lunar-camera" aria-label="Lunar camera controls">
      <button type="button" aria-label="Zoom in on Moon" title="Zoom in" onClick={()=>zoom(.45)}><Plus size={17}/></button>
      <button type="button" aria-label="Zoom out from Moon" title="Zoom out" onClick={()=>zoom(-.8)}><Minus size={17}/></button>
      <button type="button" aria-label="Show whole Moon" title="Whole Moon" onClick={home}><Globe2 size={17}/></button>
      <button type="button" aria-label="Terrain flyover at selected site" title="Terrain flyover · 900 m" onClick={() => {
        const s = useScout.getState(); s.set({view:"surface",focusVersion:s.focusVersion+1});
      }}><Mountain size={17}/></button>
      <button type="button" aria-label="Face lunar north" title="Face north" onClick={()=>{
        const v=viewer.current;if(v)v.camera.setView({orientation:{heading:0,pitch:v.camera.pitch,roll:0}});
      }}><Compass size={17}/></button>
      <button type="button" aria-label="Look along lunar horizon" title="Horizon · B" onClick={()=>look(angle(-3))}><ArrowUp size={17}/></button>
      <button type="button" aria-label="Look straight down at Moon" title="Overhead · B" onClick={()=>look(-Math.PI/2)}><ArrowDown size={17}/></button>
      <button type="button" aria-label="Lunar navigation settings" title="Navigation settings" aria-expanded={settings} onClick={()=>setSettings(value=>!value)}><Settings2 size={17}/></button>
    </nav>
    {settings && <section className="lunar-settings" aria-label="Lunar navigation settings">
      <header><strong>Navigation</strong><button className="icon-button" aria-label="Close lunar settings" onClick={()=>setSettings(false)}><X size={15}/></button></header>
      <label><input type="checkbox" checked={showTerrain} onChange={e=>setShowTerrain(e.target.checked)}/>3D terrain</label>
      <label><input type="checkbox" checked={freeAxis} onChange={e=>setFreeAxis(e.target.checked)}/>Unlock camera Z-axis</label>
      <button type="button" aria-expanded={showHelp} onClick={()=>setShowHelp(value=>!value)}>Camera controls</button>
      {showHelp && <div className="lunar-control-help">
        <p>Drag to pan. Wheel or right-drag to zoom. Middle-drag or Ctrl-drag to tilt. Pinch and drag with two fingers on touchscreens.</p>
        <dl><dt>Pan</dt><dd>Arrow keys</dd><dt>Zoom</dt><dd>A / Z</dd><dt>Pitch</dt><dd>T / G</dd><dt>Turn</dt><dd>S / F</dd><dt>Roll</dt><dd>O / P</dd><dt>Horizon / overhead</dt><dd>B</dd><dt>Selected site's surface</dt><dd>X</dd><dt>Move higher</dt><dd>V</dd></dl>
      </div>}
    </section>}
    <div className="lunar-stream-state" role="status" aria-live="polite">
      {error ? <><span>{error}</span><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></>
        : surfacePending ? "Loading surface elevation…" : !ready ? "Connecting lunar terrain…" : pending > 0 ? "Refining terrain…" : ""}
    </div>
    <div className="lunar-cursor" aria-label="Lunar cursor measurements">
      <dl>
        <div><dt>Lat</dt><dd>{cursor ? `${Math.abs(cursor.lat).toFixed(5)}° ${cursor.lat<0?"S":"N"}` : "—"}</dd></div>
        <div><dt>Lon</dt><dd>{cursor ? `${Math.abs(cursor.lon).toFixed(5)}° ${cursor.lon<0?"W":"E"}` : "—"}</dd></div>
        <div><dt title="Displayed terrain elevation relative to the 1,737.4 km lunar reference sphere">Height</dt><dd>{cursor && showTerrain ? meters(cursor.height) : "—"}</dd></div>
        <div><dt title="Ground distance represented by one screen pixel at the cursor">Res</dt><dd>{cursor ? `${cursor.resolution.toFixed(2)} m/px` : "—"}</dd></div>
        <div><dt>Dist to cursor</dt><dd>{cursor ? meters(cursor.distance) : "—"}</dd></div>
      </dl>
      <a href={LUNAR_MAP_SOURCE} target="_blank" rel="noreferrer">QuickMap · LROC</a>
      <button type="button" className="lunar-measurement-help" aria-label="Measurement details" aria-expanded={measurementHelp} onClick={() => setMeasurementHelp(value => !value)}><Info size={14}/></button>
      {measurementHelp && <div className="lunar-measurement-note">Height is the displayed terrain elevation above a 1,737.4 km lunar sphere. Res is ground metres per screen pixel, rather than the source DEM resolution. Tap terrain to pin a measurement. Source imagery limits close-range detail.</div>}
    </div>
    {(state.view === "surface" || state.view === "horizon") && <div className="lunar-view-mode">
      <span>{state.view === "surface" ? "Terrain flyover" : "Observer horizon"}</span>
      <button type="button" onClick={() => { const s=useScout.getState();s.set({view:s.view === "surface" ? "horizon" : "surface",focusVersion:s.focusVersion+1}); }}>{state.view === "surface" ? "Observer horizon" : "Terrain flyover"}</button>
    </div>}
  </>;
}

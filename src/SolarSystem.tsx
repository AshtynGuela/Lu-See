import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import {
  Focus,
  Orbit,
  RotateCcw,
  Sun,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import * as THREE from "three";
import { captureMap } from "./mapSnapshot";
import {
  PLANETS,
  SOLAR_BODIES,
  AU_KM,
  monthWindow,
  solarPosition,
  solarDisplayPoint,
} from "../engine/solar.mjs";
import { useScout, jsonFetch } from "./store";
import { planetOrientation } from "../engine/planetOrientation.mjs";
import { EarthGlobe, useEarthOrientation } from "./EarthGlobe";
const SolarContext = createContext<any>(null);
export function SolarCanvasScene() {
  return <SolarScene {...useContext(SolarContext)} />;
}
const monthlyCache = new Map<string, Record<string, any>>();
const solarLoadOrder = ["earth", "moon", ...SOLAR_BODIES.map(body => body.id)
  .filter(id => id !== "earth" && id !== "moon")];
function MoonModel({ radius }: { radius: number }) {
  const texture = useTexture("/data/moon-trek-wac.jpg");
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  );
}
function BodyModel({ id, radius }: { id: string; radius: number }) {
  const gltf = useGLTF("/assets/planets/" + id + ".glb");
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.updateMatrixWorld(true);
    const candidates: any[] = [];
    clone.traverse((m: any) => {
      if (m.isMesh) {
        // The supplied Sun uses a texture atlas, so retain its mesh and UVs.
        // Keep the emissive surface visible without the scene's tone mapping.
        if (id === "sun") m.material.toneMapped = false;
        const box = new THREE.Box3().setFromObject(m),
          s = box.getSize(new THREE.Vector3());
        if (Math.min(s.x, s.y, s.z) / Math.max(s.x, s.y, s.z) > 0.5)
          candidates.push({ box, r: Math.max(s.x, s.y, s.z) / 2 });
      }
    });
    const body = candidates.sort((a, b) => b.r - a.r)[0],
      box = body?.box || new THREE.Box3().setFromObject(clone),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3()),
      r = body?.r || Math.max(size.x, size.y, size.z) / 2;
    clone.position.sub(center);
    const group = new THREE.Group();
    group.add(clone);
    group.scale.setScalar(radius / (r || 1));
    return group;
  }, [gltf, id, radius]);
  return <primitive object={model} />;
}
function OrbitPath({
  rows,
  physical,
  color,
}: {
  rows: number[][];
  physical: boolean;
  color: string;
}) {
  const geo = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints(
        rows.map(
          (r) =>
            new THREE.Vector3(...solarDisplayPoint(r.slice(1, 4), physical)),
        ),
      ),
    [rows, physical],
  );
  const line = useMemo(
    () =>
      new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.38,
        }),
      ),
    [geo, color],
  );
  useEffect(
    () => () => {
      geo.dispose();
      (line.material as THREE.Material).dispose();
    },
    [geo, line],
  );
  return <primitive object={line} />;
}
function SolarScene({
  packets,
  selected,
  choose,
  nav,
  onSnapshot,
  orbits,
  labels,
  labelRefs,
}: {
  packets: any;
  selected: string;
  choose: (id: string) => void;
  nav: any;
  onSnapshot: any;
  orbits: boolean;
  labels: boolean;
  labelRefs: any;
}) {
  const state = useScout(),
    { camera, gl, size, invalidate } = useThree(),
    controls = useRef<any>(null),
    flight = useRef<any>(null),
    keys = useRef(new Set<string>());
  const earthOrientation = useEarthOrientation();
  const positions = useMemo(
    () =>
      Object.fromEntries(
        SOLAR_BODIES.map((b) => [
          b.id,
          solarPosition(packets[b.id]?.samples, state.time),
        ]),
      ),
    [packets, state.time],
  );
  const display = (id: string): THREE.Vector3 => {
    if (id === "sun") return new THREE.Vector3();
    if (
      id === "moon" &&
      !state.trueScale &&
      positions.earth &&
      positions.moon
    ) {
      const earth = new THREE.Vector3(...solarDisplayPoint(positions.earth));
      const relative = new THREE.Vector3(...positions.moon).sub(
        new THREE.Vector3(...positions.earth),
      );
      return earth.add(
        new THREE.Vector3(relative.x, relative.z, -relative.y).multiplyScalar(
          180,
        ),
      );
    }
    return new THREE.Vector3(
      ...solarDisplayPoint(positions[id], state.trueScale),
    );
  };
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.near = 0.00001;
    c.far = 1200;
    c.fov = 48;
    c.updateProjectionMatrix();
    invalidate();
  }, []);
  useEffect(() => {
    onSnapshot(() => captureMap(gl.domElement));
    return () => onSnapshot(() => "");
  }, [gl, onSnapshot]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,select,button,[role=dialog]",
          )
        )
          return;
        keys.current.add(e.code);
        invalidate();
      },
      up = (e: KeyboardEvent) => keys.current.delete(e.code),
      blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    if (!controls.current) return;
    const physical = state.trueScale,
      extent = nav.kind === "inner" ? (physical ? 3.5 : 6) : physical ? 65 : 21;
    let target = new THREE.Vector3(),
      distance = Math.max(
        extent * 2.8,
        (extent * 2.25) / (size.width / size.height),
      );
    if (nav.kind === "focus" && (nav.id === "sun" || positions[nav.id])) {
      target = display(nav.id);
      const b = SOLAR_BODIES.find((b) => b.id === nav.id),
        r = physical
          ? ((b?.radiusKm || 695700) / AU_KM) * 2
          : b?.displayRadius || 0.55;
      distance = Math.max(
        r * 9,
        physical ? (nav.id === "sun" ? 0.08 : 0.0007) : 1.5,
      );
    }
    const position = target
      .clone()
      .add(new THREE.Vector3(0, distance * 0.58, distance * 0.82));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      camera.position.copy(position);
      controls.current.target.copy(target);
      controls.current.update();
    } else
      flight.current = {
        from: camera.position.clone(),
        to: position,
        startTarget: controls.current.target.clone(),
        target,
        t: 0,
      };
    invalidate();
  }, [nav, state.trueScale, size.width, size.height, !!positions[nav.id]]);
  useEffect(() => {
    invalidate();
  }, [state.time, packets, selected, orbits, labels]);
  useFrame((_, dt) => {
    const ctl = controls.current;
    if (!ctl) return;
    if (flight.current) {
      const f = flight.current;
      f.t = Math.min(1, f.t + dt / 1.1);
      const u = 1 - (1 - f.t) ** 3;
      camera.position.lerpVectors(f.from, f.to, u);
      ctl.target.lerpVectors(f.startTarget, f.target, u);
      ctl.update();
      if (f.t === 1) flight.current = null;
    }
    if (keys.current.size) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const right = forward.clone().cross(camera.up).normalize(),
        v = new THREE.Vector3(),
        speed =
          Math.max(0.00005, camera.position.distanceTo(ctl.target) * 0.55) *
          Math.min(dt, 0.1) *
          (keys.current.has("ShiftLeft") ? 4 : 1);
      if (keys.current.has("KeyW")) v.add(forward);
      if (keys.current.has("KeyS")) v.sub(forward);
      if (keys.current.has("KeyD")) v.add(right);
      if (keys.current.has("KeyA")) v.sub(right);
      if (keys.current.has("KeyE")) v.y++;
      if (keys.current.has("KeyQ")) v.y--;
      if (v.lengthSq()) {
        v.normalize().multiplyScalar(speed);
        camera.position.add(v);
        ctl.target.add(v);
        flight.current = null;
        ctl.update();
      }
    }
    const placed: any[] = [];
    for (const id of [
      ...new Set(["sun", selected, "earth", ...SOLAR_BODIES.map((b) => b.id)]),
    ]) {
      const node = labelRefs.current[id];
      if (!node) continue;
      if (!labels || (id !== "sun" && !positions[id])) {
        node.style.display = "none";
        const line = node.previousElementSibling as SVGElement;
        if (line) line.style.display = "none";
        continue;
      }
      const point = display(id),
        projected = point.clone().project(camera),
        b = SOLAR_BODIES.find((b) => b.id === id),
        radius = state.trueScale
          ? ((b?.radiusKm || 695700) / AU_KM) * 2
          : b?.displayRadius || 0.55,
        gap = Math.max(
          12,
          (radius * size.height) /
            (2 *
              Math.tan(
                ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360,
              ) *
              camera.position.distanceTo(point)) +
            10,
        );
      const x = (projected.x * 0.5 + 0.5) * size.width,
        y = (-projected.y * 0.5 + 0.5) * size.height - gap;
      node.style.display =
        projected.z < -1 ||
        projected.z > 1 ||
        x < 0 ||
        x > size.width ||
        y < 0 ||
        y > size.height
          ? "none"
          : "";
      if (node.style.display === "none") {
        const line = node.previousElementSibling as SVGElement;
        if (line) line.style.display = "none";
        continue;
      }
      const w = node.offsetWidth || 48,
        h = node.offsetHeight || 20;
      let px = x,
        py = y,
        chosen: any = null;
      const candidates = [
        [0, 0],
        [0, -22],
        [34, 0],
        [-34, 0],
        [0, -44],
        [38, -24],
        [-38, -24],
        [0, 22],
        [65, -5],
        [-65, -5],
        [0, -66],
      ];
      for (const [dx, dy] of candidates) {
        const cx = Math.max(
            w / 2 + 6,
            Math.min(size.width - w / 2 - 6, x + dx),
          ),
          cy = Math.max(h / 2 + 4, Math.min(size.height - h / 2 - 4, y + dy)),
          box = { x: cx - w / 2, y: cy - h / 2, w, h };
        if (
          !placed.some(
            (b) =>
              box.x < b.x + b.w + 4 &&
              box.x + box.w + 4 > b.x &&
              box.y < b.y + b.h + 4 &&
              box.y + box.h + 4 > b.y,
          )
        ) {
          chosen = box;
          px = cx;
          py = cy;
          break;
        }
      }
      if (chosen) placed.push(chosen);
      node.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%)`;
      const leader = node.previousElementSibling as SVGSVGElement;
      if (leader) {
        leader.style.display = "";
        const line = leader.firstElementChild;
        line?.setAttribute("x1", String(x));
        line?.setAttribute("y1", String(y + gap));
        line?.setAttribute("x2", String(px));
        line?.setAttribute("y2", String(py + h / 2));
      }
    }
    if (flight.current || keys.current.size) invalidate();
  });
  const sunRadius = state.trueScale ? (695700 / AU_KM) * 2 : 0.55;
  return (
    <>
      <ambientLight intensity={0.22} />
      <pointLight position={[0, 0, 0]} intensity={7} decay={0} />
      <group
        onClick={(e) => {
          e.stopPropagation();
          choose("sun");
        }}
      >
        <group name="sun-spin" quaternion={planetOrientation("sun", state.time)}>
          <Suspense fallback={
            <mesh>
              <sphereGeometry args={[sunRadius, 48, 32]} />
              <meshBasicMaterial color="#ffcd76" toneMapped={false} />
            </mesh>
          }>
            <BodyModel id="sun" radius={sunRadius} />
          </Suspense>
        </group>
        {!state.trueScale && (
          <mesh scale={1.25}>
            <sphereGeometry args={[sunRadius, 32, 24]} />
            <meshBasicMaterial
              color="#ffb548"
              transparent
              opacity={0.1}
              depthWrite={false}
              side={THREE.BackSide}
            />
          </mesh>
        )}
      </group>
      {SOLAR_BODIES.map((body) => {
        const p = positions[body.id],
          packet = packets[body.id];
        if (!p || !packet) return null;
        const r = state.trueScale
            ? (body.radiusKm / AU_KM) * 2
            : body.displayRadius,
          pos = display(body.id);
        return (
          <group key={body.id}>
            {orbits && body.id !== "moon" && (
              <OrbitPath
                rows={packet.orbit}
                physical={state.trueScale}
                color={body.id === selected ? "#c9e787" : body.color}
              />
            )}
            <group
              name={`planet-${body.id}`}
              position={pos}
              quaternion={planetOrientation(body.id, state.time, earthOrientation)}
              onClick={(e) => {
                e.stopPropagation();
                choose(body.id);
              }}
            >
              <Suspense
                fallback={
                  <mesh>
                    <sphereGeometry args={[r, 24, 16]} />
                    <meshStandardMaterial color={body.color} />
                  </mesh>
                }
              >
                {body.id === "moon" ? (
                  <MoonModel radius={r} />
                ) : body.id === "earth" ? (
                  <EarthGlobe radius={r} />
                ) : (
                  <BodyModel id={body.id} radius={r} />
                )}
              </Suspense>
            </group>
          </group>
        );
      })}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.09}
        minDistance={0.0001}
        maxDistance={700}
        onStart={() => (flight.current = null)}
      />
    </>
  );
}
export default function SolarSystem({
  onSnapshot,
  children,
}: {
  onSnapshot: any;
  children: any;
}) {
  const labelRefs = useRef<Record<string, HTMLButtonElement>>({});
  const state = useScout(),
    [selected, setSelected] = useState("sun"),
    [nav, setNav] = useState({ kind: "whole", id: "sun", seq: 0 }),
    [orbits, setOrbits] = useState(true),
    [labels, setLabels] = useState(true),
    [retry, setRetry] = useState(0),
    [load, setLoad] = useState<any>({
      month: "",
      packets: {},
      errors: {},
      loading: true,
    });
  const month = new Date(monthWindow(state.time).start)
    .toISOString()
    .slice(0, 7);
  useEffect(() => {
    if (state.view !== "solar_system") return;
    let alive = true;
    const packets = { ...(monthlyCache.get(month) || {}) },
      errors: any = {};
    setLoad({ month, packets: { ...packets }, errors: {}, loading: true });
    (async () => {
      for (const id of solarLoadOrder) {
        if (!alive) break;
        if (packets[id]) continue;
        try {
          const p = await jsonFetch(
            "/api/solar/" +
              id +
              "?time=" +
              encodeURIComponent(month + "-01T00:00:00.000Z"),
          );
          if (!alive) break;
          packets[id] = p;
          monthlyCache.set(month, { ...packets });
        } catch (e) {
          errors[id] = e.message;
        }
        if (alive)
          setLoad({
            month,
            packets: { ...packets },
            errors: { ...errors },
            loading: true,
          });
      }
      if (alive)
        setLoad({
          month,
          packets: { ...packets },
          errors: { ...errors },
          loading: false,
        });
    })();
    return () => {
      alive = false;
    };
  }, [month, retry, state.view]);
  const packets = load.month === month ? load.packets : {},
    body = SOLAR_BODIES.find((b) => b.id === selected),
    p = body && solarPosition(packets[selected]?.samples, state.time),
    distance = p && Math.hypot(...p),
    loaded = PLANETS.filter((b) => packets[b.id]).length;
  const navigate = (kind: string, id = selected) =>
      setNav((n) => ({ kind, id, seq: n.seq + 1 })),
    choose = (id: string) => {
      setSelected(id);
      navigate("focus", id);
    };
  const value = {
    packets,
    selected,
    choose,
    nav,
    onSnapshot,
    orbits,
    labels,
    labelRefs,
  };
  return (
    <SolarContext.Provider value={value}>
      {children}
      {state.view === "solar_system" && (
        <>
          <div className="solar-labels" aria-label="Planet labels">
            {[{ id: "sun", name: "Sun" }, ...SOLAR_BODIES].map((b) => (
              <span key={b.id} className="solar-label-pair">
                <svg aria-hidden="true">
                  <line
                    stroke={b.id === "sun" ? "#ffcd76" : "#7d969d"}
                    strokeWidth="0.7"
                    opacity=".65"
                  />
                </svg>
                <button
                  ref={(el) => {
                    if (el) labelRefs.current[b.id] = el;
                  }}
                  className={
                    "solar-label" +
                    (b.id === "sun" ? " sun-label" : "") +
                    (b.id === selected ? " selected" : "")
                  }
                  onClick={() => choose(b.id)}
                >
                  {b.id === "sun" && <Sun size={13} />}
                  {b.name}
                </button>
              </span>
            ))}
          </div>
          <section
            className="solar-catalog"
            aria-label="Solar System destinations"
          >
            <h2>Solar System</h2>
            <p>Choose a body to focus.</p>
            <button
              className={selected === "sun" ? "selected" : ""}
              onClick={() => choose("sun")}
            >
              <span className="planet-dot" style={{ background: "#ffcd76" }} />
              Sun
            </button>
            {SOLAR_BODIES.map((b) => (
              <button
                key={b.id}
                className={selected === b.id ? "selected" : ""}
                disabled={!packets[b.id]}
                onClick={() => choose(b.id)}
              >
                <span className="planet-dot" style={{ background: b.color }} />
                {b.name}
                {b.id === "earth" && (
                  <span className="lunar-tag">Moon access</span>
                )}
              </button>
            ))}
          </section>
          <div
            className="solar-controls"
            aria-label="Solar System camera controls"
          >
            <button onClick={() => navigate("whole")}>
              <Orbit size={14} />
              Whole system
            </button>
            <button onClick={() => navigate("inner")}>
              <Focus size={14} />
              Inner planets
            </button>
            <label>
              <input
                type="checkbox"
                checked={orbits}
                onChange={(e) => setOrbits(e.target.checked)}
              />
              Orbits
            </label>
            <label>
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
              Labels
            </label>
          </div>
          <aside className="solar-info" aria-label="Selected Solar System body">
            <h1>{body?.name || "Sun"}</h1>
            {selected === "sun" ? (
              <p>Our star, at the centre of this map.</p>
            ) : p ? (
              <p className="solar-distance">
                {distance.toFixed(4)} AU{" "}
                <small>
                  from the Sun · {((distance * AU_KM) / 1e6).toFixed(2)} million
                  km
                </small>
              </p>
            ) : (
              <p>Waiting for verified JPL positions.</p>
            )}
            <p className="data-note">
              {body?.barycentre ? "JPL planetary-system barycentre. " : ""}
              {selected === "venus"
                ? "NASA surface model; clouds are not shown. "
                : ""}
              Planet models are visual references. Landing-site analysis is
              available on the Moon.
            </p>
            <div className="button-row solar-scale">
              <button
                className={!state.trueScale ? "active" : ""}
                onClick={() => state.set({ trueScale: false })}
              >
                Readable
              </button>
              <button
                className={state.trueScale ? "active" : ""}
                onClick={() => state.set({ trueScale: true })}
              >
                Physical scale
              </button>
            </div>
            <p className="data-note">
              {state.trueScale
                ? "Linear AU spacing and physical body sizes; labels stay visible."
                : "Radial spacing compressed; bodies and Moon separation enlarged. Numerical distances remain unscaled."}
            </p>
            <button
              className="primary full-width"
              onClick={() =>
                state.set({
                  view: "overview",
                  rail: null,
                  focusVersion: state.focusVersion + 1,
                })
              }
            >
              Explore Earth–Moon <ArrowUpRight size={15} />
            </button>
            <details>
              <summary>Position data · {loaded}/8 loaded</summary>
              <p className="data-note">
                Sun-centred ecliptic J2000. Positions follow UTC using real JPL
                vectors; paths sample about one revolution. Outer giants use
                system barycentres.
              </p>
              {body && packets[selected] && (
                <a
                  href={
                    "/api/provenance/" +
                    packets[selected].source.rawFile.replace(".txt", "")
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Raw JPL position data <ExternalLink size={11} />
                </a>
              )}
              <a
                href="https://ssd.jpl.nasa.gov/tools/orbit_viewer.html"
                target="_blank"
                rel="noreferrer"
              >
                JPL Orbit Viewer reference <ExternalLink size={11} />
              </a>
            </details>
            {loaded < 8 && (
              <p className="solar-load" role="status">
                {load.loading
                  ? "Loading real JPL trajectories…"
                  : "Some planetary data is unavailable."}{" "}
                {loaded}/8
              </p>
            )}
            {Object.keys(load.errors).length > 0 && (
              <button onClick={() => setRetry((n) => n + 1)}>
                <RotateCcw size={13} />
                Retry missing data
              </button>
            )}
          </aside>
        </>
      )}
    </SolarContext.Provider>
  );
}

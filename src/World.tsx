import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useScout, Site, packetKey, packetFor, getMask } from "./store";
import { conditions, horizonAt } from "../engine/index.mjs";
import { useEclipseMaterial } from "./eclipseMaterial";
import SolarSystem, { SolarCanvasScene } from "./SolarSystem";
import SpaceBackdrop from "./SpaceBackdrop";
import HorizonReadout from "./HorizonReadout";
import { captureMap } from "./mapSnapshot";
import { surfaceDetail, surfaceDetailCredit } from "./surfaceDetails";
import type { RankedSite } from "./NearbySites";
export const lunarPoint = (lat: number, lon: number, r = 3.5) =>
  new THREE.Vector3(
    Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180) * r,
    Math.sin((lat * Math.PI) / 180) * r,
    -Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180) * r,
  );
const scenePoint = (p: any, site: Site, alt = 0) => {
  const lat = (site.lat * Math.PI) / 180,
    lon = (site.lon * Math.PI) / 180,
    az = (p.az * Math.PI) / 180,
    el = (p.el * Math.PI) / 180;
  const up = lunarPoint(site.lat, site.lon, 1),
    east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon)),
    north = new THREE.Vector3(
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    );
  return up
    .multiplyScalar(Math.sin(el) * p.distanceKm + 1737.4 + alt / 1000)
    .addScaledVector(east, Math.cos(el) * Math.sin(az) * p.distanceKm)
    .addScaledVector(north, Math.cos(el) * Math.cos(az) * p.distanceKm);
};
function PolarMap({
  north,
  radius,
  onContext,
}: {
  north: boolean;
  radius: number;
  onContext: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useTexture(
    north ? "/data/polar-north.png" : "/data/polar-south.png",
  );
  const geometry = useMemo(() => {
    const p = [],
      uv = [],
      idx = [],
      rings = 80,
      segments = 256;
    for (let r = 0; r <= rings; r++)
      for (let a = 0; a <= segments; a++) {
        const rho = r / rings,
          lon = (a / segments) * Math.PI * 2,
          lat =
            (north ? 1 : -1) *
            (90 -
              (2 * Math.atan(rho * Math.tan((5 * Math.PI) / 180)) * 180) /
                Math.PI);
        const px = rho * Math.sin(lon),
          py = rho * Math.cos(lon);
        p.push(px * radius, 0, -py * radius);
        uv.push(0.5 + px / 2, 0.5 + py / 2);
        if (r < rings && a < segments) {
          const i = r * (segments + 1) + a,
            j = i + segments + 1;
          idx.push(i, j, i + 1, i + 1, j, j + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [north, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} onContextMenu={onContext}>
      <meshBasicMaterial
        map={texture}
        color="#d8d8d2"
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
const polarPoint = (lat: number, lon: number, radius: number) => {
  const rho =
      (Math.tan((((90 - Math.abs(lat)) / 2) * Math.PI) / 180) /
        Math.tan((5 * Math.PI) / 180)) *
      radius,
    a = (lon * Math.PI) / 180;
  return new THREE.Vector3(rho * Math.sin(a), 0.015, -rho * Math.cos(a));
};
function StatisticalLayer({
  name,
  meta,
  radius,
}: {
  name: string;
  meta: any;
  radius: number;
}) {
  const texture = useTexture("/layers/" + name + ".png"),
    factor = radius / (2 * 1737400 * Math.tan((5 * Math.PI) / 180)),
    [left, bottom, right, top] = meta.boundsM;
  return (
    <mesh
      position={[
        ((left + right) / 2) * factor,
        0.025,
        (-(top + bottom) / 2) * factor,
      ]}
      renderOrder={2}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry
        args={[(right - left) * factor, (top - bottom) * factor]}
      />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={1}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}
function MoonGlobe({
  radius,
  displaced,
  wireframe,
  onContext,
  onClick,
  eclipseMaterial,
}: {
  radius: number;
  displaced: boolean;
  wireframe: boolean;
  onContext: any;
  onClick: any;
  eclipseMaterial: any;
}) {
  const [texture, height] = useTexture(displaced
    ? ["/data/moon-trek-wac.jpg", "/data/moon-height.png"]
    : ["/data/moon-trek-wac.jpg"]);
  return (
    <mesh onContextMenu={onContext} onClick={onClick}>
      <sphereGeometry args={[radius, displaced ? 384 : 192, displaced ? 192 : 96]} />
      <meshStandardMaterial
        map={texture}
        onBeforeCompile={eclipseMaterial}
        displacementMap={height ?? null}
        displacementScale={(radius * 24) / 1737.4}
        displacementBias={(-radius * 12) / 1737.4}
        roughness={1}
        color="#e6e3d9"
        wireframe={wireframe}
      />
    </mesh>
  );
}
type SurfaceTile = { size: number; widthM: number; heightsM: number[] };

function useRegionalTopography(site: Site, width: number | undefined, detailFolder: string | null) {
  const covered = (width === 12000 || (!width && (detailFolder || site.family === "custom"))) && Math.abs(site.lat) < 59.8;
  const url = !covered ? null : detailFolder ? detailFolder + "/surroundings-terrain.bin"
    : "/api/surface-topography?" + new URLSearchParams({ lat: String(site.lat), lon: String(site.lon) });
  const [result, setResult] = useState<{ url: string; tile: SurfaceTile } | null>(null);
  useEffect(() => {
    if (!url) return;
    const request = new AbortController();
    void fetch(url, { signal: request.signal })
      .then(response => {
        if (!response.ok || !response.body) return null;
        const body = detailFolder && response.headers.get("Content-Encoding") !== "gzip"
          ? response.body.pipeThrough(new DecompressionStream("gzip")) : response.body;
        return new Response(body).json();
      })
      .then(tile => {
        if (tile && !request.signal.aborted) setResult({ url, tile });
      })
      .catch(() => {}); // The surrounding LOLA tile stays in view.
    return () => request.abort();
  }, [url, detailFolder]);
  return result?.url === url ? result.tile : null;
}

const horizonColor = new THREE.Color("#272b31");
function HorizonSilhouette({ mask, mast }: { mask: number[] | null; mast: number }) {
  const geometry = useMemo(() => {
    if (!mask) return null;
    const p = [], indices = [], skyline = [];
    for (let i = 0; i <= mask.length; i++) {
      const a = (i / mask.length) * Math.PI * 2,
        x = Math.sin(a) * 40,
        z = -Math.cos(a) * 40,
        y =
          Math.tan((mask[i % mask.length] * Math.PI) / 180) * 40 +
          mast / 1000;
      p.push(x, -1000, z, x, y, z);
      skyline.push(new THREE.Vector3(x, y, z));
      if (i < mask.length) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const line = new THREE.BufferGeometry().setFromPoints(skyline);
    return { fill: g, skyline: new THREE.Line(line, skylineMaterial) };
  }, [mask, mast]);
  useEffect(() => () => { geometry?.fill.dispose(); geometry?.skyline.geometry.dispose(); }, [geometry]);
  return geometry ? (
    <>
      <mesh geometry={geometry.fill}>
        <meshBasicMaterial color={horizonColor} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={geometry.skyline} />
    </>
  ) : null;
}
const skylineMaterial = new THREE.LineBasicMaterial({ color: "#8a9b9d", toneMapped: false });

function shadeSurface(shader: THREE.WebGLProgramParametersWithUniforms, horizon: boolean,
  near: THREE.Texture | null, nearRatio: number, terrainLighting: boolean) {
  shader.uniforms.surfaceNear = { value: near };
  shader.uniforms.surfaceNearRatio = { value: nearRatio };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 terrainUv;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nterrainUv = uv;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>
      varying vec2 terrainUv;
      uniform sampler2D surfaceNear;
      uniform float surfaceNearRatio;`)
    .replace("#include <map_fragment>", `
      #include <map_fragment>
      ${near ? `
        vec2 nearUv = (terrainUv - 0.5) / surfaceNearRatio + 0.5;
        vec2 nearEdge = abs(nearUv - 0.5) * 2.0;
        float nearBlend = 1.0 - smoothstep(0.68, 0.99, max(nearEdge.x, nearEdge.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(surfaceNear, clamp(nearUv, 0.0, 1.0)).rgb, nearBlend);
      ` : ""}
    `)
    .replace("#include <opaque_fragment>", `
      ${terrainLighting ? "outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.64);" : ""}
      ${horizon ? `
      vec2 edge = abs(terrainUv - 0.5) * 2.0;
      float blend = smoothstep(0.90, 1.0, max(edge.x, edge.y));
      outgoingLight = mix(outgoingLight, vec3(${horizonColor.toArray().join(", ")}), blend);
      ` : ""}
      #include <opaque_fragment>
    `);
}
function Earth({
  position,
  radius,
}: {
  position: THREE.Vector3;
  radius: number;
}) {
  const gltf = useGLTF("/assets/earth-web.glb");
  const model = useMemo(() => {
    const c = gltf.scene.clone(true),
      box = new THREE.Box3().setFromObject(c),
      size = box.getSize(new THREE.Vector3()).length(),
      center = box.getCenter(new THREE.Vector3());
    c.position.sub(center);
    const group = new THREE.Group();
    group.add(c);
    group.scale.setScalar((radius * 3.464) / (size || 1));
    return group;
  }, [gltf, radius]);
  return (
    <group position={position}>
      <primitive object={model} />
      <Html center position={[0, radius + 1, 0]}>
        <span className="body-label">EARTH</span>
      </Html>
    </group>
  );
}
export type SurfaceImageState = "loading" | "ready" | "unavailable" | "detail" | "detail-terrain" | "regional" | "regional-imagery";

function useSurfaceMap(url: string | null, onImageState?: (state: SurfaceImageState) => void) {
  const invalidate = useThree(s => s.invalidate);
  const [image, setImage] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  useEffect(() => {
    if (!url) return;
    onImageState?.("loading");
    const request = new AbortController();
    let map: THREE.Texture | undefined;
    let bitmap: ImageBitmap | undefined;
    fetch(url, { signal: request.signal })
      .then(response => {
        if (!response.ok) throw Error("Surface imagery unavailable");
        return response.blob();
      })
      .then(blob => createImageBitmap(blob, { imageOrientation: "flipY" }))
      .then(result => {
        if (request.signal.aborted) {
          result.close();
          return;
        }
        bitmap = result;
        map = new THREE.Texture(bitmap);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 16;
        map.needsUpdate = true;
        setImage({ url, texture: map });
        onImageState?.("ready");
        invalidate();
      })
      .catch(() => { if (!request.signal.aborted) onImageState?.("unavailable"); });
    return () => {
      request.abort();
      map?.dispose();
      bitmap?.close();
      setImage(current => current?.url === url ? null : current);
    };
  }, [url, onImageState, invalidate]);
  return image?.url === url ? image.texture : null;
}

function useSurfaceRelief(url: string | null, samples: number) {
  const [relief, setRelief] = useState<{ url: string; heights: Int16Array } | null>(null);
  useEffect(() => {
    if (!url) return;
    const request = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: request.signal });
        if (!response.ok || !response.body) return;
        const buffer = await new Response(
          response.headers.get("Content-Encoding") === "gzip"
            ? response.body
            : response.body.pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer();
        if (!request.signal.aborted && buffer.byteLength === samples ** 2 * 2)
          setRelief({ url, heights: new Int16Array(buffer) });
      } catch {
        // The wide LOLA surface remains available when the close-up fails.
      }
    })();
    return () => request.abort();
  }, [url, samples]);
  return relief?.url === url ? relief.heights : null;
}

function LocalTerrain({ site, onImageState, terrainLighting }: {
  site: Site; onImageState: (state: SurfaceImageState) => void; terrainLighting: boolean;
}) {
  const terrain = useScout(s => s.terrains[site.id]);
  const view = useScout(s => s.view);
  const grid = useScout(s => s.grid);
  const loading = useScout(s => s.loading[packetKey(site.id, s.mastM)]);
  const detail = surfaceDetail(site);
  const detailAssets = detail ? `/assets/surface-details/${detail.site}` : null;
  const regional = useRegionalTopography(site, terrain?.tile.widthM, detailAssets);
  const tile = regional ?? terrain?.tile;
  const width = tile?.widthM;
  const detailWidth = detail?.extentM ?? 0, detailSamples = detail?.samples ?? 0;
  const relief = useSurfaceRelief(detailAssets && detailAssets + "/relief.bin", detailSamples);
  const detailed = !!relief && !!width && detailWidth <= width;
  const nearWidth = width === 12000 ? 1280 : 512;
  const imageryUrl = (extent: number) =>
    "/api/surface-imagery?" + new URLSearchParams({ lat: String(site.lat), lon: String(site.lon), width: String(extent), v: "4" });
  const [imageState, setImageState] = useState<SurfaceImageState>("loading");
  const [detailImageState, setDetailImageState] = useState<SurfaceImageState>("loading");
  const detailTexture = useSurfaceMap(detailAssets && detailAssets + "/surface.webp", setDetailImageState);
  const mapUrl = !width ? null : detailAssets && width === 12000 ? detailAssets + "/surroundings-12000.jpg" : imageryUrl(width);
  const map = useSurfaceMap(mapUrl, setImageState);
  const alternateMap = useSurfaceMap(
    imageState === "unavailable" && width && detailAssets && width === 12000 ? imageryUrl(width) : null,
  );
  const surfaceMap = map ?? alternateMap;
  const nearUrl = (!detailAssets || detailImageState === "unavailable") && surfaceMap && width && view === "horizon"
    ? imageryUrl(nearWidth) : null;
  const near = useSurfaceMap(nearUrl);
  const displayState = detailed ? (detailTexture ? "detail" : "detail-terrain")
    : regional ? (surfaceMap ? "regional-imagery" : "regional") : surfaceMap ? "ready" : imageState;
  useEffect(() => onImageState(displayState), [displayState, onImageState]);
  const surfaceNear = (detailed ? detailTexture : null) ?? near;
  const surfaceNearWidth = surfaceNear === detailTexture && detailTexture ? detailWidth : nearWidth;
  const geometry = useMemo(() => {
    if (!tile) return null;
    const { size, widthM, heightsM } = tile;
    const centerHeight = heightsM[(heightsM.length - 1) / 2];
    const observerHeight = terrain?.elevationM ?? centerHeight;
    const heightOffset = regional ? observerHeight - centerHeight : 0;
    const axis = Array.from({ length: size }, (_, i) => (i / (size - 1) - .5) * widthM)
      .filter(m => !detailed || Math.abs(m) > detailWidth / 2);
    if (detailed) {
      for (let i = 0; i < detailSamples; i++)
        axis.push((i / (detailSamples - 1) - .5) * detailWidth);
      axis.sort((a, b) => a - b);
    }
    const count = axis.length,
      p = new Float32Array(count * count * 3),
      uv = new Float32Array(count * count * 2),
      indices = new (count * count > 65536 ? Uint32Array : Uint16Array)((count - 1) ** 2 * 6);
    const samples = axis.map(meters => {
      const uv = meters / widthM + .5;
      const fractional = uv * (size - 1);
      const index = THREE.MathUtils.clamp(Math.floor(fractional), 0, size - 2);
      return { uv, index, fraction: fractional - index,
        detailIndex: detailed ? Math.round((meters / detailWidth + .5) * (detailSamples - 1)) : 0 };
    });
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++) {
        const i = row * count + col, x = axis[col], n = axis[row],
          { uv: u, index: ix, fraction: fx, detailIndex: rx } = samples[col],
          { uv: v, index: iz, fraction: fz, detailIndex: rz } = samples[row],
          top = THREE.MathUtils.lerp(heightsM[iz * size + ix], heightsM[iz * size + ix + 1], fx),
          bottom = THREE.MathUtils.lerp(heightsM[(iz + 1) * size + ix], heightsM[(iz + 1) * size + ix + 1], fx),
          base = THREE.MathUtils.lerp(top, bottom, fz) + heightOffset,
          edge = Math.max(Math.abs(x), Math.abs(n)),
          detailBlend = detailed ? 1 - THREE.MathUtils.smoothstep(edge, detailWidth * .4, detailWidth / 2) : 0,
          d = Math.hypot(x, n),
          detailIndex = rz * detailSamples + rx,
          radial = 1737400 + (detailBlend
            ? THREE.MathUtils.lerp(base, observerHeight + relief![detailIndex] / 100, detailBlend)
            : base),
          h = radial * Math.cos(d / 1737400) - 1737400 - observerHeight,
          scale = d ? radial * Math.sin(d / 1737400) / d : 1;
        p[i * 3] = x * scale / 1000;
        p[i * 3 + 1] = h / 1000;
        p[i * 3 + 2] = -n * scale / 1000;
        uv[i * 2] = u;
        uv[i * 2 + 1] = v;
      }
    let offset = 0;
    for (let r = 0; r < count - 1; r++)
      for (let c = 0; c < count - 1; c++) {
        const a = r * count + c,
          b = a + 1,
          d = a + count,
          e = d + 1;
        indices[offset++] = a;
        indices[offset++] = b;
        indices[offset++] = d;
        indices[offset++] = b;
        indices[offset++] = e;
        indices[offset++] = d;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();
    return g;
  }, [terrain?.elevationM, tile, regional, detailed, relief, detailWidth, detailSamples]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry)
    return (
      <Html center>
        <div className="scene-notice">
          {loading
            ? "Loading local terrain and sky positions…"
            : "Local terrain is unavailable."}
        </div>
      </Html>
    );
  return (
    <group>
      <mesh geometry={geometry} castShadow={!terrainLighting && !grid} receiveShadow={!terrainLighting && !grid}>
        <meshStandardMaterial
          key={`${view}-${surfaceMap?.id}-${surfaceNear?.id}-${terrainLighting}`}
          customProgramCacheKey={() => `${view}-${!!surfaceNear}-${terrainLighting && !!(surfaceMap || surfaceNear)}`}
          onBeforeCompile={shader => shadeSurface(shader, view === "horizon", surfaceNear, surfaceNearWidth / (width ?? surfaceNearWidth), terrainLighting && !!(surfaceMap || surfaceNear))}
          map={surfaceMap}
          color={surfaceMap ? "#ffffff" : "#97978b"}
          roughness={1}
          side={THREE.DoubleSide}
          wireframe={grid}
        />
      </mesh>
      {view !== "horizon" && (
        <>
          <Shuttle position={[0, 0.012, 0]} scale={0.025} />
          <Html position={[0, 0.1, 0]} center>
            <span className="body-label">LANDING SITE</span>
          </Html>
        </>
      )}
    </group>
  );
}
function Shuttle({
  position = [0, 0, 0],
  scale = 0.2,
  groupRef,
}: {
  position?: any;
  scale?: number;
  groupRef?: any;
}) {
  return (
    <group
      ref={groupRef}
      position={position}
      scale={scale}
      rotation={[0, 0, 0]}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.25, 1.2, 4, 8]} />
        <meshStandardMaterial color="#dedfd7" roughness={0.7} />
      </mesh>
      <mesh scale={[2, 0.08, 0.7]} position={[0, 0, 0.2]}>
        <boxGeometry />
        <meshStandardMaterial color="#8e9da3" />
      </mesh>
      <mesh position={[0, 0.25, 0.2]} scale={[0.08, 0.9, 0.6]}>
        <boxGeometry />
        <meshStandardMaterial color="#b4c6cf" />
      </mesh>
    </group>
  );
}
function Scene({
  onContext,
  onSnapshot,
  onBearing,
  onImageState,
  terrainLighting,
  nearbyPins,
  nearbyCenter,
  onNearbyPin,
  targetBearing,
}: {
  onContext: (p: any) => void;
  onSnapshot: (fn: () => string) => void;
  onBearing: (bearing: number) => void;
  onImageState: (state: SurfaceImageState) => void;
  terrainLighting: boolean;
  nearbyPins?: RankedSite[];
  nearbyCenter?: { lat: number; lon: number };
  onNearbyPin: (site: RankedSite) => void;
  targetBearing: { az: number; el: number } | null;
}) {
  const state = useScout(),
    { camera, gl, size, invalidate } = useThree(),
    controls = useRef<any>(null),
    sunLight = useRef<THREE.DirectionalLight>(null),
    move = useRef<any>(null),
    keys = useRef(new Set<string>()),
    ship = useRef<THREE.Group>(null),
    route = useRef<THREE.QuadraticBezierCurve3 | null>(null),
    look = useRef({ yaw: 0, pitch: 0 }),
    previousBearing = useRef(-1);
  const radius = state.trueScale ? 0.17374 : 3.5,
    site = [...state.sites, ...state.custom].find(
      (s) => s.id === state.selected,
    );
  const packet = packetFor(state, state.selected),
    terrain = state.terrains[state.selected],
    mask = getMask(terrain, state.mastM);
  const c = useMemo(() => packet
    ? conditions(packet, state.time, mask, state.minAntennaEl)
    : null, [packet, state.time, mask, state.minAntennaEl]);
  const earthVector =
    c && site
      ? scenePoint(c.earth, site, packet.observer.elevationM + state.mastM)
      : null;
  const earth = earthVector ? earthVector.clone().multiplyScalar(0.0001) : null;
  const sunVector =
    c && site
      ? scenePoint(c.sun, site, packet.observer.elevationM + state.mastM)
      : null;
  const light = sunVector?.clone().normalize() || null;
  const eclipseMaterial = useEclipseMaterial(
    radius,
    sunVector,
    earthVector,
    c ? c.sun.distanceKm * Math.sin((c.sun.radius * Math.PI) / 180) : 0,
    c ? c.earth.distanceKm * Math.sin((c.earth.radius * Math.PI) / 180) : 0,
  );
  const local = state.view === "surface" || state.view === "horizon",
    polar = state.view.startsWith("polar"),
    north = state.view === "polar_north";
  const shadowExtent = (terrain?.tile.widthM ?? 12000) / 1000 * .78;
  const missionShadows = local && !terrainLighting && !!terrain && !state.grid;
  const blockers = terrain?.obstructions?.[String(state.mastM)]?.distanceM;
  const sunAzimuth = THREE.MathUtils.degToRad(c?.sun.az ?? 0);
  const distantBlocker = c && blockers && terrain
    ? blockers[Math.round(c.sun.az * blockers.length / 360) % blockers.length] >
      terrain.tile.widthM / (2 * Math.max(Math.abs(Math.sin(sunAzimuth)), Math.abs(Math.cos(sunAzimuth))))
    : false;
  const localSunlight = c
    ? (distantBlocker ? c.sun.visibleFraction : c.sun.eclipse.transmission)
    : 0;
  useEffect(() => {
    const shadow = sunLight.current?.shadow;
    if (!missionShadows || !shadow) return;
    const camera = shadow.camera;
    camera.left = camera.bottom = -shadowExtent;
    camera.right = camera.top = shadowExtent;
    camera.near = 80 - shadowExtent * 2;
    camera.far = 80 + shadowExtent * 2;
    camera.updateProjectionMatrix();
    invalidate();
  }, [missionShadows, shadowExtent, invalidate]);
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.near = 0.001;
    c.far = 500;
    c.fov = 40;
    c.updateProjectionMatrix();
    invalidate();
  }, []);
  useEffect(() => {
    if (!targetBearing) return;
    look.current = {
      yaw: -THREE.MathUtils.degToRad(targetBearing.az),
      pitch: THREE.MathUtils.degToRad(THREE.MathUtils.clamp(targetBearing.el, -85, 85)),
    };
    invalidate();
  }, [targetBearing, invalidate]);
  useEffect(() => {
    if (state.view !== "horizon") return;
    look.current = { yaw: 0, pitch: 0 };
    previousBearing.current = -1;
    let drag: any = null;
    const canvas = gl.domElement,
      cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.00005;
    cam.updateProjectionMatrix();
    const down = (e: PointerEvent) => {
      if (e.button === 0) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const motion = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      look.current.yaw -= (e.clientX - drag.x) * 0.005;
      look.current.pitch = THREE.MathUtils.clamp(
        look.current.pitch - (e.clientY - drag.y) * 0.005,
        -1.3,
        1.3,
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      invalidate();
    };
    const up = () => {
      drag = null;
    };
    const zoom = (e: WheelEvent) => {
      e.preventDefault();
      cam.fov = THREE.MathUtils.clamp(
        cam.fov * Math.exp(e.deltaY * 0.001),
        25,
        90,
      );
      cam.updateProjectionMatrix();
      invalidate();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", motion);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", zoom, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", motion);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", zoom);
      cam.fov = 40;
      cam.near = 0.001;
      cam.updateProjectionMatrix();
      invalidate();
    };
  }, [state.view, gl, camera]);
  useEffect(() => {
    if (state.view !== "horizon") return;
    // Keep the skyline in view while showing more of the near ground.
    look.current = { yaw: 0, pitch: THREE.MathUtils.degToRad(horizonAt(mask, 0) - 11) };
    invalidate();
  }, [state.view, state.selected, mask, invalidate]);
  useEffect(() => {
    if (!state.travel || !site) return;
    const end = lunarPoint(site.lat, site.lon, radius * 1.025),
      start = camera.position.clone().multiplyScalar(0.8),
      control = start
        .clone()
        .lerp(end, 0.5)
        .add(lunarPoint(site.lat, site.lon, radius * 1.8));
    route.current = new THREE.QuadraticBezierCurve3(start, control, end);
    move.current = null;
  }, [state.travel?.started]);
  useEffect(() => {
    onSnapshot(() => captureMap(gl.domElement));
    return () => onSnapshot(() => "");
  }, [gl, onSnapshot]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")
      )
        return;
      keys.current.add(e.code);
      invalidate();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return;
    let target = new THREE.Vector3(),
      position = new THREE.Vector3();
    if (local) {
      target.set(0, 0, 0);
      const scale = (terrain?.tile.widthM ?? 12000) / 12000;
      position.set(7 * scale, 6 * scale, 9 * scale);
      if (state.view === "horizon") {
        position.set(0, 0.002, 0);
        target.set(0, 0.01, -10);
      }
    } else if (state.view === "overview") {
      target.copy(
        earth ? earth.clone().multiplyScalar(0.5) : new THREE.Vector3(16, 0, 0),
      );
      position
        .copy(target)
        .add(
          new THREE.Vector3(4, 16, 70 / Math.min(1, size.width / size.height)),
        );
    } else if (state.view.startsWith("polar")) {
      position.set(0, radius * 3.6, 0.001);
    } else if (nearbyCenter && state.view === "globe") {
      position.copy(lunarPoint(nearbyCenter.lat, nearbyCenter.lon, radius * 1.14));
    } else {
      const normal = site
        ? lunarPoint(site.lat, site.lon, 1)
        : new THREE.Vector3(1, 0.2, 1).normalize();
      position.copy(normal.multiplyScalar(radius * 3.2));
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      camera.position.copy(position);
      ctl.target.copy(target);
      ctl.update();
    } else
      move.current = {
        from: camera.position.clone(),
        to: position,
        fromTarget: ctl.target.clone(),
        target,
        t: 0,
      };
    invalidate();
  }, [
    state.view,
    state.focusVersion,
    state.trueScale,
    !!earth,
    !!site,
    terrain?.tile.widthM,
    nearbyCenter,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    invalidate();
  }, [state.time, state.selected, state.mastM, state.view]);
  useFrame((_, delta) => {
    if (state.travel && route.current && ship.current && controls.current) {
      const u = Math.min(1, (performance.now() - state.travel.started) / 5500),
        s = u * u * (3 - 2 * u),
        p = route.current.getPoint(s),
        tangent = route.current.getTangent(s).normalize(),
        up = p.clone().normalize();
      ship.current.position.copy(p);
      ship.current.lookAt(p.clone().add(tangent));
      if (state.chase) {
        camera.position
          .copy(p)
          .addScaledVector(tangent, -radius * 0.5)
          .addScaledVector(up, radius * 0.45);
        controls.current.target.copy(p);
        controls.current.update();
        move.current = null;
      }
    }
    if (move.current && controls.current) {
      const m = move.current;
      m.t = Math.min(1, m.t + delta / 0.95);
      const u = 1 - (1 - m.t) ** 3;
      camera.position.lerpVectors(m.from, m.to, u);
      controls.current.target.lerpVectors(m.fromTarget, m.target, u);
      controls.current.update();
      if (m.t === 1) move.current = null;
    }
    if (sunLight.current && light) {
      const l =
        local && c
          ? new THREE.Vector3(
              Math.sin((c.sun.az * Math.PI) / 180) *
                Math.cos((c.sun.el * Math.PI) / 180),
              Math.sin((c.sun.el * Math.PI) / 180),
              -Math.cos((c.sun.az * Math.PI) / 180) *
                Math.cos((c.sun.el * Math.PI) / 180),
            )
          : light;
      sunLight.current.position.copy(l).multiplyScalar(80);
    }
    if (keys.current.size && controls.current && state.view !== "horizon") {
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      const right = f.clone().cross(camera.up).normalize(),
        v = new THREE.Vector3(),
        speed =
          (local
            ? 0.6
            : camera.position.distanceTo(controls.current.target) * 0.35) *
          delta *
          (keys.current.has("ShiftLeft") ? 4 : 1);
      if (keys.current.has("KeyW")) v.add(f);
      if (keys.current.has("KeyS")) v.sub(f);
      if (keys.current.has("KeyD")) v.add(right);
      if (keys.current.has("KeyA")) v.sub(right);
      if (keys.current.has("KeyE")) v.y++;
      if (keys.current.has("KeyQ")) v.y--;
      v.multiplyScalar(speed);
      camera.position.add(v);
      controls.current.target.add(v);
      controls.current.update();
      move.current = null;
    }
    if (state.view === "horizon") {
      if (keys.current.has("ArrowLeft")) look.current.yaw += delta * 0.6;
      if (keys.current.has("ArrowRight")) look.current.yaw -= delta * 0.6;
      if (keys.current.has("ArrowUp"))
        look.current.pitch = Math.min(1.3, look.current.pitch + delta * 0.6);
      if (keys.current.has("ArrowDown"))
        look.current.pitch = Math.max(-1.3, look.current.pitch - delta * 0.6);
      camera.position.set(0, state.mastM / 1000, 0);
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
      const bearing = (Math.round(-THREE.MathUtils.radToDeg(look.current.yaw)) % 360 + 360) % 360;
      if (bearing !== previousBearing.current) {
        previousBearing.current = bearing;
        onBearing(bearing);
      }
      move.current = null;
    }
    if (move.current || keys.current.size || state.travel) invalidate();
  });
  const context = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const n = e.point.clone().normalize(),
      rho = Math.hypot(e.point.x, e.point.z);
    onContext({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      lat: polar
        ? (north ? 1 : -1) *
          (90 -
            (2 *
              Math.atan((rho / radius) * Math.tan((5 * Math.PI) / 180)) *
              180) /
              Math.PI)
        : THREE.MathUtils.radToDeg(Math.asin(n.y)),
      lon: polar
        ? (Math.atan2(e.point.x, -e.point.z) * 180) / Math.PI
        : THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)),
    });
  };
  return (
    <>
      <ambientLight intensity={local ? (terrainLighting ? 0.55 : 0.12) : 0.045} />
      <directionalLight
        ref={sunLight}
        intensity={c ? 3 * (local ? (terrainLighting ? c.sun.visibleFraction : localSunlight) : 1) : 0}
        position={[20, 5, 10]}
        castShadow={missionShadows && localSunlight > 0}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.00002}
        shadow-normalBias={shadowExtent / 1600}
      />
      {local ? (
        <>
          <LocalTerrain key={site.id} site={site} onImageState={onImageState} terrainLighting={terrainLighting} />
          {state.view === "horizon" && <HorizonSilhouette mask={mask} mast={state.mastM} />}
          {c &&
            (["sun", "earth"] as const).map((body) => {
              const b = c[body],
                distance = body === "sun" ? 120 : 100,
                a = (b.az * Math.PI) / 180,
                e = (b.el * Math.PI) / 180,
                p = new THREE.Vector3(
                  Math.sin(a) * Math.cos(e),
                  Math.sin(e),
                  -Math.cos(a) * Math.cos(e),
                ).multiplyScalar(distance).add(new THREE.Vector3(0, state.mastM / 1000, 0));
              const clear = b.el >= b.horizon;
              return (
                <group key={body} position={p}>
                  <mesh>
                    <sphereGeometry
                      args={[distance * Math.sin((b.radius * Math.PI) / 180), 24, 16]}
                    />
                    <meshBasicMaterial
                      color={body === "sun" ? "#f3c77b" : "#94bdce"}
                    />
                  </mesh>
                  {clear && <Html center position={[0, 2.5, 0]}>
                    <span className="body-label">{body.toUpperCase()}</span>
                  </Html>}
                </group>
              );
            })}
        </>
      ) : (
        <>
          <Suspense fallback={null}>
            {polar ? (
              <PolarMap north={north} radius={radius} onContext={context} />
            ) : (
              <MoonGlobe
                radius={radius}
                displaced={!!state.layerManifest.heightReady}
                wireframe={state.terrainLayer}
                onContext={context}
                eclipseMaterial={eclipseMaterial}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation();
                  if (state.pickingSite) {
                    if (e.delta <= 5) context(e);
                    return;
                  }
                  if (state.view === "overview") state.set({ view: "globe" });
                }}
              />
            )}
          </Suspense>
          {polar &&
            !north &&
            state.statLayer &&
            state.layerManifest[state.statLayer] && (
              <Suspense fallback={null}>
                <StatisticalLayer
                  name={state.statLayer}
                  meta={state.layerManifest[state.statLayer]}
                  radius={radius}
                />
              </Suspense>
            )}
          {!polar && (
            <Html position={[0, radius + 1, 0]} center>
              <button
                className="body-label moon-body-label"
                onClick={() => state.set({ view: "globe" })}
              >
                MOON <span>Explore landing sites</span>
              </button>
            </Html>
          )}
          {state.markers &&
            !state.pickingSite &&
            [...state.sites, ...state.custom]
              .filter((s) => !polar || (north ? s.lat >= 80 : s.lat <= -80))
              .map((s) => {
                const p = polar
                    ? polarPoint(s.lat, s.lon, radius)
                    : lunarPoint(
                        s.lat,
                        s.lon,
                        radius * (1.018 + (state.terrains[s.id]?.elevationM ?? s.elevationM ?? 0) / 1737400),
                      ),
                  selected = s.id === state.selected;
                return (
                  <group key={s.id} position={p}>
                    <mesh
                      renderOrder={3}
                      onClick={(e) => {
                        e.stopPropagation();
                        state.select(s.id);
                      }}
                      onContextMenu={(e) => {
                        e.stopPropagation();
                        onContext({
                          x: e.nativeEvent.clientX,
                          y: e.nativeEvent.clientY,
                          siteId: s.id,
                        });
                      }}
                    >
                      <sphereGeometry
                        args={[radius * (selected ? 0.009 : 0.006), 12, 8]}
                      />
                      <meshBasicMaterial
                        color={selected ? "#c9e787" : "#ecebe3"}
                      />
                    </mesh>
                  </group>
                );
              })}
          {state.markers && !state.pickingSite && nearbyPins?.map((point, index) => {
            if (polar && (north ? point.lat < 80 : point.lat > -80)) return null;
            const position = polar
              ? polarPoint(point.lat, point.lon, radius)
              : lunarPoint(point.lat, point.lon, radius * 1.018);
            return <Html key={point.id || point.name} position={position} center occlude>
              <button className="ranked-pin" title={`Compare ${point.name}`}
                aria-label={`Compare ranked site ${index + 1}, ${point.name}`}
                onClick={() => onNearbyPin(point)}>{index + 1}</button>
            </Html>;
          })}
          {state.grid && !polar && (
            <mesh>
              <sphereGeometry args={[radius * 1.003, 36, 18]} />
              <meshBasicMaterial
                color="#69766d"
                wireframe
                transparent
                opacity={0.17}
              />
            </mesh>
          )}
          {earth && !polar && (
            <Suspense fallback={null}>
              <Earth position={earth} radius={state.trueScale ? 0.6378 : 4.6} />
            </Suspense>
          )}
          {state.travel && <Shuttle groupRef={ship} scale={radius * 0.07} />}
        </>
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={state.view !== "horizon" && (!state.travel || !state.chase)}
        enableDamping
        dampingFactor={0.08}
        onStart={() => {
          move.current = null;
        }}
        minDistance={
          state.travel ? radius * 0.02 : local ? 0.001 : radius * 1.04
        }
        maxDistance={400}
        enablePan={state.view !== "horizon"}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: null as any,
        }}
        target={[0, 0, 0]}
      />
    </>
  );
}
export default function World(props: {
  onContext: (p: any) => void;
  onSnapshot: (fn: () => string) => void;
  nearbyPins?: RankedSite[];
  nearbyCenter?: { lat: number; lon: number };
  onNearbyPin: (site: RankedSite) => void;
}) {
  const [bearing, setBearing] = useState(0);
  const [surfaceImage, setSurfaceImage] = useState<SurfaceImageState>("loading");
  const [terrainLighting, setTerrainLighting] = useState(true);
  const toggleTerrainLighting = () => setTerrainLighting(value => !value);
  const [targetBearing, setTargetBearing] = useState<{ az: number; el: number } | null>(null);
  const state = useScout(),
    selected = [...state.sites, ...state.custom].find(
      (s) => s.id === state.selected,
    );
  const solar = state.view === "solar_system";
  const closeUp = selected && surfaceDetail(selected);
  return (
    <SolarSystem onSnapshot={props.onSnapshot}>
      <div
        className={"world" + (solar ? " solar-world" : "")}
        aria-label="Interactive Earth–Moon map. Drag to orbit, wheel to zoom, W A S D to fly, Q and E to move vertically."
      >
        <Canvas
          frameloop="demand"
          shadows={state.view === "horizon" || state.view === "surface"}
          camera={{ position: [15, 16, 60], near: 0.001, far: 500, fov: 40 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor("#080d12");
          }}
        >
          <SpaceBackdrop />
          <Suspense fallback={null}>
            {solar ? <SolarCanvasScene /> : <Scene {...props} onBearing={setBearing} onImageState={setSurfaceImage} terrainLighting={terrainLighting} targetBearing={targetBearing} />}
          </Suspense>
        </Canvas>
        {!solar &&
          !state.pickingSite &&
          selected &&
          !state.travel &&
          ["globe", "polar_north", "polar_south"].includes(state.view) && (
            <button
              className="selected-map-label"
              onClick={() => state.set({ scenarioDialog: true })}
            >
              {selected.name}
              <span>Plan landing</span>
            </button>
          )}
      </div>
      {state.view === "horizon" && selected && <HorizonReadout
        site={selected} bearing={bearing} imagery={surfaceImage} terrainLighting={terrainLighting}
        toggleTerrainLighting={toggleTerrainLighting} pointAt={(az, el) => setTargetBearing({ az, el })}
      />}
      {state.view === "surface" && selected && (state.terrains[selected.id] || surfaceImage === "regional" || surfaceImage === "regional-imagery") && <div className="surface-imagery-credit">
        <span role="status">{(surfaceImage === "detail" || surfaceImage === "detail-terrain") && closeUp ? surfaceDetailCredit(closeUp, surfaceImage === "detail")
          : surfaceImage === "regional-imagery" ? "Moon Trek imagery · SLDEM2015 terrain ~60 m"
          : surfaceImage === "regional" ? "SLDEM2015 terrain ~60 m"
          : surfaceImage === "ready" ? "NASA Moon Trek · LOLA terrain" : surfaceImage === "loading" ? "Loading Moon Trek imagery…" : "LOLA terrain"}</span>
        <button type="button" aria-pressed={!terrainLighting} onClick={toggleTerrainLighting}>Use mission lighting</button>
      </div>}
    </SolarSystem>
  );
}

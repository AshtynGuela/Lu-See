import {useEffect, useState} from "react";
import {useTexture} from "@react-three/drei";
import {SRGBColorSpace} from "three";
import {earthTableSize} from "../engine/planetOrientation.mjs";

let earthOrientationRequest: Promise<DataView> | undefined;
let earthOrientation: DataView | undefined;

export function useEarthOrientation() {
  const [table, setTable] = useState(earthOrientation);
  useEffect(() => {
    if (table) return;
    let active = true;
    earthOrientationRequest ??= fetch("/assets/planets/earth-orientation.bin").then(async response => {
      if (!response.ok || !response.body) throw new Error("Earth orientation data is unavailable");
      const stream = response.headers.get("Content-Encoding") === "gzip"
        ? response.body : response.body.pipeThrough(new DecompressionStream("gzip"));
      const buffer = await new Response(stream).arrayBuffer();
      if (buffer.byteLength !== earthTableSize) throw new Error("Invalid Earth orientation data");
      return earthOrientation = new DataView(buffer);
    }).catch(error => {
      earthOrientationRequest = undefined;
      throw error;
    });
    earthOrientationRequest.then(value => {
      if (active) setTable(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [table]);
  return table;
}

export function EarthGlobe({radius}: {radius: number}) {
  // Three's sphere puts texture u=0.5 at +X, north at +Y and 90 E at -Z.
  const texture = useTexture("/assets/planets/earth-map.jpg", map => {
    map.colorSpace = SRGBColorSpace;
  });
  return <mesh scale={[1, 6356.7523 / 6378.137, 1]}>
    <sphereGeometry args={[radius, 64, 40]} />
    <meshStandardMaterial map={texture} roughness={1} />
  </mesh>;
}

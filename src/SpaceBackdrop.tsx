import { Suspense, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { PerspectiveCamera, SRGBColorSpace, Vector3, type Mesh } from "three";
import { useScout } from "./store";

const folder = "/assets/rocky/space/";
const art = ["solar-system", "earth-moon", "moon"].map(name => folder + name + ".webp");

function SpaceArt() {
  const view = useScout(s => s.view);
  const [solar, overview, moon] = useTexture(art, textures => {
    for (const texture of textures) texture.colorSpace = SRGBColorSpace;
  });
  const plane = useRef<Mesh>(null);
  const offset = useRef(new Vector3());
  const size = useThree(s => s.size);

  useFrame(({ camera }) => {
    if (!plane.current || !(camera instanceof PerspectiveCamera)) return;
    const distance = 90;
    const height = 2 * distance * Math.tan(camera.getEffectiveFOV() * Math.PI / 360);
    const side = height * Math.max(1, size.width / size.height) * 1.02;
    plane.current.position.copy(camera.position).add(offset.current.set(0, 0, -distance).applyQuaternion(camera.quaternion));
    plane.current.quaternion.copy(camera.quaternion);
    plane.current.scale.set(side, side, 1);
  });

  return (
    <mesh ref={plane} renderOrder={-1000} frustumCulled={false} raycast={() => {}}>
      <planeGeometry />
      <meshBasicMaterial map={view === "solar_system" ? solar : view === "overview" ? overview : moon}
        color="#c5c8d0" depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export default function SpaceBackdrop() {
  return <>
    <color attach="background" args={["#080d12"]} />
    <Suspense fallback={null}><SpaceArt /></Suspense>
  </>;
}

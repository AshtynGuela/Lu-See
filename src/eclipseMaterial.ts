import { useMemo } from "react";
import * as THREE from "three";

// Apparent positions reconstructed in Moon-fixed km from the selected JPL
// observer. Apply the same opaque-disc approximation at each globe fragment.
export function useEclipseMaterial(
  radius: number,
  sun: THREE.Vector3 | null,
  earth: THREE.Vector3 | null,
  sunRadiusKm: number,
  earthRadiusKm: number,
) {
  const uniforms = useMemo(
    () => ({
      lunarKmPerUnit: { value: 1 },
      lunarSun: { value: new THREE.Vector3() },
      lunarEarth: { value: new THREE.Vector3() },
      lunarSunRadius: { value: 0 },
      lunarEarthRadius: { value: 0 },
      lunarShadowEnabled: { value: 0 },
    }),
    [],
  );
  uniforms.lunarKmPerUnit.value = 1737.4 / radius;
  uniforms.lunarShadowEnabled.value = 0;
  if (sun && earth) {
    uniforms.lunarSun.value.copy(sun);
    uniforms.lunarEarth.value.copy(earth);
    uniforms.lunarSunRadius.value = sunRadiusKm;
    uniforms.lunarEarthRadius.value = earthRadiusKm;
    const angle = sun.angleTo(earth),
      reach =
        Math.asin((earthRadiusKm + 1737.4) / earth.length()) +
        Math.asin(sunRadiusKm / sun.length());
    uniforms.lunarShadowEnabled.value = angle <= reach ? 1 : 0;
  }
  return useMemo(
    () => (shader: any) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float lunarKmPerUnit;\nvarying vec3 lunarSurfaceKm;",
        )
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nlunarSurfaceKm = (modelMatrix * vec4(transformed, 1.0)).xyz * lunarKmPerUnit;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform vec3 lunarSun;
uniform vec3 lunarEarth;
uniform float lunarSunRadius;
uniform float lunarEarthRadius;
uniform float lunarShadowEnabled;
varying vec3 lunarSurfaceKm;
float lunarSolarTransmission() {
  if (lunarShadowEnabled < 0.5) return 1.0;
  vec3 s = lunarSun - lunarSurfaceKm;
  vec3 e = lunarEarth - lunarSurfaceKm;
  float sd = length(s), ed = length(e);
  if (ed >= sd) return 1.0;
  s /= sd; e /= ed;
  float r = asin(clamp(lunarSunRadius / sd, 0.0, 1.0));
  float R = asin(clamp(lunarEarthRadius / ed, 0.0, 1.0));
  float d = atan(length(cross(s,e)), dot(s,e));
  if (d >= R+r) return 1.0;
  if (d <= abs(R-r)) return 1.0 - min(1.0, R*R/(r*r));
  float area = r*r*acos(clamp((d*d+r*r-R*R)/(2.0*d*r), -1.0, 1.0))
    + R*R*acos(clamp((d*d+R*R-r*r)/(2.0*d*R), -1.0, 1.0))
    - 0.5*sqrt(max(0.0,(-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R)));
  return clamp(1.0-area/(PI*r*r), 0.0, 1.0);
}
`,
        )
        .replace(
          "#include <opaque_fragment>",
          "outgoingLight *= lunarSolarTransmission();\n#include <opaque_fragment>",
        );
    },
    [uniforms],
  );
}

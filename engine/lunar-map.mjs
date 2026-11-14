export const LUNAR_RADIUS_M = 1737400;
export const LUNAR_TERRAIN_URL = "https://dem-tiles.b-cdn.net/lunar/qts_demstack/lunar-fulleqc/mesh";
export const LUNAR_IMAGERY_URL = "https://lroc-tiles.quickmap.io/tiles/wac_nac_nacroi/lunar-fulleqc";
export const LUNAR_MAP_CREDIT = "LROC / NASA / GSFC / ASU / Intuitive Machines · ACT QuickMap";
export const LUNAR_MAP_SOURCE = "https://quickmap.lroc.im-ldi.com/";

export const lunarTerrainLayer = {
  tilejson: "2.1.0",
  name: "Lunar terrain from ACT QuickMap",
  version: "1.0.0",
  format: "quantized-mesh-1.0",
  extensions: ["octvertexnormals"],
  scheme: "slippyMap",
  projection: "EPSG:4326",
  bounds: [-180, -90, 180, 90],
  minzoom: 0,
  maxzoom: 16,
  available: Array.from({ length: 17 }, (_, level) => [{
    startX: 0, startY: 0, endX: 2 ** (level + 1) - 1, endY: 2 ** level - 1,
  }]),
  tiles: [LUNAR_TERRAIN_URL + "/{z}/{x}/{y}.terrain"],
  attribution: LUNAR_MAP_CREDIT,
};

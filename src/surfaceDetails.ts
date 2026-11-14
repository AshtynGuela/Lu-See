import type { Site } from "./store";
import catalogue from "./surface-detail-catalog.json";

type SurfaceDetail = {
  site: string;
  lat: number;
  lon: number;
  extentM: number;
  samples: number;
  elevationSpacingM: number;
  imagerySpacingM: number;
  terrainSource: string;
  imagerySource: string;
  sourceUrl: string;
};

const details = new Map<string, SurfaceDetail>(catalogue.map(detail => [detail.site, detail]));

export function surfaceDetail(site: Site) {
  const detail = details.get(site.id);
  return detail?.lat === site.lat && detail.lon === site.lon ? detail : undefined;
}

export function surfaceDetailCredit(detail: SurfaceDetail, imageLoaded: boolean) {
  const terrain = `${detail.terrainSource} terrain ${Number(detail.elevationSpacingM.toFixed(2))} m`;
  if (!imageLoaded) return terrain;
  const imagery = detail.imagerySource === detail.terrainSource ? "imagery" : `${detail.imagerySource} imagery`;
  return `${terrain} · ${imagery} ${Number(detail.imagerySpacingM.toFixed(2))} m`;
}

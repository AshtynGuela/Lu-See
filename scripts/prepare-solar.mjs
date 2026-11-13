import { solarPacket } from "../server/solar.mjs";
import { PLANETS } from "../engine/solar.mjs";
for (const body of PLANETS) {
  const p = await solarPacket(body.id, Date.now());
  console.log(
    body.name,
    p.samples.length,
    "local samples;",
    p.orbit.length,
    "orbit points;",
    p.source.model,
  );
}

import { z } from "zod";
import { MISSION_PROFILES } from "./mission-history.mjs";

export const APP_NAME = "AMAZE-X";
export const APP_EXPANSION = "Autonomous Moon Approach Zone Exploration - Xplorer";
export const VIEWS = ["solar_system", "overview", "globe", "polar_south", "polar_north", "horizon", "surface"];
export const BODIES = ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];
export const VIEW_LABELS = {solar_system:"Solar System",overview:"Earth–Moon",globe:"Moon",polar_south:"South pole",polar_north:"North pole",horizon:"Observer horizon",surface:"Terrain flyover"};
const iso = z.iso.datetime().refine(value => Date.parse(value) >= Date.parse("1969-01-01") && Date.parse(value) < Date.parse("2041-01-01"), "Use a UTC date from 1969 through 2040.");
export const MissionLimits = z.object({minSunlitPct:z.number().min(0).max(100),maxDarknessHours:z.number().min(0).max(2160),minEarthDtePct:z.number().min(0).max(100)});
const siteId = z.string().min(1).max(80);
const duration = z.number().min(.1).max(90);
export const AppAction = z.discriminatedUnion("type", [
  z.object({type:z.literal("fly_to"),siteId}),
  z.object({type:z.literal("open_inspector"),siteId}),
  z.object({type:z.literal("add_to_compare"),siteId,iso:iso.optional()}),
  z.object({type:z.literal("set_time"),iso}),
  z.object({type:z.literal("set_view"),view:z.enum(VIEWS)}),
  z.object({type:z.literal("navigate_body"),body:z.enum(BODIES)}),
  z.object({type:z.literal("open_panel"),panel:z.enum(["sites","time","layers","settings","comparison","timeline","landing","nearby","help","sources","date_slip"]),siteId:siteId.optional()}),
  z.object({type:z.literal("set_playback"),playing:z.boolean(),speed:z.union([z.literal(1),z.literal(60),z.literal(3600),z.literal(86400)]).optional()}),
  z.object({type:z.literal("set_map_options"),trueScale:z.boolean().optional(),grid:z.boolean().optional(),markers:z.boolean().optional(),terrain:z.boolean().optional(),statLayer:z.enum(["none","illumination","earth_visibility"]).optional()}),
  z.object({type:z.literal("set_lunar_options"),lighting:z.boolean().optional(),rotation:z.boolean().optional(),freeAxis:z.boolean().optional(),terrain:z.boolean().optional()}),
  z.object({type:z.literal("set_camera"),mode:z.enum(["whole_system","inner_planets","whole_moon","site","north","horizon","overhead","bearing"]),az:z.number().min(0).max(360).optional(),el:z.number().min(-89).max(89).optional()}),
  z.object({type:z.literal("set_observer"),mastM:z.union([z.literal(0),z.literal(2),z.literal(5),z.literal(10)]).optional(),minAntennaEl:z.number().min(0).max(90).optional()}),
  z.object({type:z.literal("create_site"),name:z.string().trim().min(1).max(64),lat:z.number().min(-90).max(90),lon:z.number().min(-180).max(180)}),
  z.object({type:z.literal("create_scenario"),siteId,iso:iso.optional(),durationDays:duration,profile:MissionLimits.optional(),flightProfile:z.enum(Object.keys(MISSION_PROFILES)).optional()}),
  z.object({type:z.literal("select_scenario"),scenarioId:z.enum(["A","B","C","D"])}),
  z.object({type:z.literal("plan_landing"),siteId:siteId.optional(),durationDays:duration.optional(),profile:MissionLimits.optional(),mode:z.enum(["open","possible","next","manual"]).default("open"),iso:iso.optional(),spanDays:z.union([z.literal(7),z.literal(30),z.literal(60),z.literal(90)]).optional()}),
  z.object({type:z.literal("rank_nearby"),siteId:siteId.optional(),radiusKm:z.number().min(1).max(100).default(20),durationDays:duration.optional(),autoRun:z.boolean().default(false)}),
  z.object({type:z.literal("travel_to"),siteId,iso,durationDays:duration}),
  z.object({type:z.literal("export_report"),format:z.enum(["json","csv"])}),
  z.object({type:z.literal("share_session")}),
  z.object({type:z.literal("set_rocky"),sizePercent:z.number().min(65).max(300).optional(),animation:z.enum(["Random","Attentive","Question","RockyDance","JazzHands","ClawGrip","Scuttle","Celebration","FistBump"]).optional(),sound:z.boolean().optional(),stream:z.boolean().optional(),chatter:z.boolean().optional(),paused:z.boolean().optional()}),
]);

export const APP_FEATURE_GUIDE = `AMAZE-X features (use the same names as the interface):
Navigation: set_view for Solar System, Earth–Moon, Moon, poles, Observer horizon or Terrain flyover; navigate_body focuses any Solar System body. set_camera offers whole-system, inner-planets, whole-Moon, selected-site, north, horizon, overhead and compass-bearing views.
Time: set_time changes the UTC clock; set_playback starts/stops playback and changes speed. Moon rotation, lighting and shadows follow that clock.
Map: set_map_options changes readable/physical scale, coordinate grid, site markers, 3D terrain and historical south-pole sunlight/Earth-visibility layers. set_lunar_options controls Sun lighting, lunar rotation and unlocked camera axis.
Analysis: lookup_site and get_conditions read real positions and mission totals; compare_sites calculates the trade-off between sites. find_landing_windows calculates candidate arrivals and estimated departures from historical mission flight times; never describe these as certified trajectories. find_events finds rise/set times.
Planning: plan_landing opens or runs the native planner with the user's surface duration and limits; mode next searches farther ahead without relaxing the limits. rank_nearby opens/runs nearby-site ranking. create_scenario adds a plan, select_scenario inspects it, travel_to animates the historical flight estimate and landing. A mission needs a user-chosen surface duration.
Places and settings: create_site adds explicit lunar coordinates. set_observer changes sensor/mast height and the minimum usable Earth angle. open_panel opens sites, time, layers, settings, comparison, timeline, landing, nearby, help, sources or date-slip analysis.
Output: export_report starts a JSON/CSV download of calculated results. share_session copies a link. Missing data must finish loading before a report is exported.
Rocky: set_rocky changes his size, animation, sound, typing and idle speech. Right-click/long-press him for these settings; drag his resize handle or pinch him to resize. He moves across the screen only when the user drags him.
Map images are visual evidence; scientific numbers still require calculation tools. Use inspect_app to read current settings. use_app_feature queues a validated native app action; do not claim it has happened until the client reports success.`;

export function actionLabel(action, sites = []) {
  const site = sites.find(site => site.id === action.siteId)?.name ?? "selected site";
  return ({fly_to:`Visit ${site}`,open_inspector:`Inspect ${site}`,add_to_compare:`Compare ${site}`,set_time:"Change the map date",set_view:`Open ${VIEW_LABELS[action.view] ?? "map"}`,navigate_body:`Explore ${action.body}`,open_panel:`Open ${action.panel?.replaceAll("_"," ")}`,set_playback:action.playing?"Play the mission clock":"Pause the mission clock",set_map_options:"Update map layers",set_lunar_options:"Update lunar lighting and navigation",set_camera:"Adjust the camera",set_observer:"Update sensor and antenna settings",create_site:`Create ${action.name}`,create_scenario:`Add a plan for ${site}`,select_scenario:`Inspect plan ${action.scenarioId}`,plan_landing:action.mode==="next"?"Search for the next landing window":"Plan a landing",rank_nearby:"Find better spots nearby",travel_to:`Travel and land at ${site}`,export_report:`Download ${action.format?.toUpperCase()} results`,share_session:"Copy a share link",set_rocky:"Adjust Rocky"})[action.type] ?? "Use app feature";
}

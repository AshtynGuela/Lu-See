import { AppAction, actionLabel } from "../engine/app-actions.mjs";
import { DEFAULT_MISSION_PROFILE, flightEstimate } from "../engine/mission-history.mjs";
import { allSites, ensureData, useScout } from "./store";
import type { Scenario, View } from "./store";

export type ActionResult = {ok:boolean;message:string};
export const FEATURE_EVENT = "amaze-x:feature";
export async function runAppAction(raw: unknown): Promise<ActionResult> {
  try {
    const a = AppAction.parse(raw), s = useScout.getState();
    const sites = allSites();
    if ("siteId" in a && a.siteId && !sites.some(site => site.id === a.siteId)) throw Error("That site is no longer available. Choose a site from Landing sites.");
    const select = (id: string) => s.select(id);
    switch (a.type) {
      case "set_time": s.set({time:Date.parse(a.iso),playing:false}); break;
      case "set_view": s.set({view:a.view as View}); break;
      case "set_playback": s.set({playing:a.playing,...(a.speed === undefined ? {} : {speed:a.speed})}); break;
      case "navigate_body": s.set({view:"solar_system",selectedBody:a.body,solarTarget:{body:a.body,kind:"focus",version:(s.solarTarget?.version??0)+1}}); break;
      case "set_observer": s.set({...a.mastM===undefined?{}:{mastM:a.mastM},...a.minAntennaEl===undefined?{}:{minAntennaEl:a.minAntennaEl}}); break;
      case "set_map_options": {
        if(a.statLayer && a.statLayer!=="none" && !s.layerManifest[a.statLayer]) throw Error("That NASA map layer is not ready yet.");
        s.set({...(a.trueScale===undefined?{}:{trueScale:a.trueScale}),...(a.grid===undefined?{}:{grid:a.grid}),...(a.markers===undefined?{}:{markers:a.markers}),...(a.terrain===undefined?{}:{lunarTerrain:a.terrain}),...(a.statLayer===undefined?{}:{statLayer:a.statLayer==="none"?null:a.statLayer,view:"polar_south"})}); break;
      }
      case "set_lunar_options": s.set({...(a.lighting===undefined?{}:{lunarLighting:a.lighting}),...(a.rotation===undefined?{}:{lunarRotation:a.rotation}),...(a.freeAxis===undefined?{}:{freeCameraAxis:a.freeAxis}),...(a.terrain===undefined?{}:{lunarTerrain:a.terrain})}); break;
      case "set_camera": {
        if(a.mode==="whole_system"||a.mode==="inner_planets") s.set({view:"solar_system",solarTarget:{body:"sun",kind:a.mode==="whole_system"?"whole":"inner",version:(s.solarTarget?.version??0)+1}});
        else s.set({view:["solar_system","overview"].includes(s.view)?"globe":s.view,cameraCommand:{...a,version:(s.cameraCommand?.version??0)+1}});
        break;
      }
      case "create_site": {
        const site={id:"custom-"+crypto.randomUUID(),name:a.name,lat:a.lat,lon:a.lon,family:"custom",region:"Custom coordinates",source:"User coordinates",description:"A lunar site at your chosen coordinates."};
        if(s.custom.length>=40) throw Error("The saved-site limit has been reached. Remove an unused custom site first.");
        s.set({custom:[...s.custom,site],selected:site.id,view:"globe",focusVersion:s.focusVersion+1}); break;
      }
      case "select_scenario": {
        const scenario=s.scenarios.find(row=>row.id===a.scenarioId);if(!scenario)throw Error("That plan is no longer saved.");
        select(scenario.siteId);s.set({activeScenarioId:scenario.id,compare:true,...scenario.epoch==="live"?{}:{time:Date.parse(scenario.epoch)}}); break;
      }
      case "create_scenario": case "travel_to": {
        const id=["A","B","C","D"].find(id=>!s.scenarios.some(row=>row.id===id));
        if(!id) throw Error("Four plans are already saved. Remove an unused plan before adding another.");
        const epoch=a.iso??new Date(s.time).toISOString(),arrival=Date.parse(epoch);
        if(arrival+a.durationDays*86400000>=Date.parse("2041-01-01")) throw Error("The full stay must finish before the end of 2040.");
        const flightProfile=("flightProfile" in a && a.flightProfile)||DEFAULT_MISSION_PROFILE;
        const estimate=flightEstimate(arrival,flightProfile);
        if(a.type==="travel_to" && Date.parse(estimate.departureUtc)<Date.parse("1969-01-01")) throw Error("The estimated departure is outside the supported dates.");
        const scenario:Scenario={id,siteId:a.siteId,epoch,durationDays:a.durationDays,flightProfile,...("profile" in a&&a.profile?{profile:a.profile}:{})};
        select(a.siteId);s.set({scenarios:[...s.scenarios,scenario],activeScenarioId:id,compare:a.type!=="travel_to"});
        void ensureData(sites.find(site=>site.id===a.siteId)!,arrival,a.durationDays);
        if(a.type==="travel_to") {
          if(matchMedia("(prefers-reduced-motion: reduce)").matches) s.set({time:arrival,view:"surface",landed:true,playing:false});
          else s.set({view:"globe",time:Date.parse(estimate.departureUtc),travel:{from:Date.parse(estimate.departureUtc),to:arrival,started:performance.now(),siteId:a.siteId},playing:false,chase:true});
        } break;
      }
      case "set_rocky": window.dispatchEvent(new CustomEvent("amaze-x:rocky-options",{detail:a})); break;
      default: {
        return await new Promise<ActionResult>(resolve=>{
          let handled=false;
          window.dispatchEvent(new CustomEvent(FEATURE_EVENT,{detail:{action:a,accept:()=>{handled=true;},resolve}}));
          // Handlers acknowledge synchronously; their work may complete later.
          if(!handled) resolve({ok:false,message:"This feature is still loading. Try the action again in a moment."});
        });
      }
    }
    return {ok:true,message:actionLabel(a,sites)};
  } catch(error) { return {ok:false,message:error instanceof Error?error.message:"This action could not run."}; }
}

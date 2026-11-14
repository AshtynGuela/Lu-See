import { z } from "zod";
import { AppAction, APP_FEATURE_GUIDE, actionLabel } from "../engine/app-actions.mjs";
import { conditions, summarize, DAY, HOUR } from "../engine/index.mjs";
import { landingWindows } from "../engine/landing.mjs";
import { arrivalSearch, DEFAULT_MISSION_PROFILE, flightEstimate, MISSION_PROFILES } from "../engine/mission-history.mjs";
import { comparisonTakeaway } from "../engine/comparison.mjs";

const fn = (name,description,properties={},required=[]) => ({type:"function",function:{name,description,parameters:{type:"object",properties,required,additionalProperties:false}}});
// Flatten the transport schema to avoid repeating the same fields for every
// action. The discriminated schema still validates every action on the server.
const variants=z.toJSONSchema(AppAction).anyOf??z.toJSONSchema(AppAction).oneOf;
const actionProperties={};
for(const variant of variants)for(const [key,definition]of Object.entries(variant.properties)){
  const property={...definition};delete property.default;
  if("const"in property){property.enum=[property.const];delete property.const;}
  if(actionProperties[key]?.enum&&property.enum)property.enum=[...new Set([...actionProperties[key].enum,...property.enum])];
  actionProperties[key]=property;
}
const compactActionSchema={type:"object",properties:actionProperties,required:["type"],additionalProperties:false};
export const appTools = [
  fn("inspect_app","Read the current app, sites, saved plans and available features before deciding how to help."),
  fn("use_app_feature","Queue a native app action requested by the user. Use type plus only fields relevant to that action. The client runs it after the answer arrives; never claim completion yet.",{action:compactActionSchema },["action"]),
  fn("compare_sites","Calculate sunlight hours, Earth-visibility hours and the trade-off for two to four sites over a user-chosen stay.",{siteIds:{type:"array",items:{type:"string"},minItems:2,maxItems:4},iso:{type:"string"},durationDays:{type:"number"}},["siteIds","iso"]),
  fn("find_landing_windows","Calculate possible arrivals and historical departure estimates, with actual JPL positions and a terrain horizon. This is a bounded search; if empty, offer the native Find next window feature.",{siteId:{type:"string"},earliestDeparture:{type:"string"},durationDays:{type:"number"},spanDays:{type:"integer",minimum:1,maximum:60},flightProfile:{type:"string",enum:Object.keys(MISSION_PROFILES)}},["siteId","earliestDeparture"]),
];

export function requestedDuration(input, siteId, offered) {
  const q=String(input.question??"").toLowerCase();
  const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const durationPattern=/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:earth\s*)?(days?|hours?|weeks?)\b/g;
  const matches=[...q.matchAll(durationPattern)];
  const surface=q.match(/\b(?:stay(?:\s+(?:of|for))?|surface\s+(?:stay|duration)(?:\s+of)?|mission\s+(?:lasts|duration)(?:\s+of)?)\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:earth\s*)?(days?|hours?|weeks?)\b/);
  if(!surface&&matches.length>1)throw Error("Choose the surface stay separately from the flight or search duration.");
  const match=surface??matches[0];
  const explicit=match ? (Number(match[1])||words[match[1]])*(match[2].startsWith("hour")?1/24:match[2].startsWith("week")?7:1) : null;
  const context=input.context??{};
  const scenario=context.scenarios?.find(row=>row.id===context.activeScenarioId && row.siteId===siteId)
    ?? context.scenarios?.find(row=>row.siteId===siteId);
  const chosen=explicit??scenario?.durationDays??context.durationDays;
  if(chosen==null) throw Error("Choose how many Earth days to stay on the surface before calculating mission totals or landing dates.");
  const duration=z.number().min(.1).max(90).parse(chosen);
  if(offered!==undefined && Math.abs(duration-offered)>1e-6) throw Error("Use the user's chosen surface duration. Do not invent or change it.");
  return duration;
}

export function validateRequestedAction(raw,input,sites) {
  const action=AppAction.parse(raw);
  if("siteId"in action&&action.siteId&&!sites.some(site=>site.id===action.siteId))throw Error("Unknown action site.");
  if(["create_scenario","travel_to"].includes(action.type)||("durationDays"in action&&action.durationDays!==undefined))requestedDuration(input,action.siteId??input.context?.selectedSiteId,action.durationDays);
  if(action.type==="rank_nearby"&&action.autoRun)requestedDuration(input,action.siteId??input.context?.selectedSiteId,action.durationDays);
  const resize=explicitRockyResize(input.question??"");
  if(action.type==="set_rocky"&&action.sizePercent!==undefined&&resize&&action.sizePercent!==resize.sizePercent)throw Error("Use the Rocky size the user requested.");
  if(action.type==="create_site"&&!sites.some(site=>Math.abs(site.lat-action.lat)<1e-6&&Math.abs(site.lon-action.lon)<1e-6)&&![action.lat,action.lon].every(n=>String(input.question).includes(String(n))))throw Error("Use coordinates the user supplied or a known site's coordinates. Otherwise help the user pick a point on the Moon.");
  return action;
}

export function explicitRockyResize(question) {
  if(!/\brocky\b/i.test(question)||!(/\b(?:resize|size|scale|bigger|smaller|grow|shrink)\b/i.test(question)||/\bmake\s+rocky\s+(?:to\s+)?\d/i.test(question)))return null;
  const match=String(question).match(/\b(\d+(?:\.\d+)?)\s*(?:percent|%)/i);
  const value=match&&Number(match[1]);
  return value>=65&&value<=300?{type:"set_rocky",sizePercent:value}:null;
}

export function mergePlannedActions(queued,suggested=[]) {
  // A tool-validated action is authoritative. A model's prose response must
  // not replace it with guessed fields or placeholder strings in parameters.
  const additional=suggested.filter(action=>!queued.some(item=>item.type===action?.type));
  return [...queued,...additional].filter((action,index,list)=>list.findIndex(other=>JSON.stringify(other)===JSON.stringify(action))===index);
}

export function createAppToolRunner({input,sites,loadData,loadTerrain,fact,queued,signal}) {
  const names=new Set(appTools.map(tool=>tool.function.name));
  const time=value=>z.iso.datetime().refine(v=>Date.parse(v)>=Date.parse("1969-01-01")&&Date.parse(v)<Date.parse("2041-01-01")).parse(value);
  const site=id=>{const found=sites.find(row=>row.id===id);if(!found)throw Error("Choose a site from the catalogue or your saved custom sites.");return found;};
  const prepare=async(id,iso,duration,span=0)=>{
    const selected=site(id), start=Date.parse(time(iso));
    if(start+(duration+span)*DAY>=Date.parse("2041-01-01"))throw Error("The search and full stay must fit before the end of 2040.");
    const terrain=await loadTerrain(selected);
    if(signal?.aborted)throw Error("The request was cancelled.");
    const mast=[0,2,5,10].includes(input.context?.mastM)?input.context.mastM:2;
    const antenna=z.number().min(0).max(90).parse(input.context?.minAntennaEl??5);
    // Match the dashboard's UTC-day cache windows. Evaluate at the requested
    // instant below; only the surrounding source-table request is aligned.
    const sourceStart=new Date(Math.floor(start/DAY)*DAY).toISOString();
    const data=await loadData({site:selected,iso:sourceStart,days:Math.max(33,Math.ceil(duration+span)+2),mast,terrain});
    if(signal?.aborted)throw Error("The request was cancelled.");
    return {selected,terrain,mask:terrain?.masks?.[String(mast)]??null,mast,antenna,data,start};
  };
  return {has:name=>names.has(name),run:async(name,args)=>{
    if(name==="inspect_app")return {features:APP_FEATURE_GUIDE,context:input.context??{},sites:sites.map(row=>({id:row.id,name:fact("Site name",row.name),region:row.region})),time:input.context?.timeUtc?fact("Current map time",input.context.timeUtc):null,nextMapDay:input.context?.timeUtc?fact("Next map day",new Date(Date.parse(input.context.timeUtc)+DAY).toISOString()):null,currentUtc:fact("Current UTC",new Date().toISOString()),settings:Object.entries(input.context?.settings??{}).map(([key,value])=>fact(key,typeof value==="object"?JSON.stringify(value):value))};
    if(name==="use_app_feature"){
      const action=validateRequestedAction(args.action,input,sites);
      queued.push(action);
      return {queued:action,label:actionLabel(action,sites),completed:false,evidence:[
        ...(action.type==="set_rocky"&&action.sizePercent!==undefined?[fact("Requested Rocky size",action.sizePercent,"%")]:[]),
        ...("durationDays"in action&&action.durationDays!==undefined?[fact("Chosen surface duration",action.durationDays,"days")]:[]),
      ]};
    }
    if(name==="compare_sites"){
      const ids=z.array(z.string()).min(2).max(4).parse(args.siteIds),iso=time(args.iso);
      if(new Set(ids).size!==ids.length)throw Error("Choose different sites to compare.");
      const duration=requestedDuration(input,ids[0],args.durationDays);
      const rows=[];
      // Keep the upstream work bounded; reuse the same scientific functions as the dashboard.
      for(const id of ids){
        const p=await prepare(id,iso,duration);
        const metrics=summarize(p.data,p.start,duration,p.mask,p.antenna);
        if(!metrics)throw Error("The full mission needs verified Sun and Earth data.");
        rows.push({id,label:p.selected.name,durationDays:duration,metrics,terrain:!!p.mask});
      }
      return {summary:fact("Site trade-off",comparisonTakeaway(rows)),duration:fact("Surface duration",duration,"days"),rows:rows.map(row=>({siteId:row.id,terrain:row.terrain,evidence:[fact("Site",row.label),fact("Sunlight during stay",(row.metrics.sunlitPct*duration*24/100).toFixed(2),"h"),fact("Earth above terrain during stay",(row.metrics.earthVisiblePct*duration*24/100).toFixed(2),"h"),fact("Usable direct Earth contact",(row.metrics.earthDtePct*duration*24/100).toFixed(2),"h"),fact("Longest darkness",row.metrics.longestDarkH.toFixed(2),"h")]})),note:rows.every(row=>row.terrain)?"Terrain included. Earth visibility differs from usable antenna contact.":"Some terrain horizons are unavailable. These rows cannot establish terrain-based viability."};
    }
    if(name==="find_landing_windows"){
      const id=z.string().parse(args.siteId),departure=time(args.earliestDeparture);
      const duration=requestedDuration(input,id,args.durationDays),span=z.number().int().min(1).max(60).parse(args.spanDays??30);
      const flight=z.enum(Object.keys(MISSION_PROFILES)).parse(args.flightProfile??DEFAULT_MISSION_PROFILE);
      const range=arrivalSearch(Date.parse(departure),span,flight);
      const p=await prepare(id,new Date(range.start).toISOString(),duration,span);
      if(!p.mask)throw Error("The terrain horizon is not ready. Landing-date screening will be available once the terrain loads.");
      const chosen=input.context?.scenarios?.find(row=>row.id===input.context.activeScenarioId&&row.siteId===id);
      const limits=chosen?.profile??{minSunlitPct:80,maxDarknessHours:12,minEarthDtePct:60};
      const result=landingWindows(p.data,range.start,range.end,duration,p.mask,p.antenna,limits);
      return {siteId:id,profile:limits,evidence:[fact("Surface duration",duration,"days"),fact("Arrival dates tested",result.tested),fact("Matching hourly arrivals",result.matching),fact("Search through",new Date(range.end).toISOString())],windows:result.windows.slice(0,4).map(window=>{
        const estimate=flightEstimate(window.best.time,flight);
        return {arrival:fact("Candidate arrival UTC",estimate.arrivalUtc),departure:fact("Estimated departure UTC",estimate.departureUtc),flight:fact("Historical flight estimate",estimate.flightHours,"h"),sunlight:fact("Sunlit stay",window.best.sunlitPct.toFixed(1),"%"),contact:fact("Direct Earth contact",window.best.earthDtePct.toFixed(1),"%"),darkness:fact("Longest darkness",window.best.longestDarkH.toFixed(1),"h")};
      }),nextAction:result.matching?null:{type:"plan_landing",siteId:id,durationDays:duration,mode:"next",profile:limits},note:"Historical flight timing plus surface-condition screening; not an optimized transfer trajectory. The native next-window search can continue beyond this checked range."};
    }
    throw Error("This tool is not available.");
  }};
}

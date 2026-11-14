import {test} from "node:test";
import assert from "node:assert/strict";
import {AppAction,actionLabel} from "../engine/app-actions.mjs";
import {comparisonTakeaway} from "../engine/comparison.mjs";
import {createAppToolRunner,requestedDuration,validateRequestedAction,explicitRockyResize,mergePlannedActions} from "../server/app-tools.mjs";
const sites=[{id:"apollo12",name:"Apollo 12",lat:-3.0128,lon:-23.4219}];

test("plain comparison explains the supplied one-hour sunlight/three-hour Earth trade-off",()=>{
  const text=comparisonTakeaway([
    {id:"A",durationDays:5/24,metrics:{sunlitPct:80,earthVisiblePct:40}},
    {id:"B",durationDays:5/24,metrics:{sunlitPct:60,earthVisiblePct:100}},
  ]);
  assert.match(text,/Plan A gives 1 h more sunlight than plan B/);
  assert.match(text,/Plan B gives 3 h more Earth visibility than plan A/);
});
test("comparison uses actual hours for unequal stays and waits for missing results",()=>{
  const rows=[{id:"A",durationDays:1,metrics:{sunlitPct:100,earthVisiblePct:100}},{id:"B",durationDays:2,metrics:{sunlitPct:75,earthVisiblePct:75}}];
  assert.match(comparisonTakeaway(rows),/Plan B gives 12 h more sunlight/);
  assert.match(comparisonTakeaway(rows),/different lengths of stay/);
  assert.match(comparisonTakeaway([rows[0],{id:"B",durationDays:2}]),/Calculating/);
});
test("feature actions validate ranges, known models and app views instead of arbitrary code",()=>{
  for(const action of [{type:"set_rocky",sizePercent:150},{type:"set_view",view:"solar_system"},{type:"set_camera",mode:"bearing",az:270,el:10},{type:"create_scenario",siteId:"apollo12",durationDays:2,flightProfile:"im-1"}])assert.doesNotThrow(()=>AppAction.parse(action));
  for(const action of [{type:"set_rocky",sizePercent:900},{type:"set_time",iso:"2060-01-01T00:00:00Z"},{type:"set_view",view:"execute_script"},{type:"fetch",url:"https://example.com"},{type:"create_scenario",siteId:"apollo12",durationDays:0}])assert.equal(AppAction.safeParse(action).success,false);
  assert.equal(actionLabel({type:"fly_to",siteId:"apollo12"},sites),"Visit Apollo 12");
});
test("mission tools require user-chosen duration and do not invent coordinates",()=>{
  assert.equal(requestedDuration({question:"Compare these places for two days."},"apollo12",2),2);
  assert.equal(requestedDuration({question:"Try a stay of 12 hours."},"apollo12",.5),.5);
  assert.equal(requestedDuration({question:"Launch in 2 days and stay for 7 days."},"apollo12",7),7);
  assert.throws(()=>requestedDuration({question:"Compare 2 days and 7 days"},"apollo12",2),/surface stay separately/);
  assert.throws(()=>requestedDuration({question:"Find a landing date"},"apollo12",7),/Choose how many/);
  assert.throws(()=>validateRequestedAction({type:"create_scenario",siteId:"apollo12",durationDays:7},{question:"Open the planner"},sites),/Choose how many/);
  assert.throws(()=>validateRequestedAction({type:"create_site",name:"Invented",lat:80,lon:90},{question:"Find a good site"},sites),/coordinates/);
  assert.throws(()=>validateRequestedAction({type:"fly_to",siteId:"invented"},{question:"Go there"},sites),/Unknown/);
});
test("explicit resizing cannot be confused with a science threshold or overwritten by model guesses",()=>{
  assert.deepEqual(explicitRockyResize("Open the Moon and resize Rocky to 150 percent"),{type:"set_rocky",sizePercent:150});
  assert.equal(explicitRockyResize("Rocky, find a landing with 80 percent sunlight"),null);
  const queued=[{type:"set_rocky",sizePercent:150}];
  assert.deepEqual(mergePlannedActions(queued,[{type:"set_rocky",sizePercent:"{{f1}}",animation:false},{type:"set_view",view:"surface"}]),[...queued,{type:"set_view",view:"surface"}]);
  assert.throws(()=>validateRequestedAction({type:"set_rocky",sizePercent:100},{question:"Resize Rocky to 150 percent"},sites),/size the user requested/);
});
test("queued app features remain requests rather than fabricated completion",async()=>{
  const queued=[],facts=[];
  const runner=createAppToolRunner({input:{question:"Make Rocky 150 percent"},sites,queued,fact:(label,value,unit="")=>{const f={id:"f"+(facts.length+1),label,value:String(value),unit};facts.push(f);return f;},loadTerrain:async()=>null,loadData:async()=>{throw Error("No data expected");}});
  const result=await runner.run("use_app_feature",{action:{type:"set_rocky",sizePercent:150}});
  assert.equal(result.completed,false);assert.equal(queued[0].sizePercent,150);assert.equal(result.evidence[0].value,"150");
});
test("landing screening refuses terrain-free viability results",async()=>{
  const requests=[];
  const runner=createAppToolRunner({input:{question:"Find a landing date for a 2 day stay",context:{mastM:2}},sites,queued:[],fact:()=>({}),loadTerrain:async()=>null,loadData:async request=>{requests.push(request);return {sun:[],earth:[]};}});
  await assert.rejects(()=>runner.run("find_landing_windows",{siteId:"apollo12",earliestDeparture:"2026-11-20T12:00:00Z",durationDays:2,spanDays:7}),/terrain horizon is not ready/);
  assert.equal(new Date(requests[0].iso).getUTCHours(),0);
  assert.equal(requests[0].days,33);
});

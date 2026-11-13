import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingWindows } from '../engine/landing.mjs';
import { HOUR, DAY, summarize } from '../engine/index.mjs';
const limits = {minSunlitPct:80, maxDarknessHours:12, minEarthDtePct:60};
function packet(hours=72) {
  const sun=[], earth=[];
  for(let i=0;i<=hours*6;i++) {
    const time=i*600000;
    sun.push([time,90,30*Math.cos(time/DAY*2*Math.PI),1920,149597870.7]);
    earth.push([time,270,20,6800,380000]);
  }
  return {sun,earth};
}
test('landing search matches independent mission summaries, including fractional duration and dark runs',()=>{
  const data=packet(), profile={minSunlitPct:0,maxDarknessHours:100,minEarthDtePct:0};
  for(const duration of [.1,.513,1.25]) {
    // Each single-hour query exposes its own metrics for comparison.
    for(let hour=0;hour<=24;hour++) {
      const {windows,tested}=landingWindows(data,hour*HOUR,hour*HOUR,duration,null,5,profile);
      assert.equal(tested,1);
      const expected=summarize(data,hour*HOUR,duration,null,5,0,[]);
      for(const key of ['sunlitPct','earthDtePct','longestDarkH'])
        assert.ok(Math.abs(windows[0].best[key]-expected[key])<1e-7,`${hour} ${duration} ${key}`);
    }
  }
});
test('groups only consecutive matching hours and enforces every threshold',()=>{
  const data=packet(), profile={...limits,minSunlitPct:100,maxDarknessHours:0,minEarthDtePct:100};
  const result=landingWindows(data,0,48*HOUR,.1,null,5,profile);
  assert.ok(result.windows.length>=2);
  assert.equal(result.matching,result.windows.reduce((n,w)=>n+w.count,0));
  for(const w of result.windows) {
    assert.equal(w.end-w.start,(w.count-1)*HOUR);
    assert.equal(w.first.time,w.start);
    const earliest=summarize(data,w.start,.1,null,5,0,[]);
    for(const key of ['sunlitPct','earthDtePct','longestDarkH'])
      assert.ok(Math.abs(w.first[key]-earliest[key])<1e-7);
    assert.ok(w.best.time>=w.start&&w.best.time<=w.end);
    assert.equal(w.best.longestDarkH,0);
    assert.equal(w.best.sunlitPct,100);
    assert.equal(w.best.earthDtePct,100);
  }
  const blocked=landingWindows(data,0,DAY,.1,new Array(720).fill(40),5,profile);
  assert.equal(blocked.matching,0);
  const antenna=landingWindows(data,0,DAY,.1,null,25,profile);
  assert.equal(antenna.matching,0);
});
test('missing coverage and invalid limits are errors, no extrapolated candidates',()=>{
  const data=packet();
  assert.throws(()=>landingWindows(data,-HOUR,DAY,1,null,5,limits),/coverage/);
  assert.throws(()=>landingWindows(data,0,3*DAY,1,null,5,limits),/coverage/);
  assert.throws(()=>landingWindows(data,0,DAY,1,null,5,{...limits,minSunlitPct:101}),/limits/);
  assert.throws(()=>landingWindows(data,0,DAY,1,null,5,{}),/limits/);
  assert.throws(()=>landingWindows(data,0,DAY,0,null,5,limits),/duration/);
  assert.equal(landingWindows(data,1,1000,.1,null,5,limits).tested,0);
});

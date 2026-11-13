import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { encodeSession } from '../src/share.mjs';
import { landingWindows } from '../engine/landing.mjs';
import { arrivalSearch, DEFAULT_MISSION_PROFILE, flightEstimate } from '../engine/mission-history.mjs';
import { HOUR, DAY } from '../engine/index.mjs';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}), errors=[];
page.on('pageerror',e=>{
  if (e.message !== 'Could not load /assets/rocky-web.glb: Failed to fetch') errors.push(e.message);
});
const state={scenarios:[],custom:[],mastM:2,minAntennaEl:5,time:Date.parse('2025-03-14T07:00Z'),selected:'apollo11',view:'globe',mode:'plain'};
const label=t=>new Date(t).toISOString().slice(0,16).replace('T',' ');
try {
  // Model fidelity/motion has a separate browser check. Keep this scientific
  // workflow independent of the full original mesh's software-rendering cost.
  await page.route('**/assets/rocky-web.glb',route=>route.abort());
  await page.goto('http://127.0.0.1:5175/?session='+encodeURIComponent(encodeSession(state)));
  await page.getByRole('button',{name:'Skip introduction'}).click();
  await page.getByRole('button',{name:'Plan landing',exact:true}).click();
  const duration=page.getByRole('spinbutton',{name:/Surface duration/});
  // Manual mission duration is available without expanding advanced settings.
  await expect(duration).toBeVisible();
  await duration.fill('3');
  await page.getByText('Timing and historical sources',{exact:true}).click();
  await page.getByLabel('Earliest departure',{exact:false}).fill('2025-03-12');
  await page.getByLabel('Arrival search span').selectOption('7');
  await page.getByRole('button',{name:'Find possible landing dates',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No dates meet these limits'})).toBeVisible({timeout:180000});
  const first=arrivalSearch(Date.parse('2025-03-12'),7,DEFAULT_MISSION_PROFILE);
  const nextStart=first.end+HOUR, nextEnd=nextStart+30*DAY-HOUR;
  const nextResponse=page.waitForResponse(r=>r.url().includes('/api/ephemeris?')&&r.url().includes('2025-03-26')&&r.status()===200,{timeout:180000});
  await page.getByRole('button',{name:'Find next window',exact:true}).click();
  const packet=await(await nextResponse).json();
  assert.ok(packet.sources.every(s=>s.name==='NASA/JPL Horizons'&&s.sha256.length===64));
  await expect(page.getByRole('heading',{name:'Next matching window found'})).toBeVisible({timeout:180000});
  const terrain=await(await page.request.get('http://127.0.0.1:5175/api/terrain/apollo11')).json();
  const result=landingWindows(packet,nextStart,nextEnd,3,terrain.masks['2'],5,{minSunlitPct:80,maxDarknessHours:12,minEarthDtePct:60});
  const window=result.windows[0];
  assert.ok(window.first.time>first.end);
  await expect(page.getByLabel('Recommend by')).toHaveValue('earliest');
  await expect(page.locator('.landing-candidate').first()).toContainText('Land '+label(window.first.time)+' UTC');
  await expect(page.locator('.landing-candidate').first()).toContainText('Estimated departure '+label(Date.parse(flightEstimate(window.first.time,DEFAULT_MISSION_PROFILE).departureUtc)));
  await page.getByLabel('Recommend by').selectOption('best');
  await expect(page.locator('.landing-candidate').first()).toContainText('Land '+label(window.best.time)+' UTC');
  await page.getByLabel('Recommend by').selectOption('earliest');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.landing-results').scrollIntoViewIfNeeded();
  await fs.mkdir('.impeccable/review/landing-next',{recursive:true});
  await page.screenshot({path:'.impeccable/review/landing-next/results-mobile.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Add to comparison',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lunar-scouter-v1')).state.scenarios[0]);
  assert.equal(Date.parse(saved.epoch),window.first.time);
  assert.equal(saved.durationDays,3);
  assert.equal(saved.flightProfile,DEFAULT_MISSION_PROFILE);
  assert.deepEqual(errors,[]);
  const report={testedUtc:new Date().toISOString(),realApi:true,rockyRenderingExcluded:true,emptyRange:first,continuedFrom:nextStart,nextWindow:window,saved,mobile:true,errors};
  await fs.writeFile('data/validation/landing-next-browser.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}

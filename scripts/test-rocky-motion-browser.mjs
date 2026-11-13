import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.bringToFront();
  await page.getByRole('button',{name:'Skip introduction'}).click();
  const rocky=page.locator('.rocky-character');
  await expect(page.locator('.rocky-speech-bubble')).toContainText('Left or Right Click Me for Features! I help you. Statement.',{timeout:120000});
  const position=await rocky.boundingBox();
  assert.ok(position.x>100&&position.x+position.width<1440-350,'starts outside right inspector');
  assert.ok(position.y>100&&position.y+position.height<900,'starts clear of bottom controls');
  await page.bringToFront();
  console.log('Original model ready; page visibility:',await page.evaluate(()=>document.visibilityState));
  await expect.poll(()=>rocky.getAttribute('data-animation'),{timeout:30000}).not.toBe('Attentive');
  // Clip selection alone does not prove the render loop advances. Compare
  // actual isolated WebGL pixels while reduced-motion suppresses map roaming.
  const canvas=rocky.locator('canvas');
  await expect(canvas).toBeVisible({timeout:120000});
  await page.waitForTimeout(600);
  const bounds=await canvas.boundingBox();
  const rendered=await page.screenshot({clip:bounds,animations:'allow',timeout:120000});
  await fs.mkdir('.impeccable/review/rocky-motion',{recursive:true});
  await fs.writeFile('.impeccable/review/rocky-motion/original-model.png',rendered);
  const first=hash(rendered);
  await page.waitForTimeout(450);
  const second=hash(await page.screenshot({clip:bounds,animations:'allow',timeout:120000}));
  assert.notEqual(first,second,'Rocky geometry keeps animating');
  // Rendering the full original mesh through a software GPU is expensive.
  // After checking actual moving pixels, test the controls independently.
  await canvas.evaluate(el=>el.getContext('webgl2').getExtension('WEBGL_lose_context')?.loseContext());
  await rocky.click();
  await page.bringToFront();
  await expect(page.getByRole('textbox',{name:'Question for Rocky'})).toBeVisible();
  const chatClip=await rocky.getAttribute('data-animation');
  await expect.poll(()=>rocky.getAttribute('data-animation'),{timeout:30000}).not.toBe(chatClip);
  await page.getByRole('button',{name:'Close Rocky'}).click();
  await rocky.click({button:'right'});
  await page.bringToFront();
  await expect(page.getByRole('menu',{name:'Rocky options'})).toBeVisible();
  const menuClip=await rocky.getAttribute('data-animation');
  await expect.poll(()=>rocky.getAttribute('data-animation'),{timeout:30000}).not.toBe(menuClip);
  await page.getByRole('menuitem',{name:'Move to corner',exact:true}).click();
  const corner=await rocky.boundingBox();
  assert.ok(Math.abs(corner.x+corner.width-1440)<1&&Math.abs(corner.y+corner.height-1000)<1);
  await rocky.click({button:'right'});
  await page.getByRole('menuitem',{name:'Reset position',exact:true}).click();
  const reset=await rocky.boundingBox();
  assert.equal(reset.x,position.x);assert.equal(reset.y,position.y);
  await page.setViewportSize({width:390,height:844});
  const mobile=await rocky.boundingBox();
  assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y>80&&mobile.y+mobile.height<422);
  await fs.mkdir('.impeccable/review/rocky-motion',{recursive:true});
  assert.deepEqual(errors,[]);
  const report={testedUtc:new Date().toISOString(),originalModel:true,greeting:true,continuousWebGLMotion:first!==second,renderingSuspendedDuringControlChecks:true,randomDuringChat:true,randomDuringMenu:true,position,reset,mobile,errors};
  await fs.writeFile('data/validation/rocky-motion-browser.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}

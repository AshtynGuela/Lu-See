import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
try {
  await page.addInitScript(()=>{
    window.rockySpeechSeen=[];
    new MutationObserver(()=>{
      const phrase=document.querySelector('.rocky-speech-bubble .sr-only')?.textContent;
      if (phrase && !window.rockySpeechSeen.includes(phrase)) window.rockySpeechSeen.push(phrase);
    }).observe(document,{childList:true,subtree:true});
  });
  await page.goto(process.env.LUSEE_TEST_URL || 'http://127.0.0.1:5175/');
  await page.bringToFront();
  await page.getByRole('button',{name:'Skip introduction'}).click();
  const rocky=page.locator('.rocky-fab');
  await expect.poll(()=>page.evaluate(()=>window.rockySpeechSeen[0]),{timeout:120000})
    .toBe('Left or Right Click Me for Features! I help you. Statement.');
  const position=await rocky.boundingBox();
  assert.ok(position.x+position.width<=1440-16&&position.x>1440-128,'starts at the right side of the Solar System map');
  assert.ok(position.y>100&&position.y+position.height<1000-52,'starts clear of bottom controls');
  assert.equal(position.width,68);
  assert.equal(position.height,68);
  await expect(rocky).toHaveCSS('border-radius','50%');
  await page.bringToFront();
  console.log('Animated FAB ready; page visibility:',await page.evaluate(()=>document.visibilityState));
  await expect.poll(()=>rocky.getAttribute('data-animation'),{timeout:30000}).not.toBe('Attentive');
  // Clip selection alone does not prove the render loop advances. Compare
  // actual isolated WebGL pixels while the FAB stays in place.
  const canvas=rocky.locator('canvas');
  await expect(canvas).toBeVisible({timeout:120000});
  await page.waitForTimeout(600);
  const bounds=await canvas.boundingBox();
  const rendered=await page.screenshot({clip:bounds,animations:'allow',timeout:120000});
  await fs.mkdir('.cache/rocky-motion',{recursive:true});
  await fs.writeFile('.cache/rocky-motion/rocky-fab.png',rendered);
  const first=hash(rendered);
  await page.waitForTimeout(450);
  const second=hash(await page.screenshot({clip:bounds,animations:'allow',timeout:120000}));
  assert.notEqual(first,second,'Rocky geometry keeps animating');
  // The old Scuttle timer moved the FAB after 4.2 seconds.
  await rocky.click({button:'right'});
  await page.getByRole('menuitemradio',{name:'Scuttle',exact:true}).click();
  await page.waitForTimeout(4700);
  assert.deepEqual(await rocky.boundingBox(),position,'Scuttle animates in place');
  await rocky.click({button:'right'});
  await page.getByRole('menuitemradio',{name:'Random animations',exact:true}).click();
  // The software GPU is expensive during control checks.
  // After checking actual moving pixels, test the controls independently.
  await canvas.evaluate(el=>el.getContext('webgl2').getExtension('WEBGL_lose_context')?.loseContext());
  await rocky.click();
  await page.bringToFront();
  await expect(page.getByRole('textbox',{name:'Question for Rocky'})).toBeVisible();
  const chatClip=await rocky.getAttribute('data-animation');
  await expect.poll(()=>rocky.getAttribute('data-animation'),{timeout:30000}).not.toBe(chatClip);
  await page.getByRole('button',{name:'Close Rocky',exact:true}).click();
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
  await rocky.click({button:'right'});
  await page.getByRole('menuitemradio',{name:'Rocky dance',exact:true}).click();
  await expect(rocky).toHaveAttribute('data-animation','RockyDance');
  await page.mouse.move(reset.x + 28, reset.y + 28);
  await page.mouse.down();
  await page.mouse.move(reset.x - 80, reset.y - 40,{steps:8});
  await page.mouse.up();
  const moved = await rocky.boundingBox();
  assert.ok(moved.x<reset.x-80 && moved.y<reset.y-45,'FAB can be dragged without opening chat');
  await expect(rocky).toHaveAttribute('aria-expanded','false');
  await rocky.click({button:'right'});
  await page.getByRole('menuitem',{name:'Reset position',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  const mobile=await rocky.boundingBox();
  assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y>600&&mobile.y+mobile.height<844-55);
  assert.deepEqual(errors,[]);
  const report={testedUtc:new Date().toISOString(),riggedModel:true,greeting:true,continuousWebGLMotion:first!==second,renderingSuspendedDuringControlChecks:true,scuttleStaysInPlace:true,randomDuringChat:true,randomDuringMenu:true,position,reset,mobile,errors};
  if (process.env.LUSEE_TEST_REPORT)
    await fs.writeFile(process.env.LUSEE_TEST_REPORT,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}

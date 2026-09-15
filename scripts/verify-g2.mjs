// Real production shaders and final default-framebuffer pixels. No test hooks
// ship in the app. SwiftShader proves correctness, not phone GPU performance.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist'), out = path.resolve('home-browser-results/g2');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const ready = page => page.locator('.home-galaxy[data-renderer="webgl2"]').waitFor({ timeout: 30000 });
const mean = v => v.reduce((a,b) => a+b, 0) / v.length;
const difference = (a,b) => a.map((v,i) => mean(v.map((x,c) => Math.abs(x-b[i][c]))));
function instrument() {
  localStorage.setItem('media_gateway_locale','zh');
  let now=1000,key=0; const callbacks=new Map();
  window.requestAnimationFrame=f=>{callbacks.set(++key,f);return key;};
  window.cancelAnimationFrame=i=>callbacks.delete(i);
  window.__advance=d=>{now+=d;for(const [i,f] of [...callbacks])if(callbacks.delete(i))f(now);};
  window.__draws=0; window.__capture=true;
  const original=WebGL2RenderingContext.prototype.drawArrays;
  WebGL2RenderingContext.prototype.drawArrays=function(...args){
    original.apply(this,args);
    if(this.getParameter(this.FRAMEBUFFER_BINDING)!==null)return;
    window.__draws++;
    if(!window.__capture)return;
    window.__capture=false;
    const w=this.drawingBufferWidth,h=this.drawingBufferHeight,buf=new Uint8Array(w*h*4);
    this.readPixels(0,0,w,h,this.RGBA,this.UNSIGNED_BYTE,buf);
    window.__glError=this.getError();
    const blocks=[];let over=0,colored=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,c=[buf[i],buf[i+1],buf[i+2]],peak=Math.max(...c);
      if(Math.min(...c)>248)over++;
      if(peak>60&&peak-Math.min(...c)>35)colored++;
    }
    for(let by=0;by<18;by++)for(let bx=0;bx<32;bx++){
      const sum=[0,0,0];let n=0;
      for(let y=Math.floor(by*h/18);y<Math.floor((by+1)*h/18);y++)
        for(let x=Math.floor(bx*w/32);x<Math.floor((bx+1)*w/32);x++){
          for(let c=0;c<3;c++)sum[c]+=buf[(y*w+x)*4+c];n++;
        }
      blocks.push(sum.map(v=>v/n));
    }
    window.__blocks=blocks;window.__imageStats={over:over/(w*h),colored:colored/(w*h)};
  };
}
async function advance(page,delta,capture=false){
  const n=await page.evaluate(()=>window.__draws);
  await page.evaluate(({delta,capture})=>{window.__capture=capture;window.__advance(delta);},{delta,capture});
  const deadline=Date.now()+30000;
  while(await page.evaluate(()=>window.__draws)===n){
    assert.ok(Date.now()<deadline,'GPU completes frame');await page.waitForTimeout(10);await page.evaluate(()=>window.__advance(0));
  }
}
async function layout(page){
  const m=await page.evaluate(()=>({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight,n:document.querySelectorAll('.home-galaxy').length}));
  assert.ok(m.x<=1&&m.y<=1,JSON.stringify(m));assert.equal(m.n,1);
  assert.ok(await page.locator('.home-create').isVisible());
  assert.equal(await page.locator('.home-footer-copy p').count(),0);
}
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:800},locale:'zh-CN',reducedMotion:'no-preference'});
  await context.addInitScript(instrument);
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(!url.startsWith(origin)||new URL(url).pathname.startsWith('/v1/')){external.push(url);return route.abort();}
    return route.continue();
  });
  const reports=[],families=['cliffs','halo','pillars','veil'],seeds=['g2-0000002a','g2-5eeda11e','g2-f00dcafe'];
  for(const family of families){
    const starts=[];
    for(const seed of seeds){
      const url=`${origin}/?sky=${family}&seed=${seed}`;
      await page.goto(url);await ready(page);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1300);
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-engine'),'g2');
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-color-mode'),'hdr16f');
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'),seed);
      await layout(page);
      const start=await page.evaluate(()=>window.__blocks),stats=await page.evaluate(()=>window.__imageStats);
      assert.equal(await page.evaluate(()=>window.__glError),0);assert.equal(start.length,576);assert.ok(mean(start.flat())>5);
      assert.ok(stats.over<.02,'No broad clipped white region');assert.ok(stats.colored>.04,'Contains colored structure');
      starts.push(start);await page.screenshot({path:path.join(out,`${family}-${seed}.png`)});
      if(seed!==seeds[0])continue;
      await advance(page,0);
      // 25 Hz clock avoids falsely counting adaptive resolution as motion.
      for(let i=1;i<=100;i++)await advance(page,40,i===100);
      const diffs=difference(start,await page.evaluate(()=>window.__blocks)),motion=mean(diffs),area=diffs.filter(v=>v>5).length/576;
      assert.ok(motion>2.5&&area>.12,`${family} wide-area motion: ${motion},${area}`);
      reports.push({family,seed,motion,area,...stats});
      await page.screenshot({path:path.join(out,`${family}-4s.png`)});
      await page.locator('.home-motion').click();
      const stopped=await page.evaluate(()=>{window.__canvas=document.querySelector('.home-galaxy');return window.__draws;});
      await page.evaluate(()=>window.__advance(500));assert.equal(await page.evaluate(()=>window.__draws),stopped);
      await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.language-toggle').click();
      assert.ok(await page.evaluate(()=>window.__canvas===document.querySelector('.home-galaxy')));
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'),seed);
      await page.evaluate(()=>{window.__lost=document.querySelector('.home-galaxy').getContext('webgl2').getExtension('WEBGL_lose_context');window.__lost.loseContext();});
      await page.locator('.home-galaxy[data-renderer="fallback"]').waitFor();await page.waitForTimeout(150);
      await page.evaluate(()=>window.__lost.restoreContext());await ready(page);
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'),seed);
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.goto(url);await ready(page);
      assert.ok(mean(difference(start,await page.evaluate(()=>window.__blocks)))<.01,'Same seed reproduces initial GPU image');
    }
    for(let i=0;i<starts.length;i++)for(let j=i+1;j<starts.length;j++)assert.ok(mean(difference(starts[i],starts[j]))>2,'Seeds change rendered composition/color');
    const mobile=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'reduce'}),phone=await mobile.newPage();
    await phone.goto(`${origin}/?sky=${family}&seed=${seeds[1]}`);await ready(phone);await phone.evaluate(()=>document.fonts.ready);await layout(phone);
    await phone.screenshot({path:path.join(out,`${family}-mobile.png`)});await mobile.close();
    console.log('PASS G2 family',family,reports.at(-1));
  }
  // Default entry selects G2, and storage is optional, not a prerequisite.
  await page.goto(origin);await ready(page);const token=await page.locator('.home-galaxy').getAttribute('data-seed');assert.match(token,/^g2-[0-9a-f]{8}$/);
  await page.reload();await ready(page);assert.notEqual(await page.locator('.home-galaxy').getAttribute('data-seed'),token);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
  for(const kind of ['no-float','allocation-failure','no-webgl','blocked-storage']){
    const fallback=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await fallback.addInitScript(kind=>{
      if(kind==='blocked-storage'){Object.defineProperty(window,'sessionStorage',{get(){throw new Error('Blocked');}});return;}
      if(kind==='no-webgl'){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};return;}
      if(kind==='no-float'){const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:get.call(this,name);};return;}
      const image=WebGL2RenderingContext.prototype.texImage2D,check=WebGL2RenderingContext.prototype.checkFramebufferStatus;
      WebGL2RenderingContext.prototype.texImage2D=function(...args){if(args[2]===this.RGBA16F)this.__failFloat=true;return image.apply(this,args);};
      WebGL2RenderingContext.prototype.checkFramebufferStatus=function(...args){if(this.__failFloat){this.__failFloat=false;return this.FRAMEBUFFER_UNSUPPORTED;}return check.apply(this,args);};
    },kind);
    const p=await fallback.newPage();await p.goto(`${origin}/?seed=g2-0000002a`);
    if(kind==='no-webgl')await p.locator('.home-galaxy[data-renderer="fallback"]').waitFor();
    else {await ready(p);if(kind!=='blocked-storage')assert.equal(await p.locator('.home-galaxy').getAttribute('data-color-mode'),'ldr8');}
    await layout(p);await p.screenshot({path:path.join(out,`${kind}.png`)});await fallback.close();
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify({reports,desktop:12,mobile:4,fallbacks:4,note:'Deterministic clock and SwiftShader. Parameter/image checks are not a universal aesthetic guarantee or hardware FPS benchmark.'},null,2));
  console.log('PASS G2 HDR composition, replay, motion, lifecycle, 16 layouts and capability fallbacks');
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}

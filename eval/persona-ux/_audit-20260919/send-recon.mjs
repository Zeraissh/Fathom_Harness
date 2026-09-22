import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("agent.ui.pref.onboardingDone","1"); } catch {} });
await page.goto("http://127.0.0.1:4173/#/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

const info = await page.evaluate(`(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const form = document.getElementById('submit-form');
  const dump = (root) => [...root.querySelectorAll('textarea,input[type=text],button,select,[contenteditable=true]')]
    .filter(vis).map(e => { const r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase(), id: e.id, cls: (e.className||'').toString().slice(0,44),
        ph: e.placeholder, type: e.type, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
        disabled: e.disabled === true, aria: e.getAttribute('aria-label'), title: e.getAttribute('title') }; });
  const wd = document.getElementById('workdir-trigger');
  return { formFound: !!form, formBox: form ? (() => { const r = form.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)}; })() : null,
    controls: form ? dump(form) : dump(document),
    workdir: wd ? { text: (document.getElementById('workdir-trigger-text')?.textContent||'').trim(), disabled: wd.disabled === true, title: wd.getAttribute('title') } : null,
    modelFace: (document.querySelector('.model-face,.composer-model,[data-model]')?.textContent||'').trim().slice(0,60) };
})()`);
console.log(JSON.stringify(info, null, 1));
await browser.close();

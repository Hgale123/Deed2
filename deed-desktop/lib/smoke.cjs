const assert = require('node:assert/strict');
async function smokeTest(win, origin) {
  const initial = await win.webContents.executeJavaScript(`JSON.stringify({ bridge: window.deedDesktop?.isDesktop, nodeExposed: typeof window.require !== 'undefined', text: document.body.innerText })`);
  const first = JSON.parse(initial);
  assert.equal(first.bridge, true); assert.equal(first.nodeExposed, false);
  await win.webContents.executeJavaScript(`fetch('/api/auth/demo', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'manager'})}).then(r=>{if(!r.ok)throw Error('sign-in failed')})`);
  await win.webContents.reload();
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  let text = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    text = await win.webContents.executeJavaScript('document.body.innerText');
    if (text.includes('A clearer path to completion.')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(text, /A clearer path to completion\./);
  const status = await win.webContents.executeJavaScript('window.deedDesktop.assistantStatus()');
  assert.equal(status.ok, true);
  const missing = await win.webContents.executeJavaScript(`window.deedDesktop.ask({transactionId:'not-assigned',question:'Summarise'})`);
  assert.equal(missing.ok, false); assert.equal(missing.status, 404);
  const web = await fetch(`${origin}/api/assistant/status`);
  assert.equal(web.status, 401);
  let runtime;
  for (let attempt = 0; attempt < 80; attempt++) {
    runtime = await win.webContents.executeJavaScript('window.deedDesktop.modelSetup()');
    if (runtime.ok && runtime.data.running) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(runtime.ok, true); assert.equal(runtime.data.model, 'qwen3:4b'); assert.equal(runtime.data.running, true, runtime.data.message);
  await win.webContents.executeJavaScript(`document.querySelector('.property-button').click()`);
  await new Promise(resolve => setTimeout(resolve, 150));
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ask Deed').click()`);
  await new Promise(resolve => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage();
  require('node:fs').writeFileSync('/private/tmp/deed-desktop-preview.png', image.toPNG());
}
module.exports = { smokeTest };

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHandlers } = require('./lib/bridge.cjs');
const { createRuntime } = require('./lib/runtime.cjs');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'deed-desktop-smoke-')));
let win, server, runtime, origin;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(start).catch(err => { console.error(err); if (!smoke) dialog.showErrorBox('Deed could not start', 'Please reinstall Deed or check that its local files are available.'); app.exit(1); });
}
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function start() {
  const apiRoot = app.isPackaged ? path.join(process.resourcesPath, 'api') : path.resolve(__dirname, '../deed-back-end2');
  const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../Deed2/build');
  const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'ollama') : path.join(__dirname, 'vendor/ollama');
  const { createApp } = require(path.join(apiRoot, 'server.js'));
  const { createStore } = require(path.join(apiRoot, 'store.js'));
  const { createLocalAssistant } = require(path.join(apiRoot, 'local-assistant.js'));
  const express = require(path.join(apiRoot, 'node_modules/express'));
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) throw new Error('Build the React interface first.');
  const directory = app.getPath('userData');
  runtime = createRuntime({ binary: path.join(runtimeRoot, process.platform === 'win32' ? 'ollama.exe' : process.platform === 'darwin' ? 'ollama' : 'bin/ollama'), directory, port: await freePort() });
  const assistant = createLocalAssistant({ model: runtime.model, host: runtime.host });
  const local = express();
  local.use((_req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  local.use(createApp({ store: createStore(path.join(directory, 'workspace.json')), demoEnabled: !app.isPackaged || smoke, frontendOrigin: () => origin, secureCookies: false }));
  local.use(express.static(webRoot));
  local.get('*', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));
  server = local.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  origin = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 760, minHeight: 620, show: false, title: 'Deed', backgroundColor: '#f3f5f0', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, partition: 'persist:deed-desktop' }
  });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { allowed = new URL(details.url).origin === origin; } catch { /* Reject malformed requests. */ }
    callback({ cancel: !allowed });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  function validateSender(event) {
    if (event.sender !== win.webContents || !event.senderFrame || event.senderFrame !== win.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw Object.assign(new Error('Desktop access denied.'), { status: 403 });
  }
  async function workspace() {
    const cookies = await win.webContents.session.cookies.get({ url: origin, name: 'deed_session' });
    const response = await fetch(`${origin}/api/workspace`, { headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Object.assign(new Error('Please sign in to use the desktop assistant.'), { status: response.status });
    return response.json();
  }
  const handlers = createHandlers({ validateSender, workspace, assistant, runtime });
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  win.once('ready-to-show', () => { if (!smoke) win.show(); });
  await win.loadURL(origin);
  void runtime.start();
  if (smoke) {
    const { smokeTest } = require('./lib/smoke.cjs');
    try { await smokeTest(win, origin); console.log('DESKTOP_SMOKE_OK'); runtime.stop(); server.close(); app.exit(0); }
    catch (err) { console.error('DESKTOP_SMOKE_FAILED', err); runtime.stop(); server.close(); app.exit(1); }
  }
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { runtime?.stop(); server?.close(); });

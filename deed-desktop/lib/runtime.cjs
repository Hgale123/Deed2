const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const MODEL = 'qwen3:4b';
function createRuntime({ binary, directory, port, fetchImpl = fetch, spawnImpl = spawn }) {
  const host = `http://127.0.0.1:${port}`;
  let child = null, controller = null, stopping = false;
  let state = { running: false, downloading: false, model: MODEL, progress: 0, message: 'Starting the local runtime…' };
  async function start() {
    if (!fs.existsSync(binary)) { state.message = 'The bundled runtime is missing. Rebuild Deed with its local runtime included.'; return; }
    fs.mkdirSync(path.join(directory, 'models'), { recursive: true });
    child = spawnImpl(binary, ['serve'], { cwd: directory, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_NO_CLOUD: '1', OLLAMA_MODELS: path.join(directory, 'models'), OLLAMA_CONTEXT_LENGTH: '8192', OLLAMA_KEEP_ALIVE: '5m' }
    });
    child.on('error', () => { state.running = false; state.message = 'The local runtime could not start. Reopen Deed or reinstall the app.'; });
    child.on('exit', () => { state.running = false; if (!stopping) state.message = 'The local runtime stopped. Reopen Deed to restart it.'; });
    for (let attempt = 0; attempt < 80 && !stopping; attempt++) {
      try {
        const response = await fetchImpl(`${host}/api/tags`, { redirect: 'error', signal: AbortSignal.timeout(1000) });
        if (response.ok) { state.running = true; state.message = 'Local runtime ready.'; return; }
      } catch { /* Startup readiness is retried only against this owned loopback runtime. */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!stopping) state.message = 'The local runtime did not become ready. Reopen Deed to try again.';
  }
  async function pull() {
    try {
      const response = await fetchImpl(`${host}/api/pull`, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, stream: true }) });
      if (!response.ok || !response.body) throw new Error('download');
      let buffer = '', successful = false;
      for await (const chunk of response.body) {
        buffer += Buffer.from(chunk).toString('utf8');
        if (buffer.length > 100000) throw new Error('invalid progress');
        let split;
        while ((split = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, split); buffer = buffer.slice(split + 1);
          if (!line.trim()) continue;
          const progress = JSON.parse(line);
          if (progress.error) throw new Error('download');
          if (progress.total > 0) state.progress = Math.min(99, Math.round((progress.completed || 0) / progress.total * 100));
          if (progress.status === 'success') successful = true;
          state.message = progress.status === 'success' ? 'Model installed. Ready for offline use.' : 'Downloading and verifying the local model…';
        }
      }
      if (buffer.trim()) { const final = JSON.parse(buffer); if (final.error) throw new Error('download'); successful = successful || final.status === 'success'; }
      if (!successful) throw new Error('incomplete download');
      state.progress = 100; state.message = 'Model installed. Ready for offline use.';
    } catch (err) {
      state.message = controller?.signal.aborted ? 'Download cancelled. You can resume it later.' : 'Download failed. Check your connection and available disk space, then retry.';
    } finally { state.downloading = false; controller = null; }
  }
  return {
    host, model: MODEL, start,
    state: () => ({ ...state }),
    download() {
      if (!state.running) throw Object.assign(new Error(state.message), { status: 503 });
      if (!state.downloading) { controller = new AbortController(); state.downloading = true; state.progress = 0; state.message = 'Starting model download…'; void pull(); }
      return { ...state };
    },
    cancel() { controller?.abort(); return { ...state }; },
    stop() { stopping = true; controller?.abort(); child?.kill(); }
  };
}
module.exports = { createRuntime, MODEL };

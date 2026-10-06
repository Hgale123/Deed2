const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createRuntime } = require('../lib/runtime.cjs');
test('owned runtime disables cloud, isolates model storage and shuts down its own process', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deed-runtime-test-'));
  const binary = path.join(directory, 'ollama'); fs.writeFileSync(binary, 'test');
  let launch, killed = false;
  const child = new EventEmitter(); child.kill = () => { killed = true; };
  const runtime = createRuntime({ binary, directory, port: 12345, spawnImpl: (...args) => { launch = args; return child; }, fetchImpl: async () => ({ ok: true }) });
  try {
    await runtime.start();
    assert.deepEqual(launch[1], ['serve']);
    assert.equal(launch[2].env.OLLAMA_NO_CLOUD, '1');
    assert.equal(launch[2].env.OLLAMA_HOST, '127.0.0.1:12345');
    assert.equal(launch[2].env.OLLAMA_MODELS, path.join(directory, 'models'));
    assert.equal(runtime.state().running, true);
    runtime.stop(); assert.equal(killed, true);
  } finally { fs.rmSync(directory, { recursive: true }); }
});
test('model download is explicit and reports actual streamed progress', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deed-runtime-test-'));
  const binary = path.join(directory, 'ollama'); fs.writeFileSync(binary, 'test');
  const calls = [];
  const child = new EventEmitter(); child.kill = () => {};
  const runtime = createRuntime({ binary, directory, port: 12345, spawnImpl: () => child, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return options?.method === 'POST' ? { ok: true, body: (async function* () { yield Buffer.from('{"status":"pulling","total":100,"completed":50}\n{"status":"success"}\n'); })() } : { ok: true };
  } });
  try {
    await runtime.start(); assert.equal(calls.length, 1);
    assert.equal(runtime.download().downloading, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.state().progress, 100); assert.equal(runtime.state().downloading, false);
    assert.equal(JSON.parse(calls[1].options.body).model, 'qwen3:4b');
    assert.equal(calls[1].options.redirect, 'error');
    runtime.stop();
  } finally { fs.rmSync(directory, { recursive: true }); }
});

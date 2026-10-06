const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createRuntime } = require('../lib/runtime.cjs');
const { createLocalAssistant } = require('../../deed-back-end2/local-assistant');
async function main() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const root = path.resolve(__dirname, '../vendor');
  const directory = path.join(root, 'model-test'); fs.mkdirSync(directory, { recursive: true });
  const runtime = createRuntime({ binary: path.join(root, 'ollama', process.platform === 'darwin' ? 'ollama' : process.platform === 'win32' ? 'ollama.exe' : 'bin/ollama'), directory, port });
  try {
    await runtime.start();
    if (!runtime.state().running) throw new Error(runtime.state().message);
    const assistant = createLocalAssistant({ model: runtime.model, host: runtime.host, fetchImpl: (url, options) => {
      if (new URL(url).origin !== runtime.host) throw new Error('Non-local inference request blocked.');
      return fetch(url, options);
    } });
    if (!(await assistant.status()).ready) {
      if (!process.argv.includes('--download')) throw new Error('Model is missing. Re-run with --download to explicitly download it for this test.');
      runtime.download();
      let ticks = 0;
      while (runtime.state().downloading) {
        if (ticks++ % 10 === 0) console.log(`Model download: ${runtime.state().progress}% of current layer`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!(await assistant.status()).ready) throw new Error(runtime.state().message);
    }
    const deal = { address: '24 Columbia Road', postcode: 'E2 7NN', createdAt: new Date().toISOString(), participants: [{ userId: 'demo', name: 'Sarah Patel', role: 'solicitor' }], evidence: [], messages: [{ id: 'record-1', name: 'Sarah Patel', role: 'solicitor', at: new Date().toISOString(), text: 'Searches were ordered on Monday. Results have not arrived yet. I will confirm when they do.' }] };
    const answer = await assistant.ask({ deal, user: { name: 'Jamie Wilson', role: 'agent' }, question: 'Have the search results arrived? Give a short answer based on the message, cite its source ID, and draft a polite request for an update.' });
    assert.ok(answer.answer.trim()); assert.ok(answer.draftMessage.trim());
    assert.ok(answer.sources.some(s => s.id === 'record-1'), 'The model should cite the supplied message.');
    fs.writeFileSync(path.join(directory, 'inference-result.json'), JSON.stringify(answer, null, 2));
    console.log('LOCAL_MODEL_CHECK_OK', JSON.stringify({ model: answer.model, answer: answer.answer, citedSources: answer.sources.length }));
  } finally { runtime.stop(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });

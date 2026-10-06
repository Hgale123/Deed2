const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../lib/bridge.cjs');
function fixture(overrides = {}) {
  const calls = [];
  const handlers = createHandlers({
    validateSender: event => { if (event !== 'trusted') throw Object.assign(new Error('Desktop access denied.'), { status: 403 }); },
    workspace: async () => ({ user: { id: 'u1', role: 'buyer' }, transactions: [{ id: 't1' }] }),
    assistant: { status: async () => ({ ready: true }), ask: async input => { calls.push(input); return { answer: 'Evidence checked.' }; } },
    runtime: { state: () => ({ running: true }), download: () => { calls.push('download'); return {}; }, cancel: () => ({}) },
    ...overrides
  });
  return { calls, handlers };
}
test('untrusted windows cannot invoke native AI or download operations', async () => {
  const { handlers, calls } = fixture();
  for (const handler of Object.values(handlers)) assert.equal((await handler('untrusted', {})).status, 403);
  assert.deepEqual(calls, []);
});
test('sign-in is required for all native operations', async () => {
  const { handlers, calls } = fixture({ workspace: async () => { throw Object.assign(new Error('Sign in'), { status: 401 }); } });
  for (const handler of Object.values(handlers)) assert.equal((await handler('trusted', {})).status, 401);
  assert.deepEqual(calls, []);
});
test('native assistant resolves the transaction and user from the authenticated workspace', async () => {
  const { handlers, calls } = fixture();
  assert.equal((await handlers['deed:ask']('trusted', { transactionId: 'other', question: 'Summarise' })).status, 404);
  assert.deepEqual(calls, []);
  const result = await handlers['deed:ask']('trusted', { transactionId: 't1', question: 'Summarise', user: { role: 'manager' }, deal: { id: 'other' } });
  assert.equal(result.ok, true); assert.equal(calls[0].user.role, 'buyer'); assert.equal(calls[0].deal.id, 't1');
});
test('changing account or transaction permissions during inference prevents disclosure', async () => {
  let reads = 0;
  const { handlers } = fixture({ workspace: async () => ++reads === 1 ? { user: { id: 'u1' }, transactions: [{ id: 't1' }] } : { user: { id: 'u2' }, transactions: [{ id: 't1' }] } });
  assert.equal((await handlers['deed:ask']('trusted', { transactionId: 't1', question: 'Summarise' })).status, 403);
});
test('a stopped runtime does not attempt inference status', async () => {
  const { handlers } = fixture({ runtime: { state: () => ({ running: false, message: 'Starting' }) }, assistant: { status: () => { throw new Error('should not run'); } } });
  const result = await handlers['deed:assistant-status']('trusted');
  assert.equal(result.ok, true); assert.equal(result.data.ready, false);
});

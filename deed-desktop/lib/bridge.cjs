function createHandlers({ validateSender, workspace, assistant, runtime }) {
  const guarded = fn => async (event, value) => {
    try {
      validateSender(event);
      const data = await workspace();
      return { ok: true, data: await fn(data, value) };
    } catch (err) { return { ok: false, error: err.status ? err.message : 'Desktop service unavailable. Please reopen Deed.', status: err.status || 503 }; }
  };
  return {
    'deed:assistant-status': guarded(async () => {
      const state = runtime.state();
      if (!state.running) return { ready: false, mode: 'local-only', message: state.message || 'The local runtime is starting.' };
      return assistant.status();
    }),
    'deed:model-setup': guarded(async () => runtime.state()),
    'deed:download-model': guarded(async () => runtime.download()),
    'deed:cancel-download': guarded(async () => runtime.cancel()),
    'deed:ask': guarded(async (data, request) => {
      if (!request || typeof request.transactionId !== 'string' || request.transactionId.length > 200) throw Object.assign(new Error('Choose a valid transaction.'), { status: 400 });
      const deal = data.transactions.find(t => t.id === request.transactionId);
      if (!deal) throw Object.assign(new Error('Transaction not found.'), { status: 404 });
      const result = await assistant.ask({ deal, user: data.user, question: request.question, history: request.history });
      const latest = await workspace();
      if (latest.user.id !== data.user.id || !latest.transactions.some(t => t.id === deal.id)) throw Object.assign(new Error('Transaction access changed. Please reopen the transaction.'), { status: 403 });
      return result;
    })
  };
}
module.exports = { createHandlers };

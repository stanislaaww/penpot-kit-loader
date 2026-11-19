// Kit Loader: выполняет код сборки UI-кита, который приходит из вкладки Penpot (postMessage).
// Права: только те, что вы подтвердите в Penpot при установке. Работает, пока панель плагина открыта.
penpot.ui.open('Kit Loader', 'ui.html', { width: 260, height: 110 });

penpot.ui.onMessage(async (m) => {
  if (!m || m.type !== 'kit-run' || typeof m.code !== 'string') return;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('penpot', 'console', m.code);
    await fn(penpot, console);
    penpot.ui.sendMessage({ type: 'done', id: m.id });
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.error('[KIT] ' + msg);
    penpot.ui.sendMessage({ type: 'err', id: m.id, msg });
  }
});

// Coalesce live updates without doing DOM work while hidden, asleep or editing.
// Data continues to synchronize; resuming renders the latest state only once.
export function createRenderQueue({ canRender, render, isPaused = () => false, onPendingChange = () => {},
  schedule = (callback) => requestAnimationFrame(callback), cancel = (id) => cancelAnimationFrame(id) }) {
  let scheduled = null;
  let pending = false;
  let destroyed = false;
  function clear() {
    if (scheduled !== null) cancel(scheduled);
    scheduled = null;
    pending = false;
    onPendingChange(false);
  }
  function request() {
    if (destroyed) return;
    pending = true;
    onPendingChange(true);
    if (scheduled !== null || isPaused()) return;
    scheduled = schedule(() => {
      scheduled = null;
      if (destroyed || isPaused() || !canRender()) return;
      pending = false;
      onPendingChange(false);
      render();
    });
  }
  return { request, clear, flush: () => { if (pending) request(); },
    destroy: () => { destroyed = true; clear(); } };
}

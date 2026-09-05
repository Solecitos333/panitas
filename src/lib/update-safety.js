// Shared by native installation and web refresh. A resolved payment does not imply
// that its receipt, drawer pulse or another overlapping action has finished.
export function createUpdateSafety({ now = Date.now, schedule = setTimeout, cancel = clearTimeout, idleMs = 30000 } = {}) {
  const blockers = new Set();
  const operations = new Set();
  const listeners = new Set();
  let lastActivity = now();
  let timer = null;
  let previousBusy;
  const hasBlockers = () => blockers.size > 0 || operations.size > 0;
  const isBusy = () => hasBlockers() || now() - lastActivity < idleMs;
  function notify() {
    if (timer !== null) cancel(timer);
    timer = null;
    const busy = isBusy();
    if (busy !== previousBusy) {
      previousBusy = busy;
      for (const listener of listeners) listener(busy);
    }
    if (!hasBlockers() && busy && listeners.size) {
      timer = schedule(notify, Math.max(1, idleMs - (now() - lastActivity)));
      timer?.unref?.();
    }
  }
  function touch() { lastActivity = now(); notify(); }
  function setBlocker(key, blocked) {
    const changed = blocked ? !blockers.has(key) : blockers.has(key);
    if (!changed) return;
    if (blocked) blockers.add(key); else blockers.delete(key);
    touch();
  }
  function beginOperation() {
    const token = Symbol('operation');
    operations.add(token);
    touch();
    return () => { if (operations.delete(token)) touch(); };
  }
  async function run(task) {
    const finish = beginOperation();
    try { return await task(); } finally { finish(); }
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(isBusy());
    notify();
    return () => { listeners.delete(listener); if (!listeners.size && timer !== null) { cancel(timer); timer = null; } };
  }
  return { isBusy, hasBlockers, touch, setBlocker, beginOperation, run, subscribe };
}

export function formFingerprint(form) {
  return JSON.stringify(Array.from(form.elements || []).filter((field) =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName)
      && !['button', 'submit', 'reset'].includes(field.type)
  ).map((field) => [field.name || field.id || '', field.type,
    field.type === 'checkbox' || field.type === 'radio' ? Boolean(field.checked)
      : field.multiple ? Array.from(field.selectedOptions || []).map((option) => option.value)
        : field.value]));
}

export function createFormChangeTracker() {
  const baselines = new WeakMap();
  const markSaved = (form) => { if (form) baselines.set(form, formFingerprint(form)); };
  function remember(root) {
    for (const form of root.querySelectorAll('form')) if (!baselines.has(form)) markSaved(form);
  }
  function isDirty(root) {
    return Array.from(root.querySelectorAll('form')).some((form) =>
      baselines.has(form) && baselines.get(form) !== formFingerprint(form));
  }
  return { remember, isDirty, markSaved };
}

// Scheduling a refresh is idempotent; a user action during the grace period
// postpones it, and overlapping operations must all finish before it runs.
export function createDeferredRefresh({ safety, refresh, canRefresh = () => true }) {
  let pending = false;
  let completed = false;
  function attempt() {
    if (!pending || completed || safety.isBusy() || !canRefresh()) return;
    completed = true;
    refresh();
  }
  const unsubscribe = safety.subscribe(attempt);
  return {
    request() { pending = true; attempt(); },
    attempt,
    destroy: unsubscribe
  };
}

export const updateSafety = createUpdateSafety();
export const updateForms = createFormChangeTracker();

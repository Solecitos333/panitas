export const REMOTE_STALE_MS = 3 * 60 * 1000;
export const REMOTE_COMMAND_TTL_MS = 24 * 60 * 60 * 1000;
export function milliseconds(value) {
  return value?.toMillis?.() ?? (typeof value === 'number' ? value : Date.parse(value) || 0);
}
export function remotePresence(terminal, now = Date.now()) {
  const seen = milliseconds(terminal.lastSeenAt);
  const sample = terminal.sampledAtMs || seen;
  return seen > 0 && now - seen >= -60000 && now - seen < REMOTE_STALE_MS
    && now - sample >= -60000 && now - sample < REMOTE_STALE_MS;
}
export function commandPhase(command, status, now = Date.now()) {
  if (!command) return '';
  if (command.action === 'update' && status.installedVersionCode >= command.targetVersionCode) return 'completed';
  if (milliseconds(command.expiresAt) <= now) return 'expired';
  if (command.action === 'report') return 'completed';
  return status.state === 'installed' ? 'awaiting_restart' : status.state || 'received';
}

// Native updater remains responsible for the signed download and the final busy check.
// Never execute arbitrary URLs, shell commands, drawer or printing operations remotely.
export function createRemoteUpdateAgent({ getStatus, isBusy, check, install, now = Date.now }) {
  let command = null, started = false, installRequested = false, failure = '';
  return {
    receive(next) {
      if (!next || next.id === command?.id) return;
      if (!['report', 'update'].includes(next.action)) return;
      command = next; started = false; installRequested = false; failure = '';
    },
    tick() {
      const status = getStatus();
      let phase = commandPhase(command, status, now());
      if (command && !['completed', 'expired'].includes(phase)) {
        if (failure) phase = 'error';
        else if (!started) {
          if (isBusy()) phase = 'waiting_for_idle';
          else {
            started = true;
            try { if (check() === false) failure = 'Actualizador nativo no disponible.'; }
            catch { failure = 'No se pudo solicitar la actualización.'; }
            phase = failure ? 'error' : 'checking';
          }
        } else if (['ready', 'waiting_for_idle'].includes(status.state) && !installRequested && !isBusy()) {
          // Explicit remote retry also releases a previously deferred local installation.
          installRequested = true;
          try { if (install() === false) failure = 'No se pudo solicitar la instalación.'; }
          catch { failure = 'No se pudo solicitar la instalación.'; }
        }
      }
      return { status, commandId: command?.id || '', commandPhase: failure ? 'error' : phase,
        commandError: failure };
    }
  };
}

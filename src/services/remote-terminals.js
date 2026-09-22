import { collection, doc, getDocFromServer, onSnapshot, query, orderBy, limit, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { can } from '../domain/roles.js';
import { createOperationId } from '../lib/id.js';
import { getEloUpdateStatus, checkEloAppUpdate, installEloAppUpdate } from '../lib/hardware.js';
import { updateSafety } from '../lib/update-safety.js';
import { createRemoteUpdateAgent, REMOTE_COMMAND_TTL_MS } from '../lib/remote-terminal.js';
import release from '../../release.json' with { type: 'json' };

export function startRemoteTerminals({ db, user, onChange, onError, host = window, clock = Date.now,
  native = { getStatus: getEloUpdateStatus, check: checkEloAppUpdate, install: installEloAppUpdate, isBusy: () => updateSafety.isBusy() } }) {
  if (!db) return { destroy() {}, async request() { throw Error('No disponible en la demostración local.'); } };
  let stopped = false, records = [], writing = false, lastWrite = 0, lastPayload = '', registration = null;
  const commands = new Map(), commandWatches = new Map(), disposers = [];
  const pendingRequests = new Map();
  const owner = can(user, '*');
  const emit = () => { if (!stopped) onChange(records.map(row => ({ ...row, command: commands.get(row.id) || null }))); };
  const error = () => { if (!stopped) onError('No se pudo sincronizar el control remoto. Comprueba conexión, sesión y permisos.'); };
  if (owner) {
    disposers.push(onSnapshot(collection(db, 'terminals'), snapshot => {
      records = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      for (const row of records) if (!commandWatches.has(row.id)) {
        commandWatches.set(row.id, onSnapshot(query(collection(db, 'terminals', row.id, 'commands'), orderBy('createdAt', 'desc'), limit(1)), snap => {
          commands.set(row.id, snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data(), pendingWrite: snap.metadata.hasPendingWrites }); emit();
        }, error));
      }
      for (const [id, unsubscribe] of commandWatches) if (!records.some(row => row.id === id)) { unsubscribe(); commandWatches.delete(id); commands.delete(id); }
      emit();
    }, error));
    const viewTimer = host.setInterval(emit, 30000);
    disposers.push(() => host.clearInterval(viewTimer));
  }
  if (host.EloPOS && can(user, 'billing:create')) {
    try {
      let deviceId = host.localStorage.getItem('panitas.remote.device');
      if (!deviceId || !/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId)) {
        deviceId = createOperationId('elo'); host.localStorage.setItem('panitas.remote.device', deviceId);
      }
      // A different authenticated cash account cannot overwrite the previous account's device record.
      const terminalId = `${user.uid}_${deviceId}`;
      const ref = doc(db, 'terminals', terminalId);
      const agent = createRemoteUpdateAgent({ getStatus: native.getStatus, isBusy: native.isBusy, check: native.check, install: native.install, now: clock });
      const pump = async () => {
        if (stopped || host.navigator.onLine === false) return;
        const result = agent.tick(), s = result.status;
        const payload = {
          accountUid: user.uid, label: `Terminal ELO · ${user.displayName || user.username || 'Caja'}`.slice(0, 120),
          installedVersionCode: Math.max(0, Number(s.installedVersionCode) || 0), installedVersionName: String(s.installedVersionName || '').slice(0, 40),
          availableVersionCode: Math.max(0, Number(s.availableVersionCode) || 0), updateState: String(s.state || 'unknown').slice(0, 40),
          progress: Math.max(0, Math.min(100, Math.round(Number(s.progressPercent) || 0))),
          message: String(result.commandError || s.message || '').slice(0, 500), errorCode: String(s.errorCode || '').slice(0, 80),
          fullyManaged: s.fullyManaged === true, busy: native.isBusy(),
          commandId: result.commandId, commandPhase: result.commandPhase
        };
        const fingerprint = JSON.stringify(payload), age = clock() - lastWrite;
        if (writing || age < 5000 || (fingerprint === lastPayload && age < 60000)) return;
        writing = true;
        try {
          await setDoc(ref, { ...payload, sampledAtMs: clock(), lastSeenAt: serverTimestamp() });
          lastWrite = clock(); lastPayload = fingerprint;
          if (!registration && !stopped) {
            registration = onSnapshot(query(collection(db, 'terminals', terminalId, 'commands'), orderBy('createdAt', 'desc'), limit(1)), { includeMetadataChanges: true }, snapshot => {
              // Cached/offline commands must not execute until the server confirms them.
              if (stopped || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || snapshot.empty) return;
              agent.receive({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() }); void pump();
            }, error);
          }
        } catch { error(); lastWrite = clock(); } finally { writing = false; }
      };
      const timer = host.setInterval(() => void pump(), 5000);
      const notify = () => void pump();
      host.addEventListener('elo-update-status', notify); host.addEventListener('online', notify);
      disposers.push(() => { host.clearInterval(timer); host.removeEventListener('elo-update-status', notify); host.removeEventListener('online', notify); registration?.(); });
      void pump();
    } catch { error(); }
  }
  return {
    async request(terminalId, action) {
      if (stopped || !owner || !records.some(row => row.id === terminalId) || !['update', 'report'].includes(action)) throw Error('Operación no autorizada.');
      if (host.navigator.onLine === false) throw Error('Conéctate a internet para enviar la solicitud.');
      if (action === 'report') {
        const snapshot = await getDocFromServer(doc(db, 'terminals', terminalId));
        if (snapshot.exists()) records = records.map(row => row.id === terminalId ? { id: snapshot.id, ...snapshot.data() } : row);
        emit(); return '';
      }
      if (!pendingRequests.has(terminalId)) {
        const id = createOperationId('remote');
        const pending = setDoc(doc(db, 'terminals', terminalId, 'commands', id), {
          action, targetVersionCode: release.versionCode,
          requestedBy: user.uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + REMOTE_COMMAND_TTL_MS)
        }).then(() => id).finally(() => pendingRequests.delete(terminalId));
        pendingRequests.set(terminalId, pending);
      }
      let timer;
      try {
        return await Promise.race([pendingRequests.get(terminalId), new Promise((_, reject) => {
          timer = host.setTimeout(() => reject(Error('Sin confirmación del servidor. La solicitud puede seguir pendiente; reintenta para consultar el mismo envío.')), 15000);
        })]);
      } finally { host.clearTimeout(timer); }
    },
    destroy() { stopped = true; disposers.forEach(dispose => dispose()); commandWatches.forEach(dispose => dispose()); }
  };
}

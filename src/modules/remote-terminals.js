import { escapeHtml } from '../lib/format.js';
import { remotePresence, milliseconds } from '../lib/remote-terminal.js';
import release from '../../release.json' with { type: 'json' };

const labels = { received: 'Recibida', checking: 'Buscando actualización', downloading: 'Descargando', verifying: 'Verificando firma', ready: 'Lista para instalar', waiting_for_idle: 'Esperando terminar operación', installing: 'Instalando', installed: 'Esperando confirmar versión', awaiting_restart: 'Esperando reinicio y confirmación', awaiting_confirmation: 'Requiere confirmación en Android', permission_required: 'Requiere permiso en la terminal', error: 'Requiere atención', expired: 'Solicitud vencida: vuelve a enviarla', completed: 'Confirmada por la terminal', idle: 'Preparada', up_to_date: 'Sin actualización pendiente', unsupported: 'Actualizador no disponible' };
const date = value => milliseconds(value) ? new Date(milliseconds(value)).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }) : 'Sin confirmar';
export function renderRemoteTerminals(state) {
  const rows = state.remoteTerminals || [];
  return `<section class="remote-terminals"><header><span class="eyebrow">Administración remota</span><h2>Mis terminales</h2><p>Versión publicada: ${escapeHtml(release.versionName)} (${release.versionCode}). No es necesario estar en la misma red.</p></header>
    <p role="status">${escapeHtml(state.remoteError || '')}</p>
    ${rows.length ? rows.map(t => {
      const cmd = t.command, acknowledged = cmd && t.commandId === cmd.id;
      const phase = acknowledged ? (labels[t.commandPhase] || t.commandPhase) : cmd ? (milliseconds(cmd.expiresAt) <= Date.now() ? labels.expired : 'Pendiente de recepción') : 'Sin solicitudes';
      return `<article class="remote-terminal-card"><h3>${escapeHtml(t.label)}</h3><p><strong>${remotePresence(t) ? 'Comunicación reciente' : 'Sin comunicación reciente'}</strong> · Última señal: ${escapeHtml(date(t.lastSeenAt))}</p>
        <dl><dt>Versión instalada confirmada</dt><dd>${escapeHtml(t.installedVersionName || 'Desconocida')} (${Number(t.installedVersionCode) || 0})</dd>
        <dt>Actualizador</dt><dd>${escapeHtml(labels[t.updateState] || t.updateState || 'Desconocido')} · ${Number(t.progress) || 0}%</dd>
        <dt>Última solicitud</dt><dd>${escapeHtml(phase)}${cmd ? ` · ${escapeHtml(date(cmd.createdAt))} · ${cmd.action === 'update' ? `Actualizar al código ${Number(cmd.targetVersionCode)}` : 'Consultar estado'}` : ''}</dd>
        <dt>Instalación silenciosa</dt><dd>${t.fullyManaged ? 'Dispositivo administrado' : 'Android puede requerir confirmación local'}</dd></dl>
        <p>${escapeHtml(t.message || '')} ${escapeHtml(t.errorCode || '')}</p><p>${t.busy ? 'Operación en curso: la instalación esperará.' : 'Sin bloqueo reportado en la última señal.'}</p>
        <div class="remote-terminal-actions"><button class="button secondary" data-remote-id="${escapeHtml(t.id)}" data-remote-action="report">Consultar último estado</button><button class="button primary" data-remote-id="${escapeHtml(t.id)}" data-remote-action="update">Actualizar / reintentar</button></div>
      </article>`;
    }).join('') : '<article class="remote-terminal-card"><h3>Todavía no hay terminales registradas</h3><p>La ELO debe instalar la versión 1.6.4 (44) o posterior, abrir Los Panitas e iniciar sesión con su cuenta de caja. Aparecerá automáticamente aquí al conectarse. Una terminal apagada o con la versión anterior no puede reportar su estado.</p></article>'}
    <p>“Sin comunicación” no permite distinguir entre equipo apagado, sin internet o sesión cerrada. Los estados mostrados corresponden a la última señal. Las solicitudes vencen a las 24 horas y una nueva sustituye a la anterior pendiente. Una instalación solo se confirma cuando la terminal reporta la versión solicitada o superior.</p></section>`;
}

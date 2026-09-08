import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';

export function renderWhatsApp(state) {
  const bot = state.whatsappBot || {};
  const status = bot.status || 'disconnected';
  const qrDataUrl = bot.qrDataUrl || '';
  const phoneNumber = bot.phoneNumber || '';
  const userName = bot.userName || '';

  const isConnected = status === 'connected';
  const isPairing = status === 'pairing' || (Boolean(qrDataUrl) && !isConnected);

  // Pedidos recibidos por WhatsApp
  const whatsappOrders = (state.orders || []).filter(
    (o) => o.source === 'whatsapp' || String(o.tableName || '').toLowerCase().includes('whatsapp')
  ).slice(0, 10);

  const totalWhatsAppCents = whatsappOrders.reduce((sum, o) => sum + Number(o.totalCents || 0), 0);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Automatización e Inteligencia Artificial</span>
        <h2>Bot Autónomo de WhatsApp</h2>
        <p>Atención al cliente 24/7 con Google Gemini 3.5 Flash, menú interactivo y recepción directa a cocina.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        ${isConnected ? `
          <button class="button secondary" id="btn-whatsapp-disconnect" title="Desvincular WhatsApp">
            <i data-lucide="log-out"></i> Desvincular Teléfono
          </button>
          <button class="button secondary" id="btn-whatsapp-restart" title="Reiniciar socket">
            <i data-lucide="refresh-cw"></i> Reiniciar Conexión
          </button>
        ` : `
          <button class="button primary" id="btn-whatsapp-restart" title="Solicitar nuevo código QR">
            <i data-lucide="refresh-cw"></i> Solicitar Nuevo QR
          </button>
        `}
      </div>
    </section>

    <div class="metric-grid">
      <article class="metric-card ${isConnected ? 'success' : isPairing ? 'warning' : 'danger'}">
        <i data-lucide="${isConnected ? 'wifi' : isPairing ? 'qr-code' : 'wifi-off'}"></i>
        <div class="metric-value">
          ${isConnected ? 'CONECTADO' : isPairing ? 'VINCULANDO' : 'DESCONECTADO'}
        </div>
        <div class="metric-label">
          ${isConnected ? (phoneNumber ? `+${phoneNumber} (${userName || 'Restaurante'})` : 'Línea de Los Panitas') : isPairing ? 'Esperando escaneo con cámara' : 'Servicio en espera'}
        </div>
      </article>

      <article class="metric-card">
        <i data-lucide="sparkles"></i>
        <div class="metric-value">Gemini 3.5 Flash</div>
        <div class="metric-label">Modelo de IA activo (750ms latencia)</div>
      </article>

      <article class="metric-card">
        <i data-lucide="shopping-bag"></i>
        <div class="metric-value">${whatsappOrders.length}</div>
        <div class="metric-label">Comandas WhatsApp registradas</div>
      </article>

      <article class="metric-card success">
        <i data-lucide="badge-dollar-sign"></i>
        <div class="metric-value">${formatMoney(totalWhatsAppCents)}</div>
        <div class="metric-label">Ventas canal WhatsApp</div>
      </article>
    </div>

    <div class="grid-two" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:1.5rem;margin-top:1.5rem;">
      <!-- Tarjeta 1: Vinculación QR en Tiempo Real -->
      <article class="card" style="padding:1.5rem;background:var(--bg-card, #111827);border-radius:14px;border:1px solid rgba(255,255,255,0.08);">
        <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;color:var(--text-primary, #fff);">
          <i data-lucide="smartphone" style="color:var(--accent, #f59e0b);"></i>
          ${isConnected ? 'WhatsApp Vinculado y Activo' : 'Vincular WhatsApp de Los Panitas'}
        </h3>

        ${isConnected ? `
          <div style="text-align:center;padding:2.5rem 1rem;background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.3);border-radius:12px;margin:1rem 0;">
            <div style="font-size:3rem;margin-bottom:0.5rem;">✅</div>
            <h4 style="color:#10b981;margin:0 0 0.5rem 0;font-size:1.3rem;">¡Bot Operando en Tiempo Real!</h4>
            <p style="color:var(--text-secondary, #94a3b8);font-size:0.95rem;max-width:380px;margin:0 auto 1.5rem auto;">
              El bot está respondiendo mensajes de clientes, cotizando el menú y enviando pedidos directamente a la cocina.
            </p>
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(255,255,255,0.05);border-radius:20px;font-family:monospace;font-size:0.9rem;color:#f3f4f6;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>
              Línea: +${escapeHtml(phoneNumber || 'Vinculada')}
            </div>
          </div>
          <p style="font-size:0.85rem;color:var(--text-secondary, #94a3b8);line-height:1.4;">
            Si necesitas cambiar el teléfono del restaurante o re-enlazar la cuenta, pulsa <b>Desvincular Teléfono</b> arriba para generar un nuevo código QR.
          </p>
        ` : `
          <div style="text-align:center;margin:1rem 0;">
            ${qrDataUrl ? `
              <div style="display:inline-block;padding:12px;background:#ffffff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.6);">
                <img src="${qrDataUrl}" alt="Código QR WhatsApp" style="width:260px;height:260px;display:block;image-rendering:pixelated;" />
              </div>
              <div style="margin-top:12px;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:12px;color:#fbbf24;font-size:0.8rem;font-weight:600;">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;box-shadow:0 0 6px #fbbf24;"></span>
                Actualizándose en vivo cada 30 segundos
              </div>
            ` : `
              <div style="padding:3rem 1rem;background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed rgba(255,255,255,0.1);">
                <i data-lucide="loader" style="width:36px;height:36px;color:#f59e0b;animation:spin 1.5s linear infinite;margin-bottom:1rem;"></i>
                <p style="color:var(--text-secondary, #94a3b8);margin:0;">Iniciando servicio de WhatsApp y generando código QR...</p>
              </div>
            `}
          </div>

          <div style="background:rgba(255,255,255,0.03);padding:1rem;border-radius:10px;border-left:3px solid var(--accent, #f59e0b);">
            <h5 style="margin:0 0 0.4rem 0;color:var(--text-primary, #fff);font-size:0.9rem;">Cómo vincular en 3 pasos:</h5>
            <ol style="margin:0;padding-left:1.2rem;font-size:0.85rem;color:var(--text-secondary, #cbd5e1);line-height:1.5;">
              <li>Abre <b>WhatsApp</b> en el teléfono del restaurante.</li>
              <li>Toca <b>Menú (⋮) o Ajustes</b> &gt; <b>Dispositivos vinculados</b>.</li>
              <li>Pulsa <b>Vincular un dispositivo</b> y apunta la cámara a este código QR.</li>
            </ol>
          </div>
        `}
      </article>

      <!-- Tarjeta 2: Asistente para Plato del Día -->
      <article class="card" style="padding:1.5rem;background:var(--bg-card, #111827);border-radius:14px;border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:1rem;">
        <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;color:var(--text-primary, #fff);">
          <i data-lucide="sparkles" style="color:var(--accent, #f59e0b);"></i>
          Anuncio del Plato del Día (con IA)
        </h3>
        <p style="color:var(--text-secondary, #94a3b8);font-size:0.9rem;margin:0;line-height:1.4;">
          Escribe el menú especial de hoy y Gemini redactará un mensaje apetitoso con emojis dominicanos para reenviar a tus clientes o estados.
        </p>

        <div>
          <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-secondary, #cbd5e1);">
            ¿Cuál es el plato de hoy?
          </label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="input-plato-del-dia" class="form-input" style="flex:1;padding:0.6rem 0.8rem;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;" placeholder="Ej: Pollo al horno con moro de guandules y tostones" />
            <button class="button primary" id="btn-generate-plato" style="white-space:nowrap;">
              <i data-lucide="sparkles"></i> Redactar
            </button>
          </div>
        </div>

        <div style="flex:1;display:flex;flex-direction:column;gap:0.4rem;">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text-secondary, #cbd5e1);">
            Mensaje para WhatsApp:
          </label>
          <textarea id="textarea-plato-output" class="form-input" rows="5" style="width:100%;box-sizing:border-box;padding:0.75rem;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-family:inherit;font-size:0.9rem;line-height:1.4;resize:vertical;" placeholder="Escribe el plato y pulsa 'Redactar' para que la IA genere el texto vendedor..."></textarea>
          <div style="display:flex;justify-content:flex-end;">
            <button class="button secondary" id="btn-copy-plato">
              <i data-lucide="copy"></i> Copiar Mensaje
            </button>
          </div>
        </div>
      </article>
    </div>

    <!-- Tarjeta 3: Últimas Comandas Recibidas por WhatsApp -->
    <article class="card" style="margin-top:1.5rem;padding:1.5rem;background:var(--bg-card, #111827);border-radius:14px;border:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:1rem;">
        <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;color:var(--text-primary, #fff);">
          <i data-lucide="receipt" style="color:#10b981;"></i>
          Últimas Comandas Recibidas desde WhatsApp
        </h3>
        <button class="button secondary" data-route="kds">
          <i data-lucide="chef-hat"></i> Ir a Pantalla de Cocina (KDS)
        </button>
      </div>

      ${whatsappOrders.length === 0 ? `
        <div style="text-align:center;padding:2.5rem;color:var(--text-secondary, #94a3b8);">
          <i data-lucide="message-square" style="width:36px;height:36px;margin-bottom:0.5rem;opacity:0.5;"></i>
          <p style="margin:0;">Aún no se han recibido comandas por WhatsApp el día de hoy.</p>
        </div>
      ` : `
        <div class="table-container" style="overflow-x:auto;">
          <table class="table" style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1);text-align:left;color:var(--text-secondary, #94a3b8);">
                <th style="padding:10px 12px;">Comanda #</th>
                <th style="padding:10px 12px;">Cliente</th>
                <th style="padding:10px 12px;">Modalidad</th>
                <th style="padding:10px 12px;">Detalle de Productos</th>
                <th style="padding:10px 12px;">Total</th>
                <th style="padding:10px 12px;">Estado en Cocina</th>
              </tr>
            </thead>
            <tbody>
              ${whatsappOrders.map((ord) => {
                const isDelivery = String(ord.tableName || '').toLowerCase().includes('delivery');
                const itemsSummary = (ord.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');
                const statusBadge = ord.status === 'ready'
                  ? '<span class="badge success" style="padding:3px 8px;border-radius:8px;background:rgba(16,185,129,0.2);color:#10b981;font-weight:600;">Listo</span>'
                  : ord.status === 'preparing'
                  ? '<span class="badge warning" style="padding:3px 8px;border-radius:8px;background:rgba(245,158,11,0.2);color:#f59e0b;font-weight:600;">En Preparación</span>'
                  : ord.status === 'served' || ord.status === 'completed'
                  ? '<span class="badge" style="padding:3px 8px;border-radius:8px;background:rgba(255,255,255,0.1);color:#cbd5e1;">Entregado</span>'
                  : '<span class="badge info" style="padding:3px 8px;border-radius:8px;background:rgba(59,130,246,0.2);color:#60a5fa;font-weight:600;">Pendiente</span>';

                return `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px 12px;font-family:monospace;font-weight:bold;color:#f3f4f6;">
                      #${escapeHtml(ord.id.slice(-6).toUpperCase())}
                    </td>
                    <td style="padding:10px 12px;font-weight:500;color:#fff;">
                      ${escapeHtml(ord.clientName || 'Cliente WhatsApp')}
                    </td>
                    <td style="padding:10px 12px;">
                      <span style="font-size:0.85rem;color:${isDelivery ? '#f59e0b' : '#38bdf8'};">
                        ${isDelivery ? '🛵 Delivery' : '🛍️ Para Llevar'}
                      </span>
                    </td>
                    <td style="padding:10px 12px;color:#cbd5e1;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(itemsSummary)}">
                      ${escapeHtml(itemsSummary || 'Sin detalle')}
                    </td>
                    <td style="padding:10px 12px;font-weight:bold;color:#10b981;">
                      ${formatMoney(ord.totalCents || 0)}
                    </td>
                    <td style="padding:10px 12px;">
                      ${statusBadge}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </article>
  `;
}

export function bindWhatsAppEvents(state, root, service, toast) {
  // Desvincular teléfono
  const btnDisconnect = root.querySelector('#btn-whatsapp-disconnect');
  if (btnDisconnect) {
    btnDisconnect.onclick = async () => {
      if (!confirm('¿Seguro que deseas desvincular el WhatsApp actual? Se generará un nuevo código QR para escanear.')) return;
      try {
        btnDisconnect.disabled = true;
        btnDisconnect.innerHTML = '<i data-lucide="loader"></i> Desvinculando...';
        await service.sendWhatsAppBotCommand('disconnect');
        toast('Comando enviado: Desvinculando WhatsApp y solicitando nuevo QR...', 'info', 4000);
      } catch (err) {
        toast('Error enviando comando: ' + err.message, 'danger');
        btnDisconnect.disabled = false;
      }
    };
  }

  // Reiniciar conexión o solicitar nuevo QR
  const btnRestart = root.querySelector('#btn-whatsapp-restart');
  if (btnRestart) {
    btnRestart.onclick = async () => {
      try {
        btnRestart.disabled = true;
        btnRestart.innerHTML = '<i data-lucide="loader"></i> Reiniciando...';
        await service.sendWhatsAppBotCommand('restart');
        toast('Comando enviado: Reiniciando servicio de WhatsApp...', 'info', 4000);
      } catch (err) {
        toast('Error enviando comando: ' + err.message, 'danger');
        btnRestart.disabled = false;
      }
    };
  }

  // Generar Plato del Día
  const btnGeneratePlato = root.querySelector('#btn-generate-plato');
  const inputPlato = root.querySelector('#input-plato-del-dia');
  const textareaOutput = root.querySelector('#textarea-plato-output');

  if (btnGeneratePlato && inputPlato && textareaOutput) {
    btnGeneratePlato.onclick = () => {
      const dish = inputPlato.value.trim();
      if (!dish) {
        toast('Por favor escribe el nombre del plato del día.', 'warning');
        inputPlato.focus();
        return;
      }

      const copy = `🍽️ *¡EL PLATO DEL DÍA EN LOS PANITAS BY NECHY!* 🤤🔥\n\n` +
        `Hoy tenemos preparado para ti: *${dish}*.\n\n` +
        `Acompáñalo con tu guarnición favorita o ensalada fresca del día. 🥗✨\n\n` +
        `🛵 *¡Tenemos delivery disponible y servicio para llevar!* Haz tu pedido ahora antes de que se termine escribiéndonos a este chat. ¡Te lo llevamos calientito! 🛵💨`;

      textareaOutput.value = copy;
      toast('¡Mensaje redactado con éxito!', 'success', 3000);
    };
  }

  // Copiar Plato del Día
  const btnCopyPlato = root.querySelector('#btn-copy-plato');
  if (btnCopyPlato && textareaOutput) {
    btnCopyPlato.onclick = async () => {
      const text = textareaOutput.value.trim();
      if (!text) {
        toast('No hay ningún mensaje para copiar.', 'warning');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast('¡Mensaje copiado al portapapeles! Listo para pegar en WhatsApp.', 'success', 3000);
      } catch {
        textareaOutput.select();
        document.execCommand('copy');
        toast('¡Mensaje copiado al portapapeles!', 'success', 3000);
      }
    };
  }
}

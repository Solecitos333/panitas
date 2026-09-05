# Pruebas de aceptación

- [ ] Cada rol solo ve sus módulos y acciones.
- [ ] Usuario anónimo, inexistente o inactivo queda bloqueado.
- [ ] El acceso público solicita únicamente nombre de usuario y contraseña.
- [ ] El propietario puede crear, cambiar el rol y desactivar a otros usuarios desde la aplicación.
- [ ] Cada usuario puede cambiar su propia contraseña sin almacenarla en Firestore.
- [ ] Dos usuarios no pueden abrir simultáneamente la misma mesa.
- [ ] La secuencia comanda → cocina → servicio → cobro libera la mesa.
- [ ] Un doble clic o cambio concurrente no duplica cobro, factura ni NCF.
- [ ] Una cotización/proforma no cobra ni descuenta inventario.
- [ ] Una factura descuenta inventario y rechaza existencias insuficientes.
- [ ] Pagos no superan el balance y no pueden editarse o eliminarse.
- [ ] Facturas no se eliminan; una anulación exige motivo y autorización.
- [ ] Apertura y cierre de caja calculan esperado y diferencia.
- [ ] Ticket y carta se imprimen legibles.
- [ ] CSV y DGII 607 abren sin fórmulas inyectadas.
- [ ] Escritorio, tablet y móvil mantienen navegación y controles utilizables.
- [ ] CSP y encabezados están presentes en Hosting.
- [ ] No hay secretos en repositorio ni build.
- [ ] Hosting responde, login funciona y Firestore niega acceso anónimo.
- [ ] La APK código 11 se instala manualmente sobre el código 10 sin borrar sesión, caja ni configuración Android.
- [ ] Una publicación de prueba código 12 es detectada, descargada y verificada desde el código 11.
- [ ] Carrito, PIN o cobro activo posponen la instalación hasta terminar la operación.
- [ ] Un formulario modificado y una impresión pendiente también posponen la instalación; los eventos de progreso conservan los campos editados.
- [ ] Cancelar la confirmación de Android conserva la aplicación operativa y permite un reintento explícito sin reabrir continuamente el instalador.
- [ ] Después de actualizar la APK, la terminal vuelve a Los Panitas y recupera la sesión.
- [ ] Una entrega solo web se detecta en la interfaz abierta y se aplica una sola vez al quedar libre, sin perder un carrito ni un formulario.
- [ ] ZIP/hash/firma/paquete/versión inválidos se rechazan sin abrir el instalador.
- [ ] Android estándar guía el permiso y la confirmación; modo Device Owner instala sin interacción si se decide aprovisionarlo.
- [ ] La búsqueda de actualización no bloquea impresión, gaveta, escáner ni cobro.

Panitas se retirará de Futunet/Creaticos únicamente cuando el dueño apruebe esta lista sobre el Hosting final.

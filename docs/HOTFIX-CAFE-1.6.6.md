# Hotfix café — 1.6.6 (46)

La terminal 1.6.4 fallaba en Transaction.set: Unsupported field value: undefined.
Las líneas del selector de tamaños incluían side y sidePriceCents ausentes.
Se omiten únicamente propiedades de línea con valor undefined en los límites
de persistencia de facturas y comandas. También cubre borradores anteriores;
no se alteran totales, variantes, inventario, PIN, reglas ni hardware.

Validación: 234 pruebas unitarias y 41 pruebas de emulador, compilación Android,
build web, firma original e integridad del ZIP/APK. Regresiones específicas:
café con tamaño + tostada, efectivo y delivery, reintento idempotente, stock
de preparado en cero, pago/caja correctos y creación/cobro de comanda nueva.
Sin ventas de prueba en producción.

La instalación debe confirmarse con installedVersionCode 46 en Mis terminales.
La ELO reportó fullyManaged=false e INSTALL_ABORTED para el intento anterior:
puede requerir aceptación presencial. No forzar instalación con carrito ocupado
ni borrar datos. La solicitud remota se emite por CLI administrativa, por petición
expresa de JESPINAL, después de verificar Hosting.

Hallazgo separado pendiente: editar una comanda existente mediante createOrder
puede ser rechazado por las reglas actuales (actualización sin statusChangedAt
y restricciones de transición/rol). No se amplían permisos en este hotfix urgente;
la prueba de este parche cubre creación y cobro, no edición de comandas existentes.

# Historial de cambios

## 1.4.0-rc.3 — 2026-09-01

- Validado en navegador el recorrido producto → PIN → cobro → caja, comanda → cocina → servicio → cobro, fiao → cobro, inventario móvil y cierre cuadrado.
- Endurecidos el bloqueo de sesión de caja, los vínculos comanda/factura, la atribución y hora de escrituras, y el rechazo de crédito como pago efectivo.
- Corregidos la caché obsoleta en desarrollo, el icono de cierre de caja, el diagnóstico USB autenticado y la etiqueta térmica de proformas.
- Añadida compatibilidad de sintaxis y polyfills para WebView antiguo de Android 8.1.
- El estado de papel de la Star ya no presenta un falso positivo: se identifica como sensor no compatible hasta implementar Star ASB.
- APK recompilada como código 10 para que Android pueda instalarla como actualización trazable.

## 1.4.0-rc.2 — 2026-08-31

- El despliegue automático conserva permisos mínimos y publica únicamente Hosting.
- CI continúa validando reglas y transacciones con el emulador; Auth, reglas e índices se publican mediante `npm run deploy` desde una sesión administrativa autorizada.

## 1.4.0-rc.1 — 2026-08-31

Primer candidato de entrega integral para la terminal ELO.

### Incorporado

- Flujo táctil de venta, cobro con PIN personal, caja rápida y cuentas por cobrar.
- Panel móvil con rendimiento por período, productos más vendidos y conteo de inventario.
- APK ELO con impresión térmica, logo optimizado, gaveta, escáner, visor y diagnósticos.
- Tickets separados para factura, pre-cuenta, cocina y arqueo.
- Descargas de APK y paquete de instalación desde la configuración del sistema.

### Corregido y endurecido

- Cobro, pago, inventario, caja, contador, mesa y comanda se enlazan mediante transacciones.
- Idempotencia contra doble toque y validaciones de reglas para saldos, pagos y secuencias.
- PIN de cuatro dígitos aislado en un documento privado del propio usuario.
- Gaveta e impresión desacopladas para no perder la apertura cuando falta papel.
- Puente local ELO limitado a origen oficial, token efímero, tamaño máximo y concurrencia acotada.
- Interfaz adaptada a 1280×800 y móvil, con estados de carga y modales accesibles.
- Service worker con caché inicial y actualización segura.

### Validación pendiente antes de 1.4.0 estable

- Recorrido físico completo en la terminal: venta, PIN, gaveta, ticket, entrada/salida y cierre de caja.
- Confirmar que la APK se instala como actualización sobre la versión existente sin borrar datos.
- Aprobación del dueño sobre la lista de aceptación.

### Limitación conocida

Mientras el proyecto permanezca en Firebase Spark, las reglas reducen la manipulación desde clientes modificados, pero la garantía fiscal absoluta de líneas, precios y secuencias NCF requiere trasladar esas operaciones a un backend confiable con Admin SDK.

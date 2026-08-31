# Modelo de datos

| Colección | Propósito | Mutabilidad |
|---|---|---|
| `users` | Nombre de usuario, perfil, roles y estado | Solo propietario; no autoelevación |
| `userSecrets` | PIN personal de cobro/gaveta | Solo el propio usuario; no admite listado |
| `settings` | Identidad y parámetros comerciales | Solo propietario |
| `counters` | Secuencias de documentos/NCF y bloqueo de caja por usuario | Incremento transaccional; nunca retrocede |
| `products` | Catálogo e inventario propio | Gerencia/propietario; stock por venta |
| `clients` | Directorio de facturación | Propietario, gerencia y caja |
| `invoices` | Facturas, cotizaciones y proformas | No se elimina; factura puede anularse |
| `payments` | Cobros vinculados a factura y caja | Inmutable |
| `cashSessions` | Apertura, efectivo esperado y arqueo | Saldo derivado de pagos/movimientos; una apertura y un cierre |
| `cashMovements` | Entradas y salidas físicas de efectivo | Inmutable y vinculada a caja abierta |
| `tables` | Estado y orden activa | Referencia, no contiene la comanda |
| `orders` | Comandas y estado operativo | Máquina de estados transaccional |
| `orders/{id}/events` | Historial de cada transición | Inmutable |
| `auditLogs` | Acciones administrativas | Inmutable |

Estados válidos de orden: `pending`, `preparing`, `ready`, `served`, `pending_payment`, `closed` y `cancelled`.

Una mesa contiene como máximo `currentOrderId`. La orden posee ID independiente. Crear una comanda exige ocupar esa mesa en la misma transacción; cerrarla o cancelarla exige liberarla también de forma atómica. Una factura guarda `subtotalCents`, `discountCents`, `taxableSubtotalCents`, `taxCents`, `tipCents`, `totalCents` y `paidCents`; nunca valores monetarios de punto flotante.

Cada cobro cambia atómicamente `invoice.paidCents`, crea un `payment` inmutable y registra su ID en `invoice.lastPaymentId`. Cuando el método es efectivo, la misma transacción actualiza `cashSession.expectedCents`. El cierre de caja no acepta un saldo esperado calculado por el navegador: usa el acumulado protegido de la sesión.

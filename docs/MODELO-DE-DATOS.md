# Modelo de datos

| Colección | Propósito | Mutabilidad |
|---|---|---|
| `users` | Perfil, roles y estado | Solo propietario; no autoelevación |
| `settings` | Identidad y parámetros comerciales | Solo propietario |
| `counters` | Secuencias de documentos y NCF | Transaccional |
| `products` | Catálogo e inventario propio | Gerencia/propietario; stock por venta |
| `clients` | Directorio de facturación | Propietario, gerencia y caja |
| `invoices` | Facturas, cotizaciones y proformas | No se elimina; factura puede anularse |
| `payments` | Cobros vinculados a factura y caja | Inmutable |
| `cashSessions` | Apertura y arqueo | Una apertura y un cierre |
| `tables` | Estado y orden activa | Referencia, no contiene la comanda |
| `orders` | Comandas y estado operativo | Máquina de estados transaccional |
| `orders/{id}/events` | Historial de cada transición | Inmutable |
| `auditLogs` | Acciones administrativas | Inmutable |

Estados válidos de orden: `pending`, `preparing`, `ready`, `served`, `pending_payment`, `closed` y `cancelled`.

Una mesa contiene como máximo `currentOrderId`. La orden posee ID independiente. Una factura guarda `subtotalCents`, `taxCents`, `totalCents` y `paidCents`; nunca valores monetarios de punto flotante.

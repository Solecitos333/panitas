# Verificación de entrega — 22 de septiembre de 2026

Versión del usuario revisada: **1.6.3, código 43**, commit `791afd0`.
Respaldo previo publicado: tag `backup-stable-1.6.3-20260922`.

## Resultado

- 223 pruebas unitarias aprobadas.
- 36 pruebas de reglas y transacciones aprobadas en Firebase Emulator Suite, proyecto demo separado de producción.
- 13 fuentes Java compiladas correctamente.
- Compilación web validada; comprobación automatizada del build sin secretos detectados.
- ZIP y APK verificados: tamaño, SHA-256, identidad, versión y certificado original de actualización.
- Los cinco archivos generados para la interfaz Android coinciden byte por byte con los incluidos en el APK publicado.
- Hosting coincide con la compilación web local. Descargas de terminal y gestión verificadas.
- Reglas Firestore activas coinciden con el archivo local probado.

Dos expectativas antiguas de pruebas exigían consultas de perfiles y reservas de PIN exclusivamente personales. Se actualizaron para reflejar el flujo multioperador incorporado por el usuario. Se mantienen comprobaciones de reserva única, listado restringido y secreto privado; se agregaron rechazos para acceso anónimo, cuenta desconocida, cuenta inactiva, modificación ajena e identificación de un operador desactivado. No se modificó el comportamiento de producción ni se debilitó ninguna regla durante esta revisión.

## Recepción en la terminal

La versión 43 ya está publicada en `/downloads/update.json`, junto con su APK firmado. No es necesario crear otra versión idéntica. El actualizador nativo consulta cada seis horas y permite adelantar la consulta desde **Configuración → Aplicación nativa ELO → Buscar actualización**. Espera a que la interfaz permita instalar sin interrumpir una operación. Android puede exigir permiso o confirmación si el dispositivo no está administrado completamente.

No hubo dispositivo conectado por ADB. Por tanto, esta revisión confirma la disponibilidad e integridad de la actualización, **no su instalación física**, ni una nueva prueba de impresora/gaveta. En la terminal debe comprobarse que figure **1.6.3 (43)**.

## Límites conocidos

- El PIN compartido identifica al operador dentro de la sesión abierta; no inicia una sesión Firebase distinta. `cashierId` y `createdBy` siguen siendo la cuenta autenticada; el nombre del operador es un dato adicional aportado por la aplicación. No equivale a una auditoría resistente a manipulación desde un cliente modificado.
- Las consultas puntuales de reservas de PIN están permitidas a cuentas activas para este flujo. Bloquear el listado no constituye un límite de intentos impuesto por el servidor. Para una garantía más fuerte se necesita autorización/verificación de operador en un backend confiable o sesiones personales.
- Vite informa de bundles grandes; no es un fallo de compilación. No se midió rendimiento sobre la terminal en esta revisión.
- Las pruebas no garantizan ausencia absoluta de errores. No se crearon ni modificaron registros comerciales en producción.

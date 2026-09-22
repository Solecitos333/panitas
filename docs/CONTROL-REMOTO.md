# Control remoto de actualizaciones (1.6.4 / código 44)

## Uso desde el teléfono

1. Inicia sesión con una cuenta **owner/propietario** en la web y abre **Mis terminales** (`#remote`). Ni caja ni gerencia pueden emitir órdenes remotas.
2. Cada terminal muestra versión instalada, última señal, estado del actualizador, progreso, mensaje de error, bloqueo por operación y si Android está administrado para instalación silenciosa.
3. **Consultar último estado** vuelve a leer el registro desde el servidor. No despierta un equipo apagado ni sustituye una orden pendiente.
4. **Actualizar / reintentar** solicita la versión publicada con esa web. La petición queda registrada con usuario, fecha, versión objetivo e identificador único. Vence a las 24 horas. Una solicitud nueva sustituye a la anterior pendiente; el historial de documentos se conserva sin modificación ni borrado.
5. Espera **Confirmada por la terminal** y comprueba la versión reportada. Descargar o terminar el instalador no constituye confirmación: esta requiere que la app reporte la versión objetivo o superior.

## Primera puesta en marcha

La terminal necesita recibir primero el código 44 mediante su actualizador previo o una instalación local autorizada. Mientras solo tenga código 43 o esté apagada no aparecerá en este panel. Tras actualizar, abrir la app e iniciar sesión con su cuenta de caja y conexión a internet, se registra automáticamente.

El identificador de instalación se conserva en el almacenamiento de la interfaz local. El registro se vincula también al UID de caja. Borrar los datos de la app, reinstalar borrando datos o cambiar de cuenta puede crear otra entrada; la anterior permanecerá sin señales. No se solicitan ni guardan PIN en la telemetría.

## Garantías y límites

- La señal normal se publica aproximadamente cada minuto; los cambios relevantes pueden publicarse cada cinco segundos. Una muestra antigua reenviada después de perder conexión no se clasifica como señal reciente usando solo su hora de recepción.
- El panel actualiza la antigüedad cada 30 segundos. Tras tres minutos sin muestra reciente dice **Sin comunicación reciente**, nunca afirma que el equipo está apagado.
- Solo se ejecutan solicitudes confirmadas por Firestore, no entradas de caché pendientes. Las escrituras de solicitudes tienen un plazo de respuesta en la interfaz; ante respuesta incierta se reutiliza el envío en curso en lugar de duplicarlo.
- Las órdenes solo piden al actualizador nativo usar su manifiesto HTTPS autorizado. No incluyen URLs, comandos de sistema, impresión ni apertura de gaveta. La verificación de firma y los bloqueos existentes permanecen activos.
- La operación espera a que el mecanismo de seguridad de actualizaciones libere venta, carrito, impresión y formularios. El actualizador nativo vuelve a comprobar su propio bloqueo antes de instalar.
- Android puede exigir permiso de instalación o confirmación presencial. No se modifica la administración del dispositivo ni se restablece la terminal. El panel informa esa necesidad, no la omite.
- El componente funciona mientras la aplicación está abierta y existe una sesión habilitada de caja. No es un servicio de gestión del sistema operativo independiente de la app; no enciende equipos ni controla la pantalla.
- Firebase autoriza por cuenta de caja, no por una identidad de hardware con atestación. Una cuenta comprometida podría falsificar sus propios reportes. Solo las cuentas de propietario pueden crear solicitudes.
- La telemetría y los observadores consumen las cuotas compartidas de Firestore Spark. No se añadieron servicios de facturación, Cloud Functions, VPN ni puertos entrantes.

## Modelo

- `terminals/{id}`: reporte sobrescrito de la instalación/cuenta; `lastSeenAt` de servidor y `sampledAtMs` de muestreo; versión, estado y confirmación de solicitud.
- `terminals/{id}/commands/{requestId}`: solicitudes de actualización inmutables con `createdAt`, `requestedBy`, `targetVersionCode` y `expiresAt`. Se procesa la última por fecha del servidor.
- Solo propietario lee todos los equipos; cada cuenta de caja reporta y consulta exclusivamente los vinculados a su UID. Lecturas anónimas y órdenes de otros roles se deniegan.

## Verificación

Las pruebas cubren registro, consulta del propietario, envío de solicitud, espera de caja ocupada, inicio único, confirmación de nueva versión, caducidad, rechazo de órdenes arbitrarias, permisos y limpieza al cerrar sesión. La prueba integral utiliza Firestore Emulator Suite y un puente Android simulado: no sustituye verificar la recepción en la ELO real.

Para restaurar una versión previa es necesario compilar su código con un versionCode superior, conservar la firma original y publicarla. No se puede instalar una APK de código inferior mediante este mecanismo.

# Entrega 1.4.1 — terminal código 21

## Cuenta y puesta en marcha

Esta entrega opera con sesiones personales, decisión aprobada para conservar Firebase Spark sin enlazar tarjeta. La cuenta prevista del local es **NECHY**. Su contraseña inicia sesión; su PIN personal de seis dígitos autoriza operaciones dentro de esa sesión. No son la misma credencial. Nunca compartirlas ni publicar los PINs en documentación.

Si al actualizar aparece ADMIN, pulsar **Usar otra cuenta** e ingresar con NECHY. ADMIN es una cuenta de pruebas: la APK no permite continuar operando con ella. No se borró el usuario ni se cerraron las cajas antiguas. JESPINAL mantiene su acceso personal de soporte.

1. Conectar la terminal a Internet, conectar impresora/gaveta y abrir Los Panitas.
2. Esperar a que busque la actualización. En Terminal ELO comprobar **1.4.1 / código 21**. Si Android pide permiso o confirmar la instalación, aceptarlo en la propia terminal. No desinstalar la app ni borrar sus datos.
3. Iniciar sesión con NECHY y su contraseña. El PIN se utiliza después, no en el campo de contraseña.
4. Antes de vender, recontar el efectivo. Si ya existe un turno abierto, contrastarlo y cerrarlo con su arqueo real antes de abrir el turno nuevo. No inventar importes ni cerrar automáticamente las cajas anteriores.
5. Abrir Caja con el fondo inicial real y el PIN de NECHY. El inicio rápido de cobro puede crear una caja con fondo cero: solo usarlo si la gaveta realmente parte de cero.
6. Seleccionar productos, pulsar Cobrar, indicar la forma de pago y autorizar con el PIN de la cuenta visible. Las ventas se confirman en Firebase antes de imprimir. Si falla la impresora, revisar la factura guardada y **reimprimir**, no volver a cobrarla.
7. Registrar todas las entradas y salidas en Caja con motivo, importe y PIN. Al cierre introducir el dinero contado; cualquier diferencia requiere explicación.

## Correcciones incluidas

- Se eliminó la búsqueda de PIN de terceros, incompatible con las reglas publicadas. La cuenta autenticada es la identidad responsable; las reglas impiden atribuir un nuevo cobro a otro usuario. El modo de cuenta general multiusuario queda fuera de esta entrega.
- Nómina acepta la caja enviada por el formulario. Empleado, caja y saldo se verifican; salida, comprobante y auditoría se escriben en una transacción. Reintentar la misma solicitud no repite el descuento. No se permite reutilizar el ID para otros importes.
- Se conserva el ticket de altura variable y corte único previamente ajustado, y se fija la referencia del ticket antes de programar su impresión.
- El campo de delivery «el cliente pagará con» es informativo: la devuelta es ese monto menos la factura. Ya no descuenta el billete completo de la caja ni abre la gaveta después de una escritura fallida. Si se adelanta efectivo al repartidor, usar explícitamente Caja → Salida, y al regresar registrar la devolución del adelanto mediante Caja → Entrada, separada del cobro de las facturas. No descontar dos veces. Los anticipos automáticos no están habilitados.
- El total del carrito muestra ITBIS sin afirmar incorrectamente una tasa fija cuando hay productos exentos o con tasas distintas.
- Versiones de paquete, bloqueo de dependencias, manifiesto y APK alineadas. El código 21 permite actualizar desde código 20 y anteriores admitidos, conservando la firma original.

## Gestión móvil

iPhone: abrir la web en Safari → Compartir → Añadir a pantalla de inicio. Android: instalar la web desde Chrome, o usar el botón **Descargar APK de gestión** del dashboard.

La APK de gestión abre el panel en el navegador seguro del teléfono; no controla gaveta ni impresora y no es una réplica nativa desconectada de todo Firebase. Requiere Internet para sincronizar y guardar.

Firebase Spark no admite alojamiento de archivos .apk directos ([documentación oficial](https://firebase.google.com/docs/hosting/faq-and-troubleshooting?hl=es-419)). El botón se redirige a GitHub Releases, repositorio Solecitos333/panitas, etiqueta gestion-v1.0.0. El archivo y su SHA-256 se describen en public/downloads/management.json. La compilación móvil se guarda fuera de public/; compilar la ELO ya no elimina instaladores ajenos.

## Pruebas y límites de aceptación

- 97 pruebas unitarias y 31 de Firestore Emulator aprobadas en la preparación de esta entrega.
- Incluyen venta/cobro/reintento/cierre, PIN personal exclusivo, nómina concurrente, falta de efectivo, caja ajena, empleado inactivo, transferencia y rechazo de movimientos de nómina huérfanos.
- Compilación Android, integridad ZIP/APK, versión y certificado original verificados con las herramientas del SDK.
- Revisión visual local de creación de producto con teclado táctil, selección en carrito y apertura de la autorización de cobro. Solo datos sintéticos locales, sin ventas de prueba en producción.
- La terminal no estuvo conectada: **falta confirmar físicamente esta versión instalada, impresión y apertura de gaveta**. No se promete ausencia absoluta de errores ni acceso remoto interactivo confirmado.
- WhatsApp depende de su servicio independiente; no se habilitó ni desplegó ese bot como parte de estas correcciones.

## Checklist del instalador

- [ ] Código 21 instalado, sesión personal de NECHY.
- [ ] Efectivo contado y turno conciliado; PIN de NECHY comprobado por él.
- [ ] Venta controlada: una factura, un pago, stock correcto; ticket legible, corte corto y gaveta física.
- [ ] Reimpresión no crea otro cobro.
- [ ] Entrada/salida registradas y cierre con arqueo correcto.
- [ ] Internet desconectado: no mostrar cobro como confirmado; al volver, revisar registros antes de reintentar.
- [ ] Identificar a una persona del local que pueda confirmar instalación y revisar conexiones físicas durante soporte.

## Recuperación y nuevas publicaciones

Respaldo local previo: rama backup/pre-delivery-20260908 y tag backup-pre-delivery-20260908. No se publican respaldos privados, credenciales ni datos operativos.

La APK código 20 anterior permanece disponible como artefacto histórico. Android no instala automáticamente una versión menor: una recuperación debe compilar el código restaurado con **un código de versión superior al instalado**, la misma firma y reglas compatibles. No desinstalar para retroceder.

Para publicar: compilar gestión, publicar su release solo si es nueva, compilar ELO, ejecutar npm run validate y npm run test:emulator, desplegar reglas/índices/Hosting y verificar las descargas públicas. El comando deploy no modifica proveedores de Auth: no deshabilita Google ni cambia contraseñas.

El soporte interactivo desde otra red no queda certificado con una actualización de Hosting. No abrir ADB al Internet público ni asumir que existe un túnel remoto sin probarlo.

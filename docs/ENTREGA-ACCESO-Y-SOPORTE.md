# Entrega: identidad, caja y soporte remoto

Estado: revisión y propuesta del 7 de septiembre de 2026. No implementado ni desplegado; requiere decisiones de infraestructura y cuentas. No sustituye las pruebas de aceptación.

## Restricción confirmada por el usuario

- Mantener Spark: no vincular tarjeta ni activar facturación de pago. La propuesta de Cloud Functions de este documento queda descartada bajo esta restricción; no desplegarla ni activar Blaze.
- JESPINAL es la cuenta del desarrollador y debe conservarse.
- El usuario permite retirar ADMIN, que es de pruebas. Sin embargo, la inspección visual de la terminal confirmó una sesión activa como Administrador y caja lista. Posponer la retirada hasta verificar el cierre/traspaso de esa sesión y el acceso sustituto; no cortar el POS ni borrar su historial.
- Nechy tiene identidad de correo verificado con proveedor password. Google permanece deshabilitado: incorporarlo no requiere convertir el proyecto a Blaze, y debe conservar el UID/perfil operativo existente.
- No se ha autorizado alterar los permisos del bot ni sustituir el código diario por una aprobación móvil. Una posible alternativa sin Cloud Functions es solicitar una aprobación autenticada desde el móvil y consumirla mediante transacción y reglas de Firestore. Ese cambio de experiencia requiere aceptación antes de implementarlo, además de pruebas de vencimiento, vinculación a importe/dispositivo y reutilización.
- Estas decisiones no significan que sea imposible construir controles adicionales con reglas en Spark; significan que no debe presentarse la validación JavaScript existente como equivalente al backend antes propuesto. Un diseño de código diario para Spark necesita una evaluación propia de generación, protección contra intentos, permisos y transacciones antes de su aceptación.

## Base comprobada

- Terminal consultada por ADB: APK 1.4.0, código 20. Que ADB aparezca conectado hoy no demuestra acceso desde otra red ni persistencia tras reiniciar.
- 66 pruebas unitarias aprobadas. No equivalen a una auditoría completa ni a pruebas de reglas, E2E o aceptación física de esta versión.
- Firebase del proyecto `los-panitas-by-nechy`: `billingEnabled=false`. Google tiene configuración de cliente, pero el proveedor está deshabilitado.
- Firestore contiene cuatro perfiles activos con rol owner: NECHY, ADMIN, JESPINAL y WHATSAPP_BOT. No se han cambiado sus permisos.
- El PIN actual se valida en JavaScript consultando `pinClaims`/`userSecrets`. No debe reutilizarse como frontera de seguridad para una terminal compartida.
- La foto del usuario confirmó la impresión corta con corte cercano al contenido en la versión 19. Conservar esa secuencia de impresión en nuevas APK; falta aceptación de factura larga.
- Existen numerosos cambios sin commit del trabajo anterior. Preservarlos y crear un respaldo revisado sin credenciales antes de implementar o publicar.

## Experiencia propuesta

1. Móvil: acceso personal mediante contraseña o Google vinculado a la identidad operativa existente. Autenticarse con Google no concede roles ni crea automáticamente un propietario. Vincular proveedores conservando UID e historial, con prueba de posesión de la cuenta existente.
2. Inicio móvil: tarjeta «Mi código de hoy», código oculto por defecto y botón para revelarlo; fecha y vencimiento en America/Santo_Domingo. Añadir resumen operativo según permisos, no acceso administrativo para todos.
3. Terminal: identidad de dispositivo emparejada y revocable, sin roles owner y sin lista de códigos. Elegir productos, introducir el código personal y confirmar cobro. Mostrar quién autoriza y volver a estado neutro al finalizar.
4. Propuesta de código: seis dígitos aleatorios, exclusivos entre usuarios para el día, asignados en servidor con control de colisiones y revocación. El cambio diario limita la vigencia, pero no impide memorizarlo, compartirlo o mirar sobre el hombro. No llamarlo segundo factor por sí solo.
5. Para mayor protección se puede evolucionar a aprobación desde el móvil o código de un solo uso. No incorporar ese cambio de experiencia sin acordarlo.

## Seguridad de servidor

- Cloud Functions autentica la identidad personal/dispositivo, comprueba usuario activo, rol, hora de servidor y fecha comercial; aplica limitación de intentos persistente. El cliente no puede listar códigos ni sus verificadores.
- Emisión bajo demanda: el primer acceso del día obtiene el código vigente mediante transacción. No depender de que una PC esté encendida ni de un trabajo local a medianoche.
- Proteger el material de generación con secretos de servidor, no con una fórmula pública o clave dentro de la APK. Nunca registrar el PIN en auditorías, errores, telemetría o URLs.
- Una validación concede una autorización breve de un solo uso, vinculada al usuario, dispositivo, acción y operación concreta. La factura/pago/movimiento consume esa autorización de forma atómica e idempotente. Cambiar el importe o la operación invalida la autorización.
- Las reglas y los servicios financieros deben impedir que las llamadas directas de una sesión de terminal eludan el código. No basta con añadir un modal delante de los métodos actuales.
- Revocar usuarios/dispositivos y códigos desde administración. Definir recuperación por el dueño sin PIN maestro oculto ni credenciales de soporte compartidas.
- Ante falta de red, explicar el bloqueo y conservar el borrador; no mostrar un cobro o una autorización como confirmados si el servidor no respondió. Resolver respuestas inciertas por ID, sin repetir cobros.

## Trazabilidad y caja

- Guardar de forma estructurada operador, dispositivo, sesión de caja, fecha de servidor, acción, motivo, importe y documento relacionado. No sustituir el operador por la cuenta general ni guardarlo solo en una frase.
- Registrar por separado autorización, solicitud de apertura, pulso enviado y fallo del hardware. Solo registrar apertura/cierre físico como observado si existe sensor compatible; la app no puede cerrar mecánicamente una gaveta manual.
- Entradas y retiros requieren motivo e importe; apertura requiere fondo inicial; cierre registra efectivo esperado, contado y diferencia. Diferenciar responsable del turno y operador de cada movimiento.
- La trazabilidad ayuda a investigar diferencias, pero no prueba por sí sola quién causó un descuadre ni detecta retiros físicos no registrados.
- No repetir una venta para resolver un fallo de impresión: conservar pago y ofrecer reimpresión identificada.

## Soporte y actualizaciones

- Publicar APK firmada, ZIP versionado y manifiesto juntos en Hosting. Incrementar siempre el código de versión; verificar firma, hash y compatibilidad antes de instalar. Mantener recuperación mediante una nueva versión, sin borrar datos.
- Validar que no se instala durante cobros, impresión, PIN, formularios o carrito pendiente. Mostrar errores y permitir reintento seguro.
- En Android, no prometer instalación silenciosa sin comprobar administración del dispositivo y permisos. Si el instalador exige confirmación, debe estar documentada y ensayada con el dueño.
- Las actualizaciones salientes por HTTPS no requieren una PC del desarrollador ni puertos abiertos en el router. No confundirlas con acceso interactivo remoto.
- El soporte interactivo requiere un canal autenticado y revocable, por ejemplo VPN privada o herramienta de soporte con equipos autorizados. No exponer ADB/gaveta a Internet ni crear un puente sin autenticación.
- Incorporar diagnóstico visible de versión, último contacto, conexión y cola de impresiones sin exponer datos sensibles. Acceso al diagnóstico remoto restringido y auditable.

## Decisiones necesarias antes de desplegar

1. Autorizar o descartar Blaze para el backend propuesto. Requiere cuenta de facturación; configurar presupuesto/alertas acordados y límites operativos. Las alertas no garantizan un tope de gasto.
2. Decidir qué hacer con ADMIN/JESPINAL y el bot: conservar, revocar o reducir a permisos concretos. No cortar una integración en uso sin transición y recuperación.
3. Confirmar/vincular la cuenta Google del dueño mediante inicio de sesión del propio dueño; no solicitar su contraseña de Google ni apropiarse de una identidad por su nombre.
4. Elegir y autorizar el mecanismo de soporte remoto, incluida la participación local necesaria para permisos y prueba desde otra red.

## Puerta de aceptación

- Google y contraseña llevan al mismo perfil; cuenta ajena/inactiva sin acceso. Probar cancelación, bloqueo de popup, recuperación y móvil real.
- Códigos distintos, vencimiento a medianoche de Santo Domingo, desfase de reloj cliente, concurrencia de emisión, revocación e intentos fallidos persistentes.
- Una terminal sin autorización no puede escribir cobros ni simular un operador; un grant usado/vencido/de otra terminal o acción es rechazado. Probar reglas y backend en emuladores.
- Venta, pago parcial si aplica, fiao, comanda, devolución/anulación, entrada/retiro y cierre; doble toque, respuesta perdida y reintento sin duplicar registros.
- Código del dueño primero; pruebas de otros roles con identidades de emulador, no usuarios comerciales ficticios en producción.
- Impresión corta/larga y recuperación de fallo sin segundo cobro. Confirmación física del cliente.
- Actualizar por Internet desde versión instalada, sin sesión entrante ADB; comprobar que conserva acceso, datos y periféricos. Probar reinicio y soporte desde otra red.
- Entregar manual breve por rol, respaldo de firma fuera del repositorio, procedimiento de recuperación y lista honesta de comprobaciones pendientes.

Referencias oficiales: [Cloud Functions y requisito Blaze](https://firebase.google.com/docs/functions/get-started), [Google en Firebase Auth](https://firebase.google.com/docs/auth/web/google-signin), [vinculación de proveedores](https://firebase.google.com/docs/auth/web/account-linking).

# Revisión de estabilidad — 1.6.7 (47)

Fecha: 24 de septiembre de 2026. Candidata preparada; no publicada todavía.
Base: `08e197b` (1.6.6). Respaldo: `backup-before-stability-audit-20260923`.
Rama: `fix/operational-regressions-20260923`.

## Errores corregidos

- **Editar una mesa fallaba por permisos:** las reglas solo contemplaban cambios de estado. Se agrega edición de contenido con revisión exacta, totales coherentes y evento nuevo e inmutable. Cocina no puede modificar artículos ni precios.
- **Una edición concurrente podía sobrescribir otra:** reemplazar requiere el ID y revisión cargados. Si otra persona modificó la mesa, se pide recargar. Las adiciones concurrentes se combinan; solo se reintentan conflictos comprobados, no fallos genéricos de permisos.
- **Cobrar una mesa pendiente/preparando/lista fallaba aunque la demo lo permitía:** caja puede facturar directamente una mesa activa, con factura, inventario, pago, caja, cierre y liberación en la misma transacción. No permite cerrar sin factura ni habilita el cobro a cocina/camareros.
- **Al cargar una mesa faltaba cómo guardar modificaciones:** el POS conservaba el destino Para llevar. Ahora carga el destino de mesa y muestra «Guardar cambios de mesa» en el mismo lugar del botón anterior.
- **Pulsaciones durante el envío podían modificar o borrar el carrito enviado:** mientras se guarda se bloquean nuevas interacciones, escaneos y navegación; se libera al terminar o fallar. El actualizador no interrumpe esa operación.
- **Descuento de artículo aplicado dos veces al cobrar mesas antiguas:** se separa el descuento global del descuento de cada artículo. Se conserva la propina fija heredada. Precuenta, edición y cobro comparten el cálculo.
- **Impuestos incorrectos con descuentos por línea y globales combinados:** se distribuye el descuento global sobre importes netos y se calcula cada impuesto sobre su base correspondiente, manteniendo centavos enteros. No se cambian tasas ni políticas fiscales.
- **Reutilizar un ID con otra venta podía aparentar un cobro exitoso:** se compara la intención de venta y su primer pago. Un reintento idéntico confirma la factura existente; cambios de productos, importes, cliente, método o caja se rechazan. Un abono posterior no invalida el reintento original.
- **Reintentar una mesa ya cobrada daba error:** se admite únicamente el mismo ID vinculado y mismos datos. En la demo tampoco libera otra comanda creada después en esa mesa.
- **Anular delivery creaba existencias ficticias del cargo de envío:** esas líneas no descuentan ni reponen stock. Anulación y auditoría se confirman juntas, evitando informar fallo después de anular correctamente.
- **Valores numéricos inválidos y referencias malformadas:** se rechazan cantidades que redondean a cero, descuentos/propinas negativos o no finitos y referencias inválidas antes de escribir.
- **Fiao de mesa intentaba registrar un pago inmediato:** el POS reutiliza el mismo cálculo de pago de la venta directa, con cero cobrado para crédito/delivery pendiente.
- **La siguiente venta conservaba una mesa ya cerrada:** cobrar o limpiar el carrito no borraba los IDs cargados, y el siguiente cobro podía intentar facturar nuevamente esa comanda. Reiniciar el borrador limpia también la mesa, comanda y revisión.

## Evidencia de validación

- Antes de las correcciones se reprodujeron cuatro fallos con el emulador: edición de mesa, descuento duplicado, ID de venta reutilizado con otros datos y stock ficticio al anular envío.
- 247 pruebas unitarias aprobadas, incluyendo regresiones de cálculo, intención de venta, carrito y demo.
- 55 pruebas con Firestore Emulator aprobadas: operaciones reales de `DataService`, cinco roles, intentos prohibidos, transacciones, concurrencia y caja.
- `npm run validate`: pruebas unitarias, compilación Java Android, build web, comprobación de secretos del build e integridad/firma de APK/ZIP.
- APK 1.6.7 (47) compilada con la firma existente; no exige desinstalar ni borrar datos.
- Revisión mediante la habilidad Browser en la demo local: detectó el botón de guardar mesa ausente y la referencia residual a una mesa cobrada. Verificado: crear artículo → mesa → aumentar cantidad → guardar → PIN → factura de RD$200 → siguiente venta independiente de RD$100. Sin escribir ventas en producción ni confirmar hardware desde la demo.
- Logs locales ignorados por Git: `test-results/stability-unit.log`, `stability-rules.log`, `stability-validate.log`, `stability-apk.log`. La advertencia del build sobre bundles grandes sigue pendiente; no es un fallo de compilación.

## Publicación coordinada (pendiente de aprobación de horario)

1. Confirmar terminal sin operación en curso; no forzar cierre de carrito ni borrar datos.
2. Revisar cambios nuevos en `main` antes de integrar esta rama.
3. Publicar primero estas reglas: `npx firebase deploy --only firestore:rules --project los-panitas-by-nechy`.
4. Integrar la rama y publicar Hosting + descargas verificadas. El workflow de Hosting no publica reglas; no omitir el paso anterior.
5. Comprobar Hosting con `node tools/verify-hosting-release.mjs` y revisar la versión pública de descargas.
6. Desde «Mis terminales», solicitar actualización al quedar libre. Confirmar `installedVersionCode: 47` y señal reciente. Una descarga o solicitud aceptada no prueba que se haya instalado.
7. Android puede pedir aceptación presencial si la ELO no está administrada. Validar una operación real supervisada y su ticket sin crear ventas ficticias en producción.

Si una mesa antigua tiene un total calculado con la fórmula anterior de descuentos combinados, el sistema pedirá cargarla y guardar sus cambios antes de cobrar. No se modifican facturas históricas ni se recalculan ventas emitidas.

## Recuperación y límites

- El tag conserva código y configuración anteriores, no es un respaldo de Firestore. Esta revisión no borra ni migra datos comerciales.
- Para revertir una publicación, usar un checkout separado del tag y republicar su Hosting/reglas cuando corresponda. Si una APK 47 ya se instaló, preparar el código anterior con un `versionCode` superior y la misma firma; Android no debe resolverse desinstalando la app ni forzando un downgrade.
- No se ha probado esta candidata en el hardware físico. Impresión, gaveta, conectividad del local y aceptación de instalación siguen requiriendo confirmación de la terminal.
- Las pruebas cubren fallos reproducibles, no certifican ausencia absoluta de errores. La configuración Spark continúa sin backend de confianza para recalcular cada línea financiera; no se afirma protección completa frente a clientes modificados maliciosamente.
- No se incluyó ni modificó el trabajo ajeno de `services/` ni los paquetes históricos no rastreados.

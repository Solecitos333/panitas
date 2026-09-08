# Facturas térmicas — validación de formato

## Corrección de papel sobrante — 2026-09-07, código 19

El usuario confirmó que la ausencia de impresión era un problema físico ya resuelto. La nueva fotografía muestra contenido legible y una cola de papel blanco muy larga. Esto sustituye la hipótesis anterior sobre la ausencia de tinta; no equivale a validar el corte.

En el código revisado, P0/E0 se enviaban antes de entrar al modo raster y se añadía `ESC d 2` después de salir. Según el protocolo, entrar reinicia P/E/F y E0 restaura valores predeterminados, no desactiva el corte. La versión 19 configura **A → P0 → E1 → F13**, envía únicamente las filas del bitmap, ejecuta **FF → B** y elimina el segundo avance/corte. El comando de reinicio R tampoco lleva un parámetro NUL. Se conserva el logo y la maquetación existente.

La altura es la del contenido, no una hoja fija. Queda únicamente el margen gráfico inferior y el avance mecánico necesario para que la cuchilla no alcance el texto.

Pruebas de esta revisión: 65 unitarias aprobadas, 13 fuentes Android compiladas, paquete firmado y validación de release aprobados. El proceso aislado en ELO-PP3-15 / Android 8.1 aprobó 11 formatos y la codificación de píxeles, umbral, alfa y pulso opcional. Los bitmaps dejan 11–16 puntos blancos inferiores (aproximadamente 1,4–2 mm a 203 dpi). Añadir diez líneas vacías finales no aumenta la altura. Se comprueban el orden de configuración y la ausencia de avance adicional en el flujo de impresión.

Evidencia: `test-results/receipt-review/20260907-005506-05166133/report.json` y PNG contiguos. Estas pruebas no imprimen ni crean ventas. La aceptación del margen y corte físico requiere observar el ticket de la nueva versión en la terminal.

Se respaldó la APK anterior en `backups/terminal/panitas-before-paper-fix-code18.apk` y se instaló el código 19 mediante actualización, sin desinstalar ni borrar datos. Android confirmó `1.4.0-rc.12`, código 19, y la aplicación conservó la sesión. El 7 de septiembre a las 01:01:03 (hora de la terminal), el botón de prueba envió un único ticket no fiscal de 48 561 bytes; no creó factura, pago ni apertura de gaveta. El log USB confirma la transferencia, **no el resultado físico**. Se solicitó una fotografía del papel completo al usuario para aceptar el corte.

Referencia: [Star Graphic Mode, revisión 2.31, páginas 25–29 y 34](https://www.starasia.com/Download/Manual/star_graphic_cm_en.pdf).

## Corrección del resultado anterior

El usuario confirmó que la versión 17 cortaba papel sin contenido. Las pruebas de bitmap y la transferencia USB descritas más abajo **no validaron la impresión física**. No debe usarse ese informe como aceptación del hardware.

Durante las pruebas de la versión 18 se ensayó entrada raster/P0/EOT1 y un **FF13 explícito antes de salir**, comparado con bytes generados mediante la API pública de StarIO_Extension 1.17.1, emulación StarGraphic. El SDK solo se usó para el diagnóstico; no se ha incorporado al producto. Posteriormente se modificó esa secuencia en el directorio compartido: este informe histórico no describe todos los paquetes recompilados con código 18. La corrección identificable de papel sobrante es el código 19 descrito arriba.

También incluye la interfaz compilada en `assets/www` de la APK. Se sirve bajo el mismo origen HTTPS para conservar la autenticación e IndexedDB de Firebase, sin ejecutar código remoto mezclado con el paquete. Actualizar esta interfaz requiere una nueva APK firmada; Firebase y los instaladores permanecen en red. Las operaciones financieras no se convierten en ventas offline.

Las fuentes de la terminal son locales, los botones no encogen al pulsarlos y el POS ya no se reconstruye por cambios de auditoría, usuarios o pagos que no afectan al catálogo. Se conservan las actualizaciones de productos, mesas, clientes y sesiones de caja. No se alteraron reglas de Firebase como parte de este ajuste.

Validación adicional: 64 pruebas unitarias, compilación Android y comprobación de que la APK contiene todas las referencias de la interfaz, sin rutas Windows, instaladores anidados, archivos de entorno o fuentes remotas. El log de la ELO confirmó `Interfaz servida desde assets de la APK` y la sesión existente se conservó después de instalar el código 18.

## Informe histórico de versión 17 (no aceptación física)

Fecha: 2026-09-06. Aplicación nativa 1.4.0-rc.10, código 17.

## Cambios

- `ReceiptRenderer` mide cada línea con la misma fuente que utiliza al dibujarla. El ancho de los importes se reserva antes de envolver la descripción; un importe excepcionalmente largo pasa a una línea independiente.
- Papel de 80 mm, área gráfica de 576 puntos, márgenes laterales de 12 puntos. No se impone una altura de página. Los blancos finales se eliminan y los huecos repetidos se compactan.
- Logo térmico dedicado sin escalado automático por densidad de Android, limitado a 300 × 112 puntos conservando su proporción.
- Los generadores conservan nombres y notas completos, y separan las columnas sin rellenos de longitud fija. Los datos libres no pueden introducir etiquetas ni comandos de impresión.
- Star Raster utiliza página continua P0 y EOT13. Salir con `ESC * r B` ejecuta el único avance hasta la cuchilla y corte parcial. No se añade un segundo `ESC d` al terminar.
- El raster se convierte por filas para reducir memoria temporal y el bitmap de impresión se libera al finalizar.

Referencia del protocolo: [Star Graphic Mode, revisión 2.31, páginas 25–29](https://www.starasia.com/Download/Manual/star_graphic_cm_en.pdf).

## Pruebas repetibles

```powershell
npm test
npm run test:android
npm run validate:release
./tools/tests/test-receipt-renderer-android.ps1 -Serial 10.0.0.105:5555
```

La última prueba requiere ADB autorizado. Ejecuta Canvas en un proceso de prueba aislado dentro de Android: no instala ni reinicia la aplicación, no imprime y no altera datos comerciales. Guarda PNG y un informe en `test-results/receipt-review/`.

Resultados comprobados: 62 pruebas unitarias aprobadas; 12 fuentes Java compiladas; ZIP y APK firmados e íntegros; 11 casos gráficos aprobados en ELO-PP3-15 / Android 8.1.0. Se verifican el flujo raster byte por byte y el pulso opcional de gaveta sin enviar bytes a hardware.

Casos gráficos: factura corta, 24 productos, palabras sin espacios, importes grandes, líneas vacías, sin logo y documentos generados por los constructores reales (factura, factura larga, precuenta, cocina y cierre). Diez líneas vacías adicionales al final aumentan la altura en cero puntos. El blanco inferior de los bitmaps es de 12–16 puntos, sin incluir el avance mecánico necesario hasta la cuchilla.

## Comprobación de la aplicación instalada

Se comprobó por ADB que la terminal tiene el código 17 y que el SHA-256 de su APK coincide con el APK local firmado. No fue necesario reinstalar ni borrar datos.

Desde **Terminal ELO → Imprimir ticket** se envió una sola prueba el 6 de septiembre a las 18:40:15 (hora de la terminal). El controlador confirmó el envío USB de 44 508 bytes y la pantalla conservó el estado de impresora conectada. Esta acción no crea una venta ni solicita apertura de gaveta.

La transferencia USB no demuestra por sí sola la calidad del papel: falta confirmación visual del usuario sobre impresión, corte único y margen físico. No se debe declarar validado ese resultado hasta ver el ticket. No repetir una venta para probar la impresora; utilizar el botón de prueba.

## Alcance y convivencia

Esta revisión cubre el formato térmico y su transporte a la impresora. No certifica la totalidad del sistema ni las funciones que otro agente está modificando. Se preservaron sus cambios; no se realizó un despliegue general ni se reinició la terminal durante esta verificación.

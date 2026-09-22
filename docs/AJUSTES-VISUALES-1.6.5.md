# Ajustes visuales 1.6.5 (45)

Preparados en `polish/layout-spacing-20260922`. **No publicar en main ni Hosting mientras la terminal esté en uso sin coordinar la instalación.** El actualizador instalado consulta automáticamente el manifiesto de producción, incluso si no se envía una orden desde Mis terminales.

Respaldo: `backup-before-layout-20260922`.

## Alcance

Solo se cambia CSS de pantalla, además de la numeración del paquete y pruebas/documentación. No se modifican eventos, orden DOM, cálculos, pagos, PIN, datos, reglas Firestore, protocolos de impresión/gaveta ni el actualizador.

- Cabeceras y acciones pueden crecer y pasar a otra línea conservando su orden.
- Destinos de venta y métodos de pago no se comprimen ni invaden controles vecinos.
- Etiquetas e importes tienen separación, incluido el subtotal de una cuenta vacía.
- Existencias y precio en tarjetas se acomodan sin chocar.
- Carrito adaptado a la altura disponible; comprobante y acciones no se encogen dentro del área de contenido.
- El catálogo vacío ya no muestra a la vez el aviso de búsqueda sin resultados.
- Se conservan estilos de impresión: las correcciones están dentro de `@media screen`.

## Comprobación local

Pruebas de navegador con MemoryDataService (`?role=owner`), sin conexión comercial a Firebase: producto de prueba, carrito con importe, selector de mesas, teclado táctil y formulario. Tamaños revisados: 1024×768, 1280×800, 1920×1080 y 390×844. No hubo operación sobre la terminal física. Tras completarse la adaptación del viewport no se observaron desbordamientos horizontales ni recortes en los controles del carrito examinados.

También se revisaron Productos, Clientes, Caja, Reportes y Facturación a 1024×768: sin desbordamiento horizontal ni botones `.button` recortados en los estados examinados. Consola de navegador sin errores. Pasaron 232 pruebas unitarias, 38 pruebas de reglas/transacciones, compilación de 13 fuentes Java y validación de firma/integridad del paquete. Se conserva el arreglo de delivery `4fec1a7` como base; no se revierte ese cambio ajeno a esta revisión.

## Publicación cuando cierre la jornada

1. Confirmar que no están operando en la terminal.
2. Comparar main con esta rama por si se incorporaron nuevos cambios; no sobrescribirlos. Si ya hay otra versión de código 45 o superior, asignar un código nuevo y recompilar con la firma original.
3. Repetir validación de paquete y pruebas; integrar la rama y desplegar Hosting por el flujo habitual. No hay cambios de reglas que desplegar.
4. Confirmar integridad del Hosting. La instalación seguirá las protecciones existentes; no forzar reinicios ni abrir periféricos.
5. Comprobar la versión instalada desde Mis terminales tras la primera señal del equipo actualizado.

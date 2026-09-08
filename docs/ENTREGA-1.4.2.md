# Actualización 1.4.2 · ELO código 22

## Alcance

Optimización conservadora de la interfaz. No cambia autenticación, PIN, reglas,
transacciones, inventario, pagos ni comandos nativos de impresión/gaveta.

- Iconos: la versión instalada de Lucide ignora `rootNode` en `createIcons`.
  Antes se reemplazaban los SVG de todo el documento al refrescar una región.
  Ahora solo se convierten los nuevos marcadores de esa región, reutilizando
  plantillas y conservando los iconos ya dibujados.
- Teclado: cada campo numérico recibe sus manejadores una sola vez; eliminada
  una pasada duplicada durante el montaje del contenido.
- Importes/fechas: se reutilizan los formateadores, sin cambiar redondeo,
  monedas ni zona horaria dominicana. Caché de monedas limitada a 16 entradas.
- La terminal no genera el panel móvil oculto ni sus formularios de inventario.
  La versión web/móvil conserva ese panel.
- Sin desenfoques en modales/teclado de la ELO; tocar la sección ya seleccionada
  no la reconstruye ni reinicia los controles.

No se han recortado consultas históricas de Firebase: hacerlo sin adaptar los
reportes y la paginación podría dejar totales incompletos.

## Verificación

Pruebas automatizadas añadidas para alcance/caché de iconos, eventos numéricos
únicos, panel móvil y equivalencia de formatos. Revisión de navegación y teclado
en navegador local con servicio en memoria, sin ventas de producción.

Validación completada: 101 pruebas unitarias, 31 pruebas de reglas/transacciones
en Firestore Emulator, 13 fuentes Java compiladas, build web y verificación de
integridad y firma del APK código 22. La llave coincide con la versión anterior.

`node tools/benchmark-ui-formatting.mjs` compara la creación repetida de
formateadores con su reutilización. Es una microprueba local; **no demuestra un
tiempo de respuesta concreto en la ELO**. No se ha tenido acceso físico a ella.

## Instalación y comprobación en el local

1. Conectar la terminal a Internet y buscar la actualización desde Configuración.
2. Dejarla sin venta en curso y aceptar la instalación si Android lo solicita.
3. Confirmar **1.4.2 / código 22**. No desinstalar ni borrar datos.
4. Conservar el acceso personal de NECHY y su PIN.
5. Cambiar entre POS, Mesas, Caja y Resumen; comprobar que los controles responden
   y que una pulsación en un importe abre un solo teclado.
6. Comprobar impresión y gaveta en la siguiente operación supervisada; no se
   ha simulado una validación física desde esta computadora.

La versión de la web no confirma que el APK de la terminal se haya actualizado.
La APK incorpora su propia interfaz y necesita instalar la actualización.

## Recuperación

Tag local previo: `backup/pre-ui-performance-1.4.2`. Se conserva el instalador de
1.4.1. Android no admite bajar el código instalado normalmente: si se requiere
revertir, preparar la fuente anterior con un código superior, la misma firma y
las reglas compatibles. Nunca desinstalar para forzar una recuperación.

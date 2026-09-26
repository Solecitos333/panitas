# Rendimiento de la terminal — 1.6.8 (código 48)

## Alcance

Optimización conservadora de la aplicación existente. No cambia el orden de las
pantallas, permisos, PIN, reglas Firestore, formato de tickets ni transacciones.
No elimina ni limita registros históricos. No crea datos de prueba en producción.

Punto de restauración de código: `backup-before-terminal-performance-20260925`
(commit `cc3d42f`). Los cambios se prepararon en `perf/terminal-responsiveness-1.6.8`.

## Cambios

- Las suscripciones Firestore deserializan únicamente documentos añadidos o
  modificados. Conservan la colección completa, su orden, eliminaciones y una
  nueva lista en cada notificación. El arranque sigue leyendo la colección completa.
- La búsqueda y el directorio reutilizan el índice de clientes durante la sesión.
  Se reconstruye al recibir nuevas listas de clientes o facturas, incluidos pagos
  y anulaciones. No se almacena en disco ni se comparte entre usuarios.
- Cada fecha del historial de clientes se convierte una vez al construir el índice,
  en vez de volver a convertirla durante cada comparación del ordenamiento.
- Las notificaciones se agrupan por cuadro. Durante reposo o con la aplicación
  oculta, no reconstruyen el DOM; al volver se pinta el estado más reciente,
  respetando formularios en edición. La sincronización y telemetría siguen activas.
- Las consultas periódicas a los periféricos se omiten mientras la pantalla está
  oculta o en reposo. Se mantienen las comprobaciones manuales y la protección
  durante cobros; al volver se retoma el intervalo de ocho segundos.
- Al añadir o quitar un producto se calcula el total una vez para importes,
  devuelta, botón y visor. La confirmación y la transacción siguen recalculándolo
  independientemente. El visor ahora también respeta descuentos/propinas.
- El autocompletado solo dibuja sus nuevos iconos, no todos los iconos de la página.
- Android: el visor tiene un ejecutor separado de impresión/gaveta. Conserva como
  máximo el mensaje en curso y el último pendiente. Los textos visuales obsoletos
  se reemplazan; **nunca se descartan tickets, pulsos de gaveta ni operaciones**.

## Evidencia reproducible

`npm run benchmark:terminal`: 10.000 facturas sintéticas, 200 clientes, 30 repeticiones.
Una ejecución local dio:

| Trabajo | Reprocesamiento completo | Optimizado |
| --- | ---: | ---: |
| Consultar historial de clientes 30 veces, índice ya construido | 702,75 ms | 0,14 ms |
| 30 notificaciones con un documento modificado | 377,27 ms | 9,53 ms |
| Documentos deserializados por esas notificaciones | 300.000 | 30 |

Son mediciones de CPU en Node en la PC de desarrollo, **no tiempos medidos en la
ELO ni una promesa de esa mejora porcentual para toda la aplicación**. La primera
construcción del índice no se incluye en el tiempo de reutilización. Permanecen
costes de carga inicial, ordenación, recorrido de listas y construcción de vistas.

## Validación

- 257 pruebas unitarias, incluyendo caché invalidada por abonos/anulaciones,
  orden e integridad de snapshots, formularios en edición, reposo y cierre de sesión.
- 56 pruebas con Firestore Emulator, incluida una suscripción real que recibe
  inserciones, cambios de precio/nombre/orden y eliminaciones.
- Compilación de 14 fuentes Java y prueba ejecutable de la cola nativa: ráfaga de
  1.000 mensajes, reemplazo durante ejecución, recuperación de errores y cierre.
- Navegador local con MemoryDataService: producto preparado de RD$50, incremento
  a dos unidades, regreso al POS después de visitar Clientes conservando RD$100,
  botón de cobro sin ticket y acceso al requisito de PIN. No se creó un PIN real
  ni se confirmó una venta de producción.
- Alta local de cliente: el directorio y el autocompletado del POS mostraron la
  nueva ficha después de haber consultado previamente el índice vacío.
- `npm run validate` completado: pruebas, Java, compilación web, comprobación de
  secretos y validación de ZIP/APK, versión 1.6.8 / 48 y firma original correctas.

## Publicación y comprobación en el local

La terminal utiliza recursos empaquetados: publicar únicamente la web **no**
reemplaza su interfaz local. Debe instalar la APK **1.6.8 / 48**.
La telemetría consultada el 25/09/2026 a las 22:56, hora dominicana, confirmó
**1.6.7 / 47**, con señal de 16 segundos antes y sin operación en curso.
Eso es una observación de ese momento, no una garantía permanente de conectividad.

Al reanudar el 26/09/2026 a las **08:37**, la terminal reportó **1.6.7 / 47**,
con señal recibida a las **08:36:47** y `busy: true`. La publicación se aplazó:
**esta entrega está preparada, pero no publicada ni instalada en la terminal**.
No se envió ningún comando de instalación o reinicio. La rama de rendimiento
puede subirse a GitHub sin desplegar: el flujo de producción solo se activa con
un push a `main`. No se programó una automatización de despliegue.

Publicar fuera de 07:00–16:00 y mantener los bloqueos de carrito, PIN, formulario,
cobro e impresión. Android puede requerir aceptar la instalación en pantalla:
`fullyManaged` es falso. No confundir descarga ni `awaiting_confirmation` con
instalación; confirmar un nuevo reporte con `installedVersionCode: 48`.

En la ELO verificar: navegación POS/Caja/Clientes; toques consecutivos de productos;
visor mostrando el último total; cobro, una impresión y una apertura de gaveta;
reposo y retorno sin pérdida de carrito. La prueba física queda pendiente de acceso
o confirmación del operador; el navegador no certifica periféricos ni fluidez real.

Para revertir, reconstruir el código del tag con un **código Android superior** al
instalado y la misma firma. No desinstalar la app ni borrar datos para bajar versión.
Restaurar solo Hosting no revierte una APK ya instalada.

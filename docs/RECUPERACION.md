# Recuperación

## Código

Los releases aprobados deben llevar tags. Para revisar un punto estable, crea una rama desde el tag; no reescribas `main` ni uses un reset destructivo sobre trabajo no guardado.

## Firestore

En Spark no hay exportación administrada ni respaldo programado. La recuperación se limita al historial inmutable de la aplicación y a correcciones administrativas. Tras aprobar el producto, activa Blaze, presupuesto y alertas; luego configura exportaciones programadas a un bucket con retención.

## Incidente operativo

1. Cierra el acceso afectado desactivando `users/{uid}.active`.
2. Conserva pagos, eventos, auditorías y facturas; no los borres.
3. Documenta hora, usuario, órdenes y documentos afectados.
4. Corrige reglas o aplicación en una rama y valida en un canal preview.
5. Despliega, realiza smoke test y registra un tag.

El proyecto anterior de Futunet conserva el tag `pre-panitas-separation-2026-06-30`; solo se usará como referencia de emergencia y no como backend del nuevo producto.

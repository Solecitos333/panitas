# Arquitectura

La aplicación es un SPA de Vite y JavaScript que usa el SDK modular de Firebase. Tiene cuatro capas:

1. `domain`: cálculos puros, transiciones, permisos y formatos fiscales.
2. `services`: persistencia transaccional en Firestore y simulador local.
3. `modules`: vistas de operación, directorios, facturación y administración.
4. `ui`: sesión, navegación, eventos, accesibilidad y estados de error.

Firebase Authentication resuelve identidad; `users/{uid}` aporta rol y estado. Las reglas validan ambos. Firestore mantiene sincronización en vivo y persistencia local; las operaciones sensibles usan transacciones para evitar dobles cobros, secuencias repetidas o dos comandas activas en la misma mesa.

Los importes se guardan como centavos enteros. Los productos de una orden son una instantánea comercial: conservan nombre, precio e impuesto aunque luego cambie el catálogo.

No hay dependencia de Futunet o Creaticos. Sus proyectos, sesiones, colecciones y despliegues no se consultan.

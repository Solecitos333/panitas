# Seguridad

No publiques vulnerabilidades en issues. Repórtalas de forma privada al propietario del repositorio incluyendo impacto, pasos de reproducción y evidencia mínima.

El repositorio no debe contener `.env`, tokens, cuentas, respaldos, llaves de servicio ni archivos de credenciales. Las credenciales de CI/CD viven únicamente en GitHub Secrets.

Principios vigentes:

- acceso solo con correo verificado, perfil activo y rol asignado;
- mínimo privilegio en interfaz y reglas Firestore;
- pagos, eventos y auditorías inmutables;
- facturas anulables, nunca eliminables;
- elevación del propio rol bloqueada;
- CSP, encabezados defensivos y detección de secretos en el build.

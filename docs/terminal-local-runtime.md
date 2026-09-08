# Interfaz local de la terminal

La APK incluye HTML, CSS, JavaScript, Firebase SDK y logos compilados en `assets/www`. `BundledWebApp` sirve esos archivos bajo el origen HTTPS existente; no crea un servidor accesible desde la red. Se conservan la autenticación y el almacenamiento de Firebase del dispositivo.

Firestore/Auth y `/downloads/` siguen usando Internet. Tener la interfaz local no autoriza cobros offline: una transacción debe confirmarse en Firebase antes de mostrarse como guardada. Si falta un archivo de la interfaz, se devuelve un error; no se mezcla el paquete firmado con código web de otra versión.

## Integración con otros cambios del proyecto

- Un despliegue de Hosting actualiza los navegadores, **no la interfaz empaquetada de la terminal**.
- Para actualizar la terminal, subir el código de versión en `release.json`, mantener las versiones de package/lock coherentes y ejecutar `tools/build-apk.ps1` con la llave original. El script compila la web, la empaqueta y firma el APK.
- `npm run validate:release` comprueba firma, hashes, referencias de assets, versión de la interfaz y ausencia de archivos no permitidos.
- Publicar los ZIP/manifiesto generados permite que el actualizador existente detecte la nueva APK. No reutilizar el código de una versión publicada.
- Coordinar instalaciones y pruebas físicas: dos agentes no deben pulsar botones o reinstalar la misma terminal simultáneamente. El código de otras funciones puede desarrollarse en paralelo.
- No desinstalar ni borrar los datos para actualizar. Se conserva un respaldo del APK anterior en `backups/terminal/`, excluido de Git.

## Verificación

El código 18 se instaló en la ELO el 2026-09-06 a las 19:04. Se observó la sesión existente y el log `EloLocalShell: Interfaz servida desde assets de la APK`.

Las pruebas en Android verifican las rutas locales, los rechazos de traversal, el contenido real del APK y las exclusiones de red, sin tocar datos comerciales. Se ejecutan junto con las pruebas de raster mediante `tools/tests/test-receipt-renderer-android.ps1`.

El resultado físico de la impresión sigue pendiente de confirmación del operador. Un envío USB correcto o un bitmap legible **no demuestra que el papel haya salido impreso**. Usar una sola impresión de prueba y comprobar texto, logo, margen y corte; nunca crear una venta para hacer esta prueba.

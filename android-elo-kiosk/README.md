# Los Panitas POS - Aplicación Nativa para Terminal ELO (Android 8.1.0)

Esta aplicación es el contenedor Kiosk nativo para la terminal **Elo PayPoint Plus 15" (Elo-PP3-15)**.

## Características
* **Modo Kiosco Inmersivo:** Pantalla completa sin barra de navegación ni botones del sistema.
* **Controlador USB Directo:** Conexión nativa con la impresora térmica de 80mm y la gaveta de dinero.
* **Puente de hardware integrado:** Diseñado para operar sin aplicaciones intermediarias cuando la impresora y la gaveta ELO son reconocidas por el controlador incluido.
* **Operaciones en cola:** La impresión y la gaveta se ejecutan fuera del hilo visual para que el cobro no congele la pantalla.
* **Puente protegido:** Los comandos locales requieren el origen oficial y un token efímero generado por la APK.
* **Actualización segura:** Busca una versión nueva al arrancar y cada seis horas, descarga sin bloquear periféricos y verifica tamaño, hashes, paquete, versión y firma antes de instalar.
* **Protección del trabajo:** Si existe un carrito, PIN, cobro, impresión o formulario modificado, conserva la actualización lista y espera a que finalice la operación.

## Instalación en la Terminal ELO
1. Copia el archivo `LosPanitas-Elo-POS.apk` a una memoria USB.
2. Conecta la memoria USB a la terminal ELO.
3. Abre el explorador de archivos de Android y presiona sobre `LosPanitas-Elo-POS.apk`.
4. Selecciona **Instalar**.
5. Al abrir la app, cuando aparezca el diálogo solicitando permiso para acceder a la impresora USB, marca **Permitir siempre** y presiona **Aceptar**.

La versión `1.4.0-rc.4` (código 11) es la versión puente que incorpora el actualizador. Si la terminal todavía tiene el código 10, este paso manual debe realizarse una sola vez.

## Actualizaciones posteriores

1. La app consulta exclusivamente `https://los-panitas-by-nechy.web.app/downloads/update.json`.
2. Si encuentra un código superior, descarga y verifica el paquete en segundo plano.
3. Espera a que la interfaz esté libre, sin ventas ni cambios pendientes. Una cancelación de Android permite volver a trabajar y reintentar desde Configuración.
4. En Android estándar, la primera actualización puede abrir **Permitir desde esta fuente** y Android puede pedir confirmación de instalación.
5. En una terminal aprovisionada como dispositivo totalmente administrado, `PackageInstaller` puede completar la actualización silenciosamente.

No cambies el `packageName` ni la llave de firma. Una reversión se publica recompilando el código anterior con un `versionCode` nuevo y superior; Android no admite bajar el código instalado.

## Compilación y firma

Ejecuta `tools/build-apk.ps1` desde PowerShell. El script descubre el repositorio, Java y Android SDK sin depender del nombre del usuario de Windows. Antes de compilar, define `PANITAS_KEYSTORE_PASSWORD` y, si difiere, `PANITAS_KEY_PASSWORD`; opcionalmente define `PANITAS_KEY_ALIAS`.

`release.json` define versión, código, canal y notas; sincroniza también la versión del paquete npm. El script genera el APK, el ZIP versionado, `update.json` y `SHA256SUMS.txt` como un conjunto coherente.

La carpeta `android-elo-kiosk/signing/` nunca se publica en Git. Conserva la llave `los-panitas-pos.keystore` y su contraseña en un respaldo cifrado: Android exige la misma firma para instalar futuras actualizaciones sobre la aplicación existente.

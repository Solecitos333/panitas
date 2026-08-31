# Los Panitas POS - Aplicación Nativa para Terminal ELO (Android 8.1.0)

Esta aplicación es el contenedor Kiosk nativo para la terminal **Elo PayPoint Plus 15" (Elo-PP3-15)**.

## Características
* **Modo Kiosco Inmersivo:** Pantalla completa sin barra de navegación ni botones del sistema.
* **Controlador USB Directo:** Conexión nativa con la impresora térmica de 80mm y la gaveta de dinero.
* **Puente de hardware integrado:** Diseñado para operar sin aplicaciones intermediarias cuando la impresora y la gaveta ELO son reconocidas por el controlador incluido.
* **Operaciones en cola:** La impresión y la gaveta se ejecutan fuera del hilo visual para que el cobro no congele la pantalla.
* **Puente protegido:** Los comandos locales requieren el origen oficial y un token efímero generado por la APK.

## Instalación en la Terminal ELO
1. Copia el archivo `LosPanitas-Elo-POS.apk` a una memoria USB.
2. Conecta la memoria USB a la terminal ELO.
3. Abre el explorador de archivos de Android y presiona sobre `LosPanitas-Elo-POS.apk`.
4. Selecciona **Instalar**.
5. Al abrir la app, cuando aparezca el diálogo solicitando permiso para acceder a la impresora USB, marca **Permitir siempre** y presiona **Aceptar**.

## Compilación y firma

Ejecuta `tools/build-apk.ps1` desde PowerShell. El script descubre el repositorio, Java y Android SDK sin depender del nombre del usuario de Windows. Antes de compilar, define `PANITAS_KEYSTORE_PASSWORD` y, si difiere, `PANITAS_KEY_PASSWORD`; opcionalmente define `PANITAS_KEY_ALIAS`.

La carpeta `android-elo-kiosk/signing/` nunca se publica en Git. Conserva la llave `los-panitas-pos.keystore` y su contraseña en un respaldo cifrado: Android exige la misma firma para instalar futuras actualizaciones sobre la aplicación existente.

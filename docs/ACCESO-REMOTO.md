# Soporte de la ELO desde otras redes

Estado al 5 de septiembre de 2026: conexión local ADB confirmada con la ELO Android 8.1. Se está preparando la red privada; el acceso desde otra red todavía requiere vinculación de cuenta y prueba externa.

## Actualizaciones y soporte

La APK código 11 incorpora actualización por Firebase Hosting: las siguientes entregas no requieren una conexión entrante ni que la computadora del desarrollador permanezca encendida. La primera instalación del código 11 sobre el código 10 es manual.

Para inspeccionar la terminal, diagnosticar periféricos y realizar soporte fuera del local, se propone una red privada Tailscale entre la ELO y la computadora autorizada. Tailscale admite Android 8.0 o superior. Fuentes oficiales: [Android](https://tailscale.com/docs/install/android), [Windows](https://tailscale.com/docs/install/windows).

## Preparación presencial

1. Confirmar la IP y el puerto ADB actuales; si la depuración por red no está habilitada, conectar por USB y autorizar la llave de esta computadora en Android.
2. Comprobar modelo, versión Android y versión de Los Panitas antes de instalar nada.
3. Revisar si ya existe una herramienta de soporte para conservar la configuración autorizada.
4. Instalar Tailscale desde su distribución oficial en ambos equipos y vincularlos a la cuenta del propietario. El inicio de sesión y la autorización VPN requieren su participación.
5. Limitar el acceso a la terminal y al puerto de soporte desde los equipos autorizados. No reenviar ADB, impresora ni gaveta mediante puertos públicos del router.
6. Comprobar que la VPN no modifica la salida a Internet necesaria para Firebase. No activar un nodo de salida ni bloquear todo el tráfico fuera de la VPN para este uso.
7. Revisar el inicio automático y las restricciones de batería de Android; activar VPN permanente solo si el dispositivo y la versión instalada lo admiten y mantienen la conectividad del POS.

## Validación

Conservar ADB con autenticación de la computadora. Android 8.1 puede necesitar una conexión USB inicial y habilitar ADB TCP con `adb tcpip 5555`; la persistencia tras reiniciar depende del firmware ELO. Referencia: [Android Debug Bridge](https://developer.android.com/tools/adb).

Desde una red externa, usar la IP privada asignada por Tailscale:

```text
adb connect <IP-TAILSCALE-ELO>:<PUERTO-ADB>
adb -s <IP-TAILSCALE-ELO>:<PUERTO-ADB> shell getprop ro.product.model
```

La aceptación requiere comprobar conexión desde otra red, reinicio de la terminal, reapertura de la app y operación normal de Internet/periféricos. Tener conexión VPN por sí solo no demuestra que ADB siga disponible después de reiniciar.

No guardar contraseñas, claves de inscripción, llaves ADB ni credenciales VPN en este repositorio. Para retirar el acceso, revocar el dispositivo de soporte en Tailscale y su autorización de depuración en Android.

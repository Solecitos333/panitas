# Guía de Puesta en Marcha: Terminal ELO PayPoint Plus 15" (Android 8.1.0)

Esta guía describe el procedimiento para configurar la terminal All-in-One **Elo PayPoint Plus 15" (Modelo Elo-PP3-15 con Android 8.1.0)** para operar mediante la integración nativa de **Los Panitas by Nechy**.

---

## 0. ¿Hace falta IP para operar?

No. Para vender, facturar, imprimir y abrir caja, el sistema se conecta a la URL pública `https://los-panitas-by-nechy.web.app` y al puente local de hardware dentro de la propia terminal.

La IP solo se necesita para soporte técnico avanzado, por ejemplo ADB, revisión remota de red, diagnóstico de un servidor local del APK o configuración de una impresora externa en la misma red. No compartas contraseñas, llaves ni datos sensibles en chats; si hace falta soporte remoto, usa una sesión controlada y temporal.

---

## 1. Periféricos Integrados en la Elo-PP3-15

* **Impresora Térmica:** 3 pulgadas (80 mm) de alta velocidad con cortador automático de papel (conectada internamente por USB).
* **Gaveta de Dinero:** Motorizada con sensor y cerradura de 3 posiciones (accionada por pulso de solenoide ESC/POS vía pin 2).
* **Pantalla Táctil:** 15.6 pulgadas Full HD (1920x1080) antirreflejo.
* **Lector de Código de Barras 2D:** Integrado para lectura de productos.

---

## 2. Configuración alternativa con RawBT

La APK nativa ya incluye el controlador recomendado. RawBT solo es un respaldo para la PWA abierta directamente en Chrome y no debe instalarse si la APK nativa imprime y abre la gaveta correctamente.

### Paso 2.1: Instalar RawBT Print Service en Android 8.1
1. En la terminal ELO, abre **Google Play Store** (o transfiere el APK de RawBT vía USB).
2. Instala **RawBT Print Service** (Driver para impresoras térmicas ESC/POS).

### Paso 2.2: Conectar la Impresora Interna en RawBT
1. Abre la aplicación **RawBT**.
2. Ve a **Configuración** → **Conexión de la impresora**.
3. Selecciona **USB**. RawBT detectará automáticamente la controladora de la impresora interna de la Elo PayPoint.
4. En **Modelo de impresora**, selecciona **ESC/POS Estándar** o **Star PRNT**.
5. En **Ancho de papel**, selecciona **80 mm (48 columnas)**.
6. En **Opciones de corte**, activa **Cortar papel después de imprimir**.
7. En **Cajón de dinero (Gaveta)**, activa **Abrir cajón de dinero al imprimir (Pin 2 / ESC p 0 25 250)**.

### Paso 2.3: Activar el Servidor WebSocket Local
1. Dentro de RawBT, ve a **Avanzado** / **Servicios Web**.
2. Activa la casilla **Servidor WebSocket Local** (puerto predeterminado `40213`).
3. Guarda los cambios. ¡Listo! A partir de este momento, **Los Panitas** se comunicará directamente con el hardware en segundo plano.

---

## 3. Configuración en la Web App (Los Panitas POS)

1. Inicia sesión con rol de **Propietario** (`owner`).
2. Ingresa al menú **Configuración**.
3. En la sección **Terminal ELO PayPoint y Hardware POS**:
   - **Controlador de Impresora:** `Automático (RawBT ESC/POS / Android)`.
   - **Ancho de Papel:** `80 mm / 3 pulgadas`.
   - **Abrir gaveta automáticamente:** Activar (abre la caja al cobrar en efectivo).
   - **Imprimir ticket automáticamente:** Opcional (imprime el recibo al cerrar la venta).
   - **Imprimir comanda automáticamente:** Opcional (imprime el ticket de cocina al enviar orden).
4. Haz clic en **Probar apertura de gaveta** para verificar el pulso del solenoide.
5. Haz clic en **Probar ticket de prueba** para verificar la alineación térmica y el auto-cutter.
6. Presiona **Guardar configuración**.

---

## 4. Opciones de Ejecución en Android 8.1

### Opción A: App Nativa ELO Kiosk (Recomendada)
El proyecto incluye el código de la aplicación nativa Android en la carpeta `android-elo-kiosk/`:
* **Modo Kiosco Inmersivo:** Oculta barras de navegación de Android y mantiene la pantalla siempre encendida.
* **Controlador USB Directo:** conecta la impresora de 80 mm y la gaveta sin aplicaciones de terceros. El puente local solo acepta órdenes autenticadas desde la aplicación oficial.
* **Impresión rasterizada:** facturas, pre-cuentas, comandas y cortes se preparan para la impresora Star con formato legible y logo optimizado.
* **Cola de periféricos:** la venta se guarda primero; después la gaveta y la impresión se ejecutan de forma independiente para que un fallo de papel no pierda el cobro.
* **Actualizaciones verificadas:** la APK consulta el Hosting oficial al iniciar y cada seis horas; si la consulta falla, reintenta quince minutos después. Descarga en una cola separada, verifica hashes, paquete, versión y firma, y espera si existen ventas, impresiones o formularios sin guardar.

#### Primera instalación del actualizador

La APK código 10 no puede actualizarse a sí misma porque todavía no contiene esta función. Instala manualmente `v1.4.0-rc.4` (código 11) una vez desde **Configuración → Recuperación e instalación manual**. A partir del código 11, la aplicación detecta las siguientes versiones automáticamente.

En una terminal Android común, cuando exista una versión futura:

1. La descarga y la verificación son automáticas.
2. Android puede abrir una vez **Permitir desde esta fuente** para Los Panitas.
3. Activa el permiso y vuelve a la app.
4. Confirma el instalador oficial si Android lo solicita.
5. La app conserva caja y datos remotos; solo reemplaza su contenedor nativo.

Si cancelas el instalador, puedes seguir trabajando y volver a intentar desde **Configuración → Actualizaciones seguras**. El progreso de la descarga no borra los campos que estés editando. Las mejoras que solo afectan a la interfaz web se detectan sin reinstalar la APK y se aplican cuando no hay trabajo pendiente.

#### Instalación silenciosa opcional

Android 8.1 solo garantiza una instalación sin interacción cuando la app es administradora de un dispositivo totalmente gestionado. Esto requiere aprovisionar la ELO como equipo dedicado antes de ponerla en producción, normalmente después de un restablecimiento y sin cuentas configuradas:

```bash
adb shell dpm set-device-owner com.panitas.pos/.PanitasDeviceAdminReceiver
```

No ejecutes un restablecimiento en una terminal operativa sin respaldo y autorización del dueño. Si la ELO ya está configurada, conserva el modo estándar con la confirmación de Android; sigue siendo seguro y no afecta los datos.

### Opción B: Progressive Web App (PWA) con Chrome + RawBT
1. Abre Google Chrome en la ELO e ingresa a `https://los-panitas-by-nechy.web.app`.
2. Toca el menú de tres puntos de Chrome (`⋮`) y selecciona **Agregar a la pantalla principal** / **Instalar aplicación**.
3. Se creará el icono de **Los Panitas** en el escritorio de Android. Al abrirlo, correrá en pantalla completa comunicándose con RawBT en segundo plano.

### Opción C: Modo Kiosco con EloView o Fully Kiosk Browser
1. Si utilizas **EloView** (plataforma de gestión de Elo), asigna la URL `https://los-panitas-by-nechy.web.app` como aplicación web en modo Kiosk.
2. Si no usas EloView, puedes instalar **Fully Kiosk Browser** desde la Play Store:
   - Establece la URL de inicio: `https://los-panitas-by-nechy.web.app`.
   - Activa el modo Kiosk (bloqueo de botones de Inicio y Atrás).

---

## 5. Flujo de Trabajo Diario del Cajero

1. **Apertura de Turno:**
   - Recomendado: el cajero entra a **Caja**, digita el fondo inicial y presiona **Abrir caja**.
   - Si todavía no existe un turno, el primer cobro confirmado con PIN puede abrir una caja rápida con fondo RD$0.00; el sistema lo deja registrado.
   - La gaveta se abre automáticamente para colocar el dinero base.
2. **Venta Rápida en POS:**
   - Selecciona los productos tocando la pantalla.
   - En la sección de pago en efectivo, utiliza la botonera rápida (RD\$100, 200, 500, 1000, 2000 o Exacto).
   - El sistema calcula la **devuelta** en tiempo real.
   - Al presionar **Cobrar**, confirma su PIN personal de cuatro dígitos. La venta se registra una sola vez; en efectivo, la gaveta se acciona y el ticket se imprime como tareas separadas.
3. **Apertura Manual de Gaveta:**
   - Cada usuario debe configurar su **PIN de gaveta** desde **Cambiar contraseña → PIN de gaveta**.
   - Botón permanente **"Gaveta"** disponible en la barra superior para abrir el cajón cuando sea necesario.
   - La apertura queda auditada con usuario, fecha, hora y motivo.
4. **Cierre de Turno y Arqueo:**
   - El cajero cuenta el efectivo, ingresa el monto y presiona **Cerrar caja**.
   - Presiona **Imprimir arqueo** para emitir el ticket de cuadre con desglose por forma de pago (Efectivo, Tarjeta, Transferencia) y firma.

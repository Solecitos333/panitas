package com.panitas.pos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.HashMap;
import java.util.Map;

/**
 * Administrador de conexión USB nativa para la impresora térmica integrada
 * y el solenoide de la gaveta de dinero de la Elo PayPoint Plus 15".
 * Soporta detección automática de cualquier impresora con endpoint BULK_OUT.
 */
public class UsbPrinterManager {
    private static final String TAG = "EloUsbPrinter";
    private static final String ACTION_USB_PERMISSION = "com.panitas.pos.USB_PERMISSION";
    private static final int RECONNECT_DELAY_MS = 2000;
    private static final int TRANSFER_TIMEOUT_MS = 3000;

    private final Context context;
    private final UsbManager usbManager;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private UsbDevice printerDevice;
    private UsbEndpoint outEndpoint;
    private UsbEndpoint inEndpoint;
    private UsbDeviceConnection connection;
    private UsbInterface usbInterface;
    private boolean connectionRequested = false;
    private boolean paperOut = false;
    private boolean paperLow = false;
    private boolean coverOpen = false;
    private long lastPaperCheckTime = 0;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (UsbPrinterManager.this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        if (device != null) {
                            Log.i(TAG, "Permiso USB concedido para: " + device.getDeviceName());
                            connectDevice(device);
                        }
                    } else {
                        Log.w(TAG, "Permiso USB denegado. Reintentando en " + RECONNECT_DELAY_MS + "ms");
                        scheduleReconnect();
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                Log.i(TAG, "Dispositivo USB conectado.");
                findAndConnectPrinter();
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                Log.i(TAG, "Dispositivo USB desconectado.");
                close();
                scheduleReconnect();
            }
        }
    };

    public UsbPrinterManager(Context context) {
        this.context = context;
        this.usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        context.registerReceiver(usbReceiver, filter);

        findAndConnectPrinter();
    }

    public synchronized void findAndConnectPrinter() {
        if (usbManager == null) return;
        connectionRequested = true;

        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        if (deviceList.isEmpty()) {
            Log.w(TAG, "No se encontraron dispositivos USB. Reintentando...");
            scheduleReconnect();
            return;
        }

        UsbDevice bestDevice = null;
        int bestScore = -1;

        for (Map.Entry<String, UsbDevice> entry : deviceList.entrySet()) {
            UsbDevice device = entry.getValue();
            int score = getPrinterScore(device);
            Log.d(TAG, "Evaluando USB: " + device.getDeviceName()
                    + " VID=" + device.getVendorId()
                    + " PID=" + device.getProductId()
                    + " Score=" + score);

            if (score > bestScore) {
                bestScore = score;
                bestDevice = device;
            }
        }

        if (bestDevice != null && bestScore > 0) {
            printerDevice = bestDevice;
            Log.i(TAG, "Impresora seleccionada (Score " + bestScore + "): "
                    + bestDevice.getDeviceName() + " VID=" + bestDevice.getVendorId() + " PID=" + bestDevice.getProductId());
            if (!usbManager.hasPermission(bestDevice)) {
                Log.i(TAG, "Solicitando permiso USB para impresora: " + bestDevice.getDeviceName());
                PendingIntent permissionIntent = PendingIntent.getBroadcast(
                        context, 0,
                        new Intent(ACTION_USB_PERMISSION),
                        PendingIntent.FLAG_IMMUTABLE);
                usbManager.requestPermission(bestDevice, permissionIntent);
            } else {
                connectDevice(bestDevice);
            }
            return;
        }

        Log.w(TAG, "No se encontró impresora térmica válida. Reintentando...");
        scheduleReconnect();
    }

    /**
     * Calcula una puntuación para identificar la impresora térmica correcta.
     * Prioriza Star TSP143IIIU (VID 1305), Epson (VID 1208) y clase PRINTER (7).
     * Excluye adaptadores de red (ASIX), lectores de banda (MagTek) y scanners.
     */
    private int getPrinterScore(UsbDevice device) {
        int vid = device.getVendorId();
        int pid = device.getProductId();

        // Descartar explícitamente adaptadores de red y periféricos conocidos no impresora
        if (vid == 2965 || vid == 0x0B95) return -1; // ASIX AX88179 Ethernet
        if (vid == 0x0BDA) return -1;                // Realtek Ethernet/WiFi
        if (vid == 2049 || vid == 0x0801) return -1; // Mag-Tek Card Reader
        if (vid == 3118 || vid == 0x0C2E) return -1; // Honeywell Barcode Scanner
        if (vid == 1659 || vid == 0x067B) return -1; // Prolific Serial Bridge

        int score = 0;

        // Máxima prioridad a fabricantes de impresoras térmicas POS
        if (vid == 1305 || vid == 0x0519) score += 200; // Star Micronics (TSP143IIIU interna de ELO)
        if (vid == 1208 || vid == 0x04B8) score += 200; // Epson TM-T series
        if (vid == 7568 || vid == 0x1D90) score += 150; // Citizen
        if (vid == 5380 || vid == 0x1504) score += 150; // Bixolon
        if (vid == 1046 || vid == 0x0416) score += 120; // Winbond / Xprinter

        // Verificar si tiene una interfaz de clase PRINTER (7) con endpoint OUT bulk
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            int cls = iface.getInterfaceClass();

            if (cls == UsbConstants.USB_CLASS_PRINTER) {
                score += 100;
            }

            for (int j = 0; j < iface.getEndpointCount(); j++) {
                UsbEndpoint ep = iface.getEndpoint(j);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                        && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    score += 50;
                }
            }
        }

        return score;
    }

    private synchronized boolean connectDevice(UsbDevice device) {
        close();
        try {
            for (int i = 0; i < device.getInterfaceCount(); i++) {
                UsbInterface iface = device.getInterface(i);
                UsbEndpoint foundOut = null;
                UsbEndpoint foundIn = null;
                for (int j = 0; j < iface.getEndpointCount(); j++) {
                    UsbEndpoint ep = iface.getEndpoint(j);
                    if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                        if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                            foundOut = ep;
                        } else if (ep.getDirection() == UsbConstants.USB_DIR_IN) {
                            foundIn = ep;
                        }
                    }
                }
                if (foundOut != null) {
                    UsbDeviceConnection conn = usbManager.openDevice(device);
                    if (conn != null && conn.claimInterface(iface, true)) {
                        this.printerDevice = device;
                        this.usbInterface = iface;
                        this.outEndpoint = foundOut;
                        this.inEndpoint = foundIn;
                        this.connection = conn;
                        Log.i(TAG, "✓ Impresora USB conectada: " + device.getDeviceName()
                                + " iface=" + i + " out=" + foundOut.getAddress()
                                + (foundIn != null ? (" in=" + foundIn.getAddress()) : ""));
                        connectionRequested = false;
                        queryPrinterStatus();
                        return true;
                    } else {
                        Log.w(TAG, "No se pudo abrir/reclamar interfaz " + i);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error conectando impresora USB", e);
        }
        Log.w(TAG, "Fallo al conectar. Reintentando...");
        scheduleReconnect();
        return false;
    }

    public synchronized void queryPrinterStatus() {
        if (connection == null || outEndpoint == null) return;
        // La Star TSP143IIIU integrada usa StarPRNT, no el DLE EOT de ESC/POS.
        // Enviarle ese comando genérico deja el canal USB inestable en algunos firmwares ELO.
        // Conservamos el estado por defecto y dejamos que el error real de impresión sea el
        // aviso operativo hasta implementar el protocolo de estado específico de Star.
        if (isStarPrinter()) {
            paperOut = false;
            paperLow = false;
            coverOpen = false;
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastPaperCheckTime < 1200) return;
        lastPaperCheckTime = now;
        try {
            if (inEndpoint != null) {
                // Consulta en tiempo real de estado de papel (DLE EOT 4)
                byte[] statusReq = new byte[]{ 0x10, 0x04, 0x04 };
                connection.bulkTransfer(outEndpoint, statusReq, statusReq.length, 300);
                byte[] buffer = new byte[8];
                int read = connection.bulkTransfer(inEndpoint, buffer, buffer.length, 400);
                if (read > 0) {
                    byte b = buffer[0];
                    this.paperLow = (b & 0x0C) != 0;
                    this.paperOut = (b & 0x60) != 0 || (b & 0x30) != 0;
                    this.coverOpen = (b & 0x20) != 0 && (b & 0x04) != 0;
                    Log.d(TAG, "Estado de papel: read=" + read + " byte=0x" + Integer.toHexString(b & 0xFF)
                            + " out=" + paperOut + " low=" + paperLow);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Fallo consultando estado de papel", e);
        }
    }

    public synchronized boolean isPaperOut() {
        return paperOut;
    }

    public synchronized boolean isPaperLow() {
        return paperLow;
    }

    public synchronized boolean isCoverOpen() {
        return coverOpen;
    }

    /**
     * La Star TSP143IIIU usa StarPRNT/ASB y no responde de forma fiable al
     * DLE EOT genérico. Hasta implementar ASB, la interfaz debe mostrar que el
     * sensor no está verificado en vez de anunciar un falso "papel listo".
     */
    public synchronized boolean isPaperStatusSupported() {
        return isConnected() && !isStarPrinter() && inEndpoint != null;
    }

    private boolean isStarPrinter() {
        if (printerDevice == null) return false;
        int vendorId = printerDevice.getVendorId();
        return vendorId == 1305 || vendorId == 0x0519;
    }

    public synchronized void setPaperStatusManual(boolean out, boolean low) {
        this.paperOut = out;
        this.paperLow = low;
    }

    private void scheduleReconnect() {
        // Usamos postDelayed en el handler para planificar la reconexión,
        // pero la ejecución real debe ocurrir en un hilo separado para evitar
        // bloquear el Looper principal si findAndConnectPrinter() adquiere el lock.
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(() -> {
            // Ejecutar en hilo de fondo para no bloquear el UI thread
            // (findAndConnectPrinter es synchronized y puede tomar tiempo)
            new Thread(this::findAndConnectPrinter, "EloUsbReconnect").start();
        }, RECONNECT_DELAY_MS);
    }

    public synchronized boolean sendBytes(byte[] data) {
        if (data == null || data.length == 0) return false;
        if (connection == null || outEndpoint == null) {
            Log.w(TAG, "Impresora no conectada. Intentando reconectar...");
            findAndConnectPrinter();
            if (connection == null || outEndpoint == null) return false;
        }
        try {
            // Android divide internamente cada bloque según el paquete máximo del endpoint.
            // Bloques de 4 KB evitan miles de llamadas JNI y mantienen estable la Star raster.
            int offset = 0;
            while (offset < data.length) {
                int chunkSize = Math.min(4096, data.length - offset);
                int transferred = connection.bulkTransfer(outEndpoint, data, offset, chunkSize, TRANSFER_TIMEOUT_MS);
                if (transferred <= 0) {
                    Log.e(TAG, "Error en bulkTransfer en offset " + offset);
                    // No conservar una conexión que ya no acepta datos: evita que el estado
                    // muestre "Conectada" después de una desconexión física o de la impresora.
                    close();
                    scheduleReconnect();
                    return false;
                }
                offset += transferred;
                if (offset < data.length) android.os.SystemClock.sleep(12);
            }
            Log.d(TAG, "✓ " + data.length + " bytes enviados a la impresora.");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Excepción al enviar bytes", e);
            close();
            scheduleReconnect();
            return false;
        }
    }

    /** Envía únicamente el pulso correspondiente al protocolo detectado. */
    public synchronized boolean openDrawer() {
        boolean star = printerDevice != null && printerDevice.getVendorId() == 1305;
        byte[] command = star
                ? new byte[]{ 0x07 }
                : new byte[]{ 0x1B, 0x70, 0x00, 0x19, (byte) 0xFA };
        return sendBytes(command);
    }

    /**
     * Convierte un Bitmap de Android a comandos Star Raster Graphics
     * compatibles con la impresora Star Micronics TSP143IIIU (576 dots / 80mm).
     */
    public static byte[] bitmapToStarRaster(android.graphics.Bitmap bitmap, boolean openDrawer) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int widthBytes = (width + 7) / 8; // 576 / 8 = 72 bytes por scanline

        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();

        try {
            // 1. Inicialización y Entrada a Modo Raster Star Oficial (11 bytes)
            out.write(new byte[]{ (byte) 0x1B, (byte) 0x40 });                   // ESC @ (Clear/Init)
            out.write(new byte[]{ (byte) 0x1B, (byte) 0x2A, (byte) 0x72, (byte) 0x52, (byte) 0x00 }); // ESC * r R \0 (Reset raster settings)
            out.write(new byte[]{ (byte) 0x1B, (byte) 0x2A, (byte) 0x72, (byte) 0x41 });       // ESC * r A (Begin raster mode)

            // 2. Scanlines de píxeles
            int[] pixels = new int[width * height];
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

            byte[] lineHeader = new byte[]{ 0x62, (byte)(widthBytes & 0xFF), (byte)((widthBytes >> 8) & 0xFF) };
            byte[] lineData = new byte[widthBytes];

            for (int y = 0; y < height; y++) {
                java.util.Arrays.fill(lineData, (byte) 0);
                int rowOffset = y * width;
                for (int x = 0; x < width; x++) {
                    int color = pixels[rowOffset + x];
                    int r = (color >> 16) & 0xFF;
                    int g = (color >> 8) & 0xFF;
                    int b = color & 0xFF;
                    int alpha = (color >> 24) & 0xFF;

                    // Luminancia estándar: 0.299R + 0.587G + 0.114B < 160 = punto negro impreso
                    if (alpha > 128 && ((r * 299 + g * 587 + b * 114) / 1000) < 160) {
                        lineData[x / 8] |= (byte)(0x80 >> (x % 8));
                    }
                }
                out.write(lineHeader);
                out.write(lineData);
            }

            // 3. Avance de 40 líneas en blanco para separar del cabezal térmico
            byte[] blankData = new byte[widthBytes];
            for (int f = 0; f < 40; f++) {
                out.write(lineHeader);
                out.write(blankData);
            }

            // 4. Finalizar Modo Raster Star
            out.write(new byte[]{ (byte) 0x1B, (byte) 0x2A, (byte) 0x72, (byte) 0x42 }); // ESC * r B (End raster mode)

            // 5. Avance de papel y corte automático parcial
            out.write(new byte[]{ (byte) 0x1B, (byte) 0x64, (byte) 0x02 });             // ESC d 2 (Feed and partial cut)

            // 6. Apertura de gaveta si fue solicitada
            if (openDrawer) {
                out.write(new byte[]{ 0x07 });                                           // BEL
            }
        } catch (java.io.IOException e) {
            Log.e(TAG, "Error construyendo Star Raster", e);
        }

        return out.toByteArray();
    }

    /**
     * Renderiza un texto formateado de ticket a Bitmap y lo imprime en modo Star Raster.
     */
    public synchronized boolean printFormattedText(String text, boolean openDrawer) {
        android.graphics.Bitmap bitmap = renderTicketBitmap(text);
        if (bitmap == null) return false;
        byte[] rasterData = bitmapToStarRaster(bitmap, openDrawer);
        return sendBytes(rasterData);
    }

    /**
     * Renderizador gráfico de ticket térmico 80mm (576 píxeles de ancho).
     */
    public android.graphics.Bitmap renderTicketBitmap(String text) {
        int width = 576; // 80mm estándar a 203 DPI
        String[] lines = text.split("\r?\n");
        boolean includeLogo = text.contains("[LOGO]");
        android.graphics.Bitmap receiptLogo = includeLogo ? createReceiptLogoBitmap() : null;

        android.graphics.Paint titlePaint = new android.graphics.Paint();
        titlePaint.setColor(android.graphics.Color.BLACK);
        titlePaint.setTextSize(28f);
        titlePaint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD));
        titlePaint.setAntiAlias(false);

        android.graphics.Paint normalPaint = new android.graphics.Paint();
        normalPaint.setColor(android.graphics.Color.BLACK);
        normalPaint.setTextSize(22f);
        normalPaint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.NORMAL));
        normalPaint.setAntiAlias(false);

        android.graphics.Paint boldPaint = new android.graphics.Paint();
        boldPaint.setColor(android.graphics.Color.BLACK);
        boldPaint.setTextSize(22f);
        boldPaint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD));
        boldPaint.setAntiAlias(false);

        android.graphics.Paint linePaint = new android.graphics.Paint();
        linePaint.setColor(android.graphics.Color.BLACK);
        linePaint.setStrokeWidth(2f);

        // Calcular altura dinámica
        int totalHeight = 40 + (receiptLogo != null ? receiptLogo.getHeight() + 18 : 0);
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[LOGO]")) {
                continue;
            } else if (trimmed.startsWith("[TITLE]") || trimmed.startsWith("[B]")) {
                totalHeight += 38;
            } else if (trimmed.startsWith("[SEP]") || trimmed.startsWith("---") || trimmed.startsWith("===")) {
                totalHeight += 20;
            } else if (trimmed.isEmpty()) {
                totalHeight += 16;
            } else {
                totalHeight += 28;
            }
        }
        totalHeight += 60; // Margen inferior

        android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(width, totalHeight, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
        canvas.drawColor(android.graphics.Color.WHITE);

        int y = 35;
        if (receiptLogo != null) {
            float logoX = Math.max(10, (width - receiptLogo.getWidth()) / 2f);
            canvas.drawBitmap(receiptLogo, logoX, y, null);
            y += receiptLogo.getHeight() + 18;
        }
        for (String rawLine : lines) {
            String line = rawLine.trim();

            if (line.startsWith("[LOGO]")) {
                continue;
            } else if (line.startsWith("[SEP]") || line.startsWith("---") || line.startsWith("===")) {
                y += 8;
                canvas.drawLine(10, y, width - 10, y, linePaint);
                y += 12;
            } else if (line.startsWith("[TITLE]")) {
                String content = line.substring(7).trim();
                float textWidth = titlePaint.measureText(content);
                float x = Math.max(10, (width - textWidth) / 2f);
                canvas.drawText(content, x, y + 24, titlePaint);
                y += 38;
            } else if (line.startsWith("[C]")) {
                String content = line.substring(3).trim();
                boolean isBold = content.startsWith("[B]");
                if (isBold) content = content.substring(3).trim();
                android.graphics.Paint p = isBold ? boldPaint : normalPaint;
                float textWidth = p.measureText(content);
                float x = Math.max(10, (width - textWidth) / 2f);
                canvas.drawText(content, x, y + 20, p);
                y += 28;
            } else if (line.startsWith("[B]")) {
                String content = line.substring(3).trim();
                boolean centered = content.startsWith("[C]");
                if (centered) content = content.substring(3).trim();
                float textWidth = boldPaint.measureText(content);
                float x = centered ? Math.max(10, (width - textWidth) / 2f) : 15f;
                canvas.drawText(content, x, y + 20, boldPaint);
                y += 28;
            } else if (line.startsWith("[R]")) {
                String content = line.substring(3).trim();
                float textWidth = normalPaint.measureText(content);
                float x = Math.max(10, width - 15 - textWidth);
                canvas.drawText(content, x, y + 20, normalPaint);
                y += 28;
            } else if (line.contains("  ") && line.length() > 20) {
                // Fila con dos columnas (ej. Nombre del producto y Precio)
                int lastSpace = line.lastIndexOf("  ");
                String left = line.substring(0, lastSpace).trim();
                String right = line.substring(lastSpace).trim();

                canvas.drawText(left, 15, y + 20, normalPaint);
                float rightWidth = normalPaint.measureText(right);
                canvas.drawText(right, width - 15 - rightWidth, y + 20, normalPaint);
                y += 28;
            } else if (line.isEmpty()) {
                y += 16;
            } else {
                canvas.drawText(line, 15, y + 20, normalPaint);
                y += 28;
            }
        }

        return bitmap;
    }

    /**
     * Crea una marca para recibos térmicos a partir del logo oficial.
     *
     * La imagen corporativa contiene un fondo negro con ilustraciones de comida. Una conversión
     * normal a escala de grises convierte ese fondo en una mancha. Aquí se recorta solamente el
     * logotipo, se descartan los tonos del fondo y se conservan los colores de las letras (rojo,
     * amarillo, verde y blanco). Al final se engrosan un píxel: el resultado es legible incluso
     * con la resolución y el calor variables de una impresora térmica.
     */
    private android.graphics.Bitmap createReceiptLogoBitmap() {
        try {
            android.graphics.Bitmap source = android.graphics.BitmapFactory.decodeResource(
                    context.getResources(), R.drawable.app_icon);
            if (source == null) return null;
            int left = Math.round(source.getWidth() * 0.035f);
            int top = Math.round(source.getHeight() * 0.22f);
            int right = Math.round(source.getWidth() * 0.965f);
            int bottom = Math.round(source.getHeight() * 0.80f);
            int cropWidth = Math.max(1, right - left);
            int cropHeight = Math.max(1, bottom - top);
            android.graphics.Bitmap wordmark = android.graphics.Bitmap.createBitmap(
                    source, left, top, cropWidth, cropHeight);

            // Un ancho amplio evita que las letras redondeadas de "Panitas" se empasten.
            int targetWidth = 320;
            int targetHeight = Math.max(1, Math.round(cropHeight * (targetWidth / (float) cropWidth)));
            android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(
                    wordmark, targetWidth, targetHeight, true);
            boolean[][] ink = new boolean[targetHeight][targetWidth];

            for (int y = 0; y < targetHeight; y++) {
                for (int x = 0; x < targetWidth; x++) {
                    int color = scaled.getPixel(x, y);
                    int alpha = android.graphics.Color.alpha(color);
                    int red = android.graphics.Color.red(color);
                    int green = android.graphics.Color.green(color);
                    int blue = android.graphics.Color.blue(color);
                    int luminance = (red * 299 + green * 587 + blue * 114) / 1000;

                    // Colores propios de la marca. Los marrones/negros del fondo no pasan.
                    boolean redLetter = red >= 145 && red > green * 1.35f && red > blue * 1.8f;
                    boolean yellowOutline = red >= 135 && green >= 105 && blue <= 105
                            && (red + green) >= 275;
                    boolean greenLetter = green >= 92 && green > red * 0.86f
                            && green > blue * 1.12f && luminance >= 92;
                    boolean whiteLetter = luminance >= 195 && Math.abs(red - green) <= 42
                            && Math.abs(green - blue) <= 42;
                    ink[y][x] = alpha > 120 && (redLetter || yellowOutline || greenLetter || whiteLetter);
                }
            }

            android.graphics.Bitmap mono = android.graphics.Bitmap.createBitmap(
                    targetWidth, targetHeight, android.graphics.Bitmap.Config.ARGB_8888);
            for (int y = 0; y < targetHeight; y++) {
                for (int x = 0; x < targetWidth; x++) {
                    // Dilatación de un píxel: mejora letras finas sin recuperar el fondo.
                    boolean black = false;
                    for (int dy = -1; dy <= 1 && !black; dy++) {
                        int sampleY = y + dy;
                        if (sampleY < 0 || sampleY >= targetHeight) continue;
                        for (int dx = -1; dx <= 1; dx++) {
                            int sampleX = x + dx;
                            if (sampleX >= 0 && sampleX < targetWidth && ink[sampleY][sampleX]) {
                                black = true;
                                break;
                            }
                        }
                    }
                    mono.setPixel(x, y, black ? android.graphics.Color.BLACK : android.graphics.Color.WHITE);
                }
            }
            return mono;
        } catch (Exception error) {
            Log.w(TAG, "No se pudo preparar el logo térmico: " + error.getMessage());
            return null;
        }
    }

    public boolean isConnected() {
        return connection != null && outEndpoint != null;
    }

    public synchronized void close() {
        handler.removeCallbacksAndMessages(null);
        if (connection != null) {
            try {
                if (usbInterface != null) connection.releaseInterface(usbInterface);
                connection.close();
            } catch (Exception ignored) {}
            connection = null;
        }
        usbInterface = null;
        outEndpoint = null;
        printerDevice = null;
        Log.i(TAG, "Conexión con impresora USB cerrada.");
    }

    public void destroy() {
        handler.removeCallbacksAndMessages(null);
        close();
        try {
            context.unregisterReceiver(usbReceiver);
        } catch (Exception ignored) {}
    }
}

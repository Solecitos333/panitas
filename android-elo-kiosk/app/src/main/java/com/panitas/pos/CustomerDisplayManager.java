package com.panitas.pos;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;

/**
 * Controla el visor de cara al cliente (VFD / Customer Facing Display) de la terminal ELO.
 * El VFD es una pantalla de 2 lineas x 20 caracteres conectada por USB-Serial (Prolific PL2303).
 * Protocolo: ESC/POS extendido para displays de dos lineas.
 */
public class CustomerDisplayManager {
    private static final String TAG = "EloVFD";

    // Prolific PL2303 USB-Serial (comun en terminales ELO para el VFD)
    private static final int VFD_VENDOR_ID  = 0x067B; // Prolific
    private static final int VFD_PRODUCT_ID = 0x2303; // PL2303

    // Baud rate estandar para displays VFD
    private static final int BAUD_RATE = 9600;
    private static final int LINE_WIDTH = 20;

    private final Context context;
    private UsbDevice vfdDevice;
    private UsbDeviceConnection connection;
    private UsbEndpoint endpointOut;
    private boolean connected = false;

    public CustomerDisplayManager(Context context) {
        this.context = context;
    }

    /** Intenta encontrar y conectar con el VFD por USB. */
    public boolean connect() {
        UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) return false;

        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
        for (UsbDevice device : devices.values()) {
            if (device.getVendorId() == VFD_VENDOR_ID) {
                if (usbManager.hasPermission(device)) {
                    vfdDevice = device;
                    Log.i(TAG, "VFD encontrado: " + device.getDeviceName() + " VID=" + device.getVendorId() + " PID=" + device.getProductId());
                    return openConnection(usbManager, device);
                }
            }
        }
        Log.w(TAG, "VFD (Prolific PL2303) no encontrado o sin permiso.");
        return false;
    }

    private boolean openConnection(UsbManager usbManager, UsbDevice device) {
        try {
            UsbInterface iface = device.getInterface(0);
            for (int i = 0; i < iface.getEndpointCount(); i++) {
                UsbEndpoint ep = iface.getEndpoint(i);
                if (ep.getDirection() == android.hardware.usb.UsbConstants.USB_DIR_OUT) {
                    endpointOut = ep;
                    break;
                }
            }
            if (endpointOut == null) return false;

            connection = usbManager.openDevice(device);
            if (connection == null) return false;
            connection.claimInterface(iface, true);

            // Configurar baud rate PL2303 a 9600
            configureBaudRate();
            connected = true;

            // Inicializar display
            send(new byte[]{0x1B, 0x40});   // ESC @ - Reset
            send(new byte[]{0x0C});          // FF - Clear display
            Log.i(TAG, "VFD conectado y configurado.");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error al conectar VFD: " + e.getMessage());
            return false;
        }
    }

    private void configureBaudRate() {
        if (connection == null) return;
        // Control request para PL2303: SET_LINE_CODING (9600 8N1)
        byte[] lineCode = {
            (byte)(BAUD_RATE & 0xFF),
            (byte)((BAUD_RATE >> 8) & 0xFF),
            (byte)((BAUD_RATE >> 16) & 0xFF),
            (byte)((BAUD_RATE >> 24) & 0xFF),
            0x00, // 1 stop bit
            0x00, // no parity
            0x08  // 8 data bits
        };
        connection.controlTransfer(0x21, 0x20, 0, 0, lineCode, lineCode.length, 1000);
    }

    /** Muestra texto en las dos lineas del visor. */
    public boolean setMessage(String line1, String line2) {
        if (!connected) {
            // Intentar reconectar
            connect();
            if (!connected) return false;
        }
        try {
            // Limpiar display
            send(new byte[]{0x0C}); // FF - Clear

            // Ir a posicion 1,1
            send(new byte[]{0x1B, 0x6C, 0x01, 0x01}); // ESC l row col

            // Escribir linea 1 (max 20 chars)
            String l1 = padOrTrim(line1, LINE_WIDTH);
            send(l1.getBytes(StandardCharsets.ISO_8859_1));

            // Ir a linea 2
            send(new byte[]{0x1B, 0x6C, 0x02, 0x01}); // ESC l 2 1

            // Escribir linea 2
            String l2 = padOrTrim(line2, LINE_WIDTH);
            send(l2.getBytes(StandardCharsets.ISO_8859_1));

            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error al escribir en VFD: " + e.getMessage());
            connected = false;
            return false;
        }
    }

    /** Muestra mensaje de bienvenida. */
    public void showWelcome(String businessName) {
        String l1 = center("  Bienvenidos a  ");
        String l2 = center(businessName);
        setMessage(l1, l2);
    }

    /** Limpia el display. */
    public void clear() {
        if (connected) send(new byte[]{0x0C});
    }

    public boolean isConnected() { return connected; }

    public void disconnect() {
        clear();
        if (connection != null) {
            try { connection.close(); } catch (Exception ignored) {}
            connection = null;
        }
        connected = false;
    }

    private void send(byte[] data) {
        if (connection == null || endpointOut == null) return;
        connection.bulkTransfer(endpointOut, data, data.length, 500);
    }

    private String padOrTrim(String s, int width) {
        if (s == null) s = "";
        if (s.length() > width) return s.substring(0, width);
        StringBuilder sb = new StringBuilder(s);
        while (sb.length() < width) sb.append(' ');
        return sb.toString();
    }

    private String center(String s) {
        if (s == null) s = "";
        if (s.length() >= LINE_WIDTH) return s.substring(0, LINE_WIDTH);
        int pad = (LINE_WIDTH - s.length()) / 2;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pad; i++) sb.append(' ');
        sb.append(s);
        while (sb.length() < LINE_WIDTH) sb.append(' ');
        return sb.toString();
    }
}
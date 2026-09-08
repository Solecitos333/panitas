package com.panitas.pos;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.IBinder;
import android.os.Parcel;
import android.os.RemoteException;
import android.util.Log;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashMap;

/**
 * Controla el visor de cara al cliente (CFD / VFD / pantalla trasera) de la terminal Elo PayPoint Plus 15".
 * En el hardware Elo-PP3-15, la pantalla trasera es un display de 2 lineas x 20 caracteres
 * conectado internamente a /dev/ttyUSB2 y administrado por el servicio de sistema "elo" (ELOPeripheralService).
 *
 * Esta clase implementa multiples niveles de respaldo:
 *  1. Servicio de Sistema Oficial ELO (context.getSystemService("elo") -> ELOPeripheralManager.mCFD_APIs)
 *  2. Llamada directa a ServiceManager ("elo" IBinder transact)
 *  3. Conexion USB directa como respaldo auxiliar
 */
public class CustomerDisplayManager {
    private static final String TAG = "EloCFD";

    private static final int LINE_WIDTH = 20;
    private static final String ELO_DESCRIPTOR = "android.elo.peripheral.IELOPeripheralService";
    private static final int TRANSACTION_SET_CFD_BACKLIGHT = 10;
    private static final int TRANSACTION_CLEAR_CFD_DISPLAY = 13;
    private static final int TRANSACTION_SET_CFD_TEXT = 14;

    private static final int VFD_VENDOR_ID  = 0x067B; // Prolific PL2303
    private static final int BAUD_RATE = 9600;

    private final Context context;

    // Driver 1: ELOPeripheralManager por reflexion
    private Object eloCfdApis;
    private Method setCfdTextMethod;
    private Method clearCfdDisplayMethod;
    private Method setCfdBacklightMethod;

    // Driver 2: ServiceManager Binder directo
    private IBinder eloBinder;

    // Driver 3: UsbManager directo
    private UsbDeviceConnection connection;
    private UsbEndpoint endpointOut;

    private boolean connected = false;

    public CustomerDisplayManager(Context context) {
        this.context = context;
    }

    /** Conecta e inicializa la pantalla trasera CFD. */
    public synchronized boolean connect() {
        if (initEloSystemService()) {
            connected = true;
            Log.i(TAG, "✓ Pantalla trasera CFD conectada via ELOPeripheralManager.");
            return true;
        }

        if (initEloBinder()) {
            connected = true;
            Log.i(TAG, "✓ Pantalla trasera CFD conectada via ServiceManager (binder).");
            return true;
        }

        if (initUsbFallback()) {
            connected = true;
            Log.i(TAG, "✓ Pantalla trasera CFD conectada via USB Serial.");
            return true;
        }

        Log.w(TAG, "No se pudo conectar la pantalla trasera CFD.");
        return false;
    }

    private boolean initEloSystemService() {
        try {
            Object eloManager = context.getSystemService("elo");
            if (eloManager == null) return false;

            Field cfdField = eloManager.getClass().getField("mCFD_APIs");
            eloCfdApis = cfdField.get(eloManager);
            if (eloCfdApis != null) {
                Class<?> clazz = eloCfdApis.getClass();
                setCfdTextMethod = clazz.getMethod("setCFDText", int.class, String.class);
                clearCfdDisplayMethod = clazz.getMethod("clearCFDDisplay");
                setCfdBacklightMethod = clazz.getMethod("setCFDBacklight", boolean.class);

                // Encender iluminacion y limpiar pantalla
                try {
                    setCfdBacklightMethod.invoke(eloCfdApis, true);
                    clearCfdDisplayMethod.invoke(eloCfdApis);
                } catch (Throwable ignored) {}

                return true;
            }
        } catch (Throwable t) {
            Log.d(TAG, "getSystemService('elo') no disponible: " + t.getMessage());
        }
        return false;
    }

    private boolean initEloBinder() {
        try {
            Class<?> smClass = Class.forName("android.os.ServiceManager");
            Method getService = smClass.getMethod("getService", String.class);
            eloBinder = (IBinder) getService.invoke(null, "elo");
            if (eloBinder != null) {
                // Encender luz de fondo y limpiar pantalla
                sendBinderBacklight(true);
                sendBinderClear();
                return true;
            }
        } catch (Throwable t) {
            Log.d(TAG, "ServiceManager getService('elo') no disponible: " + t.getMessage());
        }
        return false;
    }

    private boolean initUsbFallback() {
        try {
            UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return false;

            HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
            for (UsbDevice device : devices.values()) {
                if (device.getVendorId() == VFD_VENDOR_ID && usbManager.hasPermission(device)) {
                    UsbInterface iface = device.getInterface(0);
                    for (int i = 0; i < iface.getEndpointCount(); i++) {
                        UsbEndpoint ep = iface.getEndpoint(i);
                        if (ep.getDirection() == android.hardware.usb.UsbConstants.USB_DIR_OUT) {
                            endpointOut = ep;
                            break;
                        }
                    }
                    if (endpointOut == null) continue;

                    connection = usbManager.openDevice(device);
                    if (connection != null && connection.claimInterface(iface, true)) {
                        configureBaudRate();
                        // Reset & Clear
                        sendUsbBytes(new byte[]{0x1B, 0x40});
                        sendUsbBytes(new byte[]{0x0C});
                        return true;
                    }
                }
            }
        } catch (Throwable t) {
            Log.d(TAG, "Fallback USB no disponible: " + t.getMessage());
        }
        return false;
    }

    private void configureBaudRate() {
        if (connection == null) return;
        byte[] lineCode = {
            (byte)(BAUD_RATE & 0xFF),
            (byte)((BAUD_RATE >> 8) & 0xFF),
            (byte)((BAUD_RATE >> 16) & 0xFF),
            (byte)((BAUD_RATE >> 24) & 0xFF),
            0x00, 0x00, 0x08
        };
        connection.controlTransfer(0x21, 0x20, 0, 0, lineCode, lineCode.length, 1000);
    }

    /**
     * Muestra texto en las dos lineas del visor CFD de cara al cliente.
     * @param line1 Texto superior (max 20 caracteres)
     * @param line2 Texto inferior (max 20 caracteres)
     */
    public synchronized boolean setMessage(String line1, String line2) {
        if (!connected && !connect()) {
            return false;
        }

        String l1 = sanitize(padOrTrim(line1, LINE_WIDTH));
        String l2 = sanitize(padOrTrim(line2, LINE_WIDTH));

        // 1. Prioridad: Driver nativo Elo
        if (eloCfdApis != null && setCfdTextMethod != null) {
            try {
                setCfdTextMethod.invoke(eloCfdApis, 0, l1);
                setCfdTextMethod.invoke(eloCfdApis, 1, l2);
                return true;
            } catch (Throwable t) {
                Log.w(TAG, "Fallo al escribir via ELOPeripheralManager: " + t.getMessage());
                connected = false;
            }
        }

        // 2. Respaldo: Binder directo
        if (eloBinder != null) {
            try {
                sendBinderText(0, l1);
                sendBinderText(1, l2);
                return true;
            } catch (Throwable t) {
                Log.w(TAG, "Fallo al escribir via Binder: " + t.getMessage());
                connected = false;
            }
        }

        // 3. Respaldo: USB
        if (connection != null && endpointOut != null) {
            try {
                sendUsbBytes(new byte[]{0x0C});
                sendUsbBytes(new byte[]{0x1B, 0x6C, 0x01, 0x01});
                sendUsbBytes(l1.getBytes(StandardCharsets.ISO_8859_1));
                sendUsbBytes(new byte[]{0x1B, 0x6C, 0x02, 0x01});
                sendUsbBytes(l2.getBytes(StandardCharsets.ISO_8859_1));
                return true;
            } catch (Throwable t) {
                Log.w(TAG, "Fallo al escribir via USB: " + t.getMessage());
                connected = false;
            }
        }

        return false;
    }

    /** Muestra el mensaje de bienvenida del negocio. */
    public void showWelcome(String businessName) {
        String name = (businessName != null && !businessName.trim().isEmpty()) ? businessName.trim() : "Los Panitas";
        String l1 = center(name);
        String l2 = center("Bienvenidos!");
        setMessage(l1, l2);
    }

    /** Limpia el display. */
    public synchronized void clear() {
        if (!connected) return;
        if (eloCfdApis != null && clearCfdDisplayMethod != null) {
            try {
                clearCfdDisplayMethod.invoke(eloCfdApis);
                return;
            } catch (Throwable ignored) {}
        }
        if (eloBinder != null) {
            sendBinderClear();
            return;
        }
        if (connection != null && endpointOut != null) {
            sendUsbBytes(new byte[]{0x0C});
        }
    }

    public boolean isConnected() {
        return connected;
    }

    public synchronized void disconnect() {
        clear();
        if (connection != null) {
            try { connection.close(); } catch (Throwable ignored) {}
            connection = null;
        }
        eloCfdApis = null;
        eloBinder = null;
        connected = false;
    }

    private void sendBinderText(int lineNo, String text) throws RemoteException {
        if (eloBinder == null) return;
        Parcel data = Parcel.obtain();
        Parcel reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ELO_DESCRIPTOR);
            data.writeInt(lineNo);
            data.writeString(text != null ? text : "");
            eloBinder.transact(TRANSACTION_SET_CFD_TEXT, data, reply, 0);
            reply.readException();
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    private void sendBinderBacklight(boolean on) {
        if (eloBinder == null) return;
        Parcel data = Parcel.obtain();
        Parcel reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ELO_DESCRIPTOR);
            data.writeInt(on ? 1 : 0);
            eloBinder.transact(TRANSACTION_SET_CFD_BACKLIGHT, data, reply, 0);
            reply.readException();
        } catch (Throwable ignored) {
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    private void sendBinderClear() {
        if (eloBinder == null) return;
        Parcel data = Parcel.obtain();
        Parcel reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ELO_DESCRIPTOR);
            eloBinder.transact(TRANSACTION_CLEAR_CFD_DISPLAY, data, reply, 0);
            reply.readException();
        } catch (Throwable ignored) {
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    private void sendUsbBytes(byte[] data) {
        if (connection == null || endpointOut == null || data == null) return;
        connection.bulkTransfer(endpointOut, data, data.length, 500);
    }

    /** Limpia tildes y simbolos especiales para compatibilidad ASCII en visores VFD. */
    public static String sanitize(String input) {
        if (input == null) return "";
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFD);
        String clean = normalized.replaceAll("\\p{M}", "");
        clean = clean.replace("¡", "")
                     .replace("¿", "")
                     .replace("ñ", "n")
                     .replace("Ñ", "N")
                     .replaceAll("[^\\x20-\\x7E]", " ");
        return clean;
    }

    private static String padOrTrim(String s, int width) {
        if (s == null) s = "";
        s = s.trim();
        if (s.length() > width) return s.substring(0, width);
        StringBuilder sb = new StringBuilder(s);
        while (sb.length() < width) sb.append(' ');
        return sb.toString();
    }

    private static String center(String s) {
        if (s == null) s = "";
        s = s.trim();
        if (s.length() >= LINE_WIDTH) return s.substring(0, LINE_WIDTH);
        int pad = (LINE_WIDTH - s.length()) / 2;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pad; i++) sb.append(' ');
        sb.append(s);
        while (sb.length() < LINE_WIDTH) sb.append(' ');
        return sb.toString();
    }
}

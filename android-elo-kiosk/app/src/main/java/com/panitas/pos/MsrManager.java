package com.panitas.pos;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.util.Log;
import android.webkit.WebView;

import java.util.HashMap;

/**
 * Gestiona el lector de banda magnetica MagTek integrado en la terminal ELO PayPoint Plus.
 * Cuando el cajero desliza una tarjeta, extrae el nombre del titular y notifica a la WebApp.
 */
public class MsrManager {
    private static final String TAG = "EloMSR";

    // MagTek USB HID (lector de banda magnetica)
    private static final int MAGTEK_VENDOR_ID_1 = 0x0801; // MagTek
    private static final int MAGTEK_VENDOR_ID_2 = 0x0ACD; // ID Technologies
    private static final int MSR_CLASS_HID = 3;

    private final Context context;
    private WebView webView;
    private Thread readThread;
    private volatile boolean reading = false;
    private UsbDeviceConnection connection;

    public MsrManager(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
    }

    public void setWebView(WebView webView) {
        this.webView = webView;
    }

    /** Busca e inicia la lectura del MSR en un hilo de fondo. */
    public boolean start() {
        UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) return false;

        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
        UsbDevice msrDevice = null;

        for (UsbDevice device : devices.values()) {
            int vid = device.getVendorId();
            if (vid == MAGTEK_VENDOR_ID_1 || vid == MAGTEK_VENDOR_ID_2) {
                if (usbManager.hasPermission(device)) {
                    msrDevice = device;
                    break;
                }
            }
        }

        if (msrDevice == null) {
            Log.w(TAG, "Lector MSR MagTek no encontrado.");
            return false;
        }

        final UsbDevice device = msrDevice;
        UsbInterface iface = null;
        UsbEndpoint endpointIn = null;

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface ui = device.getInterface(i);
            if (ui.getInterfaceClass() == MSR_CLASS_HID) {
                for (int j = 0; j < ui.getEndpointCount(); j++) {
                    UsbEndpoint ep = ui.getEndpoint(j);
                    if (ep.getDirection() == android.hardware.usb.UsbConstants.USB_DIR_IN) {
                        iface = ui;
                        endpointIn = ep;
                        break;
                    }
                }
                if (endpointIn != null) break;
            }
        }

        if (endpointIn == null) return false;

        connection = usbManager.openDevice(device);
        if (connection == null) return false;
        connection.claimInterface(iface, true);

        final UsbEndpoint ep = endpointIn;
        reading = true;
        readThread = new Thread(() -> readLoop(ep), "EloMSR-Reader");
        readThread.setDaemon(true);
        readThread.start();

        Log.i(TAG, "MSR MagTek iniciado: " + device.getDeviceName());
        return true;
    }

    public void stop() {
        reading = false;
        if (connection != null) {
            try { connection.close(); } catch (Exception ignored) {}
            connection = null;
        }
    }

    public boolean isActive() {
        return reading && connection != null;
    }

    private void readLoop(UsbEndpoint ep) {
        byte[] buffer = new byte[ep.getMaxPacketSize()];
        StringBuilder track1 = new StringBuilder();

        while (reading) {
            int received = connection.bulkTransfer(ep, buffer, buffer.length, 500);
            if (received > 0) {
                // Parsear datos de pista 1: formato %B[numero]^[apellido]/[nombre]^[datos]
                for (int i = 0; i < received; i++) {
                    char c = (char)(buffer[i] & 0x7F);
                    if (c == '%') { track1.setLength(0); }
                    if (c >= 0x20 && c < 0x7F) track1.append(c);
                    if (c == '?' && track1.length() > 5) {
                        // Tarjeta completa leida
                        parseAndNotify(track1.toString());
                        track1.setLength(0);
                    }
                }
            }
        }
    }

    /**
     * Parsea la Pista 1 ISO 7813: %B<PAN>^<APELLIDO>/<NOMBRE>^<datos>
     * y notifica a la WebApp.
     */
    private void parseAndNotify(String track1) {
        try {
            String cardholderName = "";
            String maskedPan = "";

            if (track1.startsWith("%B")) {
                int caret1 = track1.indexOf('^');
                int caret2 = track1.indexOf('^', caret1 + 1);
                if (caret1 > 0) {
                    String pan = track1.substring(2, caret1);
                    maskedPan = pan.length() > 4
                        ? "****-****-****-" + pan.substring(pan.length() - 4)
                        : "****";
                }
                if (caret1 > 0 && caret2 > caret1) {
                    String nameField = track1.substring(caret1 + 1, caret2);
                    String[] parts = nameField.split("/");
                    String lastName = parts.length > 0 ? parts[0].trim() : "";
                    String firstName = parts.length > 1 ? parts[1].trim() : "";
                    cardholderName = (firstName + " " + lastName).trim();
                }
            }

            if (!cardholderName.isEmpty()) {
                final String name = cardholderName.replace("'", "\\'");
                final String pan = maskedPan;
                Log.i(TAG, "Tarjeta leida: " + name + " (" + pan + ")");
                if (webView != null) {
                    String js = "window.dispatchEvent(new CustomEvent('elo-msr', { detail: { name: '" + name + "', pan: '" + pan + "' } }));";
                    webView.post(() -> webView.evaluateJavascript(js, null));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parseando MSR: " + e.getMessage());
        }
    }
}

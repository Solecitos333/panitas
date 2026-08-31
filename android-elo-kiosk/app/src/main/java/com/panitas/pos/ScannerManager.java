package com.panitas.pos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;
import android.webkit.WebView;

/**
 * Gestiona el escaner de codigos de barras integrado en la Elo PayPoint Plus.
 * Escucha las transmisiones del hardware y las retransmite a la WebView del POS.
 */
public class ScannerManager {
    private static final String TAG = "EloScanner";

    // Acciones de broadcast del escaner ELO (segun com.elodemo.app)
    private static final String ACTION_SCAN_ELO   = "com.elotouch.peripheral.SCANNER_DATA";
    private static final String ACTION_SCAN_ELO2  = "com.elotouch.peripheral.action.SCANNER_DATA";
    private static final String ACTION_SCAN_ZEBRA = "com.symbol.datawedge.api.RESULT_ACTION";
    private static final String ACTION_SCAN_HONEYWELL = "com.honeywell.aidc.action.ACTION_CLAIM_SCANNER";
    private static final String EXTRA_SCAN_DATA   = "scanData";
    private static final String EXTRA_BARCODE     = "barcode_string";
    private static final String EXTRA_DATA_STRING = "com.symbol.datawedge.data_string";

    private final Context context;
    private WebView webView;
    private boolean registered = false;
    private boolean active = false;

    private final BroadcastReceiver scanReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            String action = intent.getAction();
            String scanned = null;

            if (ACTION_SCAN_ELO.equals(action) || ACTION_SCAN_ELO2.equals(action)) {
                scanned = intent.getStringExtra(EXTRA_SCAN_DATA);
                if (scanned == null) scanned = intent.getStringExtra(EXTRA_BARCODE);
                if (scanned == null) scanned = intent.getStringExtra("data");
            } else if (ACTION_SCAN_ZEBRA.equals(action)) {
                scanned = intent.getStringExtra(EXTRA_DATA_STRING);
            }

            if (scanned != null && !scanned.isEmpty()) {
                final String code = scanned.trim();
                Log.i(TAG, "Codigo escaneado: " + code);
                notifyWebView(code);
            }
        }
    };

    public ScannerManager(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
    }

    public void setWebView(WebView webView) {
        this.webView = webView;
    }

    public void start() {
        if (!registered) {
            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_SCAN_ELO);
            filter.addAction(ACTION_SCAN_ELO2);
            filter.addAction(ACTION_SCAN_ZEBRA);
            filter.addAction(ACTION_SCAN_HONEYWELL);
            filter.setPriority(IntentFilter.SYSTEM_HIGH_PRIORITY);
            context.registerReceiver(scanReceiver, filter);
            registered = true;
        }
        active = true;

        // Enviar intents de activacion
        sendBroadcastSafe("com.elotouch.peripheral.action.BCR_ENABLE");
        sendBroadcastSafe("com.elotouch.peripheral.action.SCANNER_ENABLE");
        sendBroadcastSafe("com.elotouch.peripheral.action.TRIGGER_ON");
        sendBroadcastSafe("com.oem.zbcr.action.START_SCAN");
        callEloService(true);
        Log.i(TAG, "Escaner ELO activado.");
    }

    public void stop() {
        active = false;
        if (registered) {
            try { context.unregisterReceiver(scanReceiver); } catch (Exception ignored) {}
            registered = false;
        }

        // 1. Invocar servicio del sistema ELO para apagar el rayo/iluminación y LEDs
        callEloService(false);

        // 2. Enviar intents para apagar luz/laser
        sendBroadcastSafe("com.elotouch.peripheral.action.BCR_DISABLE");
        sendBroadcastSafe("com.elotouch.peripheral.action.SCANNER_DISABLE");
        sendBroadcastSafe("com.elotouch.peripheral.action.TRIGGER_OFF");
        sendBroadcastSafe("com.honeywell.aidc.action.ACTION_RELEASE_SCANNER");
        sendBroadcastSafe("com.oem.zbcr.action.STOP_SCAN");
        sendBroadcastSafe("com.oem.zbcr.action.BCR_RELEASE");

        Intent dwIntent = new Intent("com.symbol.datawedge.api.ACTION");
        dwIntent.putExtra("com.symbol.datawedge.api.SCANNER_INPUT_PLUGIN", "DISABLE");
        try { context.sendBroadcast(dwIntent); } catch (Exception ignored) {}

        Log.i(TAG, "Escaner ELO desactivado y luz apagada.");
    }

    private void callEloService(boolean enable) {
        try {
            Class<?> smClass = Class.forName("android.os.ServiceManager");
            java.lang.reflect.Method getService = smClass.getMethod("getService", String.class);
            android.os.IBinder binder = (android.os.IBinder) getService.invoke(null, "elo");
            if (binder != null) {
                Class<?> stubClass = Class.forName("android.elo.peripheral.IELOPeripheralService$Stub");
                java.lang.reflect.Method asInterface = stubClass.getMethod("asInterface", android.os.IBinder.class);
                Object service = asInterface.invoke(null, binder);
                if (service != null) {
                    if (enable) {
                        try {
                            java.lang.reflect.Method activeBCR = service.getClass().getMethod("activeBCR");
                            activeBCR.invoke(service);
                        } catch (Throwable ignored) {}
                    } else {
                        try {
                            java.lang.reflect.Method disactiveBCR = service.getClass().getMethod("disactiveBCR");
                            disactiveBCR.invoke(service);
                        } catch (Throwable ignored) {}
                        try {
                            java.lang.reflect.Method pullLow = service.getClass().getMethod("pullLowTriggerPin");
                            pullLow.invoke(service);
                        } catch (Throwable ignored) {}
                        try {
                            java.lang.reflect.Method setSlkColor = service.getClass().getMethod("setSlkColor", int.class, int.class);
                            setSlkColor.invoke(service, 0, 0);
                        } catch (Throwable ignored) {}
                    }
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "No se pudo invocar IELOPeripheralService: " + t.getMessage());
        }
    }

    private void sendBroadcastSafe(String action) {
        try {
            context.sendBroadcast(new Intent(action));
        } catch (Exception ignored) {}
    }

    public boolean isActive() { return active; }

    /** Manda el codigo escaneado a la WebApp via JavaScript. */
    private void notifyWebView(String code) {
        if (webView == null) return;
        String escaped = code.replace("\\", "\\\\").replace("\"", "\\\"").replace("'", "\\'");
        String js = "window.dispatchEvent(new CustomEvent('elo-scan', { detail: { code: '" + escaped + "' } }));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
package com.panitas.pos;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.net.Uri;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.util.UUID;

/**
 * Actividad principal del POS Los Panitas para la terminal Elo PayPoint Plus 15".
 * Integra: Impresora Star TSP143IIIU, Gaveta de Dinero, Escaner 1D/2D,
 *          Visor VFD (Customer Display), Lector de Banda Magnetica MSR.
 */
public class MainActivity extends Activity {
    private static final String POS_URL = "https://los-panitas-by-nechy.web.app";
    private static final String POS_HOST = "los-panitas-by-nechy.web.app";

    private WebView webView;
    private UsbPrinterManager printerManager;
    private EloHardwareBridge hardwareBridge;
    private LocalCommandServer commandServer;
    private ScannerManager scannerManager;
    private CustomerDisplayManager vfdManager;
    private MsrManager msrManager;
    private Thread serverThread;
    private String hardwareToken;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Pantalla siempre encendida y sin bloquearse
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUI();

        // 1. Inicializar impresora USB (Star TSP143IIIU)
        printerManager = new UsbPrinterManager(this);

        // 2. Inicializar servidor WebSocket local en hilo de fondo
        hardwareToken = UUID.randomUUID().toString().replace("-", "");
        commandServer = new LocalCommandServer(this, printerManager, hardwareToken);
        serverThread = new Thread(commandServer, "EloCommandServer");
        serverThread.setDaemon(true);
        serverThread.start();

        // 3. Inicializar WebView con aceleracion por hardware y configuracion HD
        // Nunca expongas la sesión y el puente de hardware desde una APK de producción.
        // La inspección remota queda disponible únicamente en una compilación marcada
        // explícitamente como debuggable.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            boolean debugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            WebView.setWebContentsDebuggingEnabled(debugBuild);
        }
        webView = new WebView(this);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Renderizado nativo Full HD nitido
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // 4. Puente nativo ELO para acceso directo desde JavaScript
        hardwareBridge = new EloHardwareBridge(this, printerManager, commandServer, hardwareToken, webView);
        webView.addJavascriptInterface(hardwareBridge, "EloPOS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hideSystemUI();
                if (!isTrustedUrl(url)) return;
                // Inyectar variables de configuracion para hardware.js
                view.evaluateJavascript(
                        "window._ELO_NATIVE = true;" +
                        "window._ELO_PORT = " + LocalCommandServer.PORT + ";" +
                        "window._ELO_TOKEN = " + JSONObject.quote(hardwareToken) + ";",
                        null
                );
                // Mostrar mensaje de bienvenida en el VFD
                if (vfdManager != null) {
                    vfdManager.showWelcome("Los Panitas");
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return request.isForMainFrame() && !isTrustedUrl(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // 5. Inicializar managers de hardware adicionales
        initHardwareManagers();

        // 6. Cargar el sistema de facturacion
        webView.loadUrl(POS_URL);
    }

    private boolean isTrustedUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            int port = uri.getPort();
            return "https".equalsIgnoreCase(uri.getScheme())
                    && POS_HOST.equalsIgnoreCase(uri.getHost())
                    && (port == -1 || port == 443);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Inicializa escaner, VFD y MSR en hilos de fondo. */
    private void initHardwareManagers() {
        new Thread(() -> {
            // Escaner de barras (inicia apagado hasta que el usuario lo active)
            scannerManager = new ScannerManager(this, webView);
            scannerManager.stop();
            commandServer.setScannerManager(scannerManager);
            android.util.Log.i("EloMain", "ScannerManager inicializado (apagado por defecto).");

            // Visor VFD
            vfdManager = new CustomerDisplayManager(this);
            boolean vfdOk = vfdManager.connect();
            commandServer.setVfdManager(vfdManager);
            android.util.Log.i("EloMain", "VFD " + (vfdOk ? "conectado." : "no disponible."));

            // MSR (Lector de tarjetas)
            msrManager = new MsrManager(this, webView);
            boolean msrOk = msrManager.start();
            commandServer.setMsrManager(msrManager);
            android.util.Log.i("EloMain", "MSR " + (msrOk ? "activo." : "no disponible."));
        }, "EloHardwareInit").start();
    }

    private void hideSystemUI() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
    }

    @Override
    protected void onPause() {
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (scannerManager != null) scannerManager.stop();
        if (vfdManager != null) { vfdManager.clear(); vfdManager.disconnect(); }
        if (msrManager != null) msrManager.stop();
        if (commandServer != null) commandServer.stop();
        if (hardwareBridge != null) hardwareBridge.destroy();
        if (printerManager != null) printerManager.destroy();
        if (webView != null) {
            webView.removeJavascriptInterface("EloPOS");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}

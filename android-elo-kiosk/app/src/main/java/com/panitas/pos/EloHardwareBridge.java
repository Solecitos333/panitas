package com.panitas.pos;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Puente JavaScript inyectado en el WebView como window.EloPOS
 * Expone métodos nativos directos para abrir gaveta, imprimir ESC/POS y consultar estado.
 */
public class EloHardwareBridge {
    private final Context context;
    private final UsbPrinterManager printerManager;
    private final LocalCommandServer commandServer;
    private final AppUpdateManager updateManager;
    private final String hardwareToken;
    private final WebView webView;
    private final ExecutorService hardwareQueue = Executors.newSingleThreadExecutor();

    public EloHardwareBridge(Context context, UsbPrinterManager printerManager,
                             LocalCommandServer commandServer, AppUpdateManager updateManager,
                             String hardwareToken, WebView webView) {
        this.context = context;
        this.printerManager = printerManager;
        this.commandServer = commandServer;
        this.updateManager = updateManager;
        this.hardwareToken = hardwareToken;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean openDrawer() {
        return printerManager.openDrawer();
    }

    /** Encola la apertura y devuelve de inmediato al WebView. */
    @JavascriptInterface
    public void openDrawerAsync(String requestId) {
        hardwareQueue.execute(() -> notifyResult(requestId, "openDrawer", printerManager.openDrawer(), null));
    }

    @JavascriptInterface
    public boolean printBase64(String base64Data) {
        if (base64Data == null || base64Data.isEmpty()) return false;
        try {
            byte[] bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
            boolean isStarRaster = bytes.length > 4 && bytes[0] == 0x1B && bytes[1] == 0x40 && bytes[2] == 0x1B && bytes[3] == 0x2A;
            if (!isStarRaster) {
                String rawText = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                String cleanText = rawText.replaceAll("[\\x00-\\x09\\x0B-\\x1F\\x7F-\\x9F]", " ").trim();
                return printerManager.printFormattedText(cleanText, false);
            }
            return printerManager.sendBytes(bytes);
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    @JavascriptInterface
    public boolean printText(String text, boolean openDrawer) {
        if (text == null || text.isEmpty()) return false;
        return printerManager.printFormattedText(text, openDrawer);
    }

    /** Encola un ticket rasterizado sin bloquear el hilo JavaScript. */
    @JavascriptInterface
    public void printTextAsync(String requestId, String text, boolean openDrawer) {
        hardwareQueue.execute(() -> {
            boolean success = text != null && !text.isEmpty() && printerManager.printFormattedText(text, openDrawer);
            notifyResult(requestId, "printText", success, success ? null : "PRINTER_OFFLINE");
        });
    }

    @JavascriptInterface
    public void printBase64Async(String requestId, String base64Data) {
        hardwareQueue.execute(() -> notifyResult(requestId, "printBase64", printBase64(base64Data), null));
    }

    /** Ejecuta diagnósticos y periféricos auxiliares sin depender de WebSocket mixto. */
    @JavascriptInterface
    public void commandAsync(String requestId, String jsonCommand) {
        hardwareQueue.execute(() -> {
            try {
                JSONObject command = new JSONObject(jsonCommand == null ? "{}" : jsonCommand);
                command.put("token", hardwareToken);
                JSONObject result = new JSONObject(commandServer.processCommand(command.toString()));
                result.put("requestId", requestId == null ? "" : requestId);
                result.put("operation", command.optString("cmd", "command"));
                result.put("success", result.optBoolean("ok", false));
                notifyJsonResult(result);
            } catch (Exception error) {
                notifyResult(requestId, "command", false, "COMMAND_FAILED");
            }
        });
    }

    /** Devuelve un snapshot pequeño; nunca realiza red ni disco en el hilo JavaScript. */
    @JavascriptInterface
    public String getUpdateStatus() {
        return updateManager == null ? "{\"supported\":false}" : updateManager.getStatusJson();
    }

    /** Inicia la comprobación en el executor exclusivo del actualizador. */
    @JavascriptInterface
    public void checkForUpdates() {
        if (updateManager != null) updateManager.checkForUpdates(true);
    }

    /** Solicita instalar el APK ya descargado; respeta una venta marcada como ocupada. */
    @JavascriptInterface
    public void installUpdate() {
        if (updateManager != null) updateManager.installPendingIfSafe();
    }

    /** Abre el permiso por-aplicación requerido por Android 8.1. */
    @JavascriptInterface
    public void openUpdatePermission() {
        if (updateManager != null) updateManager.openInstallPermissionSettings();
    }

    /** Evita reemplazar la aplicación en mitad de un carrito, PIN o cobro. */
    @JavascriptInterface
    public void setUpdateBusy(boolean busy) {
        if (updateManager != null) updateManager.setUiBusy(busy);
    }

    private void notifyResult(String requestId, String operation, boolean success, String error) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("requestId", requestId == null ? "" : requestId);
            detail.put("operation", operation);
            detail.put("success", success);
            if (!success) detail.put("error", error == null ? "HARDWARE_FAILED" : error);
            notifyJsonResult(detail);
        } catch (Exception ignored) { }
    }

    private void notifyJsonResult(JSONObject detail) {
        String script = "window.dispatchEvent(new CustomEvent('elo-hardware-result',{detail:" + detail.toString() + "}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public void notifyUpdateState(JSONObject detail) {
        String payload = detail == null ? "{}" : detail.toString();
        String script = "(function(){try{var d=JSON.parse(" + JSONObject.quote(payload)
                + ");window.dispatchEvent(new CustomEvent('elo-update-status',{detail:d}));}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public void pushUpdateState() {
        if (updateManager == null) return;
        try {
            notifyUpdateState(new JSONObject(updateManager.getStatusJson()));
        } catch (Exception ignored) { }
    }

    public void destroy() {
        hardwareQueue.shutdownNow();
    }

    @JavascriptInterface
    public boolean isEloNative() {
        return true;
    }

    @JavascriptInterface
    public String getTerminalModel() {
        return android.os.Build.MODEL + " (" + android.os.Build.DEVICE + ")";
    }

    @JavascriptInterface
    public void showToast(String message) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
    }
}

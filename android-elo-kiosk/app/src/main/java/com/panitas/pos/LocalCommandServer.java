package com.panitas.pos;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Servidor TCP local que escucha en 127.0.0.1:8765.
 * Recibe comandos JSON desde la WebView y los ejecuta directamente
 * sobre el hardware nativo: impresora, gaveta, escaner, VFD, MSR.
 *
 * Protocolo:
 *   {cmd:"ping"}           -> {ok:true, method:"elo-local-server"}
 *   {cmd:"openDrawer"}     -> {ok:true}
 *   {cmd:"print",data:""}  -> {ok:true}
 *   {cmd:"scannerOn"}      -> {ok:true}
 *   {cmd:"scannerOff"}     -> {ok:true}
 *   {cmd:"setVFD",l1:"",l2:""} -> {ok:true}
 *   {cmd:"clearVFD"}       -> {ok:true}
 *   {cmd:"beep",tone:0}    -> {ok:true}
 *   {cmd:"status"}         -> {ok:true, printerConnected:..., vfdConnected:...}
 */
public class LocalCommandServer implements Runnable {
    private static final String TAG = "EloCmdServer";
    public static final int PORT = 8765;
    private static final String ALLOWED_ORIGIN = "https://los-panitas-by-nechy.web.app";
    private static final int MAX_FRAME_BYTES = 4 * 1024 * 1024;
    private static final int MAX_HEADER_BYTES = 16 * 1024;

    private final Context context;
    private final UsbPrinterManager printerManager;
    private final String authToken;
    private ScannerManager scannerManager;
    private CustomerDisplayManager vfdManager;
    private MsrManager msrManager;

    private volatile boolean running = true;
    private ServerSocket serverSocket;
    private final ThreadPoolExecutor clientExecutor = new ThreadPoolExecutor(
            2,
            4,
            30,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(16),
            new ThreadPoolExecutor.AbortPolicy()
    );

    public LocalCommandServer(Context context, UsbPrinterManager printerManager, String authToken) {
        this.context = context;
        this.printerManager = printerManager;
        this.authToken = authToken;
    }

    public void setScannerManager(ScannerManager sm) { this.scannerManager = sm; }
    public void setVfdManager(CustomerDisplayManager vm) { this.vfdManager = vm; }
    public void setMsrManager(MsrManager mm) { this.msrManager = mm; }

    public void stop() {
        running = false;
        clientExecutor.shutdownNow();
        try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) {}
    }

    @Override
    public void run() {
        try {
            serverSocket = new ServerSocket(PORT, 10, java.net.InetAddress.getByName("127.0.0.1"));
            serverSocket.setReuseAddress(true);
            Log.i(TAG, "Servidor de comandos ELO escuchando en 127.0.0.1:" + PORT);

            while (running) {
                try {
                    Socket client = serverSocket.accept();
                    try {
                        clientExecutor.execute(() -> handleClient(client));
                    } catch (RejectedExecutionException rejected) {
                        try { client.close(); } catch (IOException ignored) {}
                        Log.w(TAG, "Conexión local rechazada: límite de clientes alcanzado.");
                    }
                } catch (IOException e) {
                    if (running) Log.w(TAG, "Error al aceptar conexion: " + e.getMessage());
                }
            }
        } catch (IOException e) {
            Log.e(TAG, "No se pudo iniciar el servidor de comandos", e);
        }
    }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(10000);
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            OutputStream out = client.getOutputStream();

            StringBuilder headers = new StringBuilder();
            String line;
            String wsKey = null;
            String firstLine = null;
            String origin = null;
            int contentLength = 0;
            int headerBytes = 0;
            boolean invalidHeaders = false;

            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                headerBytes += line.getBytes(StandardCharsets.UTF_8).length + 2;
                if (headerBytes > MAX_HEADER_BYTES) {
                    invalidHeaders = true;
                    break;
                }
                if (firstLine == null) firstLine = line;
                headers.append(line).append("\r\n");
                String lower = line.toLowerCase();
                if (lower.startsWith("sec-websocket-key:")) {
                    wsKey = line.substring(line.indexOf(':') + 1).trim();
                } else if (lower.startsWith("origin:")) {
                    origin = line.substring(line.indexOf(':') + 1).trim();
                } else if (lower.startsWith("content-length:")) {
                    try {
                        contentLength = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                    } catch (Exception ignored) {
                        invalidHeaders = true;
                    }
                }
            }

            if (invalidHeaders || contentLength < 0 || contentLength > MAX_FRAME_BYTES) {
                byte[] denied = "{\"ok\":false,\"error\":\"REQUEST_TOO_LARGE\"}".getBytes(StandardCharsets.UTF_8);
                String response = "HTTP/1.1 413 Payload Too Large\r\nContent-Type: application/json\r\nContent-Length: "
                        + denied.length + "\r\nConnection: close\r\n\r\n";
                out.write(response.getBytes(StandardCharsets.UTF_8));
                out.write(denied);
                out.flush();
            } else if (!ALLOWED_ORIGIN.equals(origin)) {
                byte[] denied = "{\"ok\":false,\"error\":\"ORIGIN_DENIED\"}".getBytes(StandardCharsets.UTF_8);
                String response = "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: "
                        + denied.length + "\r\nConnection: close\r\n\r\n";
                out.write(response.getBytes(StandardCharsets.UTF_8));
                out.write(denied);
                out.flush();
            } else if (wsKey != null) {
                String acceptKey = computeWebSocketAccept(wsKey);
                String handshake = "HTTP/1.1 101 Switching Protocols\r\n"
                        + "Upgrade: websocket\r\n"
                        + "Connection: Upgrade\r\n"
                        + "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";
                out.write(handshake.getBytes(StandardCharsets.UTF_8));
                out.flush();
                client.setSoTimeout(0); // Sin timeout para conexion WebSocket persistente
                handleWebSocketFrames(client, out);
            } else {
                String body;
                if (firstLine != null && firstLine.startsWith("POST") && contentLength > 0) {
                    char[] bodyChars = new char[contentLength];
                    int read = 0;
                    while (read < contentLength) {
                        int r = reader.read(bodyChars, read, contentLength - read);
                        if (r == -1) break;
                        read += r;
                    }
                    String requestBody = new String(bodyChars);
                    body = processCommand(requestBody);
                } else {
                    body = "{\"ok\":true,\"server\":\"elo-pos\",\"port\":" + PORT + "}";
                }

                byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
                String response = "HTTP/1.1 200 OK\r\n"
                        + "Content-Type: application/json\r\n"
                        + "Access-Control-Allow-Origin: " + ALLOWED_ORIGIN + "\r\n"
                        + "Vary: Origin\r\n"
                        + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                        + "Access-Control-Allow-Headers: Content-Type\r\n"
                        + "Content-Length: " + bodyBytes.length + "\r\n\r\n";
                out.write(response.getBytes(StandardCharsets.UTF_8));
                out.write(bodyBytes);
                out.flush();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error en cliente: " + e.getMessage());
        } finally {
            try { client.close(); } catch (IOException ignored) {}
        }
    }

    private void handleWebSocketFrames(Socket client, OutputStream out) throws IOException {
        java.io.InputStream in = client.getInputStream();
        while (!client.isClosed() && running) {
            int b0 = in.read();
            int b1 = in.read();
            if (b0 == -1 || b1 == -1) break;

            boolean masked = (b1 & 0x80) != 0;
            int payloadLen = b1 & 0x7F;

            if (payloadLen == 126) {
                payloadLen = ((in.read() & 0xFF) << 8) | (in.read() & 0xFF);
            } else if (payloadLen == 127) {
                long len = 0;
                for (int i = 0; i < 8; i++) {
                    int b = in.read();
                    if (b == -1) break;
                    len = (len << 8) | (b & 0xFF);
                }
                payloadLen = (int) len;
            }
            if (payloadLen < 0 || payloadLen > MAX_FRAME_BYTES) break;

            byte[] mask = new byte[4];
            if (masked) {
                int read = in.read(mask, 0, 4);
                if (read < 4) break;
            }

            byte[] payload = new byte[payloadLen];
            int totalRead = 0;
            while (totalRead < payloadLen) {
                int r = in.read(payload, totalRead, payloadLen - totalRead);
                if (r == -1) break;
                totalRead += r;
            }

            if (masked) {
                for (int i = 0; i < payloadLen; i++) payload[i] ^= mask[i % 4];
            }

            String message = new String(payload, StandardCharsets.UTF_8);
            String response = processCommand(message);

            byte[] responseBytes = response.getBytes(StandardCharsets.UTF_8);
            byte[] frame;
            if (responseBytes.length <= 125) {
                frame = new byte[2 + responseBytes.length];
                frame[0] = (byte) 0x81;
                frame[1] = (byte) responseBytes.length;
                System.arraycopy(responseBytes, 0, frame, 2, responseBytes.length);
            } else {
                frame = new byte[4 + responseBytes.length];
                frame[0] = (byte) 0x81;
                frame[1] = 126;
                frame[2] = (byte) ((responseBytes.length >> 8) & 0xFF);
                frame[3] = (byte) (responseBytes.length & 0xFF);
                System.arraycopy(responseBytes, 0, frame, 4, responseBytes.length);
            }
            out.write(frame);
            out.flush();
        }
    }

    String processCommand(String message) {
        try {
            JSONObject cmd = new JSONObject(message);
            if (!authToken.equals(cmd.optString("token", ""))) {
                return "{\"ok\":false,\"error\":\"UNAUTHORIZED\"}";
            }
            String command = cmd.optString("cmd", "");

            switch (command) {

                // --- DIAGNOSTICO ---
                case "ping":
                    return "{\"ok\":true,\"method\":\"elo-local-server\",\"port\":" + PORT + "}";

                case "status": {
                    JSONObject info = new JSONObject();
                    info.put("ok", true);
                    info.put("printerConnected", printerManager.isConnected());
                    info.put("drawerAvailable", printerManager.isConnected());
                    info.put("scannerAvailable", scannerManager != null);
                    info.put("scannerActive", scannerManager != null && scannerManager.isActive());
                    info.put("vfdConnected", vfdManager != null && vfdManager.isConnected());
                    info.put("msrActive", msrManager != null && msrManager.isActive());

                    // Consulta de estado de papel
                    printerManager.queryPrinterStatus();
                    boolean paperOut = printerManager.isPaperOut();
                    boolean paperLow = printerManager.isPaperLow();
                    boolean coverOpen = printerManager.isCoverOpen();
                    boolean paperStatusSupported = printerManager.isPaperStatusSupported();
                    info.put("paperOut", paperOut);
                    info.put("paperLow", paperLow);
                    info.put("coverOpen", coverOpen);
                    info.put("paperStatusSupported", paperStatusSupported);
                    info.put("paperStatus", !printerManager.isConnected() ? "unavailable"
                            : (!paperStatusSupported ? "unsupported" : (paperOut ? "out" : (paperLow ? "near_end" : "ok"))));

                    info.put("model", android.os.Build.MODEL);
                    info.put("device", android.os.Build.DEVICE);
                    info.put("androidVersion", android.os.Build.VERSION.RELEASE);
                    info.put("sdkInt", android.os.Build.VERSION.SDK_INT);
                    info.put("port", PORT);

                    android.os.StatFs statFs = new android.os.StatFs(android.os.Environment.getExternalStorageDirectory().getPath());
                    long freeBytes = statFs.getAvailableBlocksLong() * statFs.getBlockSizeLong();
                    info.put("freeStorageMb", freeBytes / (1024 * 1024));

                    android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager)
                            context.getSystemService(android.content.Context.WIFI_SERVICE);
                    if (wm != null) {
                        int ipInt = wm.getConnectionInfo().getIpAddress();
                        String ip = android.text.format.Formatter.formatIpAddress(ipInt);
                        info.put("wifiIp", ip);
                        info.put("wifiSsid", wm.getConnectionInfo().getSSID());
                    }
                    return info.toString();
                }

                case "listUsb": {
                    android.hardware.usb.UsbManager um = (android.hardware.usb.UsbManager)
                            context.getSystemService(android.content.Context.USB_SERVICE);
                    java.util.HashMap<String, android.hardware.usb.UsbDevice> devices = um.getDeviceList();
                    StringBuilder sb = new StringBuilder("[");
                    boolean first = true;
                    for (android.hardware.usb.UsbDevice d : devices.values()) {
                        if (!first) sb.append(",");
                        first = false;
                        sb.append("{\"name\":\"").append(d.getDeviceName()).append("\"")
                          .append(",\"vendorId\":").append(d.getVendorId())
                          .append(",\"productId\":").append(d.getProductId())
                          .append(",\"class\":").append(d.getDeviceClass())
                          .append(",\"interfaces\":").append(d.getInterfaceCount())
                          .append(",\"hasPermission\":").append(um.hasPermission(d))
                          .append("}");
                    }
                    sb.append("]");
                    return "{\"ok\":true,\"devices\":" + sb + "}";
                }

                case "getSettings": {
                    android.content.SharedPreferences prefs = context.getSharedPreferences("pos_settings", android.content.Context.MODE_PRIVATE);
                    JSONObject settings = new JSONObject();
                    settings.put("ok", true);
                    for (java.util.Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                        settings.put(entry.getKey(), String.valueOf(entry.getValue()));
                    }
                    return settings.toString();
                }

                case "setSetting": {
                    String key = cmd.optString("key", "");
                    String value = cmd.optString("value", "");
                    if (key.isEmpty()) return "{\"ok\":false,\"error\":\"key requerido\"}";
                    android.content.SharedPreferences prefs = context.getSharedPreferences("pos_settings", android.content.Context.MODE_PRIVATE);
                    prefs.edit().putString(key, value).apply();
                    return "{\"ok\":true}";
                }

                case "reconnectPrinter": {
                    printerManager.findAndConnectPrinter();
                    return "{\"ok\":true,\"connected\":" + printerManager.isConnected() + "}";
                }

                case "checkPaper": {
                    printerManager.queryPrinterStatus();
                    JSONObject res = new JSONObject();
                    res.put("ok", true);
                    res.put("printerConnected", printerManager.isConnected());
                    res.put("paperOut", printerManager.isPaperOut());
                    res.put("paperLow", printerManager.isPaperLow());
                    res.put("coverOpen", printerManager.isCoverOpen());
                    boolean paperStatusSupported = printerManager.isPaperStatusSupported();
                    res.put("paperStatusSupported", paperStatusSupported);
                    res.put("paperStatus", !printerManager.isConnected() ? "unavailable"
                            : (!paperStatusSupported ? "unsupported" : (printerManager.isPaperOut() ? "out" : (printerManager.isPaperLow() ? "near_end" : "ok"))));
                    return res.toString();
                }

                case "setPaperStatus": {
                    boolean out = cmd.optBoolean("paperOut", false);
                    boolean low = cmd.optBoolean("paperLow", false);
                    printerManager.setPaperStatusManual(out, low);
                    return "{\"ok\":true,\"paperOut\":" + out + ",\"paperLow\":" + low + "}";
                }

                // --- HARDWARE: IMPRESORA Y GAVETA ---
                case "openDrawer": {
                    boolean ok = printerManager.openDrawer();
                    return "{\"ok\":" + ok + ",\"sent\":" + ok + ",\"printerReady\":" + printerManager.isConnected() + "}";
                }

                case "printText": {
                    String text = cmd.optString("text", "");
                    boolean openDrawer = cmd.optBoolean("openDrawer", false);
                    if (text.isEmpty()) return "{\"ok\":false,\"error\":\"Sin texto\"}";
                    boolean ok = printerManager.printFormattedText(text, openDrawer);
                    return ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Error al imprimir ticket\"}";
                }

                case "print": {
                    String data = cmd.optString("data", "");
                    boolean isText = cmd.optBoolean("isText", false);
                    boolean openDrawer = cmd.optBoolean("openDrawer", false);
                    if (data.isEmpty()) return "{\"ok\":false,\"error\":\"Sin datos\"}";
                    if (isText) {
                        boolean ok = printerManager.printFormattedText(data, openDrawer);
                        return ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Error al imprimir ticket\"}";
                    }
                    byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                    boolean isStarRaster = bytes.length > 4 && bytes[0] == 0x1B && bytes[1] == 0x40 && bytes[2] == 0x1B && bytes[3] == 0x2A;
                    if (!isStarRaster) {
                        String rawText = new String(bytes, StandardCharsets.UTF_8);
                        String cleanText = rawText.replaceAll("[\\x00-\\x09\\x0B-\\x1F\\x7F-\\x9F]", " ").trim();
                        boolean ok = printerManager.printFormattedText(cleanText, openDrawer);
                        return ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Error al imprimir ticket\"}";
                    }
                    boolean ok = printerManager.sendBytes(bytes);
                    return ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"Error al enviar a la impresora\"}";
                }

                // --- HARDWARE: ESCANER DE BARRAS ---
                case "scannerOn": {
                    if (scannerManager == null) return "{\"ok\":false,\"error\":\"ScannerManager no inicializado\"}";
                    scannerManager.start();
                    return "{\"ok\":true,\"scannerActive\":true}";
                }

                case "scannerOff": {
                    if (scannerManager != null) scannerManager.stop();
                    return "{\"ok\":true,\"scannerActive\":false}";
                }

                // --- HARDWARE: VISOR VFD ---
                case "setVFD": {
                    if (vfdManager == null) return "{\"ok\":false,\"error\":\"VFD no inicializado\"}";
                    String l1 = cmd.optString("l1", "");
                    String l2 = cmd.optString("l2", "");
                    boolean ok = vfdManager.setMessage(l1, l2);
                    return "{\"ok\":" + ok + ",\"vfdConnected\":" + vfdManager.isConnected() + "}";
                }

                case "clearVFD": {
                    if (vfdManager != null) vfdManager.clear();
                    return "{\"ok\":true}";
                }

                case "vfdWelcome": {
                    if (vfdManager != null) {
                        String name = cmd.optString("name", "Los Panitas");
                        vfdManager.showWelcome(name);
                    }
                    return "{\"ok\":true}";
                }

                // --- HARDWARE: PITIDO / AUDIO ---
                case "beep": {
                    int tone = cmd.optInt("tone", 0); // 0=ok, 1=error, 2=warning
                    try {
                        if (tone == 1) {
                            // Doble beep de error
                            android.media.ToneGenerator tg = new android.media.ToneGenerator(
                                    android.media.AudioManager.STREAM_ALARM, 80);
                            tg.startTone(android.media.ToneGenerator.TONE_PROP_NACK, 200);
                            Thread.sleep(300);
                            tg.startTone(android.media.ToneGenerator.TONE_PROP_NACK, 200);
                        } else if (tone == 2) {
                            // Beep de advertencia
                            android.media.ToneGenerator tg = new android.media.ToneGenerator(
                                    android.media.AudioManager.STREAM_ALARM, 60);
                            tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        } else {
                            // Beep de exito
                            android.media.ToneGenerator tg = new android.media.ToneGenerator(
                                    android.media.AudioManager.STREAM_ALARM, 60);
                            tg.startTone(android.media.ToneGenerator.TONE_PROP_ACK, 150);
                        }
                    } catch (Exception ignored) {}
                    return "{\"ok\":true}";
                }

                default:
                    return "{\"ok\":false,\"error\":\"Comando desconocido: " + command + "\"}";
            }
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null) msg = e.getClass().getSimpleName();
            msg = msg.replace("\\", "\\\\").replace("\"", "\\\"");
            return "{\"ok\":false,\"error\":\"" + msg + "\"}";
        }
    }

    private String computeWebSocketAccept(String key) {
        try {
            String magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-1");
            byte[] sha1 = md.digest(magic.getBytes(StandardCharsets.UTF_8));
            return android.util.Base64.encodeToString(sha1, android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}

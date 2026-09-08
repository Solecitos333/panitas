package com.panitas.pos;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Signed APK assets under the existing HTTPS origin, preserving Firebase sessions. */
public final class BundledWebApp {
    private final AssetManager assets;
    private final String host;
    public BundledWebApp(AssetManager assets, String host) { this.assets = assets; this.host = host; }

    public WebResourceResponse intercept(Uri uri, String method) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !host.equalsIgnoreCase(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
        String path = uri.getPath();
        // Updates and Firebase's hosted auth helpers remain network resources.
        if (path != null && (path.startsWith("/downloads/") || path.startsWith("/__/"))) return null;
        String asset = assetPath(path);
        if (!"GET".equals(method) || asset == null) return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
        try {
            InputStream stream = assets.open("www/" + asset);
            if (asset.equals("index.html")) android.util.Log.i("EloLocalShell", "Interfaz servida desde assets de la APK");
            return response(200, "OK", mime(asset), stream);
        }
        catch (IOException error) {
            // Never mix a signed shell with new remote JS/CSS from another release.
            return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
        }
    }

    public static String assetPath(String path) {
        if (path == null || path.equals("/") || path.equals("/index.html") || path.equals("/__terminal__/index.html")) return "index.html";
        if (!path.startsWith("/") || path.contains("\\") || path.indexOf('\0') >= 0) return null;
        for (String part : path.substring(1).split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return null;
        }
        return path.substring(1);
    }

    private static String mime(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private static WebResourceResponse response(int status, String reason, String mime, InputStream stream) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
        headers.put("X-Panitas-Shell", "apk");
        return new WebResourceResponse(mime, "UTF-8", status, reason, headers, stream);
    }
}

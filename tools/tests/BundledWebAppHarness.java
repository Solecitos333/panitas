package com.panitas.pos.tests;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import com.panitas.pos.BundledWebApp;
import java.io.*;

/** Tests signed asset loading and routing without app/session or network access. */
public final class BundledWebAppHarness {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void verify(String apk) throws Exception {
        check("index.html".equals(BundledWebApp.assetPath("/__terminal__/index.html")), "entry point");
        for (String path : new String[]{"/../x", "/a/../x", "/a/./x", "/a//x", "/a\\x", "/a\0x", "relative"}) {
            check(BundledWebApp.assetPath(path) == null, "invalid path: " + path);
        }
        AssetManager assets = AssetManager.class.getDeclaredConstructor().newInstance();
        int cookie = (Integer) AssetManager.class.getMethod("addAssetPath", String.class).invoke(assets, apk);
        check(cookie != 0, "cannot load APK assets");
        BundledWebApp app = new BundledWebApp(assets, "los-panitas-by-nechy.web.app");
        for (String url : new String[]{"https://firestore.googleapis.com/v1/documents", "https://los-panitas-by-nechy.web.app/downloads/update.json", "https://los-panitas-by-nechy.web.app/__/auth/handler"}) {
            check(app.intercept(Uri.parse(url), "GET") == null, "network request intercepted: " + url);
        }
        String origin = "https://los-panitas-by-nechy.web.app";
        WebResourceResponse index = app.intercept(Uri.parse(origin + "/__terminal__/index.html"), "GET");
        check(index.getStatusCode() == 200 && "text/html".equals(index.getMimeType()), "local index response");
        check("apk".equals(index.getResponseHeaders().get("X-Panitas-Shell")), "shell marker");
        ByteArrayOutputStream html = new ByteArrayOutputStream();
        try (InputStream stream = index.getData()) { byte[] buffer = new byte[4096]; int n; while ((n = stream.read(buffer)) != -1) html.write(buffer, 0, n); }
        check(html.toString("UTF-8").contains("/assets/"), "index references");
        for (String path : new String[]{"/assets/missing.js", "/a/%2e%2e/x", "/a%5cx"}) {
            check(app.intercept(Uri.parse(origin + path), "GET").getStatusCode() == 404, "must not mix remote assets: " + path);
        }
        check(app.intercept(Uri.parse(origin + "/index.html"), "POST").getStatusCode() == 404, "POST blocked");
        assets.close();
        System.out.println("BUNDLED_WEB_APP_OK: APK entry, safe paths, same origin and network exclusions");
    }
}

package com.panitas.management;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** Browser-powered management app. No WebView credential interception or POS privileges. */
public final class MainActivity extends Activity {
    private static final String DASHBOARD = "https://los-panitas-by-nechy.web.app/?mode=management#dashboard";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent dashboard = new Intent(Intent.ACTION_VIEW, Uri.parse(DASHBOARD));
        // Null Custom Tabs session is supported for a simple browser-managed tab.
        // Browsers without Custom Tabs ignore these extras and open the same HTTPS page.
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        dashboard.putExtras(extras);
        dashboard.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", 0xff111827);
        dashboard.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        try {
            startActivity(dashboard);
            finish();
        } catch (ActivityNotFoundException error) {
            new AlertDialog.Builder(this)
                .setTitle("Necesitas un navegador")
                .setMessage("Instala o habilita Chrome u otro navegador compatible para abrir el panel seguro de Los Panitas.")
                .setPositiveButton("Cerrar", (dialog, which) -> finish())
                .setOnCancelListener(dialog -> finish())
                .show();
        }
    }
}

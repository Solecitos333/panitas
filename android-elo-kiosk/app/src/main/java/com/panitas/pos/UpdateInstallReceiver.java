package com.panitas.pos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recibe el resultado oficial de la sesión PackageInstaller. */
public final class UpdateInstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            AppUpdateManager.handlePackageReplaced(context);
            return;
        }
        AppUpdateManager.handleInstallerBroadcast(context, intent);
    }
}

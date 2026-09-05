package com.panitas.pos;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.net.ssl.HttpsURLConnection;

/**
 * Actualizador seguro y autocontenido para la APK de la terminal ELO.
 *
 * La red, el hash y la extracción se ejecutan fuera de la cola de periféricos.
 * Android conserva la última palabra sobre la instalación: en una terminal común
 * mostrará su confirmación; en un dispositivo totalmente administrado puede
 * completar la misma sesión PackageInstaller sin intervención.
 */
public final class AppUpdateManager {
    public interface Listener {
        void onUpdateState(JSONObject state);
    }

    private static final String TAG = "PanitasUpdater";
    private static final String UPDATE_HOST = "los-panitas-by-nechy.web.app";
    private static final String UPDATE_MANIFEST_URL =
            "https://los-panitas-by-nechy.web.app/downloads/update.json";
    private static final String EXPECTED_PACKAGE = "com.panitas.pos";
    private static final String EXPECTED_APK_ENTRY = "LosPanitas-Elo-POS.apk";
    private static final String INSTALL_ACTION = "com.panitas.pos.UPDATE_INSTALL_STATUS";
    private static final String PREFS = "panitas_update_state";
    private static final long CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final long INITIAL_CHECK_DELAY_MS = 5000L;
    private static final long INSTALL_GRACE_MS = 8000L;
    private static final long RETRY_DELAY_MS = 15L * 60L * 1000L;
    private static final long INSTALL_TIMEOUT_MS = 10L * 60L * 1000L;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private static final long MAX_ARCHIVE_BYTES = 50L * 1024L * 1024L;
    private static final long MAX_APK_BYTES = 50L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 45000;

    private static volatile WeakReference<AppUpdateManager> activeManager =
            new WeakReference<>(null);

    private final Activity activity;
    private final SharedPreferences prefs;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicBoolean checkInFlight = new AtomicBoolean(false);
    private final AtomicBoolean installInFlight = new AtomicBoolean(false);
    private final Object stateLock = new Object();
    private final Object operationLock = new Object();
    private volatile Listener listener;
    private volatile JSONObject state;
    // An initial/reloaded page has not yet proved that the register is idle.
    private volatile boolean uiBusy = true;
    private volatile boolean uiReady;
    private volatile boolean foreground;
    private volatile boolean destroyed;
    private final Runnable periodicCheck = new Runnable() {
        @Override public void run() {
            if (destroyed) return;
            checkForUpdates(false);
            mainHandler.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };
    private final Runnable retryCheck = () -> {
        if (!destroyed) checkForUpdates(true);
    };
    private final Runnable automaticInstall = this::tryAutomaticInstall;
    private final Runnable reconcileInstall = this::reconcileInstallSession;

    public AppUpdateManager(Activity activity) {
        this.activity = activity;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.state = createBaseState();
        activeManager = new WeakReference<>(this);
        restorePendingState();
    }

    public void setListener(Listener listener) {
        this.listener = listener;
        emitState();
    }

    public int getInstalledVersionCode() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionCode;
        } catch (Exception ignored) {
            return 0;
        }
    }

    public String getInstalledVersionName() {
        try {
            String name = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
            return name == null ? "desconocida" : name;
        } catch (Exception ignored) {
            return "desconocida";
        }
    }

    public String getStatusJson() {
        synchronized (stateLock) {
            return state.toString();
        }
    }

    public void startAutomaticChecks() {
        mainHandler.removeCallbacks(periodicCheck);
        mainHandler.postDelayed(periodicCheck, INITIAL_CHECK_DELAY_MS);
        if (hasPendingUpdate()) {
            scheduleAutomaticInstall(INSTALL_GRACE_MS);
        }
    }

    public void checkForUpdates(boolean force) {
        synchronized (operationLock) {
            if (destroyed || installInFlight.get() || checkInFlight.get()) return;
            // A forced check must never delete/re-extract an APK that is staged for installation.
            if (hasPendingUpdate()) {
                scheduleAutomaticInstall(INSTALL_GRACE_MS);
                emitState();
                return;
            }
            long lastChecked = prefs.getLong("last_checked_at", 0L);
            if (!force && System.currentTimeMillis() - lastChecked < CHECK_INTERVAL_MS) return;
            checkInFlight.set(true);
        }

        publish("checking", "Buscando una versión nueva…", null, 0, true, "");
        executeUpdateTask(() -> {
            File archive = null;
            File apk = null;
            boolean persisted = false;
            try {
                Release release = fetchReleaseManifest();
                ensureActive();
                mainHandler.removeCallbacks(retryCheck);
                prefs.edit().putLong("last_checked_at", System.currentTimeMillis()).apply();
                if (release.versionCode <= getInstalledVersionCode()) {
                    clearObsoletePendingUpdate();
                    publish("up_to_date", "La aplicación ELO está al día.", release, 100, false, "");
                    return;
                }

                publish("available", "Nueva versión " + release.versionName + " encontrada.", release, 0, true, "");
                archive = downloadArchive(release);
                ensureActive();
                publish("verifying", "Verificando integridad, paquete y firma…", release, 100, true, "");
                apk = extractAndVerifyApk(archive, release);
                verifyApkIdentity(apk, release);
                synchronized (operationLock) {
                    ensureActive();
                    persistPendingUpdate(apk, release);
                    persisted = true;
                }
                publish("ready", "Actualización verificada y lista para instalar.", release, 100, true, "");
                scheduleAutomaticInstall(INSTALL_GRACE_MS);
            } catch (UpdateException error) {
                Log.w(TAG, error.code + ": " + error.getMessage());
                publish("error", error.userMessage, null, 0, true, error.code);
                scheduleRetry();
            } catch (Exception error) {
                Log.e(TAG, "Fallo inesperado del actualizador", error);
                publish("error", "No se pudo completar la actualización. Se volverá a intentar.",
                        null, 0, true, "UPDATE_FAILED");
                scheduleRetry();
            } finally {
                if (archive != null) deleteQuietly(archive);
                if (!persisted && apk != null) deleteQuietly(apk);
                checkInFlight.set(false);
            }
        });
    }

    /** Informa si hay una operación visual que no debe interrumpirse. */
    public void setUiBusy(boolean busy) {
        synchronized (operationLock) {
            uiReady = true;
            uiBusy = busy;
        }
        mainHandler.removeCallbacks(automaticInstall);
        if (!busy && hasPendingUpdate()) {
            scheduleAutomaticInstall(INSTALL_GRACE_MS);
        } else if (busy && hasPendingUpdate() && !installInFlight.get() && !isInstallDeferred()) {
            Release pending = pendingRelease();
            publish("waiting_for_idle", "Se instalará al terminar la venta actual.", pending, 100, true, "");
        }
    }

    public void onPageLoading() {
        synchronized (operationLock) {
            uiReady = false;
            uiBusy = true;
        }
        mainHandler.removeCallbacks(automaticInstall);
    }

    /** Explicit user retry; automatic lifecycle callbacks never clear a cancellation. */
    public void installPendingIfSafe() {
        prefs.edit().remove("install_deferred_version").apply();
        tryAutomaticInstall();
    }

    private void scheduleAutomaticInstall(long delayMs) {
        mainHandler.removeCallbacks(automaticInstall);
        if (!destroyed) mainHandler.postDelayed(automaticInstall, delayMs);
    }

    private boolean isInstallDeferred() {
        int pendingCode = prefs.getInt("pending_version_code", 0);
        return pendingCode > 0 && pendingCode == prefs.getInt("install_deferred_version", 0);
    }

    private boolean isUiSafe() {
        return !destroyed && foreground && uiReady && !uiBusy;
    }

    private void tryAutomaticInstall() {
        if (destroyed || !hasPendingUpdate() || installInFlight.get() || isInstallDeferred()) return;
        Release release = pendingRelease();
        if (release == null) {
            clearPendingUpdate();
            return;
        }
        if (!isUiSafe()) {
            publish("waiting_for_idle", "Se instalará al terminar la venta actual.", release, 100, true, "");
            return;
        }

        if (!isFullyManaged() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            publish("permission_required",
                    "Android necesita autorizar a Los Panitas para instalar esta actualización.",
                    release, 100, true, "INSTALL_PERMISSION_REQUIRED");
            int promptedVersion = prefs.getInt("permission_prompted_version", 0);
            if (promptedVersion != release.versionCode) {
                prefs.edit().putInt("permission_prompted_version", release.versionCode).apply();
                openInstallPermissionSettings();
            }
            return;
        }

        synchronized (operationLock) {
            if (!isUiSafe() || checkInFlight.get() || !installInFlight.compareAndSet(false, true)) return;
        }
        publish("installing", isFullyManaged()
                        ? "Instalando la actualización automáticamente…"
                        : "Preparando la confirmación segura de Android…",
                release, 100, false, "");
        executeUpdateTask(() -> {
            try {
                File apk = new File(prefs.getString("pending_apk_path", ""));
                verifyPendingApk(apk, release);
                if (!isUiSafe()) {
                    deferUntilIdle(release);
                    return;
                }
                commitInstallSession(apk, release);
            } catch (UpdateException error) {
                installInFlight.set(false);
                // A corrupt/stale APK must be downloadable again instead of poisoning every retry.
                clearPendingUpdate();
                publish("error", error.userMessage, release, 100, true, error.code);
            } catch (Exception error) {
                installInFlight.set(false);
                deferInstall(release);
                Log.e(TAG, "No se pudo iniciar PackageInstaller", error);
                publish("error", "Android no pudo iniciar la instalación. Pulsa Reintentar.",
                        release, 100, true, "INSTALL_START_FAILED");
            }
        });
    }

    private void deferUntilIdle(Release release) {
        installInFlight.set(false);
        publish("waiting_for_idle", "Se instalará al terminar la operación actual.", release, 100, true, "");
        if (isUiSafe()) scheduleAutomaticInstall(INSTALL_GRACE_MS);
    }

    private void deferInstall(Release release) {
        if (release != null) prefs.edit().putInt("install_deferred_version", release.versionCode).apply();
        mainHandler.removeCallbacks(automaticInstall);
    }

    public void openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            installPendingIfSafe();
            return;
        }
        mainHandler.post(() -> {
            // La acción explícita ocurre durante la gracia de actividad web.
            // La web bloquea este botón si existen operaciones o datos pendientes;
            // las llamadas automáticas ya han comprobado isUiSafe().
            if (destroyed || !foreground || !uiReady) return;
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(intent);
                Toast.makeText(activity,
                        "Activa “Permitir desde esta fuente” y vuelve a Los Panitas.",
                        Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                publish("error", "No se pudo abrir el permiso de instalación de Android.",
                        pendingRelease(), 100, true, "PERMISSION_SETTINGS_FAILED");
            }
        });
    }

    public void onResume() {
        foreground = true;
        if (installInFlight.get()) {
            reconcileInstallSession();
            return;
        }
        if (!hasPendingUpdate() || !isUiSafe() || isInstallDeferred()) return;
        if (isFullyManaged() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || activity.getPackageManager().canRequestPackageInstalls()) {
            scheduleAutomaticInstall(INSTALL_GRACE_MS);
        }
    }

    public void onPause() {
        synchronized (operationLock) { foreground = false; }
        mainHandler.removeCallbacks(automaticInstall);
    }

    public boolean isFullyManaged() {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager)
                    activity.getSystemService(Context.DEVICE_POLICY_SERVICE);
            return dpm != null && dpm.isDeviceOwnerApp(activity.getPackageName());
        } catch (Exception ignored) {
            return false;
        }
    }

    public void destroy() {
        synchronized (operationLock) { destroyed = true; }
        mainHandler.removeCallbacksAndMessages(null);
        listener = null;
        AppUpdateManager current = activeManager.get();
        if (current == this) activeManager = new WeakReference<>(null);
        updateExecutor.shutdownNow();
    }

    private void scheduleRetry() {
        if (destroyed) return;
        mainHandler.removeCallbacks(retryCheck);
        mainHandler.postDelayed(retryCheck, RETRY_DELAY_MS);
    }

    private void ensureActive() throws InterruptedException {
        if (destroyed || activeManager.get() != this || Thread.currentThread().isInterrupted()) {
            throw new InterruptedException("Updater activity was closed");
        }
    }

    private void executeUpdateTask(Runnable task) {
        try { updateExecutor.execute(task); }
        catch (RejectedExecutionException ignored) {
            checkInFlight.set(false);
            installInFlight.set(false);
        }
    }

    static void handleInstallerBroadcast(Context context, Intent intent) {
        if (intent == null || !INSTALL_ACTION.equals(intent.getAction())) return;
        SharedPreferences stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int sessionId = intent.getIntExtra("updateSessionId", -1);
        if (sessionId < 0 || sessionId != stored.getInt("install_session_id", -1)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        stored.edit().putInt("last_installer_status", status)
                .putString("last_installer_message", message == null ? "" : message).commit();
        AppUpdateManager manager = activeManager.get();
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            try {
                if (confirmation == null) throw new IllegalStateException("Missing installer confirmation");
                if (manager != null) manager.onInstallerStatus(status, message);
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmation);
                return;
            } catch (Exception error) {
                Log.e(TAG, "No se pudo abrir la confirmación de Android", error);
                try { context.getPackageManager().getPackageInstaller().abandonSession(sessionId); }
                catch (Exception ignored) { }
                status = PackageInstaller.STATUS_FAILURE_ABORTED;
                message = "Android no pudo abrir la confirmación; vuelve a intentar la instalación.";
                stored.edit().putInt("last_installer_status", status)
                        .putString("last_installer_message", message).commit();
            }
        }

        if (manager != null) manager.onInstallerStatus(status, message);
        else if (status != PackageInstaller.STATUS_SUCCESS) {
            stored.edit().putInt("install_deferred_version", stored.getInt("pending_version_code", 0))
                    .remove("install_session_id").remove("install_started_at")
                    .remove("restart_after_update_version").commit();
        }
    }

    private void onInstallerStatus(int installStatus, String systemMessage) {
        Release release = pendingRelease();
        if (installStatus == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            mainHandler.removeCallbacks(reconcileInstall);
            mainHandler.postDelayed(reconcileInstall, 60000L);
            publish("awaiting_confirmation", "Confirma la actualización en la ventana de Android.",
                    release, 100, false, "");
            return;
        }
        if (installStatus == PackageInstaller.STATUS_SUCCESS) {
            installInFlight.set(false);
            mainHandler.removeCallbacks(reconcileInstall);
            clearPendingUpdate();
            publish("installed", "Actualización instalada correctamente.", release, 100, false, "");
            return;
        }

        installInFlight.set(false);
        mainHandler.removeCallbacks(reconcileInstall);
        deferInstall(release);
        prefs.edit().remove("install_session_id").remove("install_started_at")
                .remove("restart_after_update_version").apply();
        String code = installerErrorCode(installStatus);
        Log.w(TAG, code + (systemMessage == null ? "" : ": " + systemMessage));
        publish("error", installerErrorMessage(installStatus), release, 100, true, code);
    }

    /** Restore an interrupted activity without submitting a second PackageInstaller session. */
    private void reconcileInstallSession() {
        if (destroyed || !installInFlight.get()) return;
        int sessionId = prefs.getInt("install_session_id", -1);
        if (sessionId < 0) return; // The worker is still hashing/staging the APK.
        long startedAt = prefs.getLong("install_started_at", 0L);
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionInfo info = installer.getSessionInfo(sessionId);
        if (getInstalledVersionCode() >= prefs.getInt("pending_version_code", Integer.MAX_VALUE)) {
            onInstallerStatus(PackageInstaller.STATUS_SUCCESS, "");
        } else if (info == null || System.currentTimeMillis() - startedAt > INSTALL_TIMEOUT_MS) {
            if (info != null) {
                try { installer.abandonSession(sessionId); } catch (Exception ignored) { }
            }
            onInstallerStatus(PackageInstaller.STATUS_FAILURE_ABORTED, "La sesión de instalación terminó sin confirmación.");
        } else {
            mainHandler.removeCallbacks(reconcileInstall);
            mainHandler.postDelayed(reconcileInstall, 60000L);
        }
    }

    static void handlePackageReplaced(Context context) {
        SharedPreferences stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int expectedVersion = stored.getInt("restart_after_update_version", 0);
        if (expectedVersion <= 0) return;
        try {
            int installedVersion = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
            if (installedVersion < expectedVersion) return;
            stored.edit().remove("restart_after_update_version").remove("install_session_id")
                    .remove("install_started_at").putInt("last_installer_status", PackageInstaller.STATUS_SUCCESS).commit();
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(launch);
        } catch (Exception error) {
            // Some newer unmanaged Android devices restrict background launches; the launcher remains usable.
            Log.e(TAG, "No se pudo reabrir Los Panitas tras actualizar", error);
        }
    }

    private Release fetchReleaseManifest() throws Exception {
        URL url = new URL(UPDATE_MANIFEST_URL);
        validateHttpsUrl(url, false);
        HttpsURLConnection connection = openConnection(url, "application/json");
        try {
            int status = connection.getResponseCode();
            if (status != HttpsURLConnection.HTTP_OK) {
                throw new UpdateException("MANIFEST_HTTP_" + status,
                        "No se pudo consultar la versión disponible.");
            }
            byte[] bytes = readBounded(connection.getInputStream(), MAX_MANIFEST_BYTES,
                    "MANIFEST_TOO_LARGE");
            JSONObject json = new JSONObject(new String(bytes, "UTF-8"));
            return Release.parse(json);
        } finally {
            connection.disconnect();
        }
    }

    private File downloadArchive(Release release) throws Exception {
        URL url = new URL(release.artifactUrl);
        validateHttpsUrl(url, true);
        File directory = updateDirectory();
        String downloadName = "update-" + release.versionCode + "-" + System.nanoTime();
        File part = new File(directory, downloadName + ".zip.part");
        File archive = new File(directory, downloadName + ".zip");
        deleteQuietly(part);
        deleteQuietly(archive);

        HttpsURLConnection connection = openConnection(url, "application/zip");
        try {
            int status = connection.getResponseCode();
            if (status != HttpsURLConnection.HTTP_OK) {
                throw new UpdateException("ARCHIVE_HTTP_" + status,
                        "No se pudo descargar la actualización.");
            }
            long responseSize = connection.getContentLength();
            if (responseSize > MAX_ARCHIVE_BYTES || (responseSize > 0 && responseSize != release.archiveSize)) {
                throw new UpdateException("ARCHIVE_SIZE_MISMATCH",
                        "La descarga no coincide con la versión publicada.");
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0L;
            int lastProgress = -1;
            byte[] buffer = new byte[16 * 1024];
            try (InputStream input = connection.getInputStream();
                 OutputStream output = new FileOutputStream(part)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    ensureActive();
                    total += read;
                    if (total > MAX_ARCHIVE_BYTES || total > release.archiveSize) {
                        throw new UpdateException("ARCHIVE_TOO_LARGE",
                                "La actualización descargada supera el tamaño esperado.");
                    }
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    int progress = release.archiveSize > 0
                            ? (int) Math.min(99L, total * 100L / release.archiveSize) : 0;
                    if (progress >= lastProgress + 5) {
                        lastProgress = progress;
                        publish("downloading", "Descargando actualización… " + progress + "%",
                                release, progress, true, "");
                    }
                }
                output.flush();
            }
            if (total != release.archiveSize || !toHex(digest.digest()).equalsIgnoreCase(release.archiveSha256)) {
                throw new UpdateException("ARCHIVE_HASH_MISMATCH",
                        "La actualización descargada no superó la verificación de integridad.");
            }
            if (!part.renameTo(archive)) {
                copyFile(part, archive);
                deleteQuietly(part);
            }
            return archive;
        } catch (Exception error) {
            deleteQuietly(part);
            deleteQuietly(archive);
            throw error;
        } finally {
            connection.disconnect();
        }
    }

    private File extractAndVerifyApk(File archive, Release release) throws Exception {
        File apk = new File(updateDirectory(), "LosPanitas-Elo-POS-" + release.versionCode
                + "-" + System.nanoTime() + ".apk");
        File part = new File(apk.getAbsolutePath() + ".part");
        deleteQuietly(apk);
        deleteQuietly(part);

        int entries = 0;
        boolean found = false;
        long total = 0L;
        long otherEntriesTotal = 0L;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[16 * 1024];
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                ensureActive();
                entries++;
                if (entries > 32) {
                    throw new UpdateException("ARCHIVE_TOO_MANY_ENTRIES",
                            "El paquete de actualización tiene una estructura inválida.");
                }
                if (!EXPECTED_APK_ENTRY.equals(entry.getName())) {
                    int read;
                    while ((read = zip.read(buffer)) != -1) {
                        ensureActive();
                        otherEntriesTotal += read;
                        if (otherEntriesTotal > 256L * 1024L) {
                            throw new UpdateException("ARCHIVE_EXTRA_DATA_TOO_LARGE",
                                    "El paquete contiene datos adicionales inesperados.");
                        }
                    }
                    zip.closeEntry();
                    continue;
                }
                if (found || entry.isDirectory()) {
                    throw new UpdateException("APK_ENTRY_INVALID",
                            "El instalador dentro del paquete es inválido.");
                }
                found = true;
                try (OutputStream output = new FileOutputStream(part)) {
                    int read;
                    while ((read = zip.read(buffer)) != -1) {
                        ensureActive();
                        total += read;
                        if (total > MAX_APK_BYTES || total > release.apkSize) {
                            throw new UpdateException("APK_TOO_LARGE",
                                    "El instalador supera el tamaño publicado.");
                        }
                        output.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                    }
                    output.flush();
                }
                zip.closeEntry();
            }
        } catch (Exception error) {
            deleteQuietly(part);
            throw error;
        }

        if (!found || total != release.apkSize
                || !toHex(digest.digest()).equalsIgnoreCase(release.apkSha256)) {
            deleteQuietly(part);
            throw new UpdateException("APK_HASH_MISMATCH",
                    "El instalador no superó la verificación de integridad.");
        }
        if (!part.renameTo(apk)) {
            copyFile(part, apk);
            deleteQuietly(part);
        }
        return apk;
    }

    private void verifyApkIdentity(File apk, Release release) throws Exception {
        if (!apk.isFile() || apk.length() != release.apkSize) {
            throw new UpdateException("APK_MISSING", "No se encontró el instalador verificado.");
        }
        PackageManager pm = activity.getPackageManager();
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
        if (candidate == null || !EXPECTED_PACKAGE.equals(candidate.packageName)) {
            throw new UpdateException("PACKAGE_MISMATCH",
                    "El paquete descargado no pertenece a Los Panitas POS.");
        }
        if (candidate.versionCode != release.versionCode || candidate.versionCode <= installed.versionCode
                || !release.versionName.equals(candidate.versionName)) {
            throw new UpdateException("VERSION_MISMATCH",
                    "La versión del instalador no coincide con la publicación.");
        }
        Set<String> candidateSignatures = signatureDigests(candidate.signatures);
        Set<String> installedSignatures = signatureDigests(installed.signatures);
        if (candidateSignatures.isEmpty() || installedSignatures.isEmpty()
                || !candidateSignatures.equals(installedSignatures)
                || !installedSignatures.contains(release.signingCertificateSha256.toUpperCase(Locale.US))) {
            throw new UpdateException("SIGNATURE_MISMATCH",
                    "La firma del instalador no coincide con la aplicación original.");
        }
    }

    private void verifyPendingApk(File apk, Release release) throws Exception {
        if (!apk.isFile() || apk.length() != release.apkSize
                || !sha256(apk).equalsIgnoreCase(release.apkSha256)) {
            throw new UpdateException("PENDING_APK_INVALID",
                    "La actualización guardada ya no es válida; vuelve a descargarla.");
        }
        verifyApkIdentity(apk, release);
    }

    private void commitInstallSession(File apk, Release release) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(EXPECTED_PACKAGE);
        int sessionId = installer.createSession(params);

        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            // PackageInstaller exige que todos los streams estén cerrados antes de commit().
            try (InputStream input = new FileInputStream(apk);
                 OutputStream output = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                output.flush();
                session.fsync(output);
            }
            Intent result = new Intent(activity, UpdateInstallReceiver.class)
                    .setAction(INSTALL_ACTION)
                    .putExtra("versionCode", release.versionCode)
                    .putExtra("updateSessionId", sessionId);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(activity, sessionId, result, flags);
            synchronized (operationLock) {
                // Hashing and writing can take time: check again immediately before the irreversible commit.
                if (!isUiSafe()) {
                    session.abandon();
                    deferUntilIdle(release);
                    return;
                }
                prefs.edit().putInt("install_session_id", sessionId)
                        .putLong("install_started_at", System.currentTimeMillis())
                        .putInt("restart_after_update_version", release.versionCode)
                        .remove("last_installer_status").remove("last_installer_message").commit();
                session.commit(pending.getIntentSender());
                mainHandler.postDelayed(reconcileInstall, 60000L);
            }
        } catch (Exception error) {
            try { installer.abandonSession(sessionId); } catch (Exception ignored) { }
            prefs.edit().remove("install_session_id").remove("install_started_at")
                    .remove("restart_after_update_version").apply();
            throw error;
        }
    }

    private void persistPendingUpdate(File apk, Release release) {
        prefs.edit()
                .putString("pending_apk_path", apk.getAbsolutePath())
                .putInt("pending_version_code", release.versionCode)
                .putString("pending_version_name", release.versionName)
                .putLong("pending_apk_size", release.apkSize)
                .putString("pending_apk_sha256", release.apkSha256)
                .putString("pending_signing_certificate_sha256", release.signingCertificateSha256)
                .putBoolean("pending_mandatory", release.mandatory)
                .putString("pending_published_at", release.publishedAt)
                .putString("pending_release_notes", release.releaseNotes.toString())
                .remove("install_deferred_version")
                .remove("last_installer_status")
                .remove("last_installer_message")
                .apply();
    }

    private Release pendingRelease() {
        int versionCode = prefs.getInt("pending_version_code", 0);
        String versionName = prefs.getString("pending_version_name", "");
        long apkSize = prefs.getLong("pending_apk_size", 0L);
        String apkSha = prefs.getString("pending_apk_sha256", "");
        String signingCertificateSha = prefs.getString("pending_signing_certificate_sha256", "");
        String path = prefs.getString("pending_apk_path", "");
        if (versionCode <= getInstalledVersionCode() || versionName.isEmpty() || apkSize <= 0
                || !isSha256(apkSha) || !isSha256(signingCertificateSha)
                || path.isEmpty() || !new File(path).isFile()) return null;
        try {
            JSONArray notes = new JSONArray(prefs.getString("pending_release_notes", "[]"));
            return new Release(versionCode, versionName, "", 0L, "", apkSize, apkSha,
                    signingCertificateSha,
                    prefs.getBoolean("pending_mandatory", false),
                    prefs.getString("pending_published_at", ""), notes);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean hasPendingUpdate() {
        return pendingRelease() != null;
    }

    private void restorePendingState() {
        Release release = pendingRelease();
        if (release == null) {
            clearObsoletePendingUpdate();
            return;
        }
        int sessionId = prefs.getInt("install_session_id", -1);
        if (sessionId >= 0) {
            installInFlight.set(true);
            publish("installing", "Comprobando la instalación iniciada en Android…", release, 100, false, "");
            mainHandler.postDelayed(reconcileInstall, 1000L);
            return;
        }
        if (isInstallDeferred()) {
            int status = prefs.getInt("last_installer_status", PackageInstaller.STATUS_FAILURE_ABORTED);
            publish("error", installerErrorMessage(status), release, 100, true, installerErrorCode(status));
            return;
        }
        boolean needsPermission = !isFullyManaged() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls();
        publish(needsPermission ? "permission_required" : "ready",
                needsPermission
                        ? "Android necesita autorizar la instalación de la actualización descargada."
                        : "Hay una actualización verificada lista para instalar.",
                release, 100, true, needsPermission ? "INSTALL_PERMISSION_REQUIRED" : "");
    }

    private void clearObsoletePendingUpdate() {
        int pendingCode = prefs.getInt("pending_version_code", 0);
        if (pendingCode > getInstalledVersionCode() && pendingRelease() != null) return;
        clearPendingUpdate();
    }

    private void clearPendingUpdate() {
        String path = prefs.getString("pending_apk_path", "");
        if (!path.isEmpty()) deleteQuietly(new File(path));
        prefs.edit()
                .remove("pending_apk_path")
                .remove("pending_version_code")
                .remove("pending_version_name")
                .remove("pending_apk_size")
                .remove("pending_apk_sha256")
                .remove("pending_signing_certificate_sha256")
                .remove("pending_mandatory")
                .remove("pending_published_at")
                .remove("pending_release_notes")
                .remove("permission_prompted_version")
                .remove("install_deferred_version")
                .remove("install_session_id")
                .remove("install_started_at")
                .apply();
    }

    private File updateDirectory() throws UpdateException {
        File directory = new File(activity.getFilesDir(), "updates");
        if ((!directory.exists() && !directory.mkdirs()) || !directory.isDirectory()) {
            throw new UpdateException("UPDATE_STORAGE_UNAVAILABLE",
                    "No hay almacenamiento disponible para preparar la actualización.");
        }
        return directory;
    }

    private HttpsURLConnection openConnection(URL url, String accept) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", accept);
        connection.setRequestProperty("Cache-Control", "no-cache, no-store");
        connection.setRequestProperty("User-Agent", "LosPanitasPOS/" + getInstalledVersionName()
                + " (Android " + Build.VERSION.RELEASE + ")");
        return connection;
    }

    private static void validateHttpsUrl(URL url, boolean artifact) throws UpdateException {
        String path = url.getPath() == null ? "" : url.getPath();
        boolean valid = "https".equalsIgnoreCase(url.getProtocol())
                && UPDATE_HOST.equalsIgnoreCase(url.getHost())
                && (url.getPort() == -1 || url.getPort() == 443)
                && url.getUserInfo() == null
                && url.getQuery() == null
                && url.getRef() == null;
        if (artifact) valid = valid && path.startsWith("/downloads/") && path.endsWith(".zip");
        else valid = valid && "/downloads/update.json".equals(path);
        if (!valid) {
            throw new UpdateException("UNTRUSTED_UPDATE_URL",
                    "La dirección de actualización no pertenece al servidor oficial.");
        }
    }

    private JSONObject createBaseState() {
        JSONObject result = new JSONObject();
        try {
            result.put("ok", true);
            result.put("supported", true);
            result.put("state", "idle");
            result.put("message", "Actualizador preparado.");
            result.put("installedVersionCode", getInstalledVersionCode());
            result.put("installedVersionName", getInstalledVersionName());
            result.put("availableVersionCode", 0);
            result.put("availableVersionName", "");
            result.put("progressPercent", 0);
            result.put("mandatory", false);
            result.put("lastCheckedAt", prefs.getLong("last_checked_at", 0L));
            result.put("retryable", false);
            result.put("errorCode", "");
            result.put("fullyManaged", isFullyManaged());
            result.put("automaticInstall", isFullyManaged());
            result.put("releaseNotes", new JSONArray());
        } catch (Exception ignored) { }
        return result;
    }

    private void publish(String stateName, String message, Release release, int progress,
                         boolean retryable, String errorCode) {
        if (destroyed) return;
        JSONObject next = createBaseState();
        try {
            next.put("state", stateName);
            next.put("message", message);
            next.put("progressPercent", Math.max(0, Math.min(100, progress)));
            next.put("retryable", retryable);
            next.put("errorCode", errorCode == null ? "" : errorCode);
            if (release != null) {
                next.put("availableVersionCode", release.versionCode);
                next.put("availableVersionName", release.versionName);
                next.put("mandatory", release.mandatory);
                next.put("publishedAt", release.publishedAt);
                next.put("releaseNotes", release.releaseNotes);
            }
        } catch (Exception ignored) { }
        synchronized (stateLock) {
            state = next;
        }
        emitState();
    }

    private void emitState() {
        Listener current = listener;
        if (current == null || destroyed) return;
        try {
            current.onUpdateState(new JSONObject(getStatusJson()));
        } catch (Exception ignored) { }
    }

    private static Set<String> signatureDigests(Signature[] signatures) throws Exception {
        if (signatures == null || signatures.length == 0) return new HashSet<>();
        Set<String> digests = new HashSet<>();
        for (Signature signature : signatures) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digests.add(toHex(digest.digest(signature.toByteArray())));
        }
        return digests;
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[16 * 1024];
        try (InputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return toHex(digest.digest());
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.US, "%02X", value & 0xff));
        return result.toString();
    }

    private static boolean isSha256(String value) {
        return value != null && value.matches("(?i)^[0-9a-f]{64}$");
    }

    private static byte[] readBounded(InputStream input, int maximum, String errorCode) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > maximum) {
                    throw new UpdateException(errorCode, "La respuesta de actualización es demasiado grande.");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static void copyFile(File source, File destination) throws Exception {
        byte[] buffer = new byte[16 * 1024];
        try (InputStream input = new FileInputStream(source);
             OutputStream output = new FileOutputStream(destination)) {
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
        }
    }

    private static void deleteQuietly(File file) {
        try { if (file != null && file.exists() && !file.delete()) file.deleteOnExit(); }
        catch (Exception ignored) { }
    }

    private static String installerErrorCode(int status) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED: return "INSTALL_ABORTED";
            case PackageInstaller.STATUS_FAILURE_BLOCKED: return "INSTALL_BLOCKED";
            case PackageInstaller.STATUS_FAILURE_CONFLICT: return "INSTALL_CONFLICT";
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE: return "INSTALL_INCOMPATIBLE";
            case PackageInstaller.STATUS_FAILURE_INVALID: return "INSTALL_INVALID";
            case PackageInstaller.STATUS_FAILURE_STORAGE: return "INSTALL_STORAGE";
            default: return "INSTALL_FAILED";
        }
    }

    private static String installerErrorMessage(int status) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                return "La instalación fue cancelada. Puedes reintentarlo cuando estés listo.";
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                return "Android bloqueó la instalación por la política de la terminal.";
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
                return "La versión instalada entra en conflicto con la actualización.";
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                return "Esta actualización no es compatible con la terminal.";
            case PackageInstaller.STATUS_FAILURE_INVALID:
                return "Android rechazó el instalador por ser inválido.";
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                return "No hay espacio suficiente para instalar la actualización.";
            default:
                return "Android no pudo instalar la actualización. Pulsa Reintentar.";
        }
    }

    private static final class Release {
        final int versionCode;
        final String versionName;
        final String artifactUrl;
        final long archiveSize;
        final String archiveSha256;
        final long apkSize;
        final String apkSha256;
        final String signingCertificateSha256;
        final boolean mandatory;
        final String publishedAt;
        final JSONArray releaseNotes;

        Release(int versionCode, String versionName, String artifactUrl, long archiveSize,
                String archiveSha256, long apkSize, String apkSha256,
                String signingCertificateSha256, boolean mandatory,
                String publishedAt, JSONArray releaseNotes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.artifactUrl = artifactUrl;
            this.archiveSize = archiveSize;
            this.archiveSha256 = archiveSha256;
            this.apkSize = apkSize;
            this.apkSha256 = apkSha256;
            this.signingCertificateSha256 = signingCertificateSha256;
            this.mandatory = mandatory;
            this.publishedAt = publishedAt;
            this.releaseNotes = releaseNotes == null ? new JSONArray() : releaseNotes;
        }

        static Release parse(JSONObject json) throws UpdateException {
            try {
                if (json.optInt("schemaVersion", 0) != 1
                        || !EXPECTED_PACKAGE.equals(json.optString("packageName", ""))) {
                    throw new UpdateException("MANIFEST_IDENTITY_MISMATCH",
                            "El manifiesto de actualización no pertenece a esta aplicación.");
                }
                int versionCode = json.getInt("versionCode");
                String versionName = json.getString("versionName").trim();
                JSONObject artifact = json.getJSONObject("artifact");
                JSONObject apk = json.getJSONObject("apk");
                String artifactUrl = artifact.getString("url").trim();
                long archiveSize = artifact.getLong("size");
                String archiveSha = artifact.getString("sha256").trim();
                long apkSize = apk.getLong("size");
                String apkSha = apk.getString("sha256").trim();
                String signingCertificateSha = apk.getString("signingCertificateSha256").trim();
                String apkEntry = apk.getString("entry");
                if (versionCode <= 0 || versionName.isEmpty() || versionName.length() > 80
                        || archiveSize <= 0 || archiveSize > MAX_ARCHIVE_BYTES
                        || apkSize <= 0 || apkSize > MAX_APK_BYTES
                        || !isSha256(archiveSha) || !isSha256(apkSha) || !isSha256(signingCertificateSha)
                        || !EXPECTED_APK_ENTRY.equals(apkEntry)) {
                    throw new UpdateException("MANIFEST_INVALID",
                            "La información de actualización publicada es inválida.");
                }
                try { validateHttpsUrl(new URL(artifactUrl), true); }
                catch (UpdateException error) { throw error; }
                catch (Exception error) {
                    throw new UpdateException("MANIFEST_URL_INVALID",
                            "La dirección de descarga publicada es inválida.");
                }
                JSONArray notes = json.optJSONArray("releaseNotes");
                if (notes == null) notes = new JSONArray();
                if (notes.length() > 12) {
                    throw new UpdateException("MANIFEST_NOTES_INVALID",
                            "El manifiesto de actualización es inválido.");
                }
                return new Release(versionCode, versionName, artifactUrl, archiveSize,
                        archiveSha, apkSize, apkSha, signingCertificateSha,
                        json.optBoolean("mandatory", false),
                        json.optString("publishedAt", ""), notes);
            } catch (UpdateException error) {
                throw error;
            } catch (Exception error) {
                throw new UpdateException("MANIFEST_INVALID",
                        "No se pudo interpretar la versión publicada.");
            }
        }
    }

    private static final class UpdateException extends Exception {
        final String code;
        final String userMessage;

        UpdateException(String code, String userMessage) {
            super(userMessage);
            this.code = code;
            this.userMessage = userMessage;
        }
    }
}

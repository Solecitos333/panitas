package com.panitas.pos;

import android.app.admin.DeviceAdminReceiver;

/**
 * Componente de administración opcional para terminales ELO totalmente gestionadas.
 * No se activa por sí solo: requiere aprovisionamiento explícito del propietario.
 */
public final class PanitasDeviceAdminReceiver extends DeviceAdminReceiver { }

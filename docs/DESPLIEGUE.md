# Despliegue

## Preparación

1. Autenticarse con `firebase login` y `gh auth login`.
2. Confirmar el proyecto seleccionado con `firebase use`.
3. Ejecutar `npm ci` y `npm run validate`.
4. Confirmar que no existan credenciales con `git status --short` y una revisión del diff.

## Publicar una versión de la app ELO

1. Incrementar `versionCode`, `versionName` y las notas en `release.json`, y sincronizar `version` en `package.json` y `package-lock.json`. El código siempre debe subir, incluso para una reversión.
2. Definir `PANITAS_KEYSTORE_PASSWORD` y, si corresponde, `PANITAS_KEY_PASSWORD` únicamente en la sesión local segura.
3. Ejecutar `./tools/build-apk.ps1` en PowerShell.
4. Ejecutar `npm run validate`. Esto compila las fuentes Android y comprueba paquete, versión, firma, ZIP, manifiesto y hashes.
5. Revisar y confirmar juntos `release.json`, `public/downloads/update.json`, el ZIP versionado y `SHA256SUMS.txt`.
6. Publicar todo en una única versión de Firebase Hosting. Nunca publiques `update.json` separado o antes de su artefacto.

El ZIP amistoso sirve para recuperación manual; el actualizador utiliza el nombre versionado indicado por `update.json`. La llave de firma y sus contraseñas nunca se agregan a Git ni a Hosting.

Si una entrega solo modifica la web, no hace falta incrementar ni reconstruir la APK. Vite asigna al Service Worker un identificador basado en el contenido generado; la interfaz abierta detecta el cambio y se renueva cuando no hay operaciones ni cambios sin guardar.

## Firebase

```bash
npm run deploy
```

Esto publica reglas, índices y Hosting. El proyecto usa Firestore `(default)` Standard en `nam5`. La protección contra eliminación debe permanecer activa.

La base inicial se crea una sola vez con un token OAuth temporal en memoria:

```bash
FIREBASE_PROJECT_ID=los-panitas-by-nechy GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)" npm run seed:foundation
```

El script solo crea configuración, contadores y doce mesas; no fabrica ventas, productos, clientes ni usuarios.

## GitHub Actions

Los pull requests validan código, fuentes Android, reglas, build y artefactos de release, y generan un canal preview `pr-{número}` por 14 días. `main` vuelve a ejecutar las pruebas y despliega únicamente Hosting. Auth, reglas e índices se publican de forma deliberada con `npm run deploy` desde una sesión administrativa; así, el secret de GitHub no necesita permisos amplios sobre el proyecto. Se requiere el secret `FIREBASE_SERVICE_ACCOUNT_LOS_PANITAS_BY_NECHY`; el JSON nunca se guarda en el repositorio. La autenticación de Google crea un archivo efímero durante el job y lo elimina al finalizar.

Los previews utilizan actualmente la configuración pública del proyecto productivo. Deben probarse sin cuentas ni datos comerciales reales hasta disponer de un proyecto Firebase separado para staging.

El proyecto asignado es `los-panitas-by-nechy`.

## Plan Spark

La demo evita Cloud Functions, exportaciones administradas y respaldos programados. Al aprobar el sistema, Blaze debe activarse con presupuesto y alertas antes de incorporar esas funciones.

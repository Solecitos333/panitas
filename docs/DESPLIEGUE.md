# Despliegue

## Preparación

1. Autenticarse con `firebase login` y `gh auth login`.
2. Confirmar el proyecto seleccionado con `firebase use`.
3. Ejecutar `npm ci` y `npm run validate`.
4. Confirmar que no existan credenciales con `git status --short` y una revisión del diff.

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

Los pull requests validan código, reglas y build, y generan un canal preview. `main` despliega producción. Se requiere el secret `FIREBASE_SERVICE_ACCOUNT_LOS_PANITAS_BY_NECHY`; el JSON nunca se guarda en el repositorio.

El proyecto asignado es `los-panitas-by-nechy`.

## Plan Spark

La demo evita Cloud Functions, exportaciones administradas y respaldos programados. Al aprobar el sistema, Blaze debe activarse con presupuesto y alertas antes de incorporar esas funciones.

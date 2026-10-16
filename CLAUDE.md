# SoftMusic API

API Express 4 (CommonJS, Node 24) para SoftMusic. El frontend vive en el repo hermano `../softmusic-web`.
El usuario trabaja en español: respuestas, comentarios de código y mensajes de error en español.

## Ejecutar en local

- `npm start` (o `npm run dev` con nodemon). Variables en `.env`, plantilla en `.env.example`.
- Puerto **3001**: el 3000 lo ocupa otro proyecto Next.js del equipo. La web local apunta a `http://localhost:3001`.
- `.env` apunta hoy a **Supabase, la misma base de datos que producción**. Para pruebas aisladas existe el
  contenedor Docker `softmusic-dev-db` (puerto 5434, usuario `postgres`, base `softmusic`, `?sslmode=disable`).

## Base de datos

- Esquema en `initDB()` de `src/config/db.js` (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- En Vercel `initDB` **no** se ejecuta al arrancar (cada arranque en frío lo repetiría). Tras cambiar el esquema,
  aplicarlo con `npm run db:init`.
- Supabase usa el *transaction pooler* (puerto 6543); el plan gratis pausa el proyecto tras 7 días sin uso.

## Arquitectura de reproducción

- Catálogo y metadatos: Deezer. Las canciones del catálogo no traen `id` reproducible; se resuelven al darles
  play con `POST /api/search/resolve` (`src/services/catalogResolver.js`).
- Proveedores de audio, por prefijo de ID (validado por `TRACK_ID_RE` en `src/routes/stream.js`):
  `yt_` YouTube (iframe; requiere `YOUTUBE_API_KEY`, sin configurar), `au_` Audius (proxy con Range),
  `jm_` Jamendo (MP3 directo, Creative Commons, requiere `JAMENDO_CLIENT_ID`), `sc_` SoundCloud (respaldo),
  `dz_` Deezer (solo preview de 30 s).
- Al añadir un proveedor: `src/providers/<nombre>.js`, ramas en `stream.js`, `isSearchPlayable` en
  `src/routes/searchV2.js`, `inferSource` en `src/routes/history.js` y el resolvedor.
- La API de Jamendo devuelve a veces 0 resultados de forma intermitente; `searchTracks` reintenta.

## Convenciones y trampas

- Rutas montadas en `server.js`: las versiones `*V2.js`. `search.js`, `searchStrict.js`, `recommendations.js`
  y `radio.js` son código antiguo no montado.
- Express 4 no captura errores de handlers `async`: envolver cada handler en `try/catch`. `server.js` tiene un
  `unhandledRejection` como red de seguridad, pero la petición que falla se queda sin respuesta.
- Descargas offline: `DOWNLOADS_DIR` (`src/config/downloads.js`); en Vercel es `/tmp`, efímero y por instancia.
- No hay suite de tests; verificar con `curl` contra `/api/health` y las rutas afectadas.

## Despliegue (Vercel, cuenta viking10881-crypto)

- Proyecto `softmusic-api` → https://softmusic-api.vercel.app, scope `diego-alexander-londono-s-projects`.
  La web es el proyecto `softmusic-web` → https://softmusic-web.vercel.app.
- `git push` a `main` despliega automáticamente (repo conectado en Vercel).
- La sesión por defecto de la CLI es la cuenta **delasoft**, que no debe usarse aquí. Usar siempre el token de viking:
  `vercel deploy --prod --yes --token "$(tr -d '[:space:]' < ~/.vercel-token-viking)" --scope diego-alexander-londono-s-projects`
- Variables en Vercel: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `VERCEL_TEAM_SLUG`, `YOUTUBE_REGION_CODE`,
  `JAMENDO_CLIENT_ID`. Gestionarlas con `vercel env` (mismo token y scope); nunca imprimir sus valores.
- Un nuevo dominio del frontend debe añadirse a `CORS_ORIGINS`; las previews del equipo ya se aceptan.
- `vercel.json` define el servicio Express con `entrypoint: server.js`; `.vercelignore` excluye `.env*`.

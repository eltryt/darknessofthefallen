# Backend en Cloudflare

Publicado: https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/

Comprobación remota correcta: Actions 37827710593 (HTTPS, páginas, API pública,
rechazo de accesos privados y origen no autorizado). Discord aún sin configurar.

El Worker sirve la aplicación completa, las API y los recursos públicos. Un
Durable Object con SQLite conserva los datos de la hermandad. GitHub Pages
continúa ofreciendo la presentación pública. El navegador usa las API en el
mismo dominio del Worker, con cookies HttpOnly y comprobaciones de origen y CSRF.

## Desarrollo y comprobaciones

Requiere Node 24. Ejecutar `npm ci`, `npm test`, `npm run test:backend` y
`npm run build:backend`. `npm run dev:backend` inicia el entorno local de
Cloudflare; `.wrangler/` conserva sus datos locales. No contiene datos remotos.
El servidor Node original sigue disponible con `npm start`.

La prueba de Cloudflare compila una entrada exclusiva de pruebas y verifica
permisos, CSRF, origen, cookies OAuth, límites de cuerpo, rollback y persistencia
tras reiniciar el runtime. La entrada de producción es siempre
`src/cloudflare-worker.mjs`; nunca desplegar `tests/cloudflare/fixture.mjs`.

## Publicación

El flujo **Deploy backend to Cloudflare** se ejecuta manualmente desde Actions.
Si la cuenta no tiene subdominio workers.dev, registra
`eltryt-darknessofthefallen`; conserva cualquier subdominio existente. Después
del despliegue comprueba la aplicación por HTTPS antes de declarar éxito.
Necesita el secreto de Actions `CLOUDFLARE_API_TOKEN` con permisos para desplegar
Workers/Durable Objects en la cuenta elegida, y `CLOUDFLARE_ACCOUNT_ID` como
secreto o variable de Actions. El complemento de Cloudflare y las credenciales
de Actions son conexiones distintas. No incluir tokens en commits ni mensajes.

También se puede ejecutar `npm run deploy:backend` con autenticación de Wrangler
o las mismas variables configuradas de forma segura. Wrangler devuelve la URL
real bajo `workers.dev`; comprobar `/api/health`, `/api/public` y `/login`.
No se activa ningún plan de pago. SQLite Durable Objects está disponible en
Workers Free; sus límites pueden detener solicitudes al agotarse.

Mantener estables el nombre `darknessofthefallen-backend`, la clase `Guild`,
la migración `v1` y el identificador `darknessofthefallen`: cambiarlos puede
crear otra base de datos. Los nuevos despliegues no importan ni borran datos.
La base comienza vacía, con los valores públicos del proyecto, sin usuarios
inventados. Los archivos ZIP aportados no incluyen una base de producción.

## Discord y acceso privado

Después de obtener la URL del Worker, registrar en Discord el callback exacto
`https://URL-DEL-WORKER/auth/discord/callback`. Configurar mediante
`wrangler secret put NOMBRE` los valores `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_LEADER_ID` y
`DISCORD_ROLE_MAP` siguiendo `.env.example`. El webhook de reclutamiento es
opcional: `DISCORD_RECRUITMENT_WEBHOOK`. Los avisos permanecen desactivados
salvo que se configure también `RECRUITMENT_NOTIFICATIONS_ENABLED=true`. No hace falta exponer estos valores al
frontend. Sin configuración Discord, el backend funciona pero el inicio de
sesión indica que está pendiente.

El origen se obtiene de la URL del Worker. Para un dominio personalizado puede
fijarse `APP_ORIGIN`; debe coincidir exactamente con el origen HTTPS de acceso.
Usar siempre ese dominio también en el callback de Discord. Las notificaciones
pendientes se entregan mediante alarmas persistentes del Durable Object.

Pages enlaza por defecto con el backend publicado. Para cambiarlo, configurar
`MEMBER_APP_URL` como variable de Actions con su origen HTTPS y volver a ejecutar
el despliegue de Pages. La presentación
mostrará un enlace a la aplicación alojada; las sesiones se gestionan allí.

El líder puede descargar la exportación JSON desde el panel. `npm run backup`
respalda exclusivamente la SQLite local de Node, no el almacenamiento remoto.
La restauración de exportaciones JSON no está implementada: conservarlas no
sustituye una estrategia de recuperación de Cloudflare.

Documentación oficial: https://developers.cloudflare.com/durable-objects/platform/pricing/

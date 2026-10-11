# Avisos privados de Discord

El backend existente conserva los mensajes y una cola SQLite. El frontend nunca
recibe el webhook. GM y oficiales (`recruitment.manage`) consultan
`/panel?tab=messages`; los demás rangos no pueden leer mensajes ni reintentar avisos.

## Configuración y prueba real

1. En Discord, editar el canal privado → Integraciones → Webhooks → crear/copiar URL.
2. Guardarla en GitHub Actions como `DISCORD_GM_WEBHOOK_URL` (no en archivos).
3. Desplegar mediante **Deploy backend to Cloudflare**.
4. Ejecutar **Configure private GM webhook**. Valida que pertenece al servidor
   configurado, envía UN mensaje marcado como prueba, comprueba su lectura y
   instala el secreto y `GM_NOTIFICATIONS_ENABLED=true` en el backend original.
   No cambia OAuth, almacenamiento ni la pasarela pública.

Un webhook no permite consultar los permisos del canal. Si existe
`DISCORD_BOT_TOKEN`, el configurador comprueba roles y sobrescrituras de permisos;
sin él, deja constancia de la comprobación pendiente. Revisar en Discord que
`@everyone` tiene **Ver canal** denegado y que únicamente GM y oficiales autorizados
lo tienen permitido. Los administradores y el propietario pueden eludir esa
restricción por diseño de Discord. No es necesario crear un bot para enviar avisos.

## Alcance

- Nuevas candidaturas: aviso con enlace a Candidaturas. Se conserva la integración
  antigua como alternativa cuando este webhook está desactivado; no se envía a ambas.
- Contactos: formulario en Contacto para miembros autenticados. Visitantes conservan
  el enlace de Discord. Texto y asunto se guardan únicamente en el panel privado.
- Incidencias: registro manual por oficiales y detección de trabajos de Raid-Helper
  bloqueados creados en los últimos 15 minutos. No es monitorización de todos los
  errores técnicos del sistema.
- Discord recibe únicamente el tipo de aviso y un enlace; no recibe nombres,
  solicitudes completas, mensajes privados ni menciones automáticas.

## Entrega y recuperación

Cada evento tiene clave única en `gm_notifications`. Los contactos incluyen un
identificador de petición estable. Cola persistente, toma exclusiva del trabajo y
registro de estado/error evitan los reenvíos normales. Cloudflare usa la alarma
existente; el servidor Node utiliza su temporizador existente.

HTTP 429 se reintenta automáticamente respetando la espera de Discord (hasta cinco
intentos). Rechazos definitivos quedan en error. Ante timeout, fallo de red, HTTP
5xx o interrupción posterior al envío, la recepción es incierta: **no se repite a
ciegas**, porque los webhooks no ofrecen una clave de idempotencia. El panel permite
reintentar tras comprobar el canal. No se promete entrega exactamente una vez.

Las copias de seguridad incorporan ambas tablas (esquema 6), mantienen lectura de
copias de esquema 5 y ponen los envíos restaurados pendientes en revisión, evitando
reproducir avisos automáticamente. No incluyen secretos. Desactivar envíos con
`GM_NOTIFICATIONS_ENABLED=false` conserva los mensajes y la cola.

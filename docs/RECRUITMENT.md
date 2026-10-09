# Candidaturas de la hermandad

Formulario público: https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev/reclutamiento

Se puede solicitar entrada sin iniciar sesión y sin pertenecer todavía a Discord.
El formulario pide alias, usuario de Discord, personaje, clase, rol, disponibilidad,
experiencia, motivación y consentimiento. La información adicional es opcional.
El envío confirmado devuelve una referencia; no supone aceptación automática.

Las solicitudes se guardan en SQLite persistente del backend. En **Panel →
Candidaturas**, el Líder y los Oficiales pueden buscar por alias, Discord,
personaje o referencia, filtrar por estado y guardar notas internas. Los estados
son Nuevo, Contactado, Prueba, Aceptado y Rechazado. Las fechas se muestran en
Europe/Madrid. Las revisiones quedan registradas en auditoría. Los visitantes,
miembros y raiders no pueden consultar candidaturas privadas.

No se envían avisos a Discord ni se crean notificaciones pendientes con la
configuración actual. El envío futuro requerirá activar explícitamente
RECRUITMENT_NOTIFICATIONS_ENABLED=true y configurar un webhook privado.

La migración 004 abre el reclutamiento una sola vez y sustituye el antiguo nombre
pendiente por «Servidor PvP» (WoW Forever Realmless). El Líder puede cerrar o abrir
el formulario desde **Panel → Configuración → Reclutamiento abierto**; los
siguientes despliegues respetan esa decisión. Pages enlaza al formulario real y
no recoge solicitudes en su copia estática.

Verificación: pruebas de permisos y validación; envío y revisión conservados al
reiniciar workerd; cierre del formulario conservado tras reiniciar; recorrido de
navegador en entorno local desechable, con envío anónimo, referencia, revisión,
filtros, notas y permisos. No se insertan candidatos ficticios en producción.

## Prioridades opcionales

Actualmente se recluta a todas las clases y roles. En **Panel → Configuración**,
el Líder puede marcar clases y roles buscados, o desmarcarlos todos para volver a
no señalar prioridades. Las elecciones se muestran en Reclutamiento de la
aplicación y quedan auditadas. No impiden enviar candidaturas de otras clases.
El texto «Sobre la hermandad» también se edita desde ese panel. Pages es una
presentación estática: enlaza a la aplicación para consultar el reclutamiento actual.

# Estado del proyecto — 8 de octubre de 2026

## Migración y GitHub Pages

- Fuente: `Darkness-of-the-Fallen-checkpoint.zip`; los archivos del ZIP coinciden con su historial Git incluido en `history.bundle`.
- Destino único: `eltryt/darknessofthefallen`.
- Historial recuperado: `08de4b0`, `b156747` y `d7689cd`, unido al commit inicial del repositorio de destino sin reescribirlo.
- Frontend adaptado para Pages bajo `/darknessofthefallen/`. Build con HTML para cada ruta, CSS, módulos JavaScript, datos públicos y `.nojekyll`.
- Workflow `.github/workflows/pages.yml`: prueba, genera y despliega `dist/` al hacer push a `main` o mediante ejecución manual.
- Contenido público editable en `site/public.json`; no se exportan la base de datos, candidaturas, sesiones ni información privada.
- Backend Node 24/SQLite conservado. Las funciones que dependen de él muestran un estado pendiente en Pages.

## Validación local

- 12 pruebas pasan: 9 de seguridad del backend y 3 de Pages (proyección pública, rutas y builds repetibles con prefijos raíz/proyecto).
- Chromium en escritorio (1440 px) y móvil (390 px): 10 rutas, recargas directas, navegación y menú móvil sin errores JavaScript, solicitudes API ni desbordamiento horizontal; filtro del roster comprobado.
- Servidor Node iniciado, `/api/health` responde correctamente e inicio/roster/login funcionan en navegador.
- No se ha verificado OAuth real, envío de webhooks ni proveedores de raids/logs: el checkpoint no incluye sus credenciales.

## Publicación

Migración subida a `main` y verificada mediante lectura del remoto: commit `93a90d2` (incluye el historial original y la configuración de Pages).

El build y las pruebas locales están verificados. La API de GitHub responde `Forbidden` desde este entorno: no se ha podido consultar o activar Pages ni verificar ejecuciones remotas de Actions. En GitHub, seleccionar **Settings → Pages → Source: GitHub Actions** y ejecutar **Deploy public website to GitHub Pages** en `main`. Consultar la ejecución para confirmar la publicación; la URL prevista es `https://eltryt.github.io/darknessofthefallen/`.

La URL prevista de Pages también devuelve un bloqueo de red, por lo que no se afirma que el sitio esté publicado.

La web de referencia de ChatGPT Sites tampoco se pudo consultar por un bloqueo de red; la migración utiliza el checkpoint proporcionado. No se modifica la visibilidad del repositorio ni se contratan servicios.

## Funciones conservadas del backend

OAuth Discord y sesiones, RBAC de seis rangos, personajes con un único Main, roster privado, candidaturas con notas/auditoría, outbox, configuración de la hermandad, exportación y backup SQLite. Las pruebas automatizadas validan permisos y datos; no sustituyen pruebas con proveedores reales.

## Pendientes del producto completo

- Alojamiento persistente del backend y configuración real de Discord; sincronización continua de roles (el checkpoint sincroniza al iniciar sesión y las sesiones duran 30 minutos).
- Logo original, invitación oficial de Discord, servidor y días de raid confirmados.
- Edición/eliminación de personajes y datos de equipamiento; permisos y gestión de miembros más detallados.
- Retención de candidaturas, campos configurables, menciones al equipo y gestión de entregas fallidas.
- Escritura/importación de raids, edición de asistencia, loot/wishlist/consejo, progreso y logs: el checkpoint contiene esquemas y límites de integración, no módulos completos.
- CSV, importación JSON, copias externas cifradas y ensayo de restauración.
- El port de Cloudflare Workers/D1 era una propuesta anterior; no forma parte de este despliegue estático. Node DatabaseSync requiere un servidor compatible.

## Comandos

`npm test`, `npm run build`, `npm run preview` para Pages; `npm start` o `npm run dev` para el backend. Consultar README y `docs/BACKEND.md`. No hay dependencias externas de ejecución.

## Entorno en la nube

Guardados en el borrador del entorno `install_script` (build con Node 24+) y `start_skill` (validación, preview y backend), junto con los dominios necesarios para consultar GitHub API, Pages y la referencia de Sites. Este guardado no aplica la red ni publica la instantánea del entorno: requiere revisar/guardar los ajustes y publicar el entorno en el producto. El script guardado y los comandos de arranque se han ejecutado localmente.

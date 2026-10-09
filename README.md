# Darkness of the Fallen

Proyecto completo de la hermandad Alianza de WoW Forever, importado de **darkness-of-the-fallen-proyecto.zip** y contrastado con **darkness-of-the-fallen-web-publica.zip**. Repositorio de destino: **eltryt/darknessofthefallen**.

Web pública: https://eltryt.github.io/darknessofthefallen/.

Aplicación y backend alojados: https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev/ (Discord pendiente de configuración).

## Código actual

- `public/`: frontend actual, logo original, estilos, páginas y módulos de personajes y operaciones.
- `src/`: servidor Node.js, Discord OAuth, permisos, API y operaciones de la hermandad.
- `migrations/`: esquema SQLite y migración de operaciones, consejo y archivado de personajes.
- `tests/`: 19 pruebas del proyecto entregado, 3 de la integración de Pages y 6 del calendario.
- `scripts/export-showcase.mjs`: genera la presentación pública desde el mismo frontend y los valores públicos de `src/database-core.mjs`.
- `scripts/build.mjs`: exporta la presentación y adapta su copia a GitHub Pages.

La importación inicial generaba la misma web que el ZIP público; las únicas diferencias originales detectadas fueron saltos de línea CRLF/LF. Las mejoras posteriores se describen a continuación. La procedencia y hashes de los archivos entregados están en [docs/SITE_IMPORT.json](docs/SITE_IMPORT.json).

## Desarrollo

Requiere **Node.js 24+**. Instalar las herramientas de Cloudflare con `npm ci`.

```sh
npm test
npm run build
npm run preview
```

`preview` sirve la versión de Pages en `127.0.0.1:4173`, ruta `/darknessofthefallen/`. `PORT` permite cambiar el puerto. Editar `public/` y recompilar actualiza la presentación; la identidad y horarios públicos iniciales están en `src/database-core.mjs`.

Para ejecutar la aplicación completa con su API y SQLite:

```sh
npm start
# Con recarga del servidor:
npm run dev
```

Escucha por defecto en `127.0.0.1:3000`, con origen `http://localhost:3000`. La base se crea en `data/guild.sqlite`; no se insertan usuarios o estadísticas ficticias. Copiar `.env.example` a `.env` únicamente si hace falta configurar valores y sin sobrescribir archivos existentes. `APP_ORIGIN` debe coincidir exactamente con el origen del navegador. No publicar `.env`, bases, backups ni credenciales.

Para una exportación pública independiente:

```sh
npm run export:showcase -- /tmp/darkness-showcase
```

## GitHub Pages

`.github/workflows/pages.yml` ejecuta las pruebas, genera `dist/` y publica exclusivamente ese directorio tras cada push a `main`. La fuente de Pages está configurada como **GitHub Actions**. También se puede ejecutar manualmente desde **Actions → Deploy public website to GitHub Pages → Run workflow**.

El build adapta prefijos de navegación, imports, imágenes y JSON, detecta correctamente las rutas bajo `/darknessofthefallen/` y actualiza las URLs canónicas y sociales. Conserva el diseño, los textos, el logo y el calendario del proyecto. No utiliza el frontend antiguo del primer ZIP.

Para otro prefijo o dominio, ajustar también el workflow:

```sh
PAGES_BASE_PATH=/ PAGES_ORIGIN=https://eltryt.github.io npm run build
```

La exportación usa solo los valores públicos iniciales y recursos de la aplicación. No consulta una base de datos ni exporta sesiones, candidaturas o información privada. El build valida el JSON y excluye el servidor y las herramientas de pruebas del artefacto.

**Pages aloja la presentación pública.** Discord OAuth, candidaturas y las herramientas de miembros/oficiales requieren desplegar el backend con almacenamiento persistente y configurar Discord. El código completo está en este repositorio; esas funciones no se ejecutan dentro de GitHub Pages.

## Horarios y calendario

Inicio, Hermandad y Raids muestran las próximas franjas del horario confirmado, la cuenta atrás y la conversión opcional a la zona horaria del navegador. Las sesiones que atraviesan medianoche y los cambios de hora de Madrid se calculan como instantes reales.

**Añadir a mi calendario** descarga un archivo `.ics` con las próximas 12 semanas. Los eventos se marcan como horarios orientativos, no como convocatorias confirmadas ni inscripciones. Es una importación puntual: si cambia la planificación, hay que actualizarla en el calendario del usuario. No requiere iniciar sesión y funciona en Pages y en la aplicación Node.

La pantalla de acceso pendiente ofrece enlaces a estas funciones. El botón del menú se llama **Acceso de miembros** mientras Discord no está configurado; no se simula un inicio de sesión.

## Backend e integraciones

El proyecto entregado incluye personajes/Main/Alters, permisos por rango, raids, asistencia, wishlist, loot, consejo, progreso, candidaturas, auditoría y exportaciones JSON/CSV. Las pruebas validan flujos locales y un intercambio OAuth simulado; no acreditan una conexión real con Discord.

Ver [docs/BACKEND.md](docs/BACKEND.md) para configuración, privacidad y backups. `npm run backup` utiliza la API consistente de SQLite. `scripts/qa-preview.mjs` es una herramienta aislada de pruebas con datos sintéticos en memoria; no es un punto de entrada de producción.

## Verificación

- 28 pruebas automatizadas correctas y build repetible, incluidos cambios de hora, sesiones tras medianoche y exportación iCalendar.
- En la importación se compararon las 8 páginas con el ZIP a 1440 y 390 px. Después se añadieron el planificador y los enlaces de acceso pendiente, manteniendo la identidad visual.
- Navegación, recargas, menú móvil/Escape, filtro/limpieza del roster y preguntas desplegables comprobados, sin errores JavaScript ni peticiones a una API en Pages.
- Descarga `.ics` real y lectura con un parser iCalendar comprobadas a 1440, 390 y 320 px, con zonas Madrid, Nueva York y Tokio.
- Backend arrancado y sus 8 páginas públicas comprobadas; 11 pestañas del panel de líder y perfil de miembro verificados en móvil mediante datos sintéticos locales.

Ver [PROJECT_STATUS.md](PROJECT_STATUS.md) para publicación y límites. Los documentos de `docs/imported/` son antecedentes conservados del ZIP; sus referencias a repositorios o permisos anteriores no describen este despliegue.

## Backend Cloudflare

Preparado para Workers con SQLite persistente en Durable Objects. Ejecutar `npm run dev:backend` para desarrollo y `npm run test:backend` para comprobar el runtime. [Guía de publicación y configuración de Discord](docs/CLOUDFLARE.md). El workflow manual **Deploy backend to Cloudflare** publica la aplicación completa cuando están configuradas las credenciales de la cuenta.

## Candidaturas

[Formulario público y revisión privada](docs/RECRUITMENT.md): solicitudes persistentes, referencia de envío, estados y notas para Líder/Oficiales. Sin avisos automáticos a Discord.

# Darkness of the Fallen

Web de la hermandad Alianza de WoW Forever. Proyecto migrado desde `Darkness-of-the-Fallen-checkpoint.zip` a **eltryt/darknessofthefallen**, conservando los tres commits del checkpoint y el commit inicial del repositorio de destino.

## GitHub Pages

La versión pública es estática: inicio, hermandad, roster público, progreso, raids, reclutamiento informativo y contacto. Conserva el diseño del checkpoint. Las rutas funcionan bajo `/darknessofthefallen/`, incluso al recargar o abrir directamente una página interna.

El servidor Node.js/SQLite sigue disponible para desarrollo. GitHub Pages **no ejecuta** Discord OAuth, sesiones, gestión de personajes, candidaturas ni el panel privado. En Pages esas funciones muestran un estado pendiente y no envían solicitudes a una API inexistente. Para activarlas hace falta desplegar el backend por separado y configurar Discord.

### Activar la publicación

1. En este repositorio, abrir **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. En **Actions**, ejecutar **Deploy public website to GitHub Pages** sobre `main`, o hacer un nuevo push a `main`.
3. Comprobar que los trabajos `build` y `deploy` terminan correctamente. La URL prevista es `https://eltryt.github.io/darknessofthefallen/`.

El workflow ejecuta las pruebas con Node 24, genera `dist/` y publica exclusivamente ese directorio mediante las acciones oficiales de Pages. No necesita tokens personales ni secretos de Discord. No modifica la visibilidad del repositorio. Si GitHub indica que Pages no está disponible para su visibilidad/plan, hay que resolver esa disponibilidad en GitHub antes de desplegar; no se ha activado ningún plan de pago.

### Editar el contenido público

Modificar `site/public.json` y subir el cambio a `main`. Solo contiene información destinada a ser pública. `settings.discordUrl` acepta una invitación oficial de Discord; actualmente está vacío porque el checkpoint no incluye una. Tampoco incluye miembros, raids ni estadísticas inventadas.

El build selecciona explícitamente los campos públicos de personajes (`name`, `class`, `role`) y raids (`id`, `title`, `starts_at`, `source`). No lee la base de datos, `.env`, copias de seguridad ni exportaciones privadas. Nunca usar una exportación administrativa como archivo de contenido público. La configuración de Pages es independiente de la configuración guardada en SQLite por el panel del servidor.

## Desarrollo

Requiere **Node.js 24 o posterior**. No hay paquetes externos que instalar.

```sh
npm test
npm run build
npm run preview
```

La vista previa sirve `dist/` en el puerto 4173 con la misma ruta `/darknessofthefallen/` que Pages. `PORT` permite cambiar el puerto. Para otro repositorio o un dominio propio, ajustar `PAGES_BASE_PATH` al compilar y también en `.github/workflows/pages.yml`; debe empezar y terminar por `/`:

```sh
PAGES_BASE_PATH=/ npm run build
npm run preview
```

Para ejecutar el backend completo en desarrollo:

```sh
npm start
# O bien, con recarga del servidor:
npm run dev
```

Escucha por defecto en `127.0.0.1:3000`. La base SQLite se crea en `data/guild.sqlite`. Si necesitas configurar Discord, copia `.env.example` a `.env` sin sobrescribir uno existente y completa los valores localmente. `APP_ORIGIN` debe coincidir exactamente con el origen del navegador. Nunca publiques `.env`, bases de datos, backups ni tokens.

La configuración de Discord, los permisos, la privacidad y las copias de seguridad se documentan en [docs/BACKEND.md](docs/BACKEND.md). `npm run backup` utiliza la API de backup consistente de SQLite.

## Estado y validación

- `npm test`: pruebas de seguridad del backend y del build de Pages, proyección de datos públicos y rutas.
- `npm run build`: verificación de sintaxis y generación completa y repetible del sitio estático.
- Verificación local en Chromium a 1440 y 390 píxeles: 10 rutas, recargas, enlaces, menú móvil, filtro de roster, ausencia de llamadas a API en Pages y ausencia de errores JavaScript.
- Arranque del servidor y comprobación de salud, inicio, roster y acceso en navegador.

La ejecución local no acredita un despliegue remoto. Consultar [PROJECT_STATUS.md](PROJECT_STATUS.md) para los límites y las verificaciones pendientes. El logo original y las integraciones en vivo no estaban en el checkpoint; se conserva el monograma provisional. El alcance histórico del producto está archivado en [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

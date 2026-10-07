# Estado del proyecto — 8 de octubre de 2026

## Fuente de esta migración

El usuario proporcionó `darkness-of-the-fallen-proyecto.zip` y `darkness-of-the-fallen-web-publica.zip`. Ambos se han inspeccionado e integrado en `eltryt/darknessofthefallen`. El proyecto completo genera la exportación pública entregada; solo había diferencias CRLF/LF en dos archivos. `docs/SITE_IMPORT.json` registra los hashes y la comparación.

Esta actualización reemplaza el código antiguo de la primera migración (`93a90d2`/`1a361b0`) con la aplicación completa entregada. El historial existente se conserva. La recuperación parcial de la web realizada antes de recibir estos ZIP no se usa como fuente del build.

## Código incorporado

- Frontend completo en `public/`, con logo real, identidad visual actual, calendario, páginas ampliadas, filtros, preguntas desplegables y módulos de operaciones/personajes.
- Backend actual en `src/`, incluida `operations.mjs`, y migración SQL 002.
- Raids manuales, asistencia, wishlist, loot, snapshots del consejo, progreso público, archivado de personajes, auditoría y CSV, además de los módulos existentes de Discord y candidaturas.
- Los tests de seguridad/operaciones entregados, scripts de exportación y QA, y documentación técnica del proyecto.
- Adaptador de Pages, preview y pruebas de integración. Una única fuente de frontend: `public/`.

## Verificación local de esta actualización

- 22/22 pruebas pasan: 19 del proyecto entregado y 3 de Pages.
- Build correcto y repetible bajo `/` y `/darknessofthefallen/`.
- 8 páginas públicas comparadas con el ZIP público a 1440 y 390 px: capturas idénticas, textos/títulos, logo y calendario coincidentes.
- Recargas directas, navegación activa, menú móvil/Escape, filtros/limpieza de roster y preguntas desplegables funcionan, sin errores JavaScript ni desbordamiento horizontal.
- Backend arrancado: health y 8 páginas públicas correctas.
- QA aislada en memoria: 11 pestañas del panel de líder y perfil de miembro comprobados en móvil, sin errores de API/interfaz. No se utilizan esas sesiones o datos en Pages ni en producción.

## GitHub Pages

La fuente de Pages está configurada como GitHub Actions. El workflow publica `dist/` tras cada push a `main`. URL: https://eltryt.github.io/darknessofthefallen/.

El resultado remoto de esta actualización se comprueba después del push. Las verificaciones locales anteriores no son una afirmación de publicación ya completada. El acceso actual a la API de GitHub permite comprobar Actions directamente.

## Límites y trabajo posterior

- Pages mantiene el modo de presentación del ZIP público. El backend completo está en GitHub, pero necesita alojamiento Node/SQLite persistente para prestar servicios a los miembros.
- Discord OAuth real, webhook privado y sincronización de proveedores no se han configurado ni probado con credenciales reales. El OAuth simulado está cubierto por tests.
- El calendario confirmado es martes, miércoles y jueves, 23:00–01:00, Europe/Madrid; servidor PvP. La invitación de Discord y el nombre concreto del servidor siguen pendientes en los datos entregados.
- No se ha contratado ningún servicio, cambiado la visibilidad del repositorio ni usado otros repositorios como destino.
- Los documentos importados reflejan antecedentes, no autorizaciones nuevas ni pruebas de esta ejecución.

## Uso

Node 24+, sin instalación de dependencias. `npm test`, `npm run build`, `npm run preview` para Pages. `npm start`/`npm run dev` para la aplicación completa. Ver README y docs/BACKEND.md para configuración y backups. Los procesos deben reiniciarse en una tarea nueva.

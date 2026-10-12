# Recursos del roster

Los iconos se sirven localmente, sin solicitudes del navegador a terceros.
Origen de las imágenes: `https://wow.zamimg.com/images/wow/icons/large/` (CDN de
Wowhead, no una API oficial de Blizzard). Se comprobaron como JPEG antes de incluirlas.
Clases: `classicon_<class>.jpg`. Especializaciones: iconos de habilidades de WoW;
son ilustrativos, no evidencia de un catálogo confirmado de WoW Forever.

`public/icon-assets.js` define los recursos permitidos en el backend y ambos
exportadores. `public/specs.js` comparte etiquetas e IDs; `src/specs.mjs` los reexporta.
Los estilos están en `public/style.css`. Para añadir un recurso, incluir un archivo
JPEG válido y actualizar el manifiesto. No guardar páginas de error como imágenes.

Validación antes de publicar: `npm test`, `npm run test:backend`, `npm run build`,
`npm run build:backend` y `npm run format:check`. El despliegue usa los workflows
existentes; no requiere nuevas credenciales ni cambios de base de datos.

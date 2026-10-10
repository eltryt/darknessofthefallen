# Organización y formato del código

- `public/index.html`: estructura HTML común y carga de la aplicación.
- `public/style.css`: única hoja de estilos. Mantiene, en este orden, base y
  variables, herramientas del panel, identidad visual y presentación estática.
  El orden importa: no reordenar reglas automáticamente por selector.
- `public/app.js`: arranque, navegación y utilidades compartidas. Construye el
  contexto de cada vista después de cargar los datos y la sesión.
- `public/public-views.js`: rutas públicas, roster y candidatura.
- `public/public-layout.js`: composición visual pública, horarios e identidad.
- `public/profile-view.js`: perfil, personajes y acciones del jugador.
- `public/panel-view.js`: pestañas, configuración y herramientas de administración.
  Cada módulo recibe sus dependencias por contexto; ninguno importa `app.js`.
  Los módulos especializados `*-ui.js` continúan gestionando sus herramientas.
- `src/`: backend, autenticación, permisos, persistencia e integraciones.
- `scripts/`: compilación, despliegue, copias y herramientas administrativas.
- `tests/`: pruebas funcionales y del runtime de Cloudflare.

Usamos Prettier con versión fijada y tabulaciones (anchura visual de dos espacios),
comillas simples y ancho orientativo de 100 columnas. Las plantillas extensas de
HTML tienen la marca `/* HTML */` para que el formateador también las entienda.
EditorConfig aplica los mismos criterios en el editor; YAML usa espacios.

```sh
npm run format
npm run format:check
npm test
npm run test:backend
npm run build
npm run build:backend
```

CI comprueba el formato. No editar `dist/`: se genera desde `public/` y los
exportadores. Las copias importadas históricas y archivos generados quedan fuera
del formateador. El CSS no debe introducirse en atributos `style` ni en bloques
`<style>` dentro del JavaScript: añadir clases y sus reglas a `public/style.css`.

Las vistas se organizan por responsabilidad. Para añadir un módulo público,
registrar su recurso en el backend y los exportadores; las pruebas de Pages
comprueban que sus imports resuelven. Mantener los cambios de reglas de negocio
separados de las reorganizaciones de código.

# Organización y formato del código

- `public/index.html`: estructura HTML común y carga de la aplicación.
- `public/style.css`: única hoja de estilos. Mantiene, en este orden, base y
  variables, herramientas del panel, identidad visual y presentación estática.
  El orden importa: no reordenar reglas automáticamente por selector.
- `public/app.js`: entrada de la interfaz, componentes compartidos y composición
  de páginas. Los módulos de personajes, candidaturas, raids y calendario siguen
  separados en sus archivos `*-ui.js` y `character-editor.js`.
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

Esta tanda mejora legibilidad y centraliza estilos, conservando la arquitectura.
La separación de más vistas del archivo principal puede hacerse por módulos en
futuras tandas, con pruebas del flujo afectado, sin mezclarla con cambios de reglas.

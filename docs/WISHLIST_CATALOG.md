# Wishlist y catálogo de encuentros de Forever

## Investigación — 11 de octubre de 2026

Fuente primaria consultada: https://worldofwarcraft.blizzard.com/en-us/forever
La página oficial presenta zonas como Mount Hyjal y Zephras Isle,
características del juego y acceso a la beta. En el contenido consultado no se
ha identificado un catálogo verificable de bosses de raid y sus tablas de loot.
Mount Hyjal anunciado como zona no confirma los encuentros de Hyjal Summit de
otras versiones de WoW. Tampoco los nombres de ejemplo de una convocatoria ni
las capturas de Viserio confirman contenido de Forever.

No se afirma que no exista información en ningún otro sitio. No se han importado
bosses ni objetos de Retail/Classic como si estuvieran confirmados para Forever.

## Estructura preparada

`public/encounter-catalog.js` tiene versión, juego, fecha de revisión, fuentes y
una colección de raids vacía. Futuras entradas:

```js
{
  id: 'identificador-estable',
  name: 'Nombre verificado',
  status: 'verified',
  sourceUrl: 'https://fuente-oficial/...',
  bosses: [
    { id: 'boss-estable', name: 'Boss verificado', sourceUrl: 'https://...', items: [] }
  ]
}
```

Solo las raids marcadas `verified` alimentan las sugerencias del formulario.
Al escoger una raid aparecen sus bosses como sugerencias. Antes de marcar una
raid verificada, verificar sus bosses y registrar fuentes. Al incorporar un
catálogo real, actualizar también el aviso de estado y la fecha de revisión.
Las tablas de objetos quedan preparadas como colección, sin estadísticas inventadas,
simulaciones de mejora ni decisiones automáticas de Loot Council.

Ahora se permite entrada manual de raid y boss; son preferencias aportadas por
el jugador, no contenido oficial confirmado. La wishlist agrupa por raid/boss,
ordena prioridades personales y filtra por personaje/texto. La prioridad no cambia
las normas de reparto. Entradas anteriores sin raid se mantienen como «Raid sin indicar».

El backend añade `raid` opcional (máximo 120 caracteres) al JSON ya existente;
no hay migración destructiva ni cambio de autenticación. Propiedad y permisos de
wishlist se mantienen. Los oficiales ven raid/boss en su consulta autorizada.

## Roster

Tarjetas por rol, nombres/distintivos con colores de las nueve clases, texto de
clase visible y filtros conservados. Algunos colores se aclaran para contraste
en el fondo oscuro. Sin estadísticas de equipo, buffs o grupos de raid ficticios.
El roster público sigue limitado a nombre/clase/rol. Main/Alter, disponibilidad
y datos de miembro solo se muestran en el panel autorizado.

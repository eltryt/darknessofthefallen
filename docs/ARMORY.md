# Armería, listas BiS y guías

Fase 1 (15/10/2026): infraestructura completa, sin objetos, estadísticas, equipamiento
ni listas BiS precargadas. Todo empieza vacío y se rellena con información fiable.

## Arquitectura reutilizada

- **Identidad y sesiones**: Discord OAuth existente (`src/auth.mjs`). No hay un segundo login.
- **Personajes**: se amplía la tabla `characters` existente (no se duplica). Los campos
  nuevos son opcionales y los personajes antiguos conservan todos sus datos.
- **Permisos**: rangos de `src/domain.mjs`, comprobados en el backend.
- **Persistencia**: SQLite local (Node) y SQLite del Durable Object (Cloudflare), con la
  misma migración secuencial `migrations/007_armory.sql`.
- **Copias**: `src/recovery.mjs` exporta las tablas nuevas (formato 2, base 7) y sigue
  restaurando copias de las versiones 5 y 6 (las columnas nuevas toman su valor por defecto).
- **Interfaz**: componentes y estilos de la web (`components.js`, `theme.css`).

## Navegación

Perfil → Mis personajes → «Ver ficha de armería» → `/armeria?personaje=<id>`.
Pestañas: Resumen | Equipamiento | Mi BiS | Guías | Revisiones. Selector para cambiar de
personaje y enlace para volver. En Panel → Roster, «Ficha de armería» en cada personaje.
Panel → Guías externas gestiona proveedores y enlaces.

## Modelo de datos (migración 007, solo aditiva)

| Tabla / columnas | Propósito |
| --- | --- |
| `characters` + `game_version, realm, region, faction, race, secondary_spec, level, avatar_url, updated_at, synced_at` | Ficha del personaje. `source`/`external_id` (ya existentes) y `synced_at` identifican datos de un proveedor. |
| `character_equipment` | Equipamiento actual por ranura: objeto, calidad, nivel, icono, encantamiento, gemas, estadísticas, fuente y `origin` (`manual`/`provider`). |
| `bis_lists` | Lista por personaje + especialización + contenido + fase. |
| `bis_entries` | Candidatos por ranura: objeto, identificador opcional, fuente, jefe, prioridad 1–5, estado, principal/alternativa y notas del jugador. Un único principal por ranura (índice parcial). |
| `guide_providers` | Wowhead, Icy Veins y Archon (semilla), dominios permitidos y estado activo. |
| `guide_links` | URL exacta por proveedor + versión + clase + especialización + sección + fase, con quién y cuándo se comprobó. |
| `character_reviews` | Revisiones de oficiales: autor, estado, resumen, quién y cuándo la completó. |
| `character_officer_notes` | Notas internas, separadas de las notas del jugador. |

Separación de datos: **manual** (lo que escribe el jugador o el staff), **proveedor**
(`origin='provider'`, `synced_at`, `avatar_url`; hoy ningún proveedor escribe) y
**aplicación** (auditoría, revisiones, fechas). Las tablas admiten un futuro catálogo de
objetos/bandas/jefes: `item_id` queda vacío hasta que exista un catálogo verificado.

## Catálogo configurable

`public/armory-catalog.js` (compartido por navegador y backend) define versiones de
juego, ranuras, razas↔facción, regiones, estados BiS y secciones de guía. Añadir una
versión es añadir una entrada. **WoW Forever está marcado como provisional**: no hay una
fuente oficial que confirme sus razas, restricciones de raza/clase, nivel máximo ni
ranuras; se usan ranuras de estilo clásico y no se restringen combinaciones raza/clase.

## Guías externas

- No se construyen URLs por patrones ni se hace scraping. El Líder introduce cada URL
  tras abrirla y la marca como comprobada; solo las comprobadas aparecen en las fichas.
- La URL debe ser HTTPS, sin credenciales y del dominio del proveedor (o subdominio).
- Cambiar la URL obliga a volver a comprobarla. Desactivar un proveedor lo oculta.
- Un enlace sin especialización vale para toda la clase; uno específico tiene prioridad.
- Se abren con `rel="noopener noreferrer"` en la web original.
- Estado actual: proveedores sembrados, **ningún enlace**. No se ha verificado que existan
  guías compatibles con WoW Forever en esos proveedores; esa decisión es del Líder.
  Comprobación de portadas: Wowhead e Icy Veins responden; Archon muestra una verificación
  humana a navegadores automatizados.

## Permisos (backend)

| Acción | Quién |
| --- | --- |
| Crear/editar sus personajes y su ficha | Propietario (`character.write`, Miembro+) |
| Crear/editar/borrar sus listas BiS | Solo el propietario |
| Ver la ficha y la lista BiS de otros | `armory.read` (Raid Leader+) |
| Revisiones y notas internas | `armory.review` (Oficial+) |
| Retirar una nota interna | Su autor o el Líder |
| Proveedores y enlaces de guías | `armory.configure` (Líder) |

Un identificador ajeno responde 404 (no 403) para no revelar qué personajes existen.
Las notas internas nunca se envían al jugador y la auditoría no copia su texto.

## API de Blizzard y proveedores de datos

La API oficial de Blizzard cubre personajes de reinos oficiales de Retail y Classic y
requiere credenciales de cliente en el servidor. No consta que ofrezca datos de WoW
Forever, así que no se ha conectado ni se han pedido credenciales. La arquitectura queda
preparada para un proveedor de datos (Blizzard u otro compatible) que escriba en
`characters` (`source`, `external_id`, `synced_at`, `avatar_url`) y en
`character_equipment` con `origin='provider'`, sin pisar los datos manuales. Los secretos
irían en variables del Worker, nunca en el frontend.

## Pendiente para fases siguientes

Catálogo verificado de objetos/jefes de Forever, edición manual del equipamiento,
comparación equipamiento ↔ BiS, listas por banda y jefe, prioridades de botín y enlace
con raids, sincronización con un proveedor real, confirmación de razas/ranuras de Forever.

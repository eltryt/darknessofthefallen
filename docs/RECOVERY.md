# Copias de seguridad y recuperación

La producción usa el SQLite del Durable Object `Guild` del Worker
`darknessofthefallen-backend`, instancia `darknessofthefallen`. GitHub contiene
el código, **no una copia de los datos de la hermandad**. No cambiar el nombre del
Worker, clase, namespace ni instancia para recuperar datos.

## Copia diaria automática y cifrada

El workflow **Encrypted off-site backup** (`.github/workflows/backup.yml`) se
ejecuta cada día a las 04:17 UTC y también a mano. Pide la exportación a
`GET /api/backup` con el secreto `BACKUP_TOKEN`, valida el checksum y la cifra
con `backup/public-key.pem` (RSA-OAEP-SHA256 + AES-256-GCM, comprimida) antes de
guardarla como artefacto durante **90 días**. El repositorio es público: solo sale
del job el archivo cifrado, y los registros muestran cantidades, nunca datos. Si
la copia falla, GitHub avisa del fallo del workflow por correo.

La **clave privada** (`backup-private-key.pem`) y el token (`backup-token.txt`)
están solo en la carpeta privada del propietario, fuera del repositorio. Sin esa
clave privada las copias no se pueden leer: guardarla también en un gestor de
contraseñas o una memoria USB. Nunca subirla a GitHub, Discord ni la web.

Configuración inicial, una sola vez:

1. `npm run backup:keygen -- /carpeta/privada` crea la pareja de claves y el token.
   Hacer commit solo de `backup/public-key.pem`.
2. Guardar el contenido de `backup-token.txt` como secreto `BACKUP_TOKEN` de
   GitHub Actions.
3. Ejecutar **Deploy backend to Cloudflare**: instala el token en el Worker. Sin
   token, `/api/backup` y `/api/restore` responden 404.

Para usar una copia: descargar el artefacto desde Actions, descomprimir el ZIP y
descifrarlo en la carpeta privada:

```sh
npm run backup:decrypt -- darkness-backup-FECHA.json.enc /privado/backup-private-key.pem /privado/copia.json
```

El JSON descifrado contiene datos personales: borrarlo al terminar.

## Copia manual desde el panel

Con la cuenta líder: **Panel → Exportación → Descargar exportación JSON**.
Guardar el archivo en almacenamiento privado y cifrado fuera de la web; nunca en
el repositorio, un issue o un artefacto público de GitHub sin cifrar. Útil antes
de cambios importantes.

Formato 2, esquema de base 6 (restauración compatible con esquema 5): configuración y todas las tablas de negocio,
incluidas convocatorias, personajes vinculados, bajas, auditoría y colas. Contiene
datos personales. No contiene sesiones, estados OAuth ni secretos de Cloudflare.
El SHA-256 detecta corrupción accidental; no demuestra autenticidad frente a
alguien que pueda modificar el archivo y recalcularlo. Usar únicamente copias
propias de confianza. Las exportaciones antiguas de formato 1 no se importan:
conservarlas y descargar una nueva cuando sea posible.

## Ensayo de restauración, sin tocar producción

En un checkout de la misma versión del proyecto con Node 24:

```sh
npm ci
npm run restore -- /ruta/privada/darkness-export.json
```

Sin destino, importa en SQLite en memoria, valida checksum, columnas, referencias
e integridad y muestra solo cantidades. No inicia un servidor ni conecta a Discord.
Para conservar una base recuperada para inspección:

```sh
npm run restore -- /ruta/privada/darkness-export.json /ruta/privada/recuperada.sqlite
```

El directorio de destino debe existir. El archivo debe ser NUEVO; no se permite
sobrescribir. Se crea con permisos 0600. Fallos de importación eliminan únicamente
el archivo nuevo incompleto. Guardar el JSON original sin modificar.

La copia recuperada no reactiva sesiones ni OAuth. Los trabajos de Discord sin
completar quedan bloqueados para revisión; los avisos pendientes no se reenvían.
Se preservan los trabajos en la copia para diagnóstico. Revisar cada evento real
antes de reintentar; una copia antigua puede contener acciones ya realizadas.
No arrancar esa base con credenciales de producción durante el ensayo.

## Recuperación en Cloudflare

Cloudflare documenta recuperación PITR de SQLite Durable Objects durante los
últimos 30 días, incluyendo SQL y almacenamiento clave/valor:
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#point-in-time-recovery-api

Métodos oficiales: `getCurrentBookmark`, `getBookmarkForTime` y
`onNextSessionRestoreBookmark`. Es una protección del proveedor, no reemplaza una
copia externa. No se ha ejecutado una restauración PITR en producción ni se afirma
haber comprobado la retención de esta cuenta.

Ante un incidente:

1. Detener temporalmente escrituras y sincronización para evitar efectos duplicados.
2. Conservar una exportación del estado actual y registrar el momento anterior al
   incidente. Mantener el despliegue y los secretos existentes.
3. Ensayar la copia JSON en una base aislada con la herramienta anterior.
4. Para recuperar el Durable Object existente, preparar una operación controlada
   con la API PITR oficial y el bookmark elegido. Esta versión NO añade un endpoint
   público de restauración ni carga automáticamente SQLite local a Cloudflare.
5. Antes de reabrir: invalidar sesiones/estados OAuth restaurados por PITR, pausar
   colas y alarmas antiguas, comprobar datos y reconciliar eventos con Raid-Helper.
   Restaurar la web no revierte publicaciones ni inscripciones en Discord.

Si la pérdida queda fuera de PITR y la base de producción se ha quedado vacía,
la copia descifrada se puede devolver al Durable Object:

```sh
npm run restore -- /privado/copia.json
BACKUP_TOKEN=$(cat /privado/backup-token.txt) npm run backup:restore-remote -- /privado/copia.json --confirmo-restaurar-produccion
```

El servidor valida el checksum y **rechaza la restauración si la base contiene
datos o sesiones**, así que no mezcla ni sobrescribe nada: no sirve para deshacer
un error con datos vivos (para eso, PITR). Hacerlo antes de que alguien inicie
sesión. Igual que la restauración local, no reactiva sesiones y deja bloqueados
los avisos y trabajos de Discord pendientes para revisarlos.

## Instalaciones locales de Node

`DATABASE_PATH=/ruta/guild.sqlite npm run backup` usa la API de backup online
consistente con WAL y valida la copia resultante. Rechaza una ruta inexistente,
para no crear una base vacía y confundirla con una copia de Cloudflare. La copia
SQLite nativa incluye sesiones: tratarla como sensible, no exponerla ni arrancarla
con credenciales durante un ensayo. No sustituir un archivo de base abierto ni
mezclarlo con WAL/SHM de otra generación.

## Validación realizada

Pruebas automáticas con datos sintéticos: recuperación de todas las tablas,
integridad, checksum, rollback ante referencias inválidas, protección contra
sobrescritura, exclusión de autenticación y bloqueo de efectos pendientes.
También exportación desde workerd/SQLite y restauración de ese JSON en Node.
Copias automáticas (16-17/10/2026): cifrado con clave equivocada y manipulación
rechazados; endpoints con token (401 sin él, 404 sin configurar); en workerd local,
exportación de un Durable Object y restauración en otro vacío, con rechazo al
repetirla. No se ha restaurado la base de producción.

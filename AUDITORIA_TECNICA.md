# Auditoría Técnica - Sistema RAID/attendance

## Sección 1: Implementación del sistema RAID/attendance

### Funcionalidades Principales
- **Sistema de gestión de convocatorias**: El sistema permite crear, consultar y gestionar raids a través de los endpoints `/api/events` y `/api/raids`
- **Integración con Raid-Helper**: Utiliza una integración con Raid-Helper para sincronizar la información de los eventos (creación, modificación y cancelación)
- **Sistema de asistencia**: Gestiona la asistencia de miembros a raids a través de `/api/attendance` y `/api/raids/{id}/attendance`
- **Control de acceso basado en roles** (RBAC): Implementa permisos granulares mediante el módulo `domain.mjs`

### Estructura de los sistemas
- Archivo principal: `raid-events.mjs` para eventos de raid
- Funcionalidad: `operations.mjs` para operaciones generales incluyendo asistencia
- Base de datos: Implementa transacciones y auditoría en `database-core.mjs`
- Permisos: Definidos en `domain.mjs` con niveles de acceso específicos

## Sección 2: Validaciones de datos

### Endpoint `/api/events`
- Validación de fechas (inicio posterior al final)
- Valores de capacidad entre 1-1000
- Categorías predefinidas ('Oficial', 'Extraordinaria', 'Voluntaria')
- Verificaciones para publicación y organización de eventos

### Endpoint `/api/attendance`
- Validaciones de entrada para registros de asistencia:
  - Personajes activos (verificación con `archived_at IS NULL`)
  - Estados válidos de asistencia definidos en `s.attendanceStates`
  - Límite de 100 registros por operación
  - Restricciones de acceso individual por usuario
- Verificaciones de duplicados y consistencia de datos

### Control de accesos mediante permisos
- Validaciones rigurosas con `requirePermission()` para acceso a endpoints protegidos
- Gestión de usuarios autenticados con `requireUser()`
- Comprobación de identidad del usuario en operaciones de edición

## Sección 3: Seguridad y control de acceso

### Control de acceso basado en permisos (RBAC)
El sistema implementa un sistema de control de acceso basado en roles (RBAC) con permisos específicos:
- `community.read`: Acceso a contenido público
- `attendance.manage`: Gestión de asistencia e información de raids
- `recruitment.manage`: Gestión del reclutamiento y convocatorias
- `loot.manage`, `loot.delete`: Gestión de loot
- `settings.manage`: Configuración del servidor
- `audit.read`: Acceso a auditoría

Los permisos se definen en el archivo `domain.mjs` con niveles de rango: visitor, member, raider, raid_leader, officer, leader.

### Protecciones contra operaciones no autorizadas
- Verificación previa de permisos antes de cada acción crítica:
  - `requirePermission()` para verificar privilegios específicos
  - `requireUser()` para asegurar autenticación
- Control de identidad en las operaciones (no se permite modificar otro usuario)
- Protección contra duplicados: Verificaciones de existencia previa antes de operaciones

## Sección 4: Sistema de auditoría

### Registro detallado de operaciones
- Todos los cambios importantes son registrados en la tabla `audit`
- Los tipos de auditoría incluyen:
  - Creación, modificación y eliminación de elementos
  - Asistencia actualizada por usuarios
  - Cambios en configuración del servidor
  - Operaciones de loot y progreso

### Auditoría específica para raids/attendance
- Registro de acciones como `raid.created`, `raid.updated`, `raid.deleted`
- Control de asistencia: `attendance.updated`, `attendance.deleted`
- Historial completo de cambios en eventos y convocatorias
- Acceso a auditoría mediante endpoint `/api/audit` con permiso `audit.read`

### Logs con información detallada
- Los logs incluyen información de:
  - Actor (usuario que realiza la acción)
  - Acción realizada
  - Objeto afectado
  - Cambios específicos efectuados (antes y después)

El sistema proporciona un control completo de las operaciones, lo cual es crucial para auditorías de seguridad y trazabilidad de los datos.
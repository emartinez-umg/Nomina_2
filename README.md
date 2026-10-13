# nomina2

Sistema de nómina: infraestructura, base de datos, seguridad y base visual del frontend completas (FASES 0–3). Monorepo con npm workspaces, Express + TypeScript strict,
React 18 + Vite + Tailwind y Oracle 21c XE mediante node-oracledb thin.
Repositorio: [emartinez-umg/Nomina_2](https://github.com/emartinez-umg/Nomina_2).

## Levantar todo con Docker

Requisitos: Docker con Compose v2 o superior y al menos 4 GB de memoria disponibles para los servicios.
Oracle XE usa `linux/amd64`; en Apple Silicon se necesita emulación x86_64. El Compose declara esa
plataforma solo para Oracle. Si el motor no puede ejecutarla, el mantenedor documenta
[Colima con arquitectura x86_64](https://github.com/gvenzl/oci-oracle-xe#oracle-xe-on-apple-m-chips).

```bash
cp .env.example .env
# Editar .env: ORACLE_PASSWORD, DB_PASSWORD y ADMIN_* antes de instalar.
docker compose up --build
```

El primer arranque descarga Oracle y prepara el volumen; puede tardar varios minutos.
La API espera el healthcheck de Oracle, aplica migraciones y seeds y comprueba la conexión antes de
escuchar. nginx arranca cuando la API está saludable. Para dejarlo en segundo plano:

```bash
docker compose up --build -d --wait --wait-timeout 900
docker compose ps
```

- Web: [http://localhost:8080/salud](http://localhost:8080/salud).
- API directa: [http://localhost:3000/api/salud](http://localhost:3000/api/salud).
- API mediante nginx: [http://localhost:8080/api/salud](http://localhost:8080/api/salud).
- Oracle desde el host: `localhost:1521/XEPDB1`, usuario `DB_USER` y clave `DB_PASSWORD` de `.env`.

Los puertos publicados están limitados a la máquina local. No se necesita Instant Client.
El ADMIN inicial usa `ADMIN_USER`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `.env`; la contraseña queda
hasheada con argon2id y `CAMBIO_OBLIGATORIO=1`. La API ya permite login, cambio obligatorio,
logout, gestión de usuarios ADMIN y consulta de bitácora. Consultar [seguridad y endpoints](docs/SEGURIDAD.md)
para el flujo CSRF, permisos, cookies y pruebas. El login, el cambio obligatorio y el layout por rol están disponibles; consultar la [guía del frontend](docs/FRONTEND.md). Para probar autenticación por HTTP local: `NODE_ENV=development npm run dev` y abrir [el login](http://localhost:5173/login). Compose conserva cookies Secure y requiere HTTPS para autenticación.

## Variables de entorno

Hay un único `.env` en la raíz. Nunca se versiona y ninguna clave se envía al frontend.

| Variable                                          | Uso / valor inicial                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ORACLE_PASSWORD`                                 | Clave administrativa SYS/SYSTEM, solo inicialización de Oracle                    |
| `DB_USER`, `DB_PASSWORD`                          | Esquema dedicado de aplicación; SYS y SYSTEM están prohibidos en la API           |
| `ADMIN_USER`, `ADMIN_EMAIL`                       | Usuario inicial en minúsculas y correo válido; obligatorios para seeds            |
| `ADMIN_PASSWORD`                                  | 10–128 caracteres, mayúscula, minúscula, número y símbolo; obligatorio para seeds |
| `DB_CONNECT_STRING`                               | Desarrollo local: `localhost:1521/XEPDB1`; Compose usa `nomina2-db:1521/XEPDB1`   |
| `DB_PORT`                                         | Puerto Oracle publicado: 1521                                                     |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_INCREMENT` | Pool: 1 / 5 / 1; mínimo e incremento no superan el máximo                         |
| `DB_POOL_TIMEOUT_SECONDS`                         | Tiempo inactivo antes de reducir el pool: 60 s                                    |
| `DB_QUEUE_TIMEOUT_MS`                             | Espera máxima por una conexión del pool: 5000 ms                                  |
| `DB_CONNECT_TIMEOUT_SECONDS`                      | Tiempo máximo de conexión Oracle: 10 s                                            |
| `DB_CALL_TIMEOUT_MS`                              | Tiempo máximo por llamada Oracle: 5000 ms                                         |
| `NODE_ENV`                                        | `development`, `test` o `production`; Compose impone `production`                 |
| `HOST`, `PORT`                                    | Escucha local: `0.0.0.0:3000`; Compose fija los valores internos                  |
| `API_PORT`, `WEB_PORT`                            | Puertos publicados: 3000 / 8080                                                   |
| `LOG_LEVEL`                                       | Nivel de pino: `info`                                                             |
| `SHUTDOWN_TIMEOUT_MS`                             | Límite del cierre ordenado: 15000 ms                                              |
| `TZ`                                              | `America/Guatemala`                                                               |
| `SESSION_IDLE_MINUTES`                            | Inactividad de sesión en Oracle: 30 min                                           |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_MINUTES`   | Límite por IP: 30 peticiones / 15 min                                             |
| `TRUST_PROXY_CIDRS`                               | Vacío por defecto; IPs/CIDR de proxies confiables, separados por coma             |
| `VITE_PROXY_TARGET`                               | Destino del proxy Vite en desarrollo: `http://localhost:3000`                     |

Al cambiar `API_PORT` con Vite en desarrollo, ajustar también `VITE_PROXY_TARGET`.
Los cambios a credenciales Oracle en `.env` no modifican usuarios de un volumen ya inicializado;
se deben cambiar también en Oracle con un procedimiento administrativo.

## Desarrollo local

Instalar Node.js 20.19 o superior dentro de la rama 20 y npm 10 o superior. Con nvm:

```bash
nvm install
nvm use
npm ci
cp .env.example .env
# Editar claves y ADMIN_* antes de iniciar Oracle.
docker compose up -d --wait nomina2-db
npm run db:setup
npm run dev
```

Vite abre el puerto 5173 y redirige `/api` al backend; el navegador usa siempre la misma URL relativa.
Si la API de Compose está ocupando el puerto 3000, detenerla antes de iniciar el backend local.

## Migraciones

```bash
# Desde la raíz, usando el .env local:
npm run db:migrate
# Dentro del contenedor, sin dependencias de desarrollo:
docker compose exec nomina2-api npm run db:migrate
# Aplicar también seeds desde el host:
npm run db:setup
# Repetir solo seeds dentro del contenedor:
docker compose exec nomina2-api npm run db:seed
```

El runner guarda nombre, versión, checksum SHA-256, estado y fechas en `VERSION_ESQUEMA`.
V000 crea `PRUEBA_INFRAESTRUCTURA` e inserta un registro técnico, sin datos de empleados.
V001–V012 crean 53 tablas de negocio agrupadas en seguridad, organización, empleados, horarios,
parámetros, descuentos, nómina, prestaciones, vacaciones, solicitudes, comunicaciones y auditoría.
Consultar [ERD y diccionario](docs/ERD.md) y [lista blanca de filtros](db/filtros.json).
Una segunda ejecución omite lo aplicado. No editar archivos ya aplicados; añadir una versión mayor.

Convención: `V001__descripcion.sql` (versiones de 3 a 6 dígitos), cada sentencia SQL o bloque PL/SQL
termina con `/` en su propia línea. El runner elimina el `;` final del SQL y conserva los `;` del
PL/SQL. No admite comandos de SQL*Plus, includes ni `/` aislado dentro de un literal multilínea.

Oracle hace commit implícito de DDL; una migración no tiene rollback completo. Por eso se registra
`APLICANDO` antes del SQL y `FALLIDA` si hay un error. Ambos estados bloquean futuros arranques hasta
revisar y reparar manualmente los objetos y el historial. No borrar filas de historial sin comprobar
primero los efectos del DDL. Ejecutar un único runner a la vez; una colisión de versión detiene la
segunda ejecución. Los scripts en `db/init` solo corresponden a la primera creación del volumen.

## Seeds y ADMIN inicial

`npm run db:seed` ejecuta los SQL de `db/seeds` y crea el ADMIN en una sola transacción DML.
Los MERGE son aditivos: una reejecución no altera contraseñas, catálogos editados, plantillas ni
parámetros existentes. No se usa el seed para restablecer contraseñas ni promover usuarios de otro rol.
Si el usuario inicial ya existe como RH/EMPLEADO, el lote falla y hace rollback completo. Ejecutar
un único instalador a la vez. No cambiar `ADMIN_USER` para intentar restablecer la misma cuenta.

Se cargan roles, contratos, descuentos (incluidos parqueo y consumo en tienda), ausencias, solicitudes,
conceptos con banderas y vigencia, parámetros de referencia desde 01/01/2026, dos tramos ISR,
13 feriados de 2026 (12 nacionales y uno local) y tres plantillas base. Los feriados conservan
medios días y fechas efectivas de traslado. Las fuentes se enlazan en [ERD](docs/ERD.md).
Antes de calcular nómina, RRHH debe validar los parámetros legales, completar datos de la empresa
y los catálogos organizativos reales. No se insertan empleados, bancos ni datos empresariales ficticios.

## Comprobar calidad y aceptación

```bash
npm run lint
npm test
npm run typecheck
npm run build
npm run format:check
npm run verify:infra
npm run db:verify
npm run verify:security
docker compose exec nomina2-api npm run db:migrate
```

`verify:infra` necesita los tres servicios arriba y Node 20; verifica Oracle desde la API y nginx,
el fallback de React Router y la disponibilidad del bundle. Las pruebas Vitest cubren configuración,
liberación de conexiones, migraciones, respuestas HTTP y estados de la página. Supertest usa un puerto
efímero local. Los dobles de Oracle/fetch existen únicamente en pruebas; la aplicación siempre consulta
Oracle real.

`db:verify` requiere Node 20, `npm ci`, `.env` y Oracle saludable en Compose. Crea un usuario temporal
aleatorio `N2TEST_*` dentro de XEPDB1, aplica V000–V015 desde cero, ejecuta seeds dos veces y compara
el contenido completo de las 53 tablas, incluyendo ajustes manuales y credenciales ya cambiadas.
Comprueba identities, auditoría, compilación de triggers, restricciones, índices de todos los FK y
filtros, argon2id, feriados, rollback de seeds, neto, vacaciones y propiedad de salario/documentos.
Elimina únicamente ese usuario temporal al finalizar; nunca borra el esquema ni volumen de aplicación.
La administración temporal usa SQL*Plus del contenedor como SYS; migraciones, seeds y verificaciones
se ejecutan mediante node-oracledb thin como usuario temporal sin privilegios administrativos.

Una respuesta saludable contiene `ok: true` y `data: { estado: "OK", baseDatos: "CONECTADA", modo:
"thin", fecha: "..." }`. Un fallo de Oracle devuelve HTTP 503, `ok: false`, `data: null` y un error
en español con código `BD_NO_DISPONIBLE`; no se exponen SQL, credenciales ni stacks.

## Operación y estructura

```bash
docker compose logs -f nomina2-api
docker compose stop
docker compose up -d --wait
docker compose down
```

`down` conserva el volumen `nomina2_nomina2-oradata`; `down --volumes` elimina todos sus datos.
La API cierra HTTP y el pool al recibir SIGTERM/SIGINT. Los errores se registran con pino sin
mensajes internos de Oracle, cuerpos, cookies ni parámetros de consulta.

- `backend/src/modules/salud`, `auth`, `usuarios`, `auditoria`: routes → controller → service → repository.
- `backend/src/shared/security`: CSRF, autenticación, RBAC, propiedad y credenciales.
- `backend/src/shared/db`: pool thin, runner y repositorio de migraciones.
- `frontend/src`: router, providers, componentes y feature de salud.
- `frontend/src/styles/tokens`: tokens derivados del mockup.
- `db`: migraciones por dominio, seeds, inicialización y manifiesto de filtros.
- `docs`: progreso, decisiones, ERD por dominio/diccionario y referencia compacta del mockup.

Consultar [docs/PROGRESO.md](docs/PROGRESO.md) para resultados de esta fase y siguientes pasos.

## FASE 4: catálogos y parametrización

RH y ADMIN disponen de `/catalogos`: organización, horarios semanales variables, calendario anual,
tipos de ausencia/descuento/contrato, parámetros legales y tramos ISR. Incluye CRUD, filtros/páginas
en servidor, CSV, ayuda y auditoría transaccional. Las modificaciones legales muestran advertencia
con comparación, exigen motivo y conservan vigencias sin afectar periodos cerrados.

V013 añade rangos salariales referenciales de puestos e índices; `npm run db:setup` o Compose
aplica la migración. Para la interfaz local: `NODE_ENV=development npm run dev`.
Guía y contratos: [docs/CATALOGOS.md](docs/CATALOGOS.md).

## Gestión de empleados (Fase 5)

RH/ADMIN: abrir `/empleados` para altas, filtros, ficha, cambios salariales, baja y carga masiva.
Crear primero la organización y centros/horarios en Catálogos. Configurar el mínimo salarial vigente
según la categoría de la empresa. Operación, CSV, seguridad y endpoints en [EMPLEADOS.md](docs/EMPLEADOS.md).

## Novedades de nómina (Fase 6)

RH/ADMIN: `/novedades` captura descuentos, préstamos/anticipos, comisiones, horas extra y ausencias.
Incluye cuotas/saldo/amortización, valoración con parámetros vigentes, respaldo privado, filtros/CSV,
auditoría, ayudas y protección de cierres. V014 agrega jornada y adjuntos sin reemplazar datos.

## Vacaciones — FASE 7

El empleado abre `/mis-gestiones/vacaciones` para consultar saldo/kardex, seleccionar un rango
laboral en el calendario y seguir sus solicitudes. RRHH/ADMIN abre `/vacaciones`: bandeja con
filtros, comparación verde/roja, aprobación/rechazo motivado y carga de historia anterior.
Cada aprobación descuenta una sola vez y notifica al empleado. La API revalida saldo, horario,
feriados, traslapes y cierres dentro de la transacción.

V015 permite una apertura certificada al día de hoy, incluso en cero; también se pueden cargar
días previos tomados como débito. El parámetro `VACACIONES_ACUMULACION_MENSUAL` proviene de Oracle
con vigencia. Para ingresos anteriores a sus vigencias, configurar la historia o certificar la
apertura antes de ajustes/disfrutes. Contratos, decisiones y consumo del finiquito en Fase 9:
[docs/VACACIONES.md](docs/VACACIONES.md).
Contratos de captura y consumo para Fase 8: [NOVEDADES.md](docs/NOVEDADES.md).

## FASE 8 — Nómina y boletas

`docker compose up --build` aplica V016 y el seed S005, conservando el volumen y credenciales.
RH/ADMIN abre `/planilla`: crear quincena → calcular → revisar → aprobar → cerrar. Resolver alertas
y recalcular antes de aprobar. ADMIN puede reabrir con motivo; se revierten cuotas conservando
el historial. La implantación a mitad de año requiere apertura fiscal real de los empleados.
El empleado consulta `/mis-gestiones/boletas`, con tarjetas móviles y PDF propio.
Historial y exportación XLSX/PDF/boletas masivas; IGSS exige ambas quincenas cerradas y configuración
patronal real desde el editor de Planilla. Contratos, fórmulas y supuestos: [docs/NOMINA.md](docs/NOMINA.md).

Verificación: `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`,
`npm run format:check`, `npm run db:verify`, `npm run verify:security` y `npm run verify:infra`.

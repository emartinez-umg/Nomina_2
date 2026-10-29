# nomina2

Sistema de nómina con anticipo y pago mensual para Guatemala, con administración, Recursos Humanos y portal del
empleado. Express/TypeScript strict, React 18, Oracle 21c XE y node-oracledb thin. Incluye expedientes,
catálogos y vigencias, novedades, ISR/IGSS, vacaciones, prestaciones/finiquitos, boletas y documentos,
anuncios/eventos, notificaciones, tableros, usuarios y bitácora. Todas las pantallas consultan la API.

## Instalación con Docker

Requisitos: Docker con Compose v2, 4 GB de RAM disponibles y **20 GB libres en el disco de Docker**.
Oracle XE necesita `linux/amd64`; en Apple Silicon habilita emulación x86_64. Consulta las
[indicaciones de la imagen Oracle](https://github.com/gvenzl/oci-oracle-xe#oracle-xe-on-apple-m-chips).

```bash
cp .env.example .env
# Edita ORACLE_PASSWORD, DB_PASSWORD y ADMIN_* con valores propios.
docker compose up --build
```

También: `docker compose up --build -d --wait --wait-timeout 900`. La primera preparación tarda
varios minutos. La API espera Oracle saludable, aplica V000–V035 y seeds y luego inicia nginx.
No necesitas SQL manual, Instant Client ni instalar Node en el host para utilizar el sistema.

- **Aplicación:** [https://localhost:8443/login](https://localhost:8443/login).
- Salud: [https://localhost:8443/salud](https://localhost:8443/salud).
- API técnica local: [http://localhost:3000/api/salud](http://localhost:3000/api/salud).
- HTTP en 8080 redirige a HTTPS; `/api/salud` sigue disponible para comprobaciones.
- Oracle del host: `localhost:1521/XEPDB1`, `DB_USER`/`DB_PASSWORD` del único `.env` raíz.

HTTPS local utiliza un certificado autofirmado generado al instalar y conservado en `nomina2-tls`.
El aviso «La conexión no es privada» aparece hasta que tu equipo confíe en ese certificado.
En **macOS**, con Node 20 y npm ci ejecutado, desde la carpeta del proyecto:

```bash
docker compose up --build -d --wait nomina2-web
npm run tls:trust
```

Autoriza el cambio si macOS lo solicita y vuelve a abrir la pestaña
[https://localhost:8443/login](https://localhost:8443/login). El comando verifica identidad, firma y
vigencia, y registra **solo ese certificado de servidor para SSL** en el llavero del usuario, sin sudo. Conserva la clave
privada en Docker y no desactiva la validación TLS. Se repite si regeneras el certificado TLS
u otro equipo necesita acceder. El certificado solo identifica localhost/127.0.0.1 y tiene
CA:FALSE, sin capacidad de actuar como autoridad certificadora.

Sin Node, o en otros sistemas, exporta e importa el certificado público de tu instalación en su
almacén de confianza:
`mkdir -p tmp && docker compose cp nomina2-web:/etc/nginx/tls/localhost.crt tmp/localhost.crt`.
En macOS puedes abrir ese .crt en Acceso a Llaveros, añadirlo al llavero Inicio de sesión y
seleccionar Confiar siempre únicamente para SSL. No importes la clave privada.
En producción instala un certificado válido para tu dominio o termina
TLS en un proxy administrado; renueva el certificado antes de su vencimiento. Las cookies conservan
`Secure`, `httpOnly` y `SameSite=Strict`. Los puertos publicados son de loopback.

## Primer uso y usuarios iniciales

1. Ingresa con **ADMIN_USER y ADMIN_PASSWORD definidos por ti en `.env`**. Se exige cambiar la
   contraseña antes de acceder a módulos. El seed no restablece contraseñas ni eleva usuarios existentes.
2. En **Usuarios**, crea accesos RH o ADMIN. El usuario `nombre.apellido` y la contraseña temporal
   se muestran una sola vez. Entrégalos en privado; cada cuenta debe cambiar su contraseña al entrar.
3. Completa **Configuración → Configuración de empresa** (identidad fiscal, contacto y logo) y revisa las plantillas de
   documentos en Solicitudes. Configura departamentos, puestos, centros y horarios laborales reales.
   ADMIN debe usar **Usuarios → Vincular ficha de firmante** para asociar cada cuenta RH/ADMIN con
   su expediente real y puesto activo. Sin nombre completo y cargo se bloquean las aprobaciones.
4. RH crea expedientes en **Empleados**, con usuario EMPLEADO creado automáticamente en la misma transacción.
   También puede importar hasta 100 filas CSV con vista previa y confirmación. No hay cuentas RH ni
   empleados de demostración sembrados en la aplicación.
5. RH valida parámetros y conceptos legales con vigencia, feriados y configuración IGSS patronal.
   Las referencias iniciales corresponden a 2026; otros ejercicios requieren sus vigencias/calendarios.
   Para implantar con historia anterior, registra aperturas fiscales y de vacaciones certificadas.
6. **Planilla v1:** Nómina → Simular pago → revisar tabla/lista de novedades → confirmar y pagar.
   Anticipo (día 15) sin descuentos; Pago (fin de mes) liquida IGSS, ISR y cuotas mensuales. Las boletas
   membretadas quedan en el portal desde la confirmación y se descargan individualmente o en ZIP.
   Planilla conserva revisar → aprobar → cerrar. ADMIN revierte pagos con motivo antes del cierre;
   reabrir un cierre v1 conserva los pagos. Los periodos históricos v0 mantienen su flujo original.
   Consulta [el flujo y fórmulas de A11](docs/NOMINA_V1.md).

La revisión legal/operativa de parámetros y documentos corresponde a RH antes del uso real.
Los pagos registrados no realizan transferencias bancarias ni presentan declaraciones a SAT/IGSS.

## Variables de entorno

Copiar `.env.example` completo. Nunca versionar `.env`; no hay secretos `VITE_*`.

| Variables                                           | Uso                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ORACLE_PASSWORD`                                   | SYS/SYSTEM, solo instalación; 8–30 caracteres ASCII.                                                                            |
| `DB_USER`, `DB_PASSWORD`                            | Esquema dedicado; SYS/SYSTEM están prohibidos en la API. Clave de 8–30 caracteres.                                              |
| `ADMIN_USER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`       | Cuenta inicial; clave de 10–128 caracteres con mayúscula, minúscula, número y símbolo.                                          |
| `DB_CONNECT_STRING`                                 | Host: `localhost:1521/XEPDB1`; Compose usa `nomina2-db:1521/XEPDB1`.                                                            |
| `DB_PORT`, `API_PORT`, `WEB_PORT`, `WEB_HTTPS_PORT` | Puertos locales: 1521, 3000, 8080 y 8443.                                                                                       |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_INCREMENT`   | Pool: 1, 5 y 1; mínimo/incremento no superan el máximo.                                                                         |
| `DB_POOL_TIMEOUT_SECONDS`, `DB_QUEUE_TIMEOUT_MS`    | Inactividad del pool 60 s, espera de conexión 5000 ms.                                                                          |
| `DB_CONNECT_TIMEOUT_SECONDS`, `DB_CALL_TIMEOUT_MS`  | Conexión 10 s; cada llamada Oracle 5000 ms.                                                                                     |
| `NODE_ENV`, `HOST`, `PORT`                          | Desarrollo: `development`, `0.0.0.0`, 3000. Compose impone `production`.                                                        |
| `LOG_LEVEL`, `SHUTDOWN_TIMEOUT_MS`, `TZ`            | `info`, 15000 ms y `America/Guatemala`.                                                                                         |
| `SESSION_IDLE_MINUTES`                              | Inactividad de sesión: 30 minutos.                                                                                              |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_MINUTES`     | 30 intentos por IP cada 15 minutos; bloqueo de cuenta tras cinco fallos.                                                        |
| `TRUST_PROXY_CIDRS`                                 | Vacío: IP del socket. En producción configura solo direcciones de proxies administrados y restringe el acceso directo a la API. |
| `VITE_PROXY_TARGET`                                 | Desarrollo: `http://localhost:3000`; ajustar si cambias el puerto local.                                                        |

Cambiar claves de Oracle en `.env` no cambia las de un volumen existente: requiere modificación
administrativa en Oracle. `NOMINA2_ENV_FILE` permite al verificador aislado seleccionar su archivo
temporal; el uso normal conserva un solo `.env` raíz. No cambies ADMIN_USER para restablecer cuentas.

## Desarrollo

Node **20.19+ dentro de la rama 20**, npm 10+, Docker y `.env` configurado:

```bash
nvm install
nvm use
npm ci
docker compose up -d --wait nomina2-db
npm run db:setup
# Detén la API de Compose si ocupa el puerto de desarrollo:
docker compose stop nomina2-api nomina2-web
NODE_ENV=development npm run dev
```

Abre [http://localhost:5173/login](http://localhost:5173/login). Vite usa `/api` del mismo origen.
`npm run build` produce backend y frontend; las imágenes también construyen y ejecutan con Node 20.

## Pruebas y aceptación

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
npm run verify:secrets
npm run db:verify
npm run verify:migration
npm run verify:migration:v1
npm run verify:security
npm run verify:prestaciones
npm run verify:solicitudes
npm run verify:comunicacion
npx playwright install chromium
npm run test:e2e -- --production
npm run verify:infra
npm run verify:clean
# Todo en secuencia:
npm run verify:all
```

`db:verify` aplica el esquema desde cero, comprueba idempotencia, constraints, identities,
compilación, índices de FK/filtros y seeds repetibles. Las suites Oracle/Supertest verifican
permisos, fechas, cálculos, propiedad, concurrencia y rollback real de auditoría. Administran únicamente
esquemas aleatorios `N2TEST_*`/`N2SEC_*`; la API usa un usuario dedicado sin privilegios administrativos.

`test:e2e` crea un esquema `N2E2E_*`, levanta API/Vite en 3018/5178 y ejecuta Chromium con autenticación,
cookies y CSRF reales. Prueba los tres roles, alta de empleado, vacaciones/aprobación, anticipo/pago mensual/cierre,
constancia/entrega/descarga y recorre las páginas por rol con ayuda, hints, axe y portal móvil a 390 px.
No reutiliza sesiones ni respuestas simuladas. Fixtures solo en el esquema desechable, retirado al salir.
Con `npm run test:e2e -- --production` se construyen y ejecutan las imágenes reales de **API y nginx**,
con `NODE_ENV=production`, TLS y Oracle temporal. El preparo de fixtures termina antes del entrypoint
de la API; no se incluyen fixtures en esa imagen. Usa la red `nomina2_default` del Compose de trabajo,
API de prueba en 3018 y web en 8448. `verify:all` ejecuta esta modalidad.
El informe local queda en `playwright-report`; no se graban trazas ni videos con credenciales.

`verify:clean` construye **otro proyecto Compose**, con claves aleatorias, puertos libres y volúmenes
vacíos. Comprueba HTTPS, login inicial, cambio obligatorio y sesión Secure; luego elimina únicamente
ese proyecto y sus volúmenes. Necesita capacidad adicional para una segunda instancia Oracle
(recomendado: 8 GB de RAM y 20 GB adicionales libres en Docker). No borra la instalación de trabajo.
`verify:infra` verifica Oracle/API/nginx/TLS, SPA, JavaScript y worker PDF; solo admite el certificado
autofirmado del loopback para esa comprobación local.

Si el host no usa Node 20, las suites Oracle admiten:

```bash
docker build --target build -f backend/Dockerfile -t nomina2-security-tests .
npm run verify:security -- --docker
# Los otros tres verify:* también admiten -- --docker.
```

Permisos de equipo (R3-8): aplicar V040 mediante el runner habitual y reconstruir API/web.
RH/ADMIN → Organización → Jefaturas → Permisos → elegir jefatura → habilitar consultas →
motivo y confirmación. El responsable conserva el rol EMPLEADO y recibe el menú Mi equipo
al actualizar la sesión o volver a la pestaña. Directorio y saldos solo muestran las ramas
autorizadas, sin acceso a salarios, banco, DPI/NIT, expedientes, actas ni aprobaciones.
El permiso de comisiones permite consultar la API de C6 (R3-9). No hay concesiones automáticas.
Pruebas: `npm run verify:jefaturas -- --docker` incluye aislamiento, revocación en la misma
sesión, privacidad y rollback de auditoría; `npm run test:e2e -- --production equipo.spec.ts`
comprueba la administración y la consulta reales en un esquema desechable.

Estadísticas de comisiones (R3-9/R3-10): V041 añade índices para mes y vendedor, sin modificar datos.
API `/api/tableros/comisiones`: resumen, tendencia, ranking/reparto, tabla vendedor × mes,
historial individual, opciones limitadas al alcance y años con datos (compatible con R3-4).
Rangos de hasta 60 meses, sin futuros; RH/ADMIN generales, jefe con permiso solo su equipo.
Contrato y criterios de comparación en [COMISIONES_ESTADISTICAS.md](docs/COMISIONES_ESTADISTICAS.md).
Pruebas Oracle: `npm run verify:comisiones -- --docker`, con la imagen Node 20 anterior actualizada.
Interfaz RH/ADMIN: **Estadísticas → Estadísticas de comisiones**; jefe autorizado: **Mi equipo**.
Filtros por rango, departamento, vendedores y estado; comparación anterior, gráficas con tablas,
matriz e historial individual. CSV/Excel exportan todo el conjunto filtrado dentro del alcance.
Ayuda manual, movimiento reducido y diseño responsive. Aceptación: `npm run test:e2e -- --production comisiones-estadisticas.spec.ts`.
No cambia pagos ni requiere migraciones nuevas respecto de V041.

## Migraciones, operación y respaldo

```bash
npm run db:migrate
npm run db:seed
# Equivalentes dentro de producción:
docker compose exec nomina2-api npm run db:migrate
docker compose exec nomina2-api npm run db:seed
docker compose logs -f nomina2-api
docker compose stop
docker compose up -d --wait
docker compose down
```

`down` conserva datos y TLS. **`down --volumes` elimina ambos volúmenes y toda la información**.
Realiza y verifica respaldos Oracle/Data Pump y una prueba de restauración antes de operación real;
no copies archivos de datos mientras Oracle está escribiendo. Incluye certificados/configuración en
el plan de respaldo privado. `No space left on device` exige ampliar/liberar almacenamiento de Docker,
no borrar el volumen de nómina. Los logs omiten cuerpos, URLs privadas, cookies, binds y secretos.

Migraciones numeradas e inmutables; cada sentencia termina con `/` en una línea propia. Oracle
confirma DDL implícitamente: una versión FALLIDA/APLICANDO bloquea el arranque hasta revisar y reparar
los objetos y el historial. No borres filas de VERSION_ESQUEMA ni ejecutes dos instaladores a la vez.
Seeds aditivos: no sobrescriben cuentas, parámetros editados ni plantillas existentes.

## Documentación

- Datos demo: [dataset y alcance](database/seed/DATASET.md) y [cargador local](database/seed/CARGA.md).
  Con Node 20 y `.env` configurado, `npm run seed:demo -- --dry-run` valida sin escribir;
  `npm run seed:demo` carga el conjunto. La contraseña temporal se toma de
  `SEED_DEFAULT_PASSWORD`; no se imprime. Las banderas de extras, reset e instalación vacía
  y las pruebas Oracle desechables están explicadas en la guía de carga.
  [Carga remota y exportación SQL](database/seed/README.md): `npm run seed:remote` usa
  `DEST_DB_*`; `npm run seed:export-sql` genera el archivo privado para otra base o esquema.
  `npm run verify:seed -- --check-idempotency` verifica integridad y dos invocaciones del
  cargador con barrera de escrituras; `--remote` verifica el destino configurado en `DEST_DB_*`.

- [Cierre, matriz de auditoría y comprobaciones](docs/CIERRE.md).
- [Progreso](docs/PROGRESO.md), [decisiones y mejoras futuras](docs/DECISIONES.md), [modelo Oracle](docs/ERD.md).
- [Seguridad](docs/SEGURIDAD.md), [frontend](docs/FRONTEND.md), [catálogos](docs/CATALOGOS.md).
- [Empleados](docs/EMPLEADOS.md), [novedades](docs/NOVEDADES.md), [vacaciones](docs/VACACIONES.md).
- [Nómina](docs/NOMINA.md), [prestaciones](docs/PRESTACIONES.md), [solicitudes](docs/SOLICITUDES.md).
- [Comunicación y tableros](docs/COMUNICACION_TABLEROS.md), [mockup visual](docs/MOCKUP/README.md).

Repositorio: [emartinez-umg/Nomina_2](https://github.com/emartinez-umg/Nomina_2).

### Códigos automáticos (v1-3)

`docker compose up --build` aplica V021 y migra los códigos existentes conservando
`CODIGO_ANTERIOR`. Los formularios consultan una vista previa y Oracle asigna el código
al guardar. El código es permanente. La plantilla CSV de empleados ya no pide código;
descarga la versión actual desde Carga masiva. Las referencias oficiales de IGSS se conservan.
`npm run verify:codigos` comprueba migración con datos de v0, contadores por departamento/año,
colisiones, concurrencia, rollback, inmutabilidad y el endpoint autenticado en Oracle temporal.

### Ubicaciones oficiales (v1, FASE V1-4)

`docker compose up --build` aplica V022 y S006 con 22 departamentos y 340 municipios
obtenidos del INE. Original, huella y catálogo extraído en [db/data/ine/README.md](db/data/ine/README.md).
Centros de trabajo usa selectores con búsqueda y cascada; en altas propone Guatemala/Guatemala.
En edición conserva la localidad anterior y permite revisar una coincidencia única antes de guardar.
Los borradores incluyen la ubicación y la ayuda explica la migración. El formulario de empleado
se integrará en su fase; UbicacionSelect y ZonaSelect ya están disponibles para reutilizarse.

Pruebas: `npm run verify:ubicaciones` (Oracle temporal), `npm run db:verify`, `npm test`
y `npm run test:e2e -- --grep 'FASE V1-4'`. Consultas autenticadas en `/api/ubicaciones/departamentos`
y `/api/ubicaciones/municipios?idDepartamentoGt=…`; especificación en [docs/CATALOGOS.md](docs/CATALOGOS.md).

## Identidad de empresa y documentos (v1-5)

`docker compose up --build` aplica V023 de forma aditiva. La configuración existente y FORMATO_IGSS
se conservan. La pantalla `/catalogos/empresa` usa `/api/empresa`; ya no se escribe a través del CRUD
antiguo. NIT con módulo 11, razón social, dirección, teléfono y correo son obligatorios; nombre
comercial, sitio web HTTP/HTTPS y logo son opcionales. Sin esos datos no se generan PDF.

Los logos PNG/JPG/SVG de hasta 2 MB se validan por contenido y se convierten a PNG sin metadatos.
Los SVG deben usar formas/texto sin scripts, estilos, DTD ni recursos externos. Oracle guarda el
BLOB privado; solo RH/ADMIN autenticados pueden obtenerlo. No hay directorio ni URL pública de logos.
Cambiar o quitar el logo queda auditado por su SHA-256, sin copiar binarios a bitácora.

Boletas, planilla, solicitudes, certificados, constancias y prestaciones comparten `shared/pdf`.
El membrete aparece en cada página; la firma conserva nombre, puesto, usuario y fecha de aprobación.
Las solicitudes ya emitidas conservan su PDF y firma aunque cambien la empresa, plantilla o puesto.
Los documentos históricos sin membrete se reemiten desde el detalle: se archiva el original,
se crea una versión aprobada por quien reemite y se exige revisar y entregar de nuevo.
Las constancias de salario conservan su PDF y aprobación en una tabla privada.

`npm run verify:empresa` prueba migración, permisos, logos, concurrencia y rollback en un esquema
desechable; `npm run verify:solicitudes` cubre firma/entrega/reemisión y `npm run test:e2e -- --grep
'FASE V1-5'` comprueba configuración, borrador, logo, móvil y entrega con API/Oracle reales.
El alta individual y masiva usa la utilidad de credenciales en memoria de V1-7; ningún PDF de acceso se archiva en el servidor.

### Horarios por bloques (V1-6)

En **Organización → Horarios**, crea o duplica un patrón con rangos/chips y horas en desplegables.
El sistema calcula jornada, horas diarias/semanales y descansos; aplica los límites vigentes en
Parámetros legales. Desde **Empleados**, Crear horario personalizado abre el mismo constructor
sin perder el expediente. Vacaciones excluye descansos/feriados y horas extra usa las horas efectivas.
`docker compose up --build` aplica V024 conservando los tiempos y asignaciones anteriores.
Pruebas específicas: `npm run verify:horarios` y `npm run test:e2e -- --grep 'FASE V1-6'`.

### Empleados automatizados (V1-7)

Alta y edición usan código de solo lectura, NIT módulo 11/K, residencia INE con zona/casa,
sexo Masculino/Femenino, parentesco de catálogo y horario seleccionable o creado en el mismo formulario.
Ingreso comienza en hoy. El tipo de contrato determina si fin es obligatorio o queda bloqueado/vacío.
Guardar crea empleado y cuenta juntos; copia o descarga el PDF membretado de credenciales y confirma
la entrega antes de cerrar. RH/ADMIN puede restablecer una temporal desde la ficha del empleado.
La carga masiva usa 30 columnas, horario por código, códigos/usuarios automáticos y un único PDF
con una página por empleado y una sola descarga. Descarga una plantilla nueva después de actualizar.
`docker compose up --build` aplica V025 conservando referencias históricas. Completa primero empresa
para emitir las credenciales membretadas. Pruebas: `npm run verify:empleados`, `npm run verify:security`
y `npm run test:e2e -- --grep 'FASE V1-7'`. Detalle en [Empleados](docs/EMPLEADOS.md).

### Vacaciones A9 — V1-8

El saldo se calcula al consultar: meses completos × tasa mensual configurada (referencia 1.25),
menos consumos y previas. Portal y RRHH muestran decimales y días enteros solicitables.
Calendario por bloques/feriados; aprobación revalida y descuenta una vez. Cancelar antes del
inicio devuelve el débito original y conserva la aprobación. V026 preserva saldos e historia v0.
Ver [reglas y API de vacaciones](docs/VACACIONES.md). Validar con npm run verify:vacaciones,
npm run verify:security y npm run test:e2e -- --grep 'FASE V1-8'.

### Novedades mensuales (V1-9)

Aplicar V027 y V028 con `docker compose up --build` o `npm run db:migrate`. RH/ADMIN carga horas extra,
comisiones y consumos por mes; las ausencias muestran el descuento sin goce. Configurar tarifas
reales Carro/Moto en Configuración → Tarifas de parqueo antes de aprobar solicitudes. Revisar
vehículos migrados y el parámetro de advertencia HORAS_EXTRA_TOPE_MENSUAL. El empleado consulta
Mi parqueo y solicita baja; RH puede dar de baja/suspender al cierre del mes. Novedades pendientes
resume cargas por persona/departamento antes del pago. Detalles y contrato para V1-10 en
[docs/NOVEDADES.md](docs/NOVEDADES.md). Pruebas: `npm run verify:novedades` y
`npm run test:e2e -- --grep 'FASE V1-9'` (Oracle en esquemas temporales).

### Prestaciones automáticas A12 — V1-11

`docker compose up --build` aplica V030. Simular pago permite Bono 14 (julio) y Aguinaldo
(diciembre), por empleado/departamento/todos; Prestaciones los precalcula al entrar.
Revisar historia del ciclo, confirmar y descargar boletas membretadas/ZIP; el portal las recibe
sin duplicar anticipos ni ingresos fiscales. La ficha del empleado abre el finiquito automático
con promedio de seis meses, vacaciones y proporcionales, preview PDF y confirmación de baja.
Detalles, supuestos y endpoints en [Prestaciones](docs/PRESTACIONES.md).
Pruebas: `npm run verify:pagos`, `npm run verify:prestaciones` y
`npm run test:e2e -- --grep 'FASE V1-11'` (esquemas temporales).

## Cierre y actualización de v0 a v1

La rama `v1` incluye A2–A12. Antes de actualizar una instalación, respalda Oracle y conserva su
volumen y `.env`. Ejecuta `docker compose up --build -d --wait --wait-timeout 900`: la API aplica
V021–V035 y seeds sin sustituir credenciales ni datos existentes. No edites migraciones aplicadas
ni elimines el volumen. Un fallo de migración detiene el arranque para revisión.

`npm run verify:migration` exige Git con la etiqueta `v0.0`, Node 20, `npm ci` y Oracle saludable.
Reconstruye una copia aislada de v0 con sus servicios/seeds originales, añade historia de regresión
y la migra a la última versión (V035). Compara conteos de las 55 tablas anteriores, todas sus PK y columnas, préstamos,
cuotas cobradas/pendientes, vacaciones, snapshots y bytes documentales; admite únicamente cambios
con archivo del original o versionado explícito. Comprueba idempotencia y retira la copia. El reporte
local `tmp/migracion-v0-v1.json` contiene conteos y huella, sin datos personales ni contraseñas.
Esta prueba reproducible se complementa al desplegar con un ensayo del respaldo real de la empresa.

Tras migrar, RH revisa ubicaciones/sexo/parentescos históricos pendientes, vehículos/tarifas de
parqueo, vigencias legales, empresa/logo y fichas firmantes. Los textos/códigos anteriores permanecen
como referencia; los periodos históricos conservan cálculos y motor v0. Las cuotas pendientes pasan
a vencimiento mensual manteniendo importes, capital, cantidad y saldo.

La aceptación completa es `npm run verify:all`: calidad, unitarias, Oracle/Supertest, migraciones v0/v1,
Playwright, infraestructura y arranque con volúmenes nuevos. Ejecuta las suites Oracle en secuencia.
Playwright recorre todos los pasos de ayuda, botones e hints, páginas y formularios de los tres roles,
menú/buscador con teclado, portal a 390 px, borradores, credenciales, horarios, vacaciones 6.25/6,
novedades, parqueo cobrado, anticipo/pago por departamento, boletas, prestaciones y finiquito.
`verify:clean` usa puertos, credenciales, contenedores, imágenes y volúmenes exclusivos de aceptación
y los retira al finalizar. Requiere suficiente espacio libre **dentro del disco de Docker**.

Consulta [decisiones y mejoras futuras](docs/DECISIONES.md#v1--automatización-y-cierre-v1-12) y
[el resultado del cierre](docs/PROGRESO_V1.md).

### Ronda 2: catálogos comunes (R2-4)

V031 unifica validación de nombres, duplicados normalizados y bloqueo de eliminación por uso.
Incluye parentescos, conceptos, tipos de solicitud y deducciones ISR en el CRUD existente.
Los duplicados previos conservan su registro y se reportan en CATALOGOS_NOMBRES_CORREGIDOS.
Consultar [CATALOGOS](docs/CATALOGOS.md) y [progreso](docs/PROGRESO_V1.md) para reglas y excepciones
de identidades versionadas/geografía oficial. Pruebas: `npm run verify:catalogos` y
`npm run test:e2e -- --production ronda2.spec.ts --grep R2-4`.

V032 prepara las restricciones exactas antiguas antes de V031 al migrar desde v0/v1; sobre V031 ya aplicada retira solamente esas restricciones redundantes. El runner conserva y verifica el checksum original de V031.

R2-5 añade los catálogos **Motivos de baja**, **Zonas** y **Países** con el CRUD común.
Código postal: cinco dígitos conservando ceros; ISO: dos letras en mayúsculas. V033 no modifica
los datos de empleados ni carga valores de ejemplo. La matriz de QA recorre cada catálogo:
`npm run test:e2e -- --production catalogos-qa.spec.ts`; backend: `npm run verify:catalogos`.

### R2-6: alta y edición de empleado por pasos

En Personal → Nuevo empleado completa Datos personales y Datos laborales. Salario/banco y
contacto de emergencia pueden quedar vacíos; completa cada grupo si lo empiezas. Guardar
empleado muestra un resumen antes de confirmar y entrega las credenciales como antes.
Los borradores recuperan todos los datos y el paso actual. Un perfil sin salario se muestra
incompleto, alerta en Inicio de RH y se excluye de la simulación sin impedir pagar a los demás.

V034 conserva la dirección anterior y renombra/amplía el detalle a Dirección (100 caracteres).
Descarga de nuevo la plantilla CSV: la columna ahora es `direccion`. El NIT admite 5–12 dígitos,
K final y guion opcionales, conservando unicidad; ADMIN puede activar módulo 11 en Parámetros
legales → Validar dígito NIT (`VALIDAR_DIGITO_NIT`, 0 desactivado, 1 activado, unidad CANTIDAD).
La validación fiscal de la empresa conserva sus reglas. Aplica con `docker compose up --build`.

### Dashboard RRHH (R2-8 y R2-9)

Cuatro agregaciones exclusivas de RH/ADMIN en `/api/tableros/rh`: remuneraciones, inasistencias,
vacaciones y celebraciones. V035 clasifica los tipos de ausencia y añade índices; no cambia importes
históricos. Contratos, fuentes y filtros en [DASHBOARD_RH.md](docs/DASHBOARD_RH.md).
Ejecutar `npm run verify:tableros` con Node 20 y Oracle saludable para integración y planes.
La primera vista de `/rh` muestra cuatro recuadros animados y filtrables, con accesos a los
detalles, antes de los indicadores y alertas. Respeta movimiento reducido y se apila en móvil.
E2E con datos de ejemplo en Oracle desechable: `npm run test:e2e -- --production dashboard-rh.spec.ts`.

### Cierre de Ronda 2 (R2-10)

`npm run verify:migration:v1` reconstruye una copia desechable del corte Git `v1` (V030), con
sus servicios y semillas originales. Añade historia de regresión, pagos/boletas, novedades y
catálogos duplicados; aplica V031–V035 y compara todas las filas y columnas originales, PK/FK,
hashes, importes, snapshots y bytes BLOB. Verifica ambas direcciones conservadas, restricciones,
objetos válidos y segunda ejecución sin cambios. Reporte: `tmp/migracion-v1-v1.1.json`.
Los duplicados conservan el ID/código y sus referencias: gana el más antiguo, los otros reciben
un sufijo libre `(duplicado N)` y quedan inactivos; el nombre original se archiva en
`CATALOGOS_NOMBRES_CORREGIDOS`. Incluye sufijos ocupados y colisiones de los UNIQUE exactos v1.
No se proporcionó un respaldo externo v1; este ensayo reproducible debe complementarse con el
respaldo real de la instalación al desplegar.

La regresión Docker cubre login sin avisos en los tres roles, rutas lazy y Anuncios/Eventos,
barra azul/Inicio directo, notificaciones propias, borradores, asistente con y sin opcionales (incluida la consulta lenta de la regla del contrato),
nombres inválidos/duplicados, catálogos en uso, cascada y alternancias de los cuatro recuadros.
La matriz audita anchos, hints, teclado, responsive, contraste WCAG AA y ayuda **solo manual**, sin
ofertas ni banderas de primera visita. La leyenda del dashboard conserva colores y tramas con
siglas sobre fondo sólido para que su texto mantenga AA.
`verify:clean` ensaya `docker compose up --build` con volúmenes nuevos y genera
`tmp/aceptacion-limpia.json`, incluida la versión esperada y cero objetos inválidos/migraciones fallidas.
Resultados y límites de esta ronda en [PROGRESO_V1.md](docs/PROGRESO_V1.md#fase-r2-10--cierre-de-la-ronda).

### Jefaturas (R3-5)

Organización → Jefaturas permite crear responsables y jerarquía, ver pendientes y asignar
empleados en bloque por departamento/centro. Empleados muestra y filtra la jefatura, y
consulta el jefe inmediato también en la ficha y CSV. Se aplica V037 con el runner habitual.

- `npm run verify:jefaturas` prueba el flujo Oracle/Supertest en un esquema desechable.
- Con imagen de pruebas actualizada, `npm run verify:jefaturas -- --docker` usa Node 20.
- `npm run test:e2e -- --production jefaturas.spec.ts` recorre el alta y asignación con
  Chromium, API/nginx, ayuda, móvil y accesibilidad; no escribe en la nómina operativa.

### Colisiones de vacaciones (R3-6)

RH/ADMIN → Vacaciones: insignia y filtro **Con colisiones**; al abrir una solicitud se muestran
otras ausencias coincidentes por departamento o centro, ocupación y línea de tiempo.
**Aprobar de todos modos** permite confirmar la advertencia con copia en la aprobación y
bitácora; el saldo insuficiente sigue bloqueando. El empleado no recibe esta información.
Aplicar V038 mediante el runner habitual y reconstruir API/web para cargar la versión.
Pruebas: `npm run verify:vacaciones` y
`npm run test:e2e -- --production vacaciones-colisiones.spec.ts`.
Contrato y supuestos: [VACACIONES.md](docs/VACACIONES.md).

### Saldos de vacaciones (R3-7)

RH/ADMIN → Vacaciones → **Saldos de vacaciones**: saldo de todo el personal con filtros de
organización/estado/búsqueda, orden y páginas en servidor, indicadores globales y CSV/Excel.
Disponible mayor que el umbral vigente resalta la fila en rojo con ícono y «Más de N días».
**Configurar umbral** reutiliza parámetros con vigencias, comparación, motivo y confirmación
auditada. El dashboard RH abre directamente el listado de activos en alerta.
Aplicar V039 con el runner y reconstruir API/web; no modifica movimientos ni pagos.
Pruebas: `npm run verify:vacaciones`, `npm run verify:tableros` (añadir `-- --docker` con imagen
Node 20 actualizada), `npm run test:e2e -- --production vacaciones-saldos.spec.ts`.
El alcance de equipo queda preparado para R3-8 y continúa denegado al empleado.

### Expediente digital (R3-11)

V042 agrega tipos y versiones del expediente; no altera documentos generados previamente.
RH/ADMIN: Empleados → ficha → Documentos → **Generados por el sistema / Expediente**.
Carga PDF/JPG/PNG, vista previa, reemplazo con historial y baja motivada. El indicador
**Expediente X de Y** y el filtro **Expediente incompleto** cuentan tipos obligatorios vigentes.
Inicio de RH avisa vencimientos. El empleado entra por Mis datos → **Consultar mi expediente**;
los permisos de jefe no permiten acceder a los archivos de su equipo.

El volumen **`nomina2-expedientes`** (normalmente `nomina2_nomina2-expedientes`) se monta
**solo en la API**, en `/var/lib/nomina2/expedientes`. No se monta en nginx ni se sirve como
ruta estática. Directorio 0700, archivos 0600 y nombres aleatorios; acceso solo mediante
endpoint autenticado con propiedad/RBAC y bitácora. Para desarrollo local, `EXPEDIENTE_DIR`
es una ruta absoluta privada; el valor de ejemplo en `/tmp` es temporal: **cámbialo por una
ruta persistente privada antes de guardar documentos reales fuera de Docker**.

Parámetros legales: `EXPEDIENTE_MAX_MB` (10 MiB, entero 1–50, unidad Cantidad) y
`EXPEDIENTE_AVISO_DIAS` (30, entero 0–365, unidad Días). **Configurar tipo** permite a RH/ADMIN
cambiar obligatoriedad y vencimiento con motivo/confirmación; no se calculan fechas legales.

**Respaldo:** Oracle y el volumen son una sola unidad lógica; `db:export` es una exportación
compartible de estructura/configuración, **no** un respaldo de expedientes. Excluye las filas
de `EXPEDIENTE_DOCUMENTOS` y nunca lee/copia el volumen. No lo uses para recuperar archivos.
Detén las escrituras (`docker compose stop nomina2-api`), toma un respaldo completo de Oracle
con el procedimiento operativo de la instalación y respalda el volumen en el mismo corte.
Guarda ambos cifrados fuera del repositorio, con permisos restringidos y claves bajo custodia.
Ejemplo de copia cifrada del volumen (requiere GnuPG y la ruta privada de destino existente):

```sh
docker run --rm -v nomina2_nomina2-expedientes:/origen:ro node:20-bookworm-slim \
  tar -C /origen -czf - . | gpg --symmetric --cipher-algo AES256 \
  --output /ruta/privada/respaldo/expedientes.tar.gz.gpg
```

Comprueba el nombre real con `docker volume ls` si cambiaste el proyecto Compose. No incluyas
la contraseña de cifrado en comandos, archivos versionados o logs. Reinicia la API al terminar
el corte con `docker compose start nomina2-api`; no ejecutes `docker compose down -v`.

**Restauración:** en una instalación aislada, restaura Oracle y el volumen del mismo corte,
preserva propietario UID/GID de `node` (1000:1000) y permisos 0700/0600, aplica únicamente las
migraciones posteriores y prueba login, acceso propio/403 ajeno, SHA-256 y versiones antes de
habilitar escrituras. La API comprueba tamaño/hash en cada lectura. No restaura un documento
confirmado si falta su archivo: recupéralo del respaldo. Tras caída/commit incierto conserva
posibles archivos huérfanos para conciliación manual, sin borrarlos automáticamente.

Pruebas: `npm run verify:expedientes -- --docker` (con la imagen de pruebas actualizada),
`npm run test:e2e -- --production expediente.spec.ts`, `npm test` y `npm run lint`.
Contrato, decisiones y revisión de dependencias en [docs/EXPEDIENTE.md](docs/EXPEDIENTE.md).

# nomina2

Sistema de nómina quincenal para Guatemala, con administración, Recursos Humanos y portal del
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
varios minutos. La API espera Oracle saludable, aplica V000–V020 y seeds y luego inicia nginx.
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
3. Completa **Catálogos → Datos de empresa**, incluido representante, y revisa las plantillas de
   documentos en Solicitudes. Configura departamentos, puestos, centros y horarios laborales reales.
4. RH crea expedientes en **Empleados**, con usuario EMPLEADO opcional vinculado al expediente.
   También puede importar hasta 100 filas CSV con vista previa y confirmación. No hay cuentas RH ni
   empleados de demostración sembrados en la aplicación.
5. RH valida parámetros y conceptos legales con vigencia, feriados y configuración IGSS patronal.
   Las referencias iniciales corresponden a 2026; otros ejercicios requieren sus vigencias/calendarios.
   Para implantar con historia anterior, registra aperturas fiscales y de vacaciones certificadas.
6. **Planilla:** crear quincena → calcular → revisar → aprobar → cerrar. Corrige alertas antes de
   cerrar. ADMIN puede reabrir con motivo y reversión de cobros. El portal muestra boletas cerradas.

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
npm run verify:security
npm run verify:prestaciones
npm run verify:solicitudes
npm run verify:comunicacion
npx playwright install chromium
npm run test:e2e
npm run verify:infra
npm run verify:clean
# Todo en secuencia:
npm run verify:all
```

`db:verify` aplica el esquema desde cero, comprueba idempotencia, constraints, identities,
compilación, índices de FK/filtros y seeds repetibles. Las cuatro suites Oracle/Supertest verifican
permisos, fechas, cálculos, propiedad, concurrencia y rollback real de auditoría. Administran únicamente
esquemas aleatorios `N2TEST_*`/`N2SEC_*`; la API usa un usuario dedicado sin privilegios administrativos.

`test:e2e` crea un esquema `N2E2E_*`, levanta API/Vite en 3018/5178 y ejecuta Chromium con autenticación,
cookies y CSRF reales. Prueba los tres roles, alta de empleado, vacaciones/aprobación, quincena/cierre,
constancia/entrega/descarga y recorre las páginas por rol con ayuda, hints, axe y portal móvil a 390 px.
No reutiliza sesiones ni respuestas simuladas. Fixtures solo en el esquema desechable, retirado al salir.
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

- [Cierre, matriz de auditoría y comprobaciones](docs/CIERRE.md).
- [Progreso](docs/PROGRESO.md), [decisiones y mejoras futuras](docs/DECISIONES.md), [modelo Oracle](docs/ERD.md).
- [Seguridad](docs/SEGURIDAD.md), [frontend](docs/FRONTEND.md), [catálogos](docs/CATALOGOS.md).
- [Empleados](docs/EMPLEADOS.md), [novedades](docs/NOVEDADES.md), [vacaciones](docs/VACACIONES.md).
- [Nómina](docs/NOMINA.md), [prestaciones](docs/PRESTACIONES.md), [solicitudes](docs/SOLICITUDES.md).
- [Comunicación y tableros](docs/COMUNICACION_TABLEROS.md), [mockup visual](docs/MOCKUP/README.md).

Repositorio: [emartinez-umg/Nomina_2](https://github.com/emartinez-umg/Nomina_2).

# Seguridad del backend — FASE 2 / RF-18

La API usa Oracle thin real. Las sesiones viven en `SESIONES`; solo se almacenan SHA-256 de los
secretos de sesión y CSRF. Las credenciales usan Argon2id (64 MiB, 3 pasadas, 1 hilo).
No hay cambios de DDL en esta fase: se reutilizan V001, V003 y V012.

## Inicio, cambio obligatorio y cierre

1. `GET /api/auth/csrf`: devuelve `data.csrfToken` y una cookie previa al login, httpOnly,
   SameSite=Strict, válida durante 10 minutos. Conservar las cookies en el cliente.
2. `POST /api/auth/login`, JSON `{ "usuario": "nombre.apellido", "contrasena": "…" }` y
   header `X-CSRF-Token` con el token anterior. Devuelve `data.usuario` y `data.csrfToken` nuevos.
3. Conservar ambas cookies httpOnly (`nomina2_sesion`, `nomina2_csrf`, Path=/api). En todas las
   escrituras, enviar el token nuevo en `X-CSRF-Token`. No almacenarlo en localStorage.
4. Si `usuario.cambioObligatorio=true`, solo se permiten `/auth/sesion`, `/auth/csrf`,
   `/auth/cambiar-contrasena` y `/auth/logout`. El resto de la API de negocio responde
   `403/CAMBIO_CONTRASENA_OBLIGATORIO`, incluso para ADMIN.
5. `POST /api/auth/cambiar-contrasena`, JSON `{ "contrasenaActual": "…", "contrasenaNueva": "…" }`.
   La nueva exige 10–128 caracteres, mayúscula, minúscula, número y símbolo; debe diferir de la actual.
   Revoca todas las sesiones anteriores, entrega cookies/token nuevos y elimina el cambio obligatorio.
6. `GET /api/auth/sesion` consulta únicamente la identidad autenticada. `GET /api/auth/csrf`
   recupera su token para una recarga de página. Si la sesión venció, responde 401 y limpia sus cookies;
   repetir `/csrf` para iniciar nuevamente. Si falta la cookie CSRF, también se limpian las cookies.
7. `POST /api/auth/logout`, cuerpo `{}` y header CSRF: revoca la sesión actual y limpia las cookies.

Las respuestas autenticadas y las de login/CSRF usan `Cache-Control: no-store`. `Secure` se activa
siempre con `NODE_ENV=production`, incluido Compose: el acceso de autenticación en producción requiere
HTTPS. Para probar con HTTP local, usar `npm run dev` y `NODE_ENV=development`.
El CSRF previo al login usa doble envío firmado con clave efímera del proceso. Reiniciar la API
invalida esos tokens previos; solicitar otro con `/csrf`. Las sesiones autenticadas sobreviven
reinicios porque sus hashes y cookies siguen siendo válidos.

Cinco intentos de login fallidos bloquean la cuenta durante 15 minutos. Contador y bloqueo se
serializan con bloqueo de fila en Oracle, incluso entre procesos. El quinto devuelve
`423/CUENTA_BLOQUEADA`; al vencer el bloqueo se reinicia el contador. Login fallido normal devuelve
`401/CREDENCIALES_INVALIDAS`. Usuario inexistente también ejecuta una verificación Argon2id.

La inactividad se configura con `SESSION_IDLE_MINUTES` (30 por defecto). Oracle verifica el
vencimiento y renueva la actividad al autenticar una petición válida; las cookies son de navegador.
Las sesiones vencidas/revocadas se conservan en BD sin volver a habilitarse. Se permiten varias
sesiones por usuario; cerrar una no cierra las demás.

El límite por IP usa express-rate-limit: `LOGIN_RATE_LIMIT=30` peticiones por
`LOGIN_RATE_WINDOW_MINUTES=15`, aplicado a login y cambio de contraseña. Devuelve
`429/LIMITE_INTENTOS`, con `Retry-After`. Su contador vive en memoria del proceso; el Compose actual
usa una sola API. Para varias réplicas debe conectarse un almacén compartido y coordinar el CSRF
previo al login. El bloqueo por cuenta y las sesiones sí son persistentes.

Por defecto no se confía en `X-Forwarded-For`: se usa la IP del socket tanto para el límite como para
la auditoría. En Compose esa IP corresponde a nginx cuando se accede mediante la web. En despliegue,
configurar `TRUST_PROXY_CIDRS` con las IPs/CIDR exclusivos de los proxies administrados y restringir
el acceso directo a la API; nunca confiar en cualquier proxy. Las direcciones/rangos se validan
al arrancar. Referencias: [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
y [CSRF en OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Usuarios y bitácora (ADMIN)

| Método y ruta                                   | Entrada / resultado                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/usuarios`                             | Lista paginada sin hashes ni datos bancarios/personales sensibles            |
| `PATCH /api/usuarios/:id/estado`                | `{ "activo": true/false, "motivo": "…" }`                                    |
| `PATCH /api/usuarios/:id/rol`                   | `{ "rol": "ADMIN/RH/EMPLEADO", "motivo": "…" }`                              |
| `POST /api/usuarios/:id/restablecer-contrasena` | `{ "motivo": "…" }`; devuelve una contraseña temporal aleatoria una sola vez |
| `GET /api/auditoria`                            | Consulta paginada de la bitácora inmutable                                   |

`motivo` es obligatorio, de 5 a 1000 caracteres. Activar/desactivar, cambiar rol y restablecer
revocan todas las sesiones del usuario. El restablecimiento borra el bloqueo e impone cambio
obligatorio. No se permite desactivar ni degradar al último ADMIN activo; la comprobación es
transaccional. La contraseña temporal solo aparece en la respuesta de restablecimiento/alta interna,
nunca en listados, logs, historial ni auditoría. Un correo/usuario duplicado produce 409.

Filtros de usuarios: `buscar` (usuario/correo), `usuario`, `correo`, `rol`, `activo=0/1`,
`cambioObligatorio=0/1`; `ordenarPor=id/usuario/correo/rol/activo`.
Filtros de bitácora: `usuario` (ID de usuario actor), `entidad`, `accion`, `desde`, `hasta`
(fechas válidas `aaaa-mm-dd`, desde 1900, rango inclusivo en Guatemala); `ordenarPor=fecha/id`.
Ambos admiten `pagina` (desde 1), `limite` (1–100), `direccion=asc/desc` y devuelven total/página/límite.
Se rechazan filtros y órdenes desconocidos. Todo SQL usa binds y órdenes predefinidos.

## Extender el backend en próximas fases

`app.ts` aplica autenticación, roles reconocidos y cambio obligatorio a `/api` antes de montar
los módulos de negocio. Cada router añade `permitirRoles(...)` con su alcance específico.
Las únicas rutas públicas son login/CSRF previo y `GET /api/salud` (también HEAD para healthchecks).
La salud es una excepción técnica conservada para Docker; no contiene datos de negocio.
Las rutas de negocio desconocidas también exigen autenticación y cambio de contraseña.

Para EMPLEADO, buscar primero en el repositorio el usuario propietario del recurso y ejecutar
`verificarPropiedad(actor, idUsuarioPropietario)` antes de leer/devolver o modificar datos.
La identidad viene de la sesión, nunca del cuerpo/query. Si un recurso pertenece a EMPLEADOS,
resolver su `ID_USUARIO` desde Oracle. Un propietario nulo o diferente produce `403/RECURSO_AJENO`.
ADMIN/RH conservan el alcance que permita su router; este helper no sustituye RBAC.

Los servicios sensibles revalidan sesión, rol y cambio obligatorio dentro de su transacción.
Bloquean primero la administración (si corresponde), después usuario y sesión, en ese orden.
`enTransaccion` hace commit/rollback explícitos. `registrarAuditoria(conexion, registro)` recibe la
misma conexión y no hace commit. Registra actor/rol histórico, acción, entidad/id, antes/después,
motivo, IP y fecha de Guatemala. Elimina recursivamente claves de contraseñas/tokens/DPI/NIT/cuenta
bancaria/afiliación. Los servicios deben enviar exclusivamente los cambios necesarios.
Se auditan login correcto/fallido/bloqueado, logout, cambio de contraseña correcto/fallido,
alta interna, estado, restablecimiento y cambio de rol.

`crearUsuarioInterno(conexion, actor, { nombre, apellido, correo, rol? })` queda disponible para
Fase 5, sin endpoint público de alta adelantado. Normaliza nombre/apellido a minúsculas sin acentos
ni espacios y genera sufijos `2`, `3`, etc., incluyendo cuentas inactivas. Serializa altas dentro de
la transacción, genera una clave temporal aleatoria de 24 caracteres y audita sin guardar el secreto.
RH puede crear RH/EMPLEADO, nunca ADMIN; EMPLEADO no puede crear usuarios. El servicio llamador debe
revalidar al actor, vincular EMPLEADOS y confirmar/revertir toda la operación en la misma conexión.

## Pruebas

- `npm test`: validación de entorno, política de contraseñas, normalización, generación aleatoria,
  comparación de tokens, depuración de auditoría, RBAC/propiedad, CSRF previo y regresión de Fases 0/1.
- `npm run verify:security`: requiere Oracle saludable en Compose y Node 20. Crea un esquema
  `N2SEC_*` aleatorio, aplica migraciones/seeds, ejecuta Supertest con repositories Oracle reales y
  elimina exclusivamente ese esquema al finalizar. No modifica cuentas del esquema de aplicación.
- Integración: bloqueo concurrente, cookies Secure/Strict/httpOnly, CSRF, cambio obligatorio,
  rotación, expiración, permisos/propiedad, filtros, administración, generación y rollback real
  cuando un trigger de prueba hace fallar la auditoría. La ruta de prueba de propiedad solo existe
  dentro de la suite, consulta Oracle y no se publica en la aplicación.

Para repetir la integración bajo Node 20 desde un host con otra versión:

```bash
docker build --target build -f backend/Dockerfile -t nomina2-security-tests .
docker run --rm --mount type=bind,source="$PWD/db",target=/app/db,readonly nomina2-security-tests npm test -w backend
npm run verify:security -- --docker
```

La opción `--docker` usa la red `nomina2_default` del Compose y monta `db/` en solo lectura.
Las credenciales temporales se transfieren por entorno y no aparecen en los argumentos.
Las pruebas `.oracle.ts` se excluyen del build de producción.

## Cierre — accesos y logs

`POST /api/usuarios` solo ADMIN: `{ nombre, apellido, correo, rol: "ADMIN" | "RH", motivo,
confirmado: true }`. Revalida al actor en la transacción, genera usuario/clave temporal y audita;
responde 201 con `{ idUsuario, usuario, contrasenaTemporal }` una sola vez. EMPLEADO se crea vinculado
al expediente. Los endpoints anteriores de estado/rol/restablecimiento conservan revocación y
protección del último ADMIN. Interfaz: `/admin/usuarios`.

Los logs HTTP guardan la plantilla del endpoint, sin parámetros de ruta, query, cuerpo o cookies.
HTTPS local en 8443 mantiene Secure; README describe certificado, proxy de producción y aceptación
aislada. La matriz completa de controles y pruebas se documenta en CIERRE.md.

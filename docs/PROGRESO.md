# Progreso de nomina2

Estado actual: FASE 12 completada. Proyecto cerrado el 13/10/2026; los registros de FASES 0–11
se conservan como historial. Ver FASE 12 y docs/CIERRE.md para aceptación y mejoras futuras.

## FASE 0 — Infraestructura y esqueleto

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Incorporado AGENTS.md y creada la estructura backend/frontend/db/docs del punto 4, con marcadores
  para carpetas reservadas sin implementación de negocio.
- npm workspaces, lockfile único, `.nvmrc` Node 20, TypeScript strict, ESLint, Prettier y Vitest en
  backend y frontend.
- Compose `name: nomina2`: Oracle XE 21c con volumen persistente y healthcheck, API con migraciones
  al arrancar y nginx con React y proxy `/api`. Los tres servicios quedan saludables.
- `.env.example` completo; `.env` local con claves generadas, ignorado por Git. API con usuario
  dedicado NOMINA2, configuración Zod y pool node-oracledb thin, sin Instant Client.
- Express 5, helmet, pino, identificación de solicitudes, errores centralizados y respuestas uniformes.
  `GET /api/salud` consulta Oracle real y devuelve 503 cuando no está disponible.
- Runner `npm run db:migrate`, también utilizable dentro del contenedor de producción;
  `VERSION_ESQUEMA`, checksums, estados de aplicación y V000 de prueba técnica.
- React 18, Vite, Tailwind 4, React Router, TanStack Query, mapa de iconos y página `/salud` con
  estados de carga/error/éxito, reintento y ayuda contextual. No hay datos simulados en la aplicación.
- Tokens del mockup documentados y centralizados; referencia visual compacta con las 38 páginas.
- README con arranque, entorno, desarrollo, migraciones, pruebas y operación; ERD y decisiones.
- Remoto origin configurado a `https://github.com/emartinez-umg/Nomina_2.git` y autoría local
  `emartinez-umg` con el correo existente `emartinezo8@miumg.edu.gt` para el commit solicitado.

### Validación realizada

- `npm run lint`, `npm run typecheck` y `npm run format:check`: sin errores.
- `npm test`: 37 pruebas aprobadas (31 backend y 6 frontend), también ejecutadas dentro de imágenes
  Node 20.20.2. Cubren entorno, liberación de conexiones, migraciones, HTTP y estados de la página.
- Builds de backend y frontend correctos bajo Node 20.20.2 en Docker.
- Instalación con `npm ci` y auditoría: 0 vulnerabilidades reportadas.
- `docker compose up --build -d --wait --wait-timeout 900`: tres servicios saludables.
- Oracle consultado: versión 21.3.0.0.0, modo thin y usuario NOMINA2.
- V000 aplicada al arrancar la API. Reejecución desde host y contenedor: 0 migraciones pendientes,
  una fila APLICADA en VERSION_ESQUEMA y un solo registro técnico en PRUEBA_INFRAESTRUCTURA.
- `npm run verify:infra`: HTTP 200 con Oracle conectado desde la API directa y nginx; rutas SPA y
  bundle React disponibles.
- Prueba de caída real: Oracle detenido devuelve HTTP 503/BD_NO_DISPONIBLE. Tras reiniciar Oracle,
  vuelve HTTP 200; el volumen conserva V000 sin duplicación.
- Página revisada en navegador; ancho móvil de 390 px sin desbordamiento horizontal.

### Decisiones

- Implementada exclusivamente FASE 0. Seguridad de sesiones, RBAC, CRUD y cálculo de nómina se
  reservan para fases posteriores; no hay usuario ADMIN ni seeds de negocio en esta fase.
- Oracle XE 21c mantiene plataforma amd64; API y web usan la arquitectura nativa del motor.
- React Router 7, Tailwind 4 y Vitest 4.1.11 sustituyen versiones iniciales afectadas por auditoría,
  conservando React 18 y Node 20. Detalles en DECISIONES.md.
- Migraciones confiables delimitadas por `/` aislado, orden numérico y checksum inmutable. Oracle
  confirma DDL implícitamente: un fallo o interrupción exige revisión manual, sin reintento ciego.
- Un runner a la vez; las colisiones de versión detienen la ejecución adicional.
- La API no registra cuerpos, cookies, secretos, query params ni mensajes internos de Oracle.
- Claves locales de Oracle dentro del límite de 30 caracteres; la configuración valida ese máximo.
- El mockup original pesa 289 MiB. Se conserva intacto en Descargas y se versiona una referencia
  rasterizada a 144 dpi, sin compresión con pérdida, con sus 38 páginas y tamaños conservados.

### Supuestos

- XEPDB1 es el PDB de aplicación; la imagen crea el usuario dedicado mediante APP_USER.
- El entorno local tiene Node 24; Node 20 se fija en Docker y `.nvmrc` y se usó también para pruebas.
- La fuente del PDF aparece como `unknown`; se usa Trebuchet MS/Arial/sans-serif. Paleta, radios y
  espaciados son aproximaciones visuales documentadas. La página de salud se deriva del mockup.
- La ayuda de la página temporal es manual; los recorridos por rol y su primera visita se integrarán
  con las pantallas definitivas cuando exista autenticación.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 0.
- Para próximas fases: esquema de negocio, autenticación, sesiones/CSRF, RBAC, seeds y módulos
  según la siguiente solicitud. No se han adelantado esas funcionalidades.

### Cómo probar

1. Copiar `.env.example` a `.env` y definir claves diferentes de 8 a 30 caracteres ASCII.
2. `docker compose up --build` y esperar los tres healthchecks.
3. Abrir `http://localhost:8080/salud` y consultar `http://localhost:3000/api/salud`.
4. Con Node 20: `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run format:check`.
5. `npm run verify:infra` y `docker compose exec nomina2-api npm run db:migrate`.
6. Consultar README.md para desarrollo local y recuperación manual de migraciones fallidas.

## FASE 1 — Diseño e implementación completa de Oracle

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- 53 tablas de negocio en V001–V012, agrupadas por los 12 dominios solicitados. Se conserva V000
  intacta: el esquema instalado tiene 55 tablas y 13 migraciones APLICADAS.
- PK identity ALWAYS, FK indexadas (incluidos todos los campos de FK compuestos), CHECK, UNIQUE,
  auditoría por ID de usuario, eliminación lógica e índices para la lista blanca db/filtros.json.
- Triggers con fecha/hora explícita de Guatemala para modificaciones y bitácora inmutable.
- Historial salarial y de horarios, calendario con medios días/localidad, parámetros y conceptos
  versionados, descuentos/cuotas/aplicaciones/reversos, nómina con snapshots e ISR proyectado,
  prestaciones desglosadas, kardex, solicitudes/PDF privados, audiencias y filas de carga masiva.
- Cuatro archivos de seeds aditivos: roles, catálogos solicitados, 20 conceptos con banderas,
  38 parámetros vigentes desde 01/01/2026, dos tramos ISR, 13 feriados de 2026 y tres plantillas.
- Runner de seeds TypeScript strict, SQL encapsulado en repositorio, transacción con commit/rollback,
  credenciales ADMIN_* validadas con Zod y argon2id (64 MiB, tres pasadas, un hilo).
- ADMIN inicial con cambio obligatorio, sin secretos en logs/bitácora. Reejecución conserva su hash,
  correo, estado y cambio obligatorio. Una colisión con RH/EMPLEADO no eleva permisos y revierte el lote.
- npm run db:seed, db:setup y db:verify; Compose aplica migraciones y seeds antes de iniciar la API.
- ERD Mermaid por dominio, diagrama técnico y diccionario resumido en docs/ERD.md; README y decisiones
  actualizados. El entorno local ignorado incluye ADMIN_* y una clave generada sin mostrarla.

### Validación realizada

- npm run lint, npm run typecheck, npm run format:check y git diff --check: sin errores.
- npm test: 47 pruebas aprobadas (41 backend y 6 frontend). Backend repetido en Docker Node 20.20.2:
  41 aprobadas, incluidas las 10 nuevas de seeds/configuración/idempotencia y rollback.
- npm run db:verify contra Oracle XE 21.3 real: creación desde esquema vacío V000–V012, segunda
  ejecución sin pendientes, 53 PK identity, auditoría, CHECK/FK habilitados y validados, todos los
  índices de FK y filtros, y cero objetos/triggers inválidos.
- Seeds ejecutados dos veces: contenido completo idéntico en las 53 tablas, incluso tras editar
  catálogos y plantillas y cambiar CAMBIO_OBLIGATORIO. Hash argon2id verificado contra la clave inicial.
- Pruebas reales de rechazo: identity manual, duplicados, baja lógica inválida, FK inexistente,
  quincena inválida/duplicada, bitácora mutable, neto negativo, JSON inválido, saldo de vacaciones
  insuficiente, puesto de otro departamento y salario/documento de otro empleado.
- Coexistencia de varias audiencias y boletas: UNIQUE condicionales comprobados. Colisión de ADMIN:
  rollback íntegro, sin promoción de rol. El esquema temporal N2TEST_* se elimina al finalizar.
- docker compose up --build -d --wait --wait-timeout 900: backend y frontend construidos con Node 20,
  tres servicios saludables, instalación automática completa sobre la infraestructura local.
- Reejecución desde imagen de producción: db:migrate informa 0 pendientes y db:seed termina sin errores.
- Consulta de aplicación: 55 tablas, 13 migraciones, 38 parámetros, 20 conceptos, 0 objetos inválidos,
  un ADMIN con cambio obligatorio. npm run verify:infra verifica Oracle/API/nginx/React correctamente.
- npm install/auditoría y npm ci durante builds: 0 vulnerabilidades reportadas.

### Decisiones

- Se añaden BANCOS, CENTROS_TRABAJO, CONFIGURACION_EMPRESA, TIPOS_DEDUCCION_ISR,
  DESCUENTOS_APLICACIONES, NOMINA_PARAMETROS, ISR_PROYECCIONES, PRESTACION_DETALLE y
  CARGA_MASIVA_FILAS para cubrir relaciones, reproducción de cálculos y resultados de importación.
- El salario base y horario vigentes provienen de sus historiales, sin duplicación en EMPLEADOS.
- Claves compuestas refuerzan pertenencia a empleado/departamento/periodo/cálculo. PERIODOS_NOMINA
  solo admite quincenas exactas y fecha inicial única, por lo que no pueden traslaparse.
- CREADO_POR nulo representa instalación o proceso del sistema. Los servicios futuros establecerán
  actor, cambios depurados y bitácora en la transacción. La bitácora no permite UPDATE/DELETE.
- Los seeds solo insertan claves ausentes: no sirven para restablecer claves ni modificar valores
  operativos. Nuevos parámetros/conceptos/plantillas requieren nueva vigencia/versión.
- argon2 se fija a 0.44, compatible con Node 20; la rama 0.45 dejó de soportar esa versión y no se usa.
- db:verify administra exclusivamente un esquema N2TEST aleatorio mediante SQL*Plus del contenedor;
  las migraciones, seeds y comprobaciones usan el driver thin sin privilegios administrativos.

### Supuestos

- Vigencia inicial de referencia: 01/01/2026. Los valores de AGENTS.md y banderas iniciales requieren
  validación de RRHH antes de calcular nómina real; esta fase no ejecuta cálculos.
- El tope inicial de donaciones ISR es parametrizable (5 % de renta bruta), según referencia oficial
  de Minfin enlazada en ERD.md; no se inventan topes monetarios para seguros o IGSS.
- Calendario del año solicitado: 2026. El Ejército se descansa el 29/06 y se conmemora el 30/06;
  24 y 31/12 solo desde las 12:00. La Asunción (15/08) aplica a GUATEMALA_CIUDAD, no a todo el país.
  Fuentes oficiales y tratamiento de feriados locales/colectivos están en ERD.md.
- No se inventan empleados, organización, bancos ni datos de empresa. Se cargarán mediante sus CRUD.
- Parámetros genéricos y sus snapshots usan NUMBER(18,6); importes de nómina/saldos/prestaciones
  usan NUMBER(12,2). Rangos de vigencia incluyen ambos extremos y un fin nulo representa vigencia abierta.
- Fechas actuales, no traslapes, calendario laboral, saldo real, topes ISR, estados, RBAC y periodos
  cerrados requieren servicios transaccionales en fases posteriores; se documentan en ERD.md.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 1.
- Para las próximas fases, según solicitud: autenticación/cambio obligatorio, sesiones/CSRF, RBAC,
  servicios/CRUD y reglas de cálculo. No se han adelantado pantallas ni cálculos de negocio.
- Antes del uso real: RRHH valida parámetros/banderas/plantillas y completa empresa, organización,
  bancos, centros de trabajo y sus feriados locales; otros años requieren nuevos seeds de calendario.

### Cómo probar

1. Copiar .env.example a .env si no existe y definir ORACLE_PASSWORD, DB_PASSWORD y ADMIN_*.
2. docker compose up --build (crea el esquema y seeds automáticamente; no requiere Instant Client).
3. Con Node 20 y npm ci: npm run lint, npm test, npm run typecheck y npm run format:check.
4. npm run db:verify con Oracle saludable: creación aislada desde cero, idempotencia e integridad.
5. npm run verify:infra y docker compose exec nomina2-api npm run db:seed.
6. Para instalación local sobre Oracle existente: npm run db:setup; para solo DDL: npm run db:migrate.
7. Consultar README.md, docs/ERD.md y db/filtros.json para operación y definición del modelo.

## FASE 2 — Núcleo de seguridad del backend (RF-18)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Login/logout con sesión persistente en SESIONES, hashes SHA-256 de tokens aleatorios de 256 bits,
  cookies httpOnly/SameSite=Strict/Path=/api y Secure obligatorio en producción. No se expone el token
  de sesión en JSON. Inactividad renovable mediante SESSION_IDLE_MINUTES (30 por defecto).
- CSRF en login (doble envío firmado con vigencia de 10 min) y en todas las escrituras autenticadas
  (header contrastado con hash de sesión). Endpoint de recuperación CSRF y limpieza de cookies vencidas.
- Rate limit por IP configurable, bloqueo persistente de 15 min tras 5 fallos y bloqueo de fila
  para impedir que intentos concurrentes omitan el contador. Verificación Argon2id también si no existe
  el usuario; errores uniformes en español, headers Retry-After y Cache-Control: no-store.
- Cambio obligatorio global con 403/CAMBIO_CONTRASENA_OBLIGATORIO. Cambio propio valida política,
  contraseña actual y no reutilización; revoca todas las sesiones y entrega una sesión/token CSRF nuevos.
- Middleware RBAC para ADMIN/RH/EMPLEADO y helper de propiedad por ID de usuario del recurso obtenido
  del repositorio. Identidad propia en /auth/sesion, sin aceptar IDs del cliente.
- Servicio de auditoría reutilizable con la conexión de la transacción y depuración recursiva de
  secretos/datos sensibles. Login correcto/fallido/bloqueado, logout, cambio de clave, alta interna,
  estado, restablecimiento y rol quedan registrados con actor/rol, entidad/id, cambios, motivo e IP.
- ADMIN: listado de usuarios con filtros combinados, paginación/ordenamiento; activar/desactivar,
  cambiar rol y restablecer contraseña temporal. Cada cambio revoca sesiones y se audita atómicamente.
  No se permite desactivar ni degradar al último ADMIN activo.
- Bitácora solo ADMIN, filtros por usuario actor, entidad, acción y rango inclusivo de fechas;
  paginación y lista blanca de órdenes. Todas las consultas SQL usan binds.
- Alta interna preparada para Fase 5: nombre.apellido sin acentos/espacios, sufijos únicos y clave
  aleatoria de 24 caracteres con cambio obligatorio. RH nunca puede crear ADMIN.
- TRUST_PROXY_CIDRS validado y vacío por defecto: no se aceptan IPs reenviadas sin proxies confiables.
- Integración Supertest contra repositories Oracle reales en esquema temporal N2SEC_*, con eliminación
  al finalizar. Pruebas de propiedad en una ruta exclusiva de la suite; no se crean pantallas ni CRUD futuros.
- README, .env.example, DECISIONES.md y guía docs/SEGURIDAD.md con endpoints, contratos y operación.

### Validación realizada

- npm run lint, npm run typecheck, npm run format:check y git diff --check: sin errores.
- npm test: 73 pruebas aprobadas (67 backend, 6 frontend); backend repetido bajo Node 20 en Docker:
  67 aprobadas. Cubren además política, tokens, CSRF, RBAC, propiedad, depuración y configuración.
- npm run verify:security -- --docker: 20 pruebas de integración aprobadas con Node 20 y Oracle thin
  real. Incluyen cinco fallos concurrentes, bloqueo/vencimiento, Secure/httpOnly/Strict, CSRF, rotación,
  primer login, logout, inactividad, filtros, permisos, administración y generación con sufijos.
- Un trigger temporal provoca un fallo real de auditoría: se comprueba rollback de contraseña,
  cambio obligatorio y revocación de sesiones. La sesión anterior continúa válida tras el rollback.
- Protección contra IP falsificada y recuperación tras expiración verificadas. Esquema temporal
  eliminado, sin modificar las cuentas de la aplicación.
- Builds backend/frontend correctos, también en Docker Node 20. npm ci/auditoría durante construcción:
  0 vulnerabilidades. Las pruebas Oracle se excluyen del build de producción.
- Compose reconstruido: los tres servicios saludables. npm run verify:infra comprueba Oracle/API/nginx/React.
  Imagen de producción: CSRF 200, login del ADMIN inicial 200, acceso de negocio bloqueado con
  403/CAMBIO_CONTRASENA_OBLIGATORIO y logout 200, conservando la contraseña inicial y su cambio obligatorio.

### Decisiones

- No se requiere una migración nueva: V001/V003/V012 cubren esta fase y permanecen intactas.
- Los routers de negocio se montan después del guard global; cada router declara sus roles.
  /api/salud permanece público como excepción técnica de healthchecks, sin datos de negocio.
- Solo identidad, CSRF, cambio de contraseña y logout están disponibles durante el primer inicio.
- Los fallos de login se confirman con su auditoría antes de devolver el error HTTP, para conservar
  el contador. Las escrituras revalidan sesión/rol dentro de la misma transacción que la modificación.
- Bloqueo de administración antes de usuario/sesión serializa altas y cambios críticos. Garantiza
  sufijos reservados y al menos un ADMIN activo. El servicio llamador controla la transacción del alta.
- Cookies de navegador y expiración en Oracle: no dependen de un reloj enviado por el cliente.
  Logout cierra la sesión actual; cambio/restablecimiento/rol/estado revocan todas las anteriores.
- No se almacenan ni se auditan contraseñas temporales en claro. Se muestran una sola vez en la
  respuesta de restablecimiento/alta; los clientes deben entregarlas de forma privada.

### Supuestos

- El Compose actual usa una sola API: rate limit en memoria y clave CSRF previa al login por proceso.
  Reiniciar invalida solo los tokens previos al login; sesiones autenticadas sobreviven el reinicio.
- En despliegue con varias réplicas será necesario compartir contador por IP y clave CSRF previa.
- Producción usa HTTPS para cookies Secure. Para HTTP local se utiliza npm run dev en development;
  esta fase no incorpora certificados ni pantallas de autenticación.
- Sin TRUST_PROXY_CIDRS, auditoría/rate limit usan IP del socket (nginx al entrar por la web).
  El despliegue configurará únicamente IPs/CIDR exclusivos de proxies administrados y limitará
  conexiones directas. No se confía en rangos indiscriminados por defecto.
- Rango de filtros de bitácora desde 1900, fechas aaaa-mm-dd y zona America/Guatemala. El vínculo
  de futuras entidades de empleado a su usuario propietario se resolverá desde Oracle.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 2.
- Según la siguiente fase solicitada: pantallas de autenticación/usuarios y módulos de negocio que
  consuman estos guards/servicios. No se adelanta el CRUD de empleados ni el cálculo de nómina.
- Se mantienen las validaciones operativas de RRHH registradas en FASE 1 antes del uso real.

### Cómo probar

1. Con .env y Oracle saludable: docker compose up --build; la cuenta ADMIN inicial conserva su clave
   y cambio obligatorio. No es necesario modificar ni reaplicar migraciones.
2. Con Node 20 y npm ci: npm run lint, npm test, npm run typecheck, npm run build, npm run format:check.
3. npm run verify:security crea el esquema de integración y lo elimina al finalizar.
4. Para otro Node en el host: construir nomina2-security-tests con target build y ejecutar
   npm run verify:security -- --docker; comandos completos en docs/SEGURIDAD.md.
5. npm run verify:infra comprueba Oracle, API, nginx y bundle React.
6. Para el flujo HTTP manual: GET /api/auth/csrf, POST /api/auth/login con cookies/header CSRF,
   POST /api/auth/cambiar-contrasena; después consultar /api/usuarios y /api/auditoria como ADMIN.
7. Contratos, filtros, errores y helpers para próximas fases: docs/SEGURIDAD.md.

## FASE 3 — Base visual del frontend y autenticación

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Leídos AGENTS.md y PROGRESO.md y estudiadas las 38 páginas de MOCKUP antes de escribir código.
  Muestreo refinado de colores, tokens de fuente/radios/sombras/espacios y consumo desde Tailwind.
  Emblema extraído del PDF; login con panel curvo, sidebar azul, acciones verdes y tarjetas blancas.
- UI reutilizable: Button con icono obligatorio y mapa único, Card, Modal/ConfirmModal, Tooltip,
  Badge, Table con callbacks de página/orden en servidor, Skeleton, EmptyState, Toast, Tabs,
  Breadcrumbs y NotificationBell con contador opcional (sin inventar un valor en el producto).
- Campos controlados: TextField, NumberField, MoneyField/CurrencyField, DateField, DpiField,
  NitField, PhoneField, EmailField, SelectField con búsqueda, TextAreaField, FileField y resumen
  de errores. Etiqueta/obligatorio/hint/tooltip, máscaras, bloqueo y saneo, límites, aria y anchos
  proporcionales en grilla de 12 columnas. Validación al salir y errores de servidor por campo.
- Validadores Zod y utilidades de DPI, NIT módulo 11, teléfono, correo, política y fechas coherentes:
  edad configurable, ingreso/egreso, rangos/traslapes, horarios/feriados, vacaciones, periodos
  cerrados y eventos. El calendario deshabilita límites y restricciones recibidas por props.
- Login y cambio obligatorio contra la API de FASE 2; redirecciones ADMIN /admin, RH /rh y
  EMPLEADO /mis-gestiones. Guards por sesión/rol/cambio obligatorio; manejo de expiración y red.
- Cliente HTTP tipado con Zod, cookies del mismo origen, CSRF en memoria y rotación/recuperación,
  timeouts y errores en español. TanStack Query para sesión y mutaciones; no reintenta escrituras.
  La caché privada se limpia al cambiar identidad/cerrar/expirar; sin polling de sesión.
- Sidebar por rol, buscador funcional de secciones, campana/panel UI, menú de cuenta real, logout,
  acceso móvil y ayuda global. Accesos de módulos futuros deshabilitados con explicación.
- Framework driver.js declarativo por página/rol, oferta en primera visita y repetición manual.
  Recorridos de login, cambio obligatorio, layout por rol y salud; iconos desde el mapa común.
- Documentación FRONTEND.md, README y decisiones actualizados. No se cambia la API ni el esquema
  de aplicación, ni se implementan CRUD/cálculos/reportes de fases posteriores.

### Validación realizada

- Lint, TypeScript strict, Prettier y git diff --check sin errores; builds backend/frontend correctos.
- 129 pruebas unitarias/integración ligera aprobadas: 67 backend y 62 frontend. Incluyen máscaras,
  saneo al pegar, NIT con K, años bisiestos/edades/límites/traslapes, calendarios, select por teclado,
  archivos, moneda Decimal, tabla, tabs, contador accesible, ayuda, CSRF, errores y guards.
- Frontend construido y probado también en Docker con Node 20. npm ci/auditoría: 0 vulnerabilidades.
- Chromium real con API Express y Oracle thin en esquema N2UI temporal: login de los tres roles,
  cambio obligatorio/rotación, recarga autenticada, redirección de EMPLEADO al intentar /admin,
  vencimiento provocado en Oracle y retorno al login, logout y recorridos de login/layout.
- Revisión visual de login, layout y portal móvil a 390 px; sin desbordamiento horizontal ni errores
  de JavaScript. Panel de notificaciones abre/cierra sin simular mensajes ni contadores.
- Esquema de prueba y procesos temporales eliminados; las credenciales/cuentas reales se conservan.

### Decisiones

- Los tokens refinados sustituyen las aproximaciones de FASE 0; la fuente sigue siendo una
  aproximación por falta de metadatos del mockup. Se documentan medidas y paleta en FRONTEND.md.
- Login por usuario, según contrato del backend. No se agregan Google/recordarme/registro ni
  recuperación pública que la API no soporta. El administrador restablece la contraseña.
- La primera visita ofrece el tour, sin forzar a completar el recorrido. Solo esa preferencia
  se guarda en localStorage; sesión y CSRF no se almacenan allí.
- Se conserva /salud como excepción técnica pública, con componentes/ayuda del sistema.
- Las tarjetas de inicio son accesos estáticos según rol; su estado pendiente es explícito.
  Los módulos se conectarán a sus endpoints reales en las fases correspondientes.

### Supuestos

- Marca neutra Nómina hasta que la configuración de empresa esté disponible; no se usan los
  nombres de empresa/personas/cifras ilustrativos del PDF como datos de aplicación.
- DPI exige formato de 13 dígitos; NIT verifica módulo 11. No se consulta existencia/identidad
  en RENAP/SAT. Datos personales de prueba existen únicamente en fixtures y esquemas desechables.
- DateField recibe restricciones reales por props; los próximos CRUD deben suministrar parámetros,
  horarios, feriados, rangos existentes y periodos cerrados desde la API. La validación del servidor
  será obligatoria al implementar esos módulos. No se inventan estos datos en FASE 3.
- FileField verifica formato declarado/tamaño; su endpoint futuro verificará contenido.
- Se mantiene HTTPS obligatorio para cookies Secure en producción. HTTP local se prueba con
  NODE_ENV=development y Vite; no se debilita la seguridad del Compose.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 3.
- Para próximas fases según solicitud: conectar los accesos de negocio a sus CRUD, filtros,
  exportaciones, notificaciones reales, dashboards y recorridos específicos; actualmente deshabilitados.
- Se mantienen las validaciones operativas de RRHH de FASE 1 y la configuración HTTPS de despliegue
  registrada en FASE 2 antes del uso real.

### Cómo probar

1. Oracle saludable y Node 20: npm ci; si corresponde, npm run db:setup con .env configurado.
2. NODE_ENV=development npm run dev; abrir http://localhost:5173/login.
3. Entrar con ADMIN_USER/ADMIN_PASSWORD de .env y cambiar la contraseña si es el primer acceso.
   El seed no restablece una contraseña cambiada. Probar ayuda, recarga, menú, búsqueda y logout.
4. npm run lint, npm test, npm run typecheck, npm run build y npm run format:check.
5. Docker Node 20: docker build --target build -f frontend/Dockerfile -t nomina2-frontend-tests .
   y docker run --rm nomina2-frontend-tests npm test -w frontend.
6. docker compose up --build sirve el frontend de producción; la autenticación requiere HTTPS.
   npm run verify:infra comprueba Oracle/API/nginx y las rutas/bundles de React.
7. Contratos y extensión de componentes/campos/tours: docs/FRONTEND.md y docs/SEGURIDAD.md.

## FASE 4 — Catálogos y parametrización (backend + frontend)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- CRUD para RH/ADMIN de departamentos, puestos, jefaturas, horarios, feriados, tipos de ausencia,
  tipos de descuento, tipos de contrato, parámetros legales y tramos ISR. EMPLEADO queda excluido
  por guards del frontend y RBAC del backend; CSRF y cambio obligatorio siguen vigentes.
- Módulo declarativo con capas routes/controller/service/repository, schemas Zod estrictos,
  parámetros enlazados, listado paginado, orden por lista blanca y filtros combinados por todos
  los campos editables relevantes; rangos numéricos/fechas, año y distribución diaria de horarios.
- V013 aditiva: rangos salariales opcionales NUMBER(12,2) de puestos y CHECK de ambos límites;
  índices de nuevos campos/rangos/textos. ERD y db/filtros.json actualizados; V000–V012 intactas.
- Jefatura por departamento con responsable real, activo y del mismo departamento. Referencias
  buscables/paginadas desde Oracle. El responsable puede asignarse después de cargar empleados.
- Horarios con siete días independientes: laborable/descanso, entrada/salida, cruce de medianoche,
  descanso y horas efectivas. Soportan distribución distinta de lunes a viernes. No se modifica
  el patrón/jornada de un horario ya asignado: se conserva el historial y se crea otro patrón.
- Calendario anual real de feriados, con año, ámbito nacional/local, localidad, franjas de medio día,
  conmemoración/fundamento y validación de traslapes. Tipos incluyen parqueo/consumo en tienda
  y efectos de ausencia; no se implementa el descuento ni cálculo de fases futuras.
- Parámetros/tramos con edición y nueva vigencia; modal ADVERTENCIA con anterior/nuevo y motivo
  obligatorio. Servidor exige confirmación, valida porcentajes/unidades/calendario, traslapes y
  último cierre. Nueva versión termina la anterior el día previo, sin extender un fin existente.
- Protección de versiones históricas/referenciadas y de cualquier efecto retroactivo sobre cierres.
  Bloqueos serializan escrituras y protegen la comprobación de periodos; permisos se revalidan en
  la misma transacción que datos/auditoría. Un fallo revierte incluso el cierre de la versión anterior.
- Eliminación lógica por defecto, física solo ADMIN con motivo/confirmación. Cualquier FK impide
  eliminar; UI bloquea la acción y ofrece desactivar, conservando las relaciones existentes.
- Interfaz `/catalogos` y páginas por catálogo con tokens del mockup, formularios proporcionales,
  hints, saneo, errores al salir/resumen/servidor, iconos, estados de carga/error/vacío, toasts,
  detalle, filtros colapsables y removibles, paginación/orden en servidor y CSV de toda la consulta.
- Recorridos declarativos específicos de cada catálogo/listado/formulario y rol. Ayuda también
  opera dentro del diálogo nativo, conservando su capa de foco y ofreciendo la primera visita.
- Documentación CATALOGOS.md, README, ERD y DECISIONES actualizada. Compose reconstruido con V013;
  sin alterar las credenciales reales ni cargar empleados/organización ficticios en la aplicación.

### Validación realizada

- Lint, TypeScript strict, Prettier y git diff --check sin errores; builds backend/frontend correctos.
- 142 pruebas unitarias/integración ligera aprobadas: 74 backend y 68 frontend. Validan dinero,
  rangos, formatos, horarios, calendario, límites ISR, confirmación/motivo y exportación multipágina,
  además de las pruebas previas. También aprobadas bajo Node 20 en Docker (seeds montados en solo lectura).
- 31 pruebas Oracle thin/Supertest aprobadas mediante verify:security: CRUD, filtros/rangos/orden,
  RBAC/CSRF, responsable del mismo departamento, horarios asignados, baja en uso, versiones/cierres,
  dos cambios concurrentes (uno 200 y otro 409) y rollback real provocado por trigger de auditoría.
  Se comprueba rollback tanto de alta como de cierre de vigencia e inserción de nueva versión.
- db:verify aprueba V000–V013 desde cero e idempotencia, 53 tablas de negocio, restricciones,
  índices de FK/filtros, seeds repetibles y objetos válidos. Esquemas N2TEST/N2SEC eliminados.
- Chrome real con Express/Oracle en esquema N2UI desechable: login, alta de departamento/puesto,
  referencias, filtros monetarios con formato, CSV, horario con lunes/viernes diferentes,
  advertencia/nueva vigencia, calendario anual y recorrido interactivo dentro del formulario.
  Revisión visual de tablas/formularios/advertencia/calendario y móvil a 390 px, sin desbordamiento
  horizontal de página ni errores JavaScript. Esquema y procesos temporales eliminados.
- Imágenes de build Node 20 correctas, instalación npm ci sin vulnerabilidades; Compose deja
  Oracle/API/nginx saludables y conserva los datos existentes.

### Decisiones

- Las definiciones internas de catálogo determinan campos/filtros/órdenes. La API publica solo
  metadatos de UI; nunca SQL. La validación frontend guía y el backend vuelve a validar todo.
- Montos/tasas viajan como texto decimal y se validan con Decimal; Oracle usa NLS explícito.
  El rango salarial es referencial y no sustituye HISTORIAL_SALARIAL.
- Misma fecha de inicio legal permite corregir únicamente una versión no utilizada ni cerrada;
  una fecha posterior crea versión. Se conservan código/unidad y límite inferior del tramo.
- Referencias históricas, incluidas inactivas, cuentan como uso al eliminar. Desactivar impide
  nuevas asignaciones y preserva las existentes; la historia legal cerrada exige nueva vigencia.
- La jornada sigue a nivel del patrón semanal; cada día contiene entrada/salida/descanso propios.
  El criterio de horas diarias se muestra derivado de esos datos, evitando duplicar valores.

### Supuestos

- El jefe responsable puede quedar vacío mientras no existan empleados reales; se validará al
  asignarlo en este CRUD después de la fase 5. No se inventan personas para completar jefaturas.
- Vigencias nuevas posteriores al último cierre es una regla conservadora: protege también
  cambios iniciados antes de un cierre y permite mantener intacto cualquier periodo cerrado.
- La UI de calendario usa el año actual en America/Guatemala y permite cambiarlo; no genera
  automáticamente feriados de otros años. Los seeds de 2026 permanecen como referencia inicial.
- La edición de tablas legales no sustituye la validación operativa de RRHH indicada en fase 1.
  Los servicios de cálculo/asignación de futuras fases volverán a validar integridad y vigencias.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 4.
- Próximas fases únicamente según solicitud: empleados/asignaciones, cálculo, solicitudes y demás
  módulos; no se adelantaron. Se mantienen la revisión de referencias legales por RH y HTTPS de producción.

### Cómo probar

1. Con .env configurado: docker compose up --build aplica V013 y conserva usuarios/credenciales.
2. Para HTTP local: NODE_ENV=development npm run dev; entrar como RH o ADMIN y abrir `/catalogos`.
3. Crear departamento/puesto/jefatura, combinar filtros/orden/páginas y exportar; crear horario
   con distribuciones distintas, revisar calendario anual y administrar tipos.
4. Editar valor legal con nueva fecha, revisar anterior/nuevo, exigir motivo y confirmar; consultar
   versiones. ADMIN consulta auditoría en `/api/auditoria?entidad=PARAMETROS_LEGALES`.
5. Probar bloqueo de eliminación en uso y alternativa Desactivar. Reiniciar ayuda en listado/formulario.
6. npm run lint; npm test; npm run typecheck; npm run build; npm run format:check.
7. npm run verify:security; npm run db:verify; npm run verify:infra. Guía completa: docs/CATALOGOS.md.

## FASE 5 — Gestión de empleados (backend + frontend)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- CRUD RH/ADMIN con capas routes/controller/service/repository, Oracle thin y binds. Alta/edición
  de datos personales, laborales, contacto principal de emergencia y banco; salario y horario
  iniciales se guardan en sus historiales, sin duplicar el salario vigente en EMPLEADOS.
- Formulario de cinco secciones, campos proporcionales, máscaras DPI/teléfono/NIT/moneda,
  saneo al escribir/pegar, hints, validación al salir/resumen y errores de servidor por campo.
  Edad parametrizada, nacimiento real/no futuro, ingreso desde edad mínima y hasta 30 días futuros;
  fin de contrato y egreso desde el ingreso. Banco/cuenta/tipo se completan juntos o quedan vacíos.
- Unicidad de código, DPI, NIT, IGSS y correo con mensajes específicos; NIT con verificador módulo 11.
  Catálogos buscables/paginados, activos y con pertenencia al departamento; se incorporaron bancos
  y centros de trabajo al CRUD declarativo existente para poder completar altas con datos reales.
- Listado con filtros combinables por nombre, DPI, NIT, departamento, puesto, jefatura, contrato,
  estado, ingreso y salario; chips removibles, limpiar, paginación y orden en servidor. CSV de toda
  la consulta, DPI/NIT enmascarados y neutralización de fórmulas. Ficha con seis pestañas desde Oracle:
  resumen, salario, descuentos, vacaciones, documentos e historial acotado al expediente.
- Usuario EMPLEADO opcional en alta individual/masiva: nombre.apellido normalizado y sufijo por
  colisión, contraseña aleatoria con cambio obligatorio. Entrega única en memoria con copiar/imprimir;
  las claves quedan fuera de cachés de consultas, almacenamiento, auditoría, logs y reportes.
- Cambios de salario con importe, fecha efectiva, motivo, actor y confirmación anterior/nuevo.
  HISTORIAL_SALARIAL cierra la vigencia previa el día anterior y conserva cambios programados.
  Advertencia contra SALARIO_MINIMO_MENSUAL vigente en la fecha elegida; aviso si falta configuración.
- Baja lógica con fecha/motivo/confirmación, conservación del expediente, desactivación del usuario
  y revocación de todas sus sesiones dentro de la misma transacción auditada.
- CSV de 29 columnas: plantilla ilustrativa descargable, BOM/comillas escapadas, límite 100 filas/1 MB,
  vista previa de errores/advertencias por fila, duplicados internos y revalidación al confirmar.
  Modalidades todo o nada/solo válidas, importación atómica de las filas elegidas, reporte sin claves
  y protección de propiedad/reconfirmación. Un fallo revierte también usuarios e historiales.
- Bloqueos y revalidación del actor protegen escrituras, referencias, unicidad y cierres concurrentes.
  Ayuda declarativa para listado, alta/edición, ficha, cambio salarial/baja y carga masiva, por rol;
  funciona dentro del diálogo y puede reiniciarse desde la barra superior.
- README, ERD, DECISIONES y guía docs/EMPLEADOS.md actualizados; sin nuevas migraciones ni datos
  ficticios en la aplicación. Se reutilizaron las tablas e índices de FASE 1 y tokens del mockup.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds backend/frontend sin errores.
- 179 pruebas aprobadas: 99 backend y 80 frontend; también bajo Node 20 en Docker. Incluyen
  validadores DPI/NIT/teléfono/correo/dinero/fechas, límites de edad y calendario, CSV malformado,
  duplicados, sanitización, credencial de una sola entrega y flujo de confirmación de carga.
- 42 pruebas Oracle thin/Supertest aprobadas mediante verify:security en host y Docker Node 20.
  Las 11 pruebas añadidas cubren RBAC/CSRF, alta completa, unicidad, filtros combinados/exportación,
  edición, usuario con sufijo, cambio obligatorio/baja/sesiones, salario futuro/cierres/concurrencia,
  propiedad de carga, revalidación tras vista previa, reporte/replay y rollback provocado por triggers.
  Se comprueba reversión de alta, cambio salarial y última fila de lote junto con todos sus usuarios.
- Revisión en navegador con API/Oracle en esquema N2UI desechable: alta individual, máscaras,
  referencias, ficha, nueva vigencia e historial salarial, ayuda dentro del diálogo y carga masiva.
  Vista móvil a 390 px sin desbordamiento horizontal de página. Solo fixtures del esquema temporal.
- Compose reconstruido con Oracle/API/nginx saludables; verify:infra comprueba rutas y bundles.
  Los esquemas N2SEC/N2UI y procesos de revisión se eliminan al concluir; volumen real conservado.

### Decisiones

- Todas las escrituras de empleados y su auditoría se confirman juntas. La carga solo persiste
  datos/errores/resultados, nunca contraseñas; el creador es el único que confirma o descarga el reporte.
- La edición del expediente no cambia salario ni crea usuarios. Salario tiene operación independiente;
  cambiar horario exige fecha efectiva. Se conserva la fecha de ingreso después del alta.
- El listado/ficha consulta el salario vigente hoy (o al ingreso para altas futuras), sin adelantar
  cambios programados. El historial expone todas las vigencias, motivo y usuario responsable.
- Las pestañas de descuentos/vacaciones/documentos leen registros reales existentes; las acciones,
  saldos calculados, PDF y flujos de esos módulos corresponden a sus fases futuras.

### Supuestos

- SALARIO_MINIMO_MENSUAL es un parámetro mensual QUETZALES de la categoría aplicable a la empresa.
  RH define importe/fundamento/vigencia; no se inventó un mínimo legal ni se sembró un monto nuevo.
  Un importe inferior genera advertencia y permite guardar, según el alcance solicitado.
- La baja desactiva el acceso inmediatamente al confirmarla, incluso con egreso futuro. No se
  implementó un programador de bajas. Ingreso protegido y asignaciones laborales sin cambios tras
  cierres son reglas conservadoras para conservar historia; correcciones personales siguen disponibles.
- Nuevas vigencias salariales/horario deben superar la última registrada y el último cierre global.
  No se reemplazan cambios programados ni se reabren periodos desde este módulo.
- CSV limitado a 100 empleados por transacción para controlar tiempo/memoria; la interfaz permite
  dividir archivos mayores. Se usa un contacto principal de emergencia por expediente.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 5.
- Próximas fases únicamente según solicitud: cálculo de planilla, operaciones de descuentos,
  vacaciones, solicitudes/documentos y demás módulos. Permanecen la revisión legal por RH y HTTPS
  de producción registrados en fases anteriores.

### Cómo probar

1. Con .env configurado: docker compose up --build. Para HTTP local usar Node 20 y
   NODE_ENV=development npm run dev; entrar como RH o ADMIN y abrir `/empleados`.
2. Crear referencias reales en Catálogos (incluidos centro de trabajo/horario y banco si corresponde).
   Configurar SALARIO_MINIMO_MENSUAL en Parámetros legales si aún no existe.
3. Crear empleado, probar máscaras/fechas/duplicados y generar usuario opcional; copiar/imprimir
   la clave antes de cerrar. Combinar filtros/rangos/orden y descargar CSV; abrir las seis pestañas.
4. Registrar salario con fecha posterior al ingreso/último cambio/cierre, motivo y confirmación;
   comprobar ambas vigencias. Probar baja y comprobar que el usuario ya no puede iniciar sesión.
5. Descargar plantilla, sustituir ejemplo/IDs, subir CSV con filas válidas e inválidas y revisar errores;
   corregir o elegir solo válidas, confirmar y descargar reporte. Reiniciar ayuda en cada pantalla.
6. npm run lint; npm test; npm run typecheck; npm run build; npm run format:check.
7. npm run verify:security (esquema desechable); npm run verify:infra. Contrato y detalles:
   docs/EMPLEADOS.md. La suite Oracle también admite verify:security -- --docker con la imagen de build.

## FASE 6 — Novedades que alimentan la nómina (RF-04, RF-14, RF-15, RF-21)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Backend con cinco recursos RH/ADMIN: descuentos, préstamos/anticipos, comisiones, horas extra y
  ausencias/permisos/incapacidades. Capas routes/controller/service/repository, schemas Zod estrictos,
  Oracle thin/binds, filtros combinados, paginación/orden en servidor, detalle y CSV completo.
- Descuentos FIJO, CUOTAS y UNICO, inicio/fin, estado y saldo real. Tipos de parqueo, tienda, embargo
  y otros desde Catálogos. Préstamos agregan capital, referencia única y desembolso; primera cuota
  no pasada, amortización quincenal exacta y ajuste de centavos en la última cuota.
- Primitiva interna registrarCobroCuota para el consumidor de Fase 8: valida cuota/empleado/nómina,
  vencimiento y saldo, crea aplicación, actualiza pago/saldo y liquida automáticamente en cero.
  Todo comparte transacción y auditoría con el llamador; sin endpoint de cobro manual.
- Comisiones manuales por empleado/quincena con referencia contra duplicados. Comisión/horas crean
  únicamente el periodo ABIERTO faltante, sin adelantar cálculo, aprobación ni cierre de planilla.
- Horas por empleado/día y jornada DIURNA/MIXTA/NOCTURNA, autorización y estimación con salario,
  divisor mensual, horas de jornada y recargo vigentes en la fecha del registro. Decimal y redondeo
  half-up único en shared/utils/dinero.ts; el importe final no usa el valor hora ya redondeado.
- Ausencias por tipo/efecto, rango inclusivo coherente, máximo 366 días y sin traslape contra otras
  ausencias vigentes o vacaciones en proceso/aprobadas/tomadas. Respaldo privado PDF/PNG/JPEG hasta
  1 MiB en BLOB transaccional, firma/base64/tamaño validados y descarga autenticada; hash/metadatos
  auditados sin contenido. Omitir conserva el respaldo; null lo quita.
- Protección de rangos anteriores/nuevos frente a cierres, incluidos movimientos de fecha y
  anulaciones. Registros consumidos, cuotas pagadas, anulados y liquidados se conservan para consulta.
  Locks compatibles con catálogos/usuarios/periodos y actor revalidado dentro de la transacción.
- RF-21 reutiliza catálogos y vigencias legales; código/efecto de tipos utilizados no se reescriben.
  V014 aditiva incorpora jornada, soporte privado e índices de rangos/horas/montos/saldos/cuotas.
  Se conservan las 53 tablas de negocio y las migraciones anteriores; db/filtros.json actualizado.
- Frontend `/novedades` con cinco secciones, referencias reales buscables/paginadas, formularios
  proporcionales, hints, máscaras/saneo, validación al salir/resumen y errores backend por campo.
  Amortización/cálculo desde API, autorización/anulación confirmadas, evitar doble envío, toasts,
  filtros/chips/limpiar, exportación, estados de carga/vacío/error, iconos y ayuda declarativa por rol.
- Tokens/componentes del mockup reutilizados. README, ERD, DECISIONES y docs/NOVEDADES.md actualizados
  con contratos y criterios de consumo para Fase 8. Compose reconstruido y V014 aplicada conservando
  volumen, datos y credenciales reales. Ningún fixture se cargó en el esquema de aplicación.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds backend/frontend sin errores.
- 196 pruebas aprobadas (112 backend y 84 frontend), también ejecutadas con Node 20 en Docker.
  Incluyen centavos/cuotas/residuos, liquidación y cobros inválidos, años bisiestos/cambio de año,
  redondeo de horas, traslapes inclusivos/adyacentes, rangos/filtros, firmas de respaldo y captura UI.
- 53 pruebas Oracle thin/Supertest aprobadas en host y Docker Node 20. Las 11 nuevas cubren las cinco
  novedades, RBAC/CSRF, schemas, filtros/CSV, referencias duplicadas, primera cuota pasada,
  estimación parametrizada, traslapes concurrentes y con vacaciones, respaldos privados y cierres.
  Triggers de fallo verifican rollback de préstamo/cuotas/periodo y de aplicación/pago/saldo/auditoría.
  El cobro final liquida una cuota real; repetirlo se rechaza y saldoMax=0 consulta las liquidadas.
- db:verify aprueba V000–V014 desde cero e idempotencia, índices de FK/filtros, CHECK, seeds repetibles
  y objetos válidos. Todos los esquemas temporales N2TEST/N2SEC se eliminan al concluir.
- Chrome real con API/Oracle en N2UI desechable: alta de préstamo con amortización, cálculo de horas,
  captura de permiso con respaldo, referencias, filtros/exportación CSV y ayuda reiniciable.
  Revisión visual de formulario, detalle/calendario, listado y móvil de 390 px, sin desbordamiento
  horizontal de página ni errores JavaScript. Procesos y esquema temporales eliminados.
- Compose saludable (Oracle/API/nginx) con builds Node 20; verify:infra verifica conectividad,
  rutas React y bundles. Datos del volumen de aplicación conservados.

### Decisiones

- El ID público del préstamo es el acuerdo ID_DESCUENTO_EMPLEADO; PRESTAMOS agrega capital,
  desembolso y referencia. Todos los descuentos del empleado siguen visibles en su ficha existente.
- Las cuotas vencen al final de la quincena elegida. El monto se reparte en centavos enteros;
  la última absorbe el residuo. FIJO no tiene saldo total ni cuotas. Capturar no realiza cobros.
- La captura de ausencias guarda días calendario. Fase 8 intersectará el rango con el periodo,
  horario/feriados y efecto para determinar los días pagados/descontados y subsidios.
- Un periodo cerrado protege toda novedad que lo intersecta; un fijo sin fin protege su vigencia
  completa. Las aplicaciones/referencias de nómina protegen también su historial aunque se reabra.
- Los cambios de un tipo ya utilizado requieren crear otro código/efecto para conservar significados.
  Los parámetros de horas mantienen las vigencias y advertencias de configuración de Fase 4.

### Supuestos

- Préstamos y anticipos sin intereses: no se solicitó tasa ni sistema financiero de intereses.
  INTERES_TOTAL queda en cero para las nuevas capturas. Límite operativo: 600 cuotas por acuerdo.
- La primera cuota no pasada se interpreta como fecha de inicio hoy o futura; su vencimiento será
  el fin de esa quincena. Desembolso está entre el ingreso del empleado y la primera cuota.
- Fecha de horas seleccionada y jornada declarada describen la labor real; la UI inicia en DIURNA,
  permite cambiarla y exige una opción válida. Sin salario/parámetros vigentes no permite guardar.
  Registros de horas anteriores a V014 conservan jornada null; nuevas capturas la exigen.
- La estimación de horas es informativa y puede cambiar mientras el periodo esté abierto. Fase 8
  guardará snapshots. Captura/configuración no sustituyen la revisión legal de RRHH ya documentada.
- Firma binaria/tamaño no equivalen a análisis antimalware ni validación completa del documento.
  El respaldo se entrega como descarga autenticada y no se publica ni se incrusta como HTML.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 6.
- Según próximas fases solicitadas: consumo efectivo de novedades, neto no negativo/prorrateos,
  snapshots, cierre/reapertura/reversión en Fase 8; vacaciones/solicitud de parqueo y su activación
  automática por sus módulos. No se adelantaron estos flujos.
- Se mantienen la revisión legal por RH y HTTPS de producción registrados en fases anteriores.

### Cómo probar

1. `docker compose up --build` aplica V014 y conserva datos. Para HTTP local con Node 20:
   `NODE_ENV=development npm run dev`; entrar como RH/ADMIN y abrir `/novedades`.
2. Crear empleado/referencias reales, comprobar tipos y parámetros vigentes en Catálogos.
   Registrar fijo/cuotas/único, préstamo/anticipo, comisión de quincena, horas y ausencia.
3. Revisar amortización/cálculo, autorizar horas/ausencias, adjuntar/descargar/quitar respaldo;
   combinar filtros/orden/páginas, limpiar chips, exportar CSV y reiniciar Ayuda.
4. Probar primera cuota pasada, referencia repetida, rango invertido/traslapado y datos inválidos.
   La suite Oracle prueba cierres, consumo y liquidación sin alterar la planilla de aplicación.
5. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`.
6. `npm run verify:security`; `npm run db:verify`; `npm run verify:infra`.
   Contratos de captura, adjuntos y consumo: docs/NOVEDADES.md.

## FASE 7 — Vacaciones

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Módulo backend routes/controller/service/repository, Zod estricto, Oracle thin/binds y propiedad
  derivada de la sesión. Saldo con tasa mensual vigente en BD, kardex idempotente por aniversario,
  snapshots históricos y descuento de vacaciones anteriores/aprobadas, usando Decimal.
- Carga RH/ADMIN de días previos tomados con referencia/motivo/confirmación, o saldo disponible
  certificado hoy para empleados existentes. V015 permite apertura única, incluso en cero;
  conserva las 53 tablas y todas las migraciones anteriores sin cambios.
- Días laborales fecha por fecha según horario/asignación vigente, incluidos descansos entre
  semana y trabajo domingo; excluye feriados nacionales y locales efectivos. Detecta huecos de
  horario, fechas pasadas, límites de relación laboral y traslapes con vacaciones/ausencias/cierres.
- Portal `/mis-gestiones/vacaciones`: saldo/kardex real, calendario react-day-picker con fechas
  inválidas atenuadas/deshabilitadas, revisión de días/saldo, envío confirmado e historial de estados.
  Rango con saldo insuficiente o bloqueos impide enviar y explica cómo corregirlo.
- Panel `/vacaciones` RH/ADMIN: bandeja paginada/ordenada, búsqueda/filtros combinados, chips/limpiar
  y CSV completo. Comparación actual verde/roja; aprobar deshabilitado con tooltip cuando no alcanza.
  El backend vuelve a validar y rechaza independientemente del cliente; rechazo requiere motivo.
- Aprobación registra un único débito/reserva y actualiza saldo, solicitud de vacaciones, solicitud
  general e historial, notificación al empleado y auditoría en la misma transacción. Nueva solicitud
  avisa a RH/ADMIN. Campana real con contador, últimos avisos y marcado propio como leído.
- Locks compatibles con catálogos/usuarios/periodos y actor revalidado dentro de la transacción:
  evita aprobaciones duplicadas, sobreconsumo y traslapes concurrentes. Rollback incluye el kardex.
- `prepararVacacionesFiniquito` y endpoint informativo exponen días pendientes, salario/divisor
  vigentes y monto exacto para Fase 9, sin adelantar pago/liquidación. Bloquea corte incoherente,
  movimientos o solicitudes/reservas posteriores que deban resolverse antes del finiquito.
- UI derivada del mockup con tokens/componentes existentes, calendario con colores del sistema,
  campos proporcionales, saneo/referencias, hints, errores por campo, carga/vacío/error, toasts,
  iconos, accesibilidad y recorrido declarativo/reiniciable por rol. Sin datos simulados en pantallas.
- README, ERD, DECISIONES y docs/VACACIONES.md documentan fórmulas, API, supuestos y contrato Fase 9.
  Compose reconstruido con Node 20, V015 aplicada e idempotencia confirmada; volumen real conservado.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds backend/frontend sin errores.
- 212 pruebas unitarias aprobadas (124 backend y 88 frontend), también en Docker Node 20.
  Las nuevas cubren acumulación, meses cumplidos/bisiestos/vigencias/snapshots/apertura, calendarios
  diferentes con descanso entre semana, traslapes, saldo insuficiente/igualdad, valoración exacta,
  fechas/schemas, semáforo verde/rojo, botón bloqueado y saneo de referencias.
- 62 pruebas Oracle thin/Supertest aprobadas en host y Docker Node 20. Las nueve de vacaciones
  cubren propiedad/RBAC/CSRF, acumulación persistida/idempotente y apertura histórica/cero,
  horarios/feriados nacionales/locales, solicitud→verde, previas→rojo/rechazo motivado,
  aprobación concurrente única, notificaciones propias y rollback de saldo/estados/historial/avisos.
- db:verify aprueba V000–V015 desde cero, idempotencia, índices/CHECK/seeds/objetos válidos.
  Esquemas N2TEST/N2SEC eliminados al concluir. Reejecución en Compose: cero migraciones pendientes.
- Navegador integrado con API/Oracle reales en esquema N2UI desechable: solicitó cinco días para
  empleado con descanso martes/miércoles; RRHH vio verde, aprobó y el saldo pasó de 11.25 a 6.25.
  Segunda solicitud de cuatro días y carga de tres previos dejó 3.25: semáforo rojo y aprobar
  deshabilitado con explicación. Ayuda reiniciable y móvil 390 px sin desbordamiento ni errores JS.
  El arnés temporal inyectó únicamente sesiones de fixtures para evitar la limitación de cookies
  del navegador integrado; cookies/CSRF reales se probaron aparte con Supertest. Arnés, procesos,
  credenciales y esquema N2UI eliminados; nunca se cargaron fixtures en el esquema de aplicación.
- Compose saludable (Oracle/API/nginx); verify:infra aprueba conectividad y rutas/bundles React.

### Decisiones

- Los meses se cumplen en el aniversario de contratación (día ajustado al fin del mes si falta).
  La vigencia se evalúa en cada aniversario; materializar conserva la tasa y clave MES:fecha.
  El saldo no anticipa acumulación futura y deja de acumular al egreso.
- Pendientes no reservan saldo. Aprobar revalida el saldo actual y debita hoy inmediatamente;
  el movimiento DISFRUTE funciona como reserva y no se vuelve a descontar al llegar el rango.
  Por eso una pendiente puede pasar de verde a rojo al aprobar otra o cargar vacaciones previas.
- La apertura certifica disponible hoy, sustituye el saldo previo sin borrar el kardex y solo se
  permite antes de ajustes/disfrutes. TOMADAS es un débito motivado y no duplica historia certificada.
- Solicitudes generales e historial se mantienen sincronizados por el FK obligatorio de V010;
  no se implementan los demás tipos de solicitud ni entrega de documentos en esta fase.
- Valoración del finiquito comparte conexión/transacción con Fase 9 y usa salario/divisor vigentes
  al corte. No admite reservas posteriores sin resolver ni efectúa pagos desde un GET.

### Supuestos

- No hay prorrateo diario de mes incompleto; se acumulan meses cumplidos. El requisito no define
  fracciones de mes. El saldo inicial conserva los aniversarios originales de contratación.
- Sin tasa histórica configurada se exige completar vigencias o certificar apertura hoy;
  no se extrapola la referencia de 2026 hacia años anteriores.
- La unidad de vacaciones es día laboral completo: se excluye toda fecha feriada, incluidos los
  medios días del catálogo. Inicio/fin deben ser laborales; descansos interiores son permitidos.
- Rango máximo operativo 366 días y navegación del portal hasta hoy + 365. Los descansos no
  consumen saldo, pero un traslape interior con otro registro igualmente invalida el rango.
- La valoración de vacaciones pendientes usa salario al corte / SALARIO_DIAS_MES, coherente con
  valor día de sección 10. Pago efectivo y resolución/reversión de reservas pertenecen a Fase 9.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 7.
- Próximas fases solo según solicitud: consumo por nómina y pago/liquidación del finiquito en Fase 9.
  Transiciones adicionales de cancelación/reversión/disfrute no se adelantaron.
- Permanecen la revisión legal de parámetros por RH y HTTPS de producción de fases anteriores.

### Cómo probar

1. `docker compose up --build` aplica V015 sin reemplazar el volumen. Para HTTP local con Node 20:
   `NODE_ENV=development npm run dev`. Configurar empleado/horario, feriados y tasa vigente reales.
2. RRHH/ADMIN abre `/vacaciones`, selecciona empleado y consulta kardex; para historia anterior
   carga TOMADAS o saldo inicial certificado, con referencia/motivo y confirmación.
3. Empleado abre `/mis-gestiones/vacaciones`, revisa saldo, elige extremos laborales libres y envía.
   Probar rango con descanso entre semana/feriado y rango que exceda saldo o cruce una ausencia.
4. RRHH filtra la bandeja, comprueba verde y aprueba; empleado verifica descuento, historial y aviso.
   Crear otra pendiente y cargar previas que reduzcan el saldo: queda roja y no permite aprobar.
   Rechazar exige motivo y notifica sin otro débito. Probar CSV, filtros, kardex y Ayuda.
5. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`.
6. `npm run verify:security`; `npm run db:verify`; `npm run verify:infra`.
   Contrato de API y primitiva de Fase 9: docs/VACACIONES.md.

## FASE 8 — Motor de nómina (RF-08, RF-09, RF-16, RF-19)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Backend routes/controller/service/repository, Zod estricto, Oracle thin/binds, Decimal y redondeo
  half-up único. Salarios/conceptos/banderas/parámetros con vigencia por fecha/segmento, sin tasas
  ni montos de respaldo en código. Salario completo/parcial, cambios intermedios, bonificación,
  horas por jornada, comisiones y ausencias según horario/feriados/efecto real.
- ISR con reales acumulados, proyección futura efectiva, IGSS real/proyectado, deducción personal,
  comprobantes agrupados/topes, tramos continuos y retención restante. Recálculo final y devolución
  de exceso como ingreso no afecto. Consume aguinaldo/Bono 14 ya pagados según límites configurados.
- Apertura fiscal certificada por empleado/año para implantación con historia anterior; no inventa
  ingresos pagados desde el contrato. Captura RH de deducciones acreditadas y consulta de comprobantes.
- Periodos quincenales exactos/no solapados y flujo calcular → revisar → aprobar → cerrar. Control
  de versión, huella SHA-256 de fuentes y revalidación antes de transiciones; alertas por empleado
  bloquean aprobación/cierre, incluidos neto negativo y novedades pendientes. Devolver a revisión
  exige motivo para corregir un aprobado cuyas fuentes cambiaron.
- Cierre transaccional aplica cuotas/fijos una sola vez, enlaza NOMINA_DETALLE y liquida saldos.
  Incluye cuotas vencidas anteriores pendientes, con tope de saldo conjunto y última cuota exacta.
  Reapertura solo ADMIN con motivo: revierte aplicaciones/cuotas/saldo, conserva versiones y obliga
  a recalcular. Cierres posteriores impiden alterar historia anterior; respeta cierre cronológico.
- Resultados versionados y detalle por concepto con fuentes/base/cantidad/tasa/banderas; snapshots
  completos de entrada/resultado/empresa/versión del motor. NOMINA_PARAMETROS e ISR_PROYECCIONES
  conservan vigencias, deducciones y escala utilizada. Lecturas/exportaciones Oracle READ ONLY
  mantienen totales/filas/versiones consistentes. Auditoría depurada con binds CLOB explícitos.
- Planilla e historial reales con búsqueda/filtros combinados, chips/limpiar, totales globales,
  alertas, orden/página en servidor, detalle, recálculo y confirmaciones. Exportación XLSX real
  (dinero numérico exacto, textos sin fórmulas), PDF consolidado y boletas masivas paginadas.
- Portal `/mis-gestiones/boletas`: propietario derivado de Oracle, solo versiones actuales cerradas;
  tarjetas móviles con neto/detalle/PDF y tabla desktop. RH/ADMIN consulta boletas y vista previa.
- IGSS mensual exportable 2.2.0, datos patronales/centros/tipos/asignaciones parametrizados en BD,
  editor guiado con referencias reales, códigos/nombres exactos, TC/TP, suspensiones/licencias y
  consolidación de dos quincenas cerradas. TP conserva horas efectivas de horario y extra aprobadas.
- V016 aditiva: hash/alertas de periodo, FORMATO_IGSS, índices funcionales de filtros y tabla
  ISR_APERTURAS (54 tablas de negocio). S005 incorpora ISR_DEVOLUCION sin sobrescribir parámetros.
  Migraciones anteriores intactas. UI/tokens/iconos/campos/tours del mockup reutilizados, sin mocks.
- README, ERD, DECISIONES, seeds y docs/NOMINA.md actualizados con contratos, reglas y fuentes.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds correctos; producción construida con
  Node 20. Nueva pantalla cargada por ruta para evitar cargarla durante el login y otros módulos.
- 259 pruebas unitarias aprobadas (164 backend, 95 frontend), también en Docker Node 20. Las 40 nuevas del backend cubren
  salario bajo/alto, ingreso/egreso parcial, febrero/31 días, cambios de vigencia/salario, ausencias,
  horas de tres jornadas, comisión/banderas, descuentos/última cuota/cuotas vencidas/neto negativo,
  ISR/deducciones/topes/exenciones/diciembre/reintegro, reproducción de snapshot y flujo/formatos.
  Siete nuevas UI verifican transiciones, alertas, bloqueo cerrado/ADMIN, doble envío y tarjeta móvil.
- 72 pruebas Oracle thin/Supertest aprobadas en host y Docker Node 20: flujo real, snapshots/boletas,
  recálculo/versiones, CSRF/RBAC/propiedad,
  cierre concurrente único, rollback provocado de auditoría que revierte también cobro/saldo/estado,
  reapertura/reversión y recierre, fuente modificada, neto negativo, liquidación final, cuotas vencidas,
  deducciones/apertura única/PK auditada y exportaciones XLSX/PDF/IGSS. Esquemas N2SEC eliminados.
- db:verify aprueba V000–V016 desde cero, idempotencia, CHECK/FK/identity/índices/objetos válidos y
  seeds repetibles. Esquemas N2TEST eliminados; datos y credenciales de aplicación conservados.
- Navegador integrado con API/Oracle en N2UI desechable: creó quincena, calculó, revisó, aprobó y
  cerró; verificó detalle, formularios fiscales/IGSS y boleta propia. Portal móvil de 390 px sin
  desbordamiento de página y con tarjetas/descarga accesible. Errores transitorios de HMR durante
  edición corregidos; verificación final sin nuevos errores JavaScript.
- PDF real de Oracle renderizado e inspeccionado; extracción verifica ingresos, descuentos y neto
  exactos contra la API y numeración. PDF consolidado revisado visualmente. Descarga de archivo
  comprobada por HTTP; el navegador integrado no expuso el evento de descarga de su URL Blob.
  El arnés usó sesiones Oracle de fixtures por la limitación de cookies del navegador integrado;
  sesión/cookies/CSRF reales se prueban con Supertest. Arnés/procesos/esquema eliminados.
- Compose actualizado y saludable (Oracle/API/nginx), V016/S005 aplicados sobre el volumen existente;
  verify:infra aprueba Oracle, API, assets y rutas React. Reejecución de migraciones sin pendientes.

### Decisiones

- Calcular guarda versiones sin cobrar; cerrar aplica y publica boletas, reabrir revierte y conserva.
  La revisión debe corresponder a la misma huella y versión aprobada. No hay pago bancario automático.
- Quincena completa = mitad mensual; parcial = días calendario dentro de contratación/egreso con
  tope quincenal. Ausencias se muestran como descuentos y reducen las bases afectas; la bonificación
  se prorratea directamente. COSTO_PATRONAL representa aportes informativos, etiquetados en la UI.
- Topes ISR se aplican a la suma acreditada de cada tipo, evitando multiplicar el límite por recibo.
  Proyección restante considera salarios/bonificación con vigencias programadas; variables se
  incorporan cuando se registran en la quincena calculada. La última quincena usa reales y reintegra
  exceso de ISR con concepto separado sin generar nueva renta ni contribuciones.
- Aperturas/comprobantes son historia fiscal auditada; no sustituyen nóminas cerradas. Para empezar
  a mitad de año se exige continuidad o apertura real, aun si esto bloquea un cálculo incompleto.
- Reporte IGSS conserva estructura oficial 2.2.0 y parametriza datos/mapeos patronales; nunca divide
  automáticamente apellidos compuestos. La exportación no presenta declaraciones externas.

### Supuestos

- Se mantienen jornada mensual y periodicidad estructural 2/24; los parámetros se leen/validan desde
  BD. Los días pagados completos son SALARIO_DIAS_MES / QUINCENAS_MES, incluso en febrero.
- Ausencias/vacaciones se manejan en días laborales completos y feriados completos, coherente con
  FASES 6–7; un subsidio IGSS no se registra como desembolso empresarial ficticio. TC reporta días
  pagados nominales; TP usa horas del horario efectivo conservado, excluye ausencias sin goce y
  feriados e incluye extra autorizada. RH valida clasificaciones y códigos patronales reales.
- La renta inicial certificada es gravada, sin rentas exentas; IGSS acreditado manualmente no duplica
  cuotas ya acumuladas desde planillas. No se estiman comisiones/horas futuras sin registro real.
- El ajuste/reintegro final se materializa en la última quincena fiscal según sección 10; el informe
  y las obligaciones de liquidación externa ante SAT se validan/gestionan por RH. Se documentan
  referencias oficiales SAT/Minfin e IGSS en NOMINA.md; no se declara certificación legal.
- Exportaciones limitadas a 10,000 resultados por consulta; configuración IGSS admite hasta 5,000
  asignaciones y cuerpo de hasta 4 MiB. Apertura única por empleado/año; las correcciones de historia
  certificada deben resolverse antes de aprobar/cerrar, conservando trazabilidad.

### Pendientes

- Ningún pendiente del criterio de aceptación de FASE 8.
- Permanecen la validación legal/operativa de vigencias y códigos por RH y HTTPS de producción
  registrados en fases anteriores. Siguientes fases únicamente según solicitud: prestaciones y
  finiquito en FASE 9 y flujos de solicitudes/parqueo/documentos cuando se indiquen.

### Cómo probar

1. `docker compose up --build` aplica V016/S005 sin reemplazar volumen ni credenciales. Para HTTP
   local con Node 20: `NODE_ENV=development npm run dev`.
2. RH/ADMIN abre `/planilla`, crea/abre una quincena; completa salarios, novedades y vigencias reales.
   Si hay historia anterior, registra apertura fiscal al cierre de la quincena anterior y comprobantes.
3. Calcular → revisar detalle/alertas → recalcular si corresponde → marcar revisada → aprobar → cerrar.
   Corregir netos negativos/novedades pendientes; probar cambio de fuente y pantalla desactualizada.
4. Descargar Excel/PDF/boletas masivas; filtrar historial por mes/año. Empleado abre
   `/mis-gestiones/boletas`, consulta sus propias boletas cerradas y descarga PDF, también en móvil.
5. Cerrar ambas quincenas de un mes, configurar IGSS con datos patronales/centros/tipos/empleados
   inscritos y exportar TXT. Probar falta de afiliación/códigos y un mes incompleto (se bloquean).
6. ADMIN reabre último cierre con motivo: comprobar cuota/saldo restaurados y versión conservada;
   recalcular/revisar/aprobar/cerrar. RH no puede reabrir. Probar ayuda reiniciable en Planilla/portal.
7. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:security`; `npm run verify:infra`.
   Oracle con Node 20: construir `nomina2-security-tests` y `npm run verify:security -- --docker`.

## FASE 9 — Prestaciones de ley (RF-12, RF-17)

Estado: completada el 12/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Módulo prestaciones con routes/controller/service/repository, Zod estricto, RBAC RH/ADMIN,
  CSRF, Oracle thin, binds y Decimal. Bono 14 julio–junio y aguinaldo diciembre–noviembre:
  promedio devengado, aumentos y comisiones reales, proporcionalidad sin doble prorrateo.
- Vista masiva por empleado/departamento con errores por persona y fecha límite de pago.
  Guardado transaccional, aprobación revalidada y pago registrado con fecha/referencia/motivo.
  Huellas SHA-256 detectan fuentes modificadas; duplicados y transiciones concurrentes se bloquean.
- Promedios usan snapshots de nóminas cerradas o devengados del mismo motor con salarios/novedades
  registrados. Meses equivalentes por cantidades/divisores de FASE 8, incluidas quincenas parciales.
  Faltas de vigencia y autorizaciones pendientes bloquean; no se inventan pagos ni historia.
- Indemnización con promedio de últimos seis meses (o tiempo menor), años/fracción, causa de egreso,
  vacaciones de la primitiva FASE 7 y aguinaldo/Bono 14 proporcionales. Simulación y confirmación
  con huella; baja, débito del kardex, desactivación de usuario, sesiones y auditoría atómicos.
- Control de reservas/movimientos posteriores y nóminas aprobadas/cerradas que excedan el egreso.
  Exige regularizar pagos de ciclos anteriores; una prestación ya pagada del ciclo actual se resta
  para evitar desembolsarla otra vez. Liquidación confirmada conserva la baja y su snapshot.
- Exención ISR por tipo con límite vigente, consumo anual, comprobación al pagar y monto exento
  congelado por componente. FASE 8 incorpora solo gravados, incluidas vacaciones de finiquito;
  indemnización exenta. Pago de finiquito antes del cierre y dentro de la quincena final.
- Constancias RF-17 por fechas de pago: nóminas cerradas/versiones actuales y prestaciones pagadas,
  empresa/empleado reales, historial y totales. PDF de prestación/finiquito con estado, componentes,
  base, promedio, exenciones, motivo, referencia y numeración; emisión/descarga auditadas con SHA-256.
- `/prestaciones` con filtros combinados/chips/limpiar, paginación/orden Oracle y CSV completo,
  iconos, campos proporcionales, restricciones de fechas, estados de carga/error/vacío, toasts,
  confirmaciones y ayuda por rol reiniciable incluso dentro del detalle. Sin mocks en pantallas.
- Empleados abre simulación desde **Liquidar y dar de baja**. V017 conserva snapshots/aprobación
  y sustituye unicidad de ciclo por índice condicional para conservar anulados; índice de liquidación
  única, aprobador/FK y filtros indexados. Siguen 54 tablas; V000–V016 intactas.
- Reapertura de nómina protege cierres referenciados por prestaciones vigentes. README, ERD,
  DECISIONES y PRESTACIONES.md explican contratos, reglas, fuentes oficiales y supuestos.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds correctos; imágenes de producción
  backend/frontend construidas con Node 20. Compose saludable con V017 sobre el volumen existente.
- 283 pruebas unitarias aprobadas (183 backend, 100 frontend), también bajo Node 20. Las nuevas
  cubren ciclos, menos de un año/un día, aumentos, variables, vigencias, bisiestos, ventanas,
  fracciones de quincena, renuncia, límites exentos consumidos/redondeados, desbordamiento monetario,
  incorporación fiscal de snapshots y prevención de transiciones/envíos dobles en UI.
- 82 pruebas Oracle thin/Supertest aprobadas: 72 de regresión y diez de FASE 9. Estas diez cubren
  RBAC/CSRF, fuentes modificadas, cálculo con aumento/comisión, aprobación concurrente única,
  pago idempotente, CSV/filtros, constancias/PDF, ciclos anteriores pendientes, Bono 14 ya pagado,
  liquidación/baja y rollback real provocado por trigger de auditoría (empleado, usuario, kardex,
  prestación y estados). La suite FASE 9 también aprobada bajo Node 20 mediante `--docker`.
- db:verify aprueba V000–V017 desde cero, idempotencia, índices de filtros/FK, CHECK, identities,
  objetos válidos y seeds repetibles. Esquemas N2TEST/N2SEC eliminados por los verificadores.
- Navegador integrado con API y Oracle desechables: vista masiva, guardado, aprobación, pago con
  referencia, bloqueo de acciones del pagado, simulación con cuatro componentes y ayuda dentro
  del detalle. Formulario/listado a 390 px sin desbordamiento de página; sin errores JS finales.
  El arnés solo inyectó una sesión Oracle de fixture por la limitación de cookies del navegador;
  autenticación, permisos y CSRF reales se verifican por separado con Supertest.
- PDF de Bono 14, constancia y finiquito obtenidos de Oracle, renderizados e inspeccionados;
  extracción confirma Q2,150, promedio de indemnización Q5,000 y numeración correcta. Prueba de
  constancia extensa (120 ingresos, nueve páginas): total Q180,000 y numeración en todas las páginas,
  cabeceras y alineación revisadas. Corregido salto de página extra al imprimir el pie.
- verify:infra aprueba Oracle/API/nginx, assets y rutas SPA. Datos/credenciales de aplicación
  conservados; fixtures solo en esquemas temporales, arnés y procesos de revisión retirados.

### Decisiones

- Devengado para calcular prestaciones y pago para emitir constancias son fuentes distintas.
  Los snapshots cerrados conservan sus banderas; las quincenas abiertas usan registros reales.
  Comisión final registrada = ya devengada; una cerrada se atribuye al fin de su quincena.
- Guardar un lote no paga. Aprobar y pagar anuales revalidan fuentes; se puede anular antes del pago
  y recalcular conservando historia. Un finiquito confirmado conserva su baja y no puede anularse;
  su pago usa el snapshot y no debita vacaciones nuevamente.
- Motivo obligatorio, confirmación, estado/huella y locks compartidos protegen las escrituras.
  No hay transferencia bancaria automática ni retenciones duplicadas fuera del motor de nómina.
- Constancias por fecha de pago, hasta cinco años, ingresos brutos; excluyen indemnización y
  periodos abiertos. Sin empresa o pagos reales no se genera una constancia vacía.

### Supuestos

- Indemnización sigue la fórmula explícita solicitada: promedio × tiempo. No se añade integración
  automática de alícuotas de aguinaldo/Bono 14 a la base. RH debe validar el régimen aplicable,
  banderas y parámetros antes de uso real; contraste y fuentes oficiales en PRESTACIONES.md.
- Se conserva la convención nominal de FASE 8 y la valoración de vacaciones de FASE 7. Mes completo
  de nómina equivale a uno; parcial usa cantidades/divisor. Años y fracción usan aniversarios reales.
- RRHH debe completar historia salarial y vigencias reales, capturar comisiones definitivas y
  registrar obligaciones pagadas de ciclos anteriores antes de liquidar. No se extrapolan tasas
  de 2026 hacia años anteriores ni se declara pagado un devengado reconstruido.
- Pago único por prestación, año fiscal actual y fecha posterior al último cierre. Fraccionamientos,
  correcciones de pagos históricos, firma electrónica y declaraciones externas no se automatizan.
- Límites operativos: 500 empleados por lote, CSV de hasta 10,000 registros y constancias de cinco
  años. La causa declarada por RH determina indemnización; el software no decide la causa legal.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de FASE 9.
- Continúan revisión legal/operativa por RH (incluida integración de la base de indemnización) y
  HTTPS de producción de fases previas. Siguientes fases únicamente según solicitud.

### Cómo probar

1. `docker compose up --build` aplica V017 sin reemplazar volumen ni credenciales; para HTTP local
   con Node 20: `NODE_ENV=development npm run dev`.
2. RH/ADMIN abre `/prestaciones`, elige Bono 14/aguinaldo y año de cierre; filtra empleado/departamento,
   genera vista previa, corrige errores, guarda con motivo, abre detalle y aprueba.
3. Registra pago real con fecha/referencia/motivo; descarga PDF. Prueba fuente modificada entre
   vista previa/aprobación, reintento de pago, anulación sin pago y filtros/chips/CSV/orden/páginas.
4. En un empleado activo, **Liquidar y dar de baja** abre simulación. Revisa causa, corte, promedio,
   vacaciones y proporcionales; regulariza ciclos anteriores/reservas pendientes. Confirma y verifica
   baja/acceso/kardex; registra pago dentro de la quincena final antes de cerrarla en Planilla.
5. En Constancias selecciona empleado y rango de fechas de pago. Revisa PDF/total y prueba rango
   sin ingresos, fechas futuras o falta de datos de empresa. Reinicia Ayuda también en detalle.
6. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:security`; `npm run verify:prestaciones`; `npm run verify:infra`.
   Oracle con Node 20: construir `nomina2-security-tests` y agregar `-- --docker` al verificador.

## FASE 10 — Portal de gestiones y bandeja de RRHH

Estado: completada el 13/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Motor de solicitudes con routes/controller/service/repository, Zod estricto, Oracle thin, binds,
  CSRF, propiedad derivada de sesión y revalidación del actor en cada transacción. Constancia laboral,
  certificado IGSS, constancia INTECAP, gafete, parqueo y actualización de datos críticos.
- Flujo EN_PROCESO → APROBADA/RECHAZADA; APROBADA → ENTREGADA. Rechazo motivado, historial con
  actor/fecha, confirmaciones, protección contra doble resolución y pendientes duplicadas por tipo.
  Rechazada es terminal; se puede crear otra solicitud corregida. Vacaciones mantiene su servicio.
- Campana compartida y API `/notificaciones`, contador propio, últimos 30 avisos y marcado idempotente
  propio. Nueva solicitud notifica a RH/ADMIN; cada cambio al empleado, con acceso al documento al
  entregar. Conserva los avisos de vacaciones y sus endpoints anteriores.
- Bandeja `/solicitudes` RH/ADMIN con búsqueda, tipo/estado/empleado/fechas combinados, chips,
  limpiar, orden/páginas Oracle, detalle/historial y CSV de toda la consulta hasta 10,000 registros.
  Listados/exportaciones excluyen DPI, NIT y datos críticos propuestos.
- Plantillas RH editables con variables insertables, texto validado, motivo y control de versión.
  Inserta una nueva versión efectiva hoy; no sobrescribe las anteriores ni los PDF aprobados.
- Aprobar documentos genera PDFKit con datos reales de empresa/empleado/salario y plantilla vigente.
  Conserva archivo privado, texto/variables, FK de versión, bytes y SHA-256. Datos faltantes bloquean.
  Vista previa PDF.js con páginas, ampliación, texto accesible y descarga; entrega exige revisión y
  hash vigente, publica los mismos bytes y notifica al empleado. Descarga autenticada verifica hash.
- Parqueo aprobado utiliza `registrarParqueo` de Fase 6: crea un único acuerdo FIJO/VIGENTE vinculado
  a la solicitud, con tarifa/fecha reales de RH y comprobación de relación laboral/cierres/duplicados.
  Las fuentes de Fase 8 lo consumen; conserva el bloqueo de nómina por neto negativo.
- `/mis-gestiones/datos`: contacto del expediente y contacto principal de emergencia editables y
  auditados directamente. Nombres/apellidos/DPI/NIT/estado civil mediante propuesta original/nueva;
  aprobación revalida el original y unicidad antes de aplicar. Rechazo no altera el expediente.
- Portal `/mis-gestiones` con ocho tarjetas, boletas/vacaciones existentes, solicitudes propias,
  estados, historial y PDF entregado. Tarjetas de historial móviles, campos proporcionales,
  máscaras iniciales/saneo, errores por campo, skeletons/error/vacío, toasts e iconos.
- Ayuda declarativa por rol y recorrido independiente de Mis datos. Disponible dentro de los
  diálogos; el proveedor limita los pasos al diálogo activo. Estilos/tokens existentes del mockup.
- V018 aditiva: BLOB de PDF, unicidad de documento vigente y un índice de bandeja; siguen 54 tablas.
  V000–V017 y seeds intactos. README, ERD, DECISIONES y SOLICITUDES.md documentan contratos/operación.

### Validación realizada

- Lint, TypeScript strict, Prettier y git diff --check correctos. Builds de backend/frontend y
  producción Compose con Node 20 correctos. PDF.js 5.5.207 fijado por compatibilidad y auditado;
  npm ci/audit reportan cero vulnerabilidades. Visor cargado diferido por ruta/uso.
- 304 pruebas unitarias aprobadas (196 backend, 108 frontend), también bajo Node 20 en Docker.
  Las 21 nuevas cubren transiciones válidas/inválidas, rechazo/confirmación, schemas estrictos,
  variables faltantes/malformadas, PDF multipágina, permisos UI, preview antes de entrega,
  gafete sin PDF, tarifa/doble envío, máscaras y normalización de DPI/teléfonos antes del envío.
- 98 pruebas Oracle thin/Supertest aprobadas: 72 de regresión, 10 prestaciones y 16 de Fase 10.
  Las 16 nuevas también pasan con Node 20: sesiones/cookies/CSRF reales, propiedad/listados/PDF,
  solicitud→avisos→aprobación concurrente única→PDF→entrega→descarga propia, los tres documentos,
  plantillas/versiones/snapshot inmutable, rechazo terminal, gafete, parqueo en fuentes reales de
  nómina, contacto y datos críticos/expediente modificado, contador/lectura propia y filtros/CSV.
- Triggers de fallo de auditoría prueban rollback real de aprobación/PDF/historial/avisos, entrega,
  descuento de parqueo y actualización crítica. Los efectos se revierten juntos y no se publican
  documentos de una entrega fallida. Esquemas N2SEC eliminados al finalizar.
- db:verify aprueba V000–V018 desde cero, idempotencia, constraints/identities/índices/objetos y
  seeds repetibles. Esquema N2TEST eliminado; tablas/datos de aplicación conservados.
- Navegador integrado con Oracle/API desechables y login real de EMPLEADO/RH: solicitud enviada,
  campana RH con aviso, aprobación, PDF renderizado dentro de la página, entrega y aviso al empleado
  con acceso al mismo documento. Portal/Mis datos a 390 px sin desbordamiento horizontal y sin
  errores JavaScript finales. Arnés, sesiones/cuentas, procesos y esquema temporal retirados.
- PDF Oracle renderizado e inspeccionado; extracción verifica persona, salario Q5,000, fecha,
  datos de empresa y numeración. El iframe nativo no se veía en el navegador integrado: reemplazado
  por visor propio. nginx sirve `.mjs` como JavaScript bajo nosniff; verify:infra comprueba ese asset.
- Compose final Oracle/API/nginx saludable y V018 aplicada sobre el volumen existente. Reejecución
  de migraciones informa cero pendientes; verify:infra aprueba API/Oracle/SPA/assets/worker PDF.

### Decisiones

- Aprobar genera un documento privado; entregar publica exactamente el archivo revisado, sin
  regenerar con datos posteriores. Archivo BLOB, estados, historial, auditoría y avisos comparten
  la transacción; no quedan archivos huérfanos ni entregas parciales.
- La bandeja genérica gestiona seis tipos nuevos. Boletas y vacaciones abren los módulos existentes;
  no se alteran sus reglas ni se adelantan anuncios/eventos o dashboards de próximas fases.
- Contacto modifica el expediente; el correo de acceso de USUARIOS se administra por separado.
  El snapshot original evita sobrescribir correcciones de RH mientras la propuesta espera revisión.
- Los documentos empresariales no realizan trámites externos ni incorporan firma electrónica.
  RH revisa el texto y la vista previa antes de entregar; cada plantilla conserva su historia.

### Supuestos

- Parqueo se cobra como FIJO por quincena según las reglas actuales de Fase 6/8. RH indica la tarifa
  y su inicio y confirma que comunicó el importe al empleado; no existe una tarifa asumida/sembrada.
  Cancelación o modificación posterior usa Novedades y sus protecciones de cierres.
- Gafete, parqueo y actualización de datos tienen entrega manual confirmada, sin PDF. Aprobar datos
  críticos los aplica inmediatamente; entregar registra la comunicación/completitud de esa gestión.
- Las plantillas efectivas hoy se eligen por su mayor versión; edición y aprobación se serializan.
  Solo una solicitud en proceso por empleado/tipo genérico; solicitudes resueltas conservan historia.
- Se usa un contacto principal de emergencia, coherente con Fase 5. No se cambian cuenta bancaria,
  salario o roles desde el portal. Límites: plantilla 20,000 caracteres, CSV 10,000 solicitudes.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de Fase 10.
- RH debe completar datos reales de empresa/representante/afiliación y validar plantillas y tarifas
  antes de emitir/cobrar en operación. Continúan revisión legal y HTTPS de producción de fases previas.
- Próximas fases únicamente según solicitud; no se implementaron anuncios, eventos ni dashboards.

### Cómo probar

1. `docker compose up --build` aplica V018 sin reemplazar volumen/credenciales. Para HTTP local con
   Node 20: `NODE_ENV=development npm run dev`. Completar empresa, empleados y plantillas reales.
2. Empleado abre `/mis-gestiones`, solicita constancia; RH abre `/solicitudes` o el aviso de campana,
   aprueba, revisa/amplía el PDF y **Enviar y entregar documento**. Empleado abre su aviso y descarga.
3. Probar IGSS/INTECAP, rechazo motivado y gafete sin PDF. Editar una plantilla y comprobar que un
   documento ya aprobado conserva su archivo. Combinar filtros/chips/CSV/orden/páginas y Ayuda.
4. Solicitar parqueo; RH indica tarifa/inicio y aprueba. Ver fijo en Novedades y su incorporación
   en nómina; probar duplicado o fecha cerrada. Entrega se confirma después de completar la gestión.
5. En Mis datos guardar contacto y proponer cambio crítico. RH revisa original/nuevo y resuelve;
   probar rechazo y expediente modificado mientras está pendiente. Revisar bitácora y notificaciones.
6. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:security`; `npm run verify:prestaciones`;
   `npm run verify:solicitudes`; `npm run verify:infra`. Node 20/Oracle: construir imagen
   `nomina2-security-tests` y ejecutar `npm run verify:solicitudes -- --docker`.

## FASE 11 — Comunicación y tableros

Estado: completada el 13/10/2026. Siguiente trabajo: esperar instrucciones para la próxima fase.

### Hecho

- Módulo de comunicación con routes/controller/service/repository, Zod estricto, RBAC, CSRF y actor
  revalidado. CRUD RH/ADMIN de anuncios con vigencia y eventos con fecha/hora/lugar, baja lógica
  motivada/confirmada y VERSION para evitar sobrescrituras concurrentes.
- Audiencias todos o varios departamentos/puestos/jefaturas activos, unidas por OR y sin duplicados.
  Visibilidad del empleado resuelta por su sesión y pertenencia actual en Oracle; listado y detalle
  comprueban vigencia/audiencia, incluso con IDs o filtros manipulados. Nunca se acepta un ID propio
  del cliente. Anuncios incluyen ambos días; eventos deben comenzar en el futuro según reloj Oracle
  de Guatemala, fin >= inicio. Eventos iniciados conservan historia y no se editan.
- Publicación/edición, relaciones, avisos y auditoría en una sola transacción. Un aviso por destinatario
  y versión; edición retira avisos anteriores y notifica la nueva versión. Cambio de audiencia y baja
  retiran avisos/acceso anterior. La campana abre anuncios/eventos protegidos y mantiene lectura propia.
- `/comunicacion/anuncios` y `/comunicacion/eventos` con filtros/chips/limpiar, orden/páginas Oracle,
  CSV completo, detalle, formularios proporcionales RHF/Zod y grupos buscables/paginados con nombres.
  Calendario mensual react-day-picker carga el mes completo, muestra eventos de varios días y permite
  crear desde una fecha. Empleados tienen vistas propias `/mis-gestiones/anuncios` y `/eventos`.
- `/rh`: empleados activos, bruto/neto/aportes patronales de quincena actual, pendientes/vacaciones,
  altas/bajas efectivas del mes, distribución por departamento y evolución de últimos seis periodos
  con Recharts, alertas de periodos/contratos, cumpleaños/aniversarios y accesos rápidos.
- `/mis-gestiones`: ocho tarjetas funcionales, saldo propio reutilizando Fase 7, última boleta cerrada
  propia y resúmenes de anuncios vigentes/eventos próximos. La tarjeta elegida abre directamente su
  solicitud; saldo sin vigencias o falta de cálculo se explica sin inventar cifras.
- `/admin`: usuarios activos/registrados por rol, diez sesiones recientes, diez acciones recientes,
  estado real de Oracle, versión de esquema, migraciones incompletas y objetos inválidos. Sesiones
  activas excluyen revocadas/vencidas y usuarios/roles inactivos; no se exponen hashes ni tokens.
- `/admin/bitacora`: filtros por actor/rol/entidad/recurso/acción/IP/fechas, orden/páginas en Oracle,
  detalle anterior/nuevo depurado y CSV de metadatos/motivos. Solo ADMIN puede consultar/exportar.
- Agregaciones agrupadas, EXISTS, snapshots READ ONLY y versión vigente evitan consultas por empleado
  y doble conteo de recalculados. Dinero agregado en Oracle y texto decimal; solo escala de dibujo usa
  Number. Gráficas cargadas diferidas, acceso con teclado y alternativa textual de cifras exactas.
- V019 aditiva: VERSION en anuncios/eventos e índices compuestos de vigencias, agenda, nómina,
  empleados, notificaciones propias, sesiones y bitácora. Siguen 54 tablas; V000–V018 intactas.
- Ayuda declarativa por rol en los tres tableros, comunicaciones/calendario/formulario y bitácora,
  reiniciable también en diálogos. Estados de carga/error/vacío, iconos y toasts existentes.
- README, ERD, DECISIONES y COMUNICACION_TABLEROS.md actualizados; nuevo verify:comunicacion.

### Validación realizada

- Lint, TypeScript strict, Prettier, git diff --check y builds correctos. Producción API/frontend
  construida con Node 20; Compose saludable y V019 aplicada conservando volumen y credenciales.
- 316 pruebas unitarias aprobadas (202 backend, 114 frontend), también bajo Node 20. Las doce nuevas
  cubren fechas imposibles/horas, futuro/minutos, vigencia inclusiva, audiencias/grupos/duplicados,
  lista blanca e identidad, saneo de hora, cifras en cero/faltas de configuración y texto sin HTML.
- 114 pruebas Oracle thin/Supertest aprobadas: 98 de regresión (seguridad, prestaciones, solicitudes)
  y 16 de Fase 11. Estas dieciséis también aprobadas en Docker Node 20: RBAC/CSRF, propiedad,
  audiencias independientes y OR/deduplicación, programación/vencimiento, calendario multiday,
  edición concurrente/versiones, retiro de audiencia, filtros/paginación/CSV, indicadores propios,
  agregación de una sola versión/boleta cerrada, estado ADMIN y bitácora restringida.
- Triggers de fallo verifican rollback de alta/edición/eliminación con relaciones, versiones y avisos.
  Oracle comprueba aniversarios 28/29 de febrero en años bisiestos/no bisiestos, sin desplazamiento
  indebido de un cumpleaños de 28/02 al último día de febrero de otro año.
- db:verify aprueba V000–V019 desde cero, idempotencia, índices/CHECK/FK/identity/objetos y seeds
  repetibles. verify:infra aprueba Oracle/API/nginx, rutas SPA, bundles y worker PDF. Cero cambios
  de credenciales o fixtures en el esquema de aplicación; esquemas temporales eliminados.
- Navegador integrado con API/Oracle desechables: tableros RH/ADMIN/EMPLEADO, creación de evento
  desde calendario, notificaciones, acceso directo a solicitud, filtros/detalle de bitácora y ayuda
  dentro del diálogo. Revisión visual de tarjetas, gráficas, calendario y estilos del mockup.
- Portal y calendario a 390 px, ancho de documento 390 px, sin desbordamiento. Se corrigió el efecto
  del estilo global de tablas sobre react-day-picker, también en los selectores de fecha. Sin errores
  JavaScript finales. El arnés conserva únicamente cookie de sesión de fixture por la limitación del
  navegador integrado; autenticación/cookies/CSRF reales se prueban separadamente con Supertest.
  Arnés, cuentas, procesos, credenciales temporales y esquema de revisión retirados.

### Decisiones

- El PDF tiene 38 pantallas del ERP, sin tableros específicos de nómina. Los tres diseños se derivan
  de páginas 6/29/37 con los tokens existentes: sidebar azul, tarjetas blancas, acciones verdes y
  fondo gris. No se usan nombres/cifras ilustrativas como datos de aplicación.
- Audiencias se consultan por pertenencia actual. Editar emite nueva versión y retira avisos previos;
  la historia completa queda en auditoría. No se reactivan publicaciones eliminadas.
- Tableros leen snapshots y no materializan kardex ni recalculan planillas. Aportes patronales
  mantiene su significado informativo de Fase 8. No existe sustitución por otra quincena si falta la
  actual. Solicitudes pendientes incluye vacaciones y el indicador separado permite priorizarlas.

### Supuestos

- Anuncios programados notifican inmediatamente al guardar, explican que se consultan durante su
  vigencia y aparecen en el portal al comenzar. No se añadió scheduler ni correo/SMS externo.
- Empleados ven eventos próximos/en curso; RH conserva consulta de pasados/eliminados. Audiencia
  todos representa empleados activos con ingreso efectivo; para avisar exige usuario EMPLEADO activo.
- Celebraciones de hoy/próximos 30 días y alertas: hasta 50; comunicaciones resumidas: cinco con
  enlace al listado; sesiones/bitácora reciente: diez. Agenda: hasta 2,000 eventos por mes, con error
  explícito y alternativa del listado al superar el límite. CSV: hasta 10,000 acciones/publicaciones.
- Altas/bajas del mes usan fechas efectivas hasta hoy; contratos vencidos siguen alertando mientras
  el empleado esté activo. Los periodos no cerrados se muestran como provisionales en la evolución.

### Pendientes

- Ningún pendiente técnico del criterio de aceptación de Fase 11.
- Continúan la revisión legal/operativa de parámetros y HTTPS de producción de fases anteriores.
  Próximas fases únicamente según solicitud.

### Cómo probar

1. `docker compose up --build` aplica V019 sin reemplazar volumen/credenciales. Para HTTP local:
   `NODE_ENV=development npm run dev` con Node 20 y los usuarios reales de cada rol.
2. RH abre `/rh`, revisa indicadores/gráficas/alertas/accesos. Publica en `/comunicacion/anuncios`
   para todos y para departamento/puesto/jefatura; prueba vigencias, filtros/chips/CSV y cambios de
   audiencia. Comprueba avisos y acceso del empleado, también con enlace de una audiencia retirada.
3. En `/comunicacion/eventos` elige fecha, crea con hora/lugar y grupos. Prueba hora pasada, fin
   anterior, edición concurrente y eliminación motivada. Cambia de mes/día en calendario.
4. Empleado abre `/mis-gestiones`: revisa saldo/boleta/comunicaciones, abre una tarjeta de solicitud
   y revisa su campana. Abre anuncios/eventos propios; comprobar móvil y Ayuda.
5. ADMIN abre `/admin` y `/admin/bitacora`; combina filtros de actor/rol/entidad/acción/IP/fechas,
   orden/páginas/CSV, compara cambios y repite Ayuda en el detalle. RH/EMPLEADO deben recibir 403.
6. `npm run lint`; `npm test`; `npm run typecheck`; `npm run build`; `npm run format:check`;
   `npm run db:verify`; `npm run verify:security`; `npm run verify:prestaciones`;
   `npm run verify:solicitudes`; `npm run verify:comunicacion`; `npm run verify:infra`.
   Integración Node 20: actualizar `nomina2-security-tests` y agregar `-- --docker`.

## FASE 12 — Cierre del proyecto

Estado: completada el 13/10/2026. Sin pendientes técnicos del criterio de aceptación.

### Hecho

- Releídos AGENTS.md y PROGRESO. Auditoría visual contra páginas 6/29 del mockup y tokens existentes;
  matriz por página/rol, seguridad, fechas y rendimiento documentada en docs/CIERRE.md.
- Revisadas las páginas públicas y autenticadas de ADMIN/RH/EMPLEADO, variantes de cinco novedades,
  13 catálogos, fichas/edición/importación y portal móvil. Ayuda declarativa con rol, secciones,
  filtros, acciones, formatos y errores; incorpora todos los campos visibles, reinicio y diálogos.
  Objetivos DOM acotados al diálogo superior, texto escapado y foco/posición restituidos al salir.
- Corregidos hints/etiquetas, asterisco accesible, roles ARIA, foco blanco en sidebar, salto al
  contenido, cuenta móvil y alturas de ventanas. Bienvenida integrada para no tapar acciones.
  Mis solicitudes muestra filtros propios y estados skeleton/vacío con icono en móvil.
- Usuarios y roles ADMIN conectados a servicios existentes; alta administrativa transaccional,
  confirmación/motivo, último ADMIN protegido y contraseña temporal de una entrega sin Query cache.
  Datos de empresa habilitados como catálogo real para preparar constancias desde la interfaz.
- Validación duplicada de contactos/NIT/formato IGSS; teléfono normalizado, fecha fiscal real,
  pegado de fechas saneado antes de truncar y confirmaciones invalidadas al cambiar datos.
  Corregida colisión de filtro postal/ordenamiento usando direccionTexto en query de catálogos.
- Revisados guards globales/endpoints y propiedad; logs solo conservan plantillas de rutas,
  sin cuerpo, query, cookies, binds ni secretos. Prueba con datos sensibles en URLs/header/cuerpo.
  Verificador de .env privado/historial y firmas de claves/tokens en archivos versionados.
- V020 aditiva: índices de empresa y usuarios. Consulta de usuarios usa predicados presentes y
  orden de lista blanca. Sin cambiar migraciones previas, las 54 tablas de negocio ni snapshots.
- HTTPS local automático con clave en volumen privado, cookies Secure conservadas. Salud Oracle
  espera APP_USER y grants completos; nginx comprueba /api/salud. Build fuerza React de producción
  aunque el .env compartido sea development; bundle principal 396.58 kB, sin elevar límites.
- README final: instalación, variables, usuarios, bootstrap por UI, comandos, pruebas y operación.
  DECISIONES/ERD/FRONTEND/CATALOGOS/SEGURIDAD actualizados y mejoras futuras registradas.

### Validación realizada

- Lint, TypeScript strict (incluido arnés E2E), Prettier, build backend/frontend y revisión de
  diff sin errores; npm audit reporta cero vulnerabilidades. 324 unitarias aprobadas: 206 backend + 118 frontend, también con Node 20 Docker.
- 114 pruebas Oracle thin/Supertest: seguridad 72, prestaciones 10, solicitudes 16 y comunicación 16.
  Cubren RBAC, propiedad, CSRF, fechas, cálculos, concurrencia y rollback de auditoría.
- Playwright: 10 casos aprobados con API/Oracle reales. Login de los tres roles; alta de empleado;
  vacaciones con aprobación/débito; calcular/revisar/aprobar/cerrar quincena; constancia con PDF,
  entrega/descarga; Usuarios/empresa y pruebas de recursos ajenos/roles.
- Matriz E2E: 111 visitas por rol/viewport y 26 formularios de catálogo; hints, ayuda reiniciable,
  foco al cerrar, axe WCAG A/AA, teclado y ausencia de desbordamiento/errores JS. Portal 390 × 844
  revisado en capturas de boletas, solicitudes, datos, vacaciones, anuncios, eventos e inicio.
- db:verify desde esquema vacío: V000–V020, idempotencia, seeds, identities, constraints, objetos
  válidos e índices de FK/filtros. Seis endpoints medidos tres veces: 4–45 ms en fixtures locales.
- verify:clean: docker compose up --build con otro proyecto, claves aleatorias y volúmenes vacíos;
  tres servicios saludables, migraciones/seeds, HTTPS, login inicial, cambio obligatorio y recarga
  con sesión Secure. Se retiraron exclusivamente recursos/esquemas de aceptación.
- Composición habitual reconstruida y verify:infra aprobado: Oracle thin/API/nginx, SPA, assets y
  worker PDF con MIME correcto. Se conservaron volumen y credenciales existentes.

### Decisiones

- Usuarios y empresa completan caminos ya previstos, necesarios para operar una instalación vacía
  sin SQL manual. Solo ADMIN crea accesos administrativos; los empleados se generan desde expediente.
- El certificado autofirmado local permite reproducir sesiones Secure. Dominio/certificado público
  se configura al desplegar. El verificador admite certificado local únicamente en loopback.
- Esquemas N2E2E/N2SEC/N2TEST y proyecto Compose de aceptación son desechables. No se graban trazas
  ni videos con credenciales. No hay respuestas simuladas en E2E ni datos ficticios en la aplicación.
- La aceptación encontró carrera de healthcheck Oracle/APP_USER y agotamiento del disco Docker.
  Se corrigió la espera y se retiraron únicamente imágenes nomina2 sin uso y caché reconstruible;
  no se borraron volúmenes de trabajo ni recursos de otros proyectos.

### Supuestos

- Chromium es el navegador automatizado; axe complementa la revisión de teclado/visual.
- Latencias con pocos fixtures comprueban regresiones locales; no constituyen una prueba de carga.
  B-tree no evita necesariamente recorridos de búsquedas INSTR; evaluar planes con volumen real.
- Referencias legales y feriados de 2026 requieren validación operativa por RH antes de uso real.

### Pendientes y mejoras futuras

- Ningún pendiente técnico del cierre. RH valida parámetros/documentos y completa datos reales.
- Para operación: certificado público/renovación, respaldo/restauración Oracle probado, monitoreo,
  calendarios futuros y capacidad de almacenamiento. Ver lista detallada en DECISIONES.md.
- Según crecimiento: rate limit/CSRF previo compartidos entre réplicas, pruebas de carga/planes,
  Oracle Text y cobertura Firefox/WebKit. Integraciones externas únicamente si se solicitan.

### Cómo probar

1. Copiar .env.example a .env y configurar claves propias. docker compose up --build; abrir
   https://localhost:8443/login, aceptar/confiar el certificado local y cambiar la clave inicial.
2. Crear RH desde Usuarios; completar Datos de empresa/organización/horarios y crear empleados.
   Probar flujos de vacaciones, planilla y documentos con las cuentas reales de cada rol.
3. Node 20.19+ y npm ci; npx playwright install chromium. npm run verify:all ejecuta calidad,
   migraciones, cuatro suites Oracle, E2E, infraestructura y aceptación limpia en secuencia.
4. Comandos individuales y requisitos de espacio/RAM en README. Suites Oracle también admiten
   -- --docker con imagen nomina2-security-tests. Reportes/capturas locales quedan ignorados.

### Corrección posterior al cierre — confianza HTTPS local

- Reportado bloqueo del navegador por certificado autofirmado. Servicios saludables; certificado
  con SAN localhost/127.0.0.1 y vigencia correcta, pero sin confianza en el llavero del equipo.
- Añadido npm run tls:trust para macOS: obtiene únicamente el certificado público de nomina2-web,
  verifica firma/identidad/vigencia y solicita registro del certificado de servidor en el llavero
  del usuario, únicamente para SSL. Sin sudo, sin modificar las cookies Secure ni desactivar validación del navegador.
- Certificado local con basicConstraints CA:FALSE, keyUsage de servidor y extendedKeyUsage
  serverAuth. Migra el certificado antiguo sin cambiar la clave privada ni tocar Oracle.
- Chromium omite entradas macOS con Policy String; se confía en el certificado de servidor exacto,
  cuyo SAN solo incluye localhost/127.0.0.1. Nunca se instala una CA genérica.
- README explica el paso de confianza, la autorización que puede pedir macOS y la reapertura de
  la pestaña. Otros equipos deben confiar en su propia instalación; producción usa certificado público.
- Confianza verificada con security verify-cert y curl nativo sin omitir validación TLS (HTTP 200).
  Login abierto en navegador integrado sin advertencia de certificado. Retirada la entrada anterior
  del llavero mediante huella exacta; se conserva únicamente el nuevo certificado de servidor.
- Lint, TypeScript, formato y las 324 unitarias aprobados. Emisión nueva, idempotencia y migración
  del certificado CA antiguo comprobadas en contenedor efímero; clave privada conservada.
- Supuesto: confianza local por equipo/usuario; si el navegador conserva el error anterior, cerrar
  y volver a abrir la pestaña. Pendiente operativo de producción: certificado público con renovación.

# Progreso de nomina2

Estado actual: FASE 3 completada. Los registros de FASES 0–2 se conservan como historial; consultar
la sección FASE 3 al final para el estado y las instrucciones de continuación.

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

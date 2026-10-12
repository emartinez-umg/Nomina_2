# Progreso de nomina2

Estado actual: FASE 1 completada. El registro de FASE 0 se conserva como historial; consultar la
sección FASE 1 al final para el estado y las instrucciones de continuación.

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

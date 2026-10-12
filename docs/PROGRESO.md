# Progreso de nomina2

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

# Decisiones — FASE 0

## Infraestructura y aplicación

- npm workspaces mantiene un solo lockfile; Node.js 20 en las imágenes y `.nvmrc`.
- Oracle XE 21c en `gvenzl/oracle-xe:21-slim`, volumen persistente, plataforma amd64,
  healthcheck y usuario dedicado creados por la imagen. No se sustituye XE por Oracle Free.
- Express 5 propaga promesas rechazadas al middleware central. Zod valida configuración y query.
- node-oracledb 6.10 usa thin por defecto y se comprueba el modo al crear el pool. No se llama
  `initOracleClient`. Referencia: [documentación del driver](https://node-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html).
- HTTP arranca después de comprobar Oracle. El entrypoint de Docker aplica migraciones antes
  del servidor y conserva SIGTERM mediante `exec`; el pool tiene cierre ordenado y timeouts.
- nginx sirve el build React, resuelve la API con DNS de Docker y aplica fallback para React Router.
  En desarrollo Vite usa proxy. Esto permite `/api` relativo y evita exponer credenciales al navegador.
- React 18, Router 7, TanStack Query, Tailwind 4, lucide-react y driver.js se usan en la página técnica.
  No se construyen formularios, sesiones, RBAC, nómina, calendarios, gráficas ni PDFs de negocio.
- Vitest 4 mantiene compatibilidad con Node 20; Vitest 5 requiere Node 22. Se seleccionan versiones
  corregidas de Router y Tailwind después de revisar la auditoría inicial.

## Migraciones

- Orden numérico, checksum SHA-256 y registro persistente en `VERSION_ESQUEMA`.
- Las migraciones SQL son archivos confiables versionados; los valores del historial usan binds.
- Delimitador SQL*Plus `/` aislado por sentencia, sin dividir por `;` para preservar PL/SQL y literales.
- Una migración DDL puede dejar objetos confirmados antes de fallar. El estado previo `APLICANDO`
  y el estado `FALLIDA` impiden reintentos automáticos sobre un esquema parcialmente modificado.
- Un runner a la vez. Se rechazan versiones retroactivas, duplicadas y archivos aplicados modificados.
- Sin seeds de negocio ni credenciales ADMIN de aplicación en esta fase.

## Tokens del mockup

Fuente: `docs/MOCKUP/mockup.pdf`, páginas de inicio de sesión inspeccionadas visualmente.
La página de salud no aparece en el PDF y se deriva de su paleta y controles.

| Token              | Valor                                 | Criterio                       |
| ------------------ | ------------------------------------- | ------------------------------ |
| Marca              | `#1f3a60`                             | Azul oscuro de títulos         |
| Primario           | `#2b622a`                             | Verde de acciones              |
| Acento             | `#2e245b`                             | Morado del símbolo             |
| Fondo / superficie | `#f5f5f5` / `#ffffff`                 | Fondos claros                  |
| Texto / secundario | `#1a1a1a` / `#5f5f5f`                 | Texto principal y secundario   |
| Borde              | `#d1d1d1`                             | Separadores suaves             |
| Radios             | 16 px / 12 px / píldora               | Tarjetas / controles / botones |
| Sombra             | 0 8 px 24 px, negro 12 %              | Elevación de tarjetas          |
| Espaciado          | Base 4 px; campo 16 px, sección 32 px | Ritmo aproximado del PDF       |
| Tipografía         | Trebuchet MS, Arial, sans-serif       | Aproximación de sistema        |

El PDF exporta el nombre de fuente como `unknown`; no se puede asegurar una familia exacta.
Paleta y medidas son aproximaciones visuales documentadas, ajustadas para texto legible.
Todos los valores se concentran en `frontend/src/styles/tokens/index.ts` y Tailwind los consume.

## FASE 1 — Base de datos completa

- 53 tablas de negocio en V001–V012; V000 se conserva sin cambiar su checksum. La documentación
  de FASE 0 anterior es histórica y se complementa con estas decisiones.
- Auditoría común mediante IDs FK a USUARIOS; NULL representa instalación/proceso del sistema.
  Fecha de creación y triggers de modificación usan explícitamente America/Guatemala.
- BITACORA_AUDITORIA es inmutable; las correcciones crean nuevos eventos. Los servicios posteriores
  escribirán cambios depurados dentro de la misma transacción de negocio.
- Salario y horario provienen de historiales con vigencia; no se duplican en EMPLEADOS. La nómina
  versiona cálculos y conserva banderas, parámetros, datos del empleado y proyección ISR.
- Se añaden bancos, centros de trabajo, configuración de empresa, deducciones ISR, aplicaciones de
  descuento, detalle de prestación y filas de importación para cubrir los flujos sin campos libres.
- FKs compuestos impiden mezclar departamento/puesto, empleados, salarios, periodos y documentos.
  UNIQUE condicionales evitan colisiones indeseadas de claves compuestas con NULL en Oracle.
- La lista blanca inicial de filtros vive en db/filtros.json; db:verify inspecciona índices reales
  de cada campo y de la totalidad de columnas de cada FK.
- Seeds aditivos con MERGE, una transacción y binds para credenciales; no sobrescriben ediciones ni
  restablecen contraseñas. El usuario ADMIN existente con otro rol causa rollback sin elevación.
- argon2 se fija a la rama 0.44 para Node 20. La rama 0.45
  [dejó de soportar Node 20](https://github.com/ranisalt/node-argon2/releases/tag/v0.45.0).
- El calendario 2026 guarda descanso efectivo 29/06 y conmemoración 30/06, dos medios días desde
  las 12:00 y el feriado capitalino separado por localidad. Las fuentes oficiales están en ERD.md.
- Validaciones que consultan otras filas, fechas actuales y permisos se implementarán en servicios
  de fases posteriores, con bloqueos/transacciones. La fase 1 no agrega autenticación ni cálculos.
- Prueba de aceptación reproducible con esquema N2TEST_* aislado: verifica DDL, seeds, índices,
  restricciones y rollback; se elimina al finalizar y conserva el esquema de aplicación.

## FASE 2 — Seguridad del backend (RF-18)

- Se reutilizan los esquemas V001/V003/V012: sesiones persistentes con hashes SHA-256 de secretos
  aleatorios de 256 bits, Argon2id y cookies httpOnly/Strict; Secure siempre en producción.
- CSRF también en login mediante doble envío firmado y temporal; para sesiones autenticadas se
  contrasta el header con su hash en Oracle. GET de recuperación exige las cookies de esa sesión.
- Cambio obligatorio global antes de los routers de negocio, RBAC explícito y helper de propiedad
  basado en usuario propietario obtenido desde Oracle; salud sigue pública por healthchecks.
- Bloqueo persistente de 15 min tras 5 fallos con bloqueo de fila. El error HTTP se produce después
  de confirmar contador/bitácora para que un rollback no borre intentos fallidos.
- Operaciones ADMIN y altas internas se serializan por la fila del rol ADMIN: evita eliminar al
  último administrador y colisiones de sufijos. Los permisos se revalidan dentro de las escrituras.
- Cambios de credenciales/rol/estado revocan sesiones en la misma transacción que la auditoría.
  Cambiar contraseña propia genera una sesión nueva; el restablecimiento muestra el secreto una vez.
- Auditoría reutilizable con la conexión del servicio y depuración recursiva, sin commits propios.
- Rate limit por IP en memoria de una API; `TRUST_PROXY_CIDRS` explícito, sin confiar por defecto en
  headers reenviados. Escalado a varias réplicas requiere almacenamiento/clave previa compartidos.
- Integración Supertest contra un esquema Oracle N2SEC desechable, sin tocar datos de aplicación;
  inyección real de fallo de auditoría verifica rollback. No se adelantan pantallas ni CRUD de empleados.

## FASE 3 — Frontend y autenticación visual

- Las 38 páginas del mockup se revisan antes de implementar. Se refina el muestreo de paleta
  (marca #1d395e, primario #28622a y fondo #f4f4f4) y se extrae su emblema. La fuente sigue siendo
  una aproximación de sistema; no se incorpora una familia externa sin referencia comprobable.
- El login usa usuario para respetar la API existente. Google/recordarme/registro no tienen
  soporte en FASE 2 y no se presentan como acciones disponibles. Marca neutra Nómina hasta
  que exista configuración de empresa. Detalles visuales y contratos en FRONTEND.md.
- Guards de cliente complementan los del servidor. La identidad viene de /auth/sesion;
  el token CSRF permanece en memoria y las cookies son del servidor. No hay polling que
  mantenga viva una sesión inactiva ni repetición automática de escrituras.
- Los módulos futuros quedan deshabilitados con explicación, sin estadísticas, contadores
  ni empleados inventados. La búsqueda superior filtra secciones, no datos privados.
- DateField usa react-day-picker con límites y restricciones recibidas; las reglas de negocio
  futuras obtendrán horarios, feriados y periodos reales de la API. MoneyField usa Decimal.
- UI controlada y Table con callbacks de paginación/orden en servidor. React Hook Form + Zod
  en autenticación; errores del backend solo se asignan a campos expresamente permitidos.
- El recorrido se ofrece en primera visita y se puede reiniciar. Únicamente esa preferencia
  se guarda en localStorage, separada por página y rol.

## FASE 4 — Catálogos y parametrización

- Se reutilizan tokens/componentes de fase 3 y el lenguaje visual de las páginas 7–8 del mockup.
  Un módulo declarativo permite formularios y filtros por sus campos, conservando capas
  routes/controller/service/repository y validación Zod estricta en cada endpoint.
- Oracle conserva rangos monetarios NUMBER(12,2); API usa texto decimal, validación Decimal y
  TO_NUMBER/TO_CHAR con NLS explícito. No se implementa cálculo de nómina de futuras fases.
- Bajas lógicas por defecto; física solo ADMIN con motivo/confirmación. Cualquier FK impide eliminar
  y la alternativa es desactivar. Las referencias inactivas no sirven para nuevas asignaciones.
- Las vigencias legales tienen extremos inclusivos. Versionar termina la anterior el día previo,
  sin extender una vigencia ya terminada. No se reescriben versiones utilizadas/cerradas;
  una corrección del mismo inicio requiere que ningún cierre ni snapshot resulte afectado.
- Las nuevas vigencias deben superar el último cierre, además de no traslapar versiones; es una
  validación conservadora que protege cambios iniciados antes de un periodo cerrado.
- Las escrituras de catálogos se serializan con la fila de administración, siguiendo el orden de
  locks de usuarios. Las legales bloquean PERIODOS_NOMINA durante la comprobación. Auditoría
  y cambios, incluido fin de versión anterior, se confirman/revierten juntos.
- La jornada pertenece al patrón semanal y cada día tiene su propia distribución.
  Días/jornada de un horario asignado se mantienen; un nuevo patrón permite cambios futuros.
- El jefe responsable puede quedar pendiente hasta cargar empleados reales en fase 5. Al
  asignarlo debe estar activo y pertenecer al departamento de la jefatura.

## FASE 5 — Expedientes e importación

- Banco y centro de trabajo se habilitan en el CRUD declarativo: el alta no depende de SQL manual ni seeds ficticios.
- Una sola transacción para empleado/contacto/salario/horario/usuario/auditoría; la misma exclusión de catálogos
  y administración serializa altas, nombres de usuario y salarios. Revalidación del actor dentro de la transacción.
- Ingreso inmutable tras alta; cambios salariales y horarios anexan vigencias posteriores al último cambio
  y al último cierre. Asignaciones laborales con cierres se conservan, sin implementar nómina futura.
- Carga CSV limitada a 100 filas/1 MB. Vista previa persistida por actor, revalidación al confirmar,
  modos todo o nada/solo válidas y atomicidad de todas las filas elegidas; no se reimporta la misma carga.
- Credenciales de una sola entrega, solo memoria del componente y sin caché; reporte durable sin claves.
- SALARIO_MINIMO_MENSUAL (QUETZALES) lo configura RH según categoría y vigencia. Ausencia produce aviso;
  no se agrega un importe supuesto. Las edades provienen de los parámetros vigentes en Oracle.

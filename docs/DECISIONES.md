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

## FASE 6 — Novedades para planilla

- Módulo único con cinco recursos, capas estrictas, schemas por recurso, listas blancas y Oracle thin.
  Préstamos se exponen por el ID del acuerdo de descuento; PRESTAMOS solo agrega capital/desembolso/referencia.
- Cuotas en centavos enteros y último residuo; sin interés porque no se pidió un esquema de tasas.
  La primera cuota no es pasada; fechas de vencimiento son fin de quincena. Capturar no realiza cobros.
- Valoración de horas por salario y parámetros vigentes a la fecha; redondeo compartido half-up al final.
  Jornada se captura explícitamente. Fase 8 guardará snapshots y calculará el neto/prorrateo.
- Comisión/horas crean únicamente la quincena ABIERTO ausente. No se adelanta el flujo de planilla.
- Rango anterior y nuevo protegidos contra cierres; novedades consumidas y cuotas pagadas son inmutables.
  Mismo orden de locks de administración/catálogos y bloqueo SHARE de periodos, con actor revalidado.
- Ausencias usan días calendario y traslapes inclusivos contra ausencias y vacaciones vigentes.
  Respaldo privado en BLOB de la misma fila, firma/tamaño/base64 comprobados y hash en auditoría.
- Código/efecto de tipos ya utilizados se conservan; crear otro tipo mantiene las novedades históricas.
- RF-21 reutiliza los CRUD de configuración existentes. La UI reutiliza tokens, iconos y componentes
  del mockup; filtros, estados y formularios consumen exclusivamente la API real.
- registrarCobroCuota es una primitiva interna transaccional para Fase 8; genera aplicación y
  liquida automáticamente en cero. No se expone cobro manual ni se consume por reloj/calendario.

## FASE 7 — Vacaciones

- Acumulación por aniversarios mensuales cumplidos del ingreso, ajustando el día al fin del mes
  cuando corresponda. La tasa vigente proviene de PARAMETROS_LEGALES; los movimientos materializados
  conservan su snapshot y clave idempotente. No se estima saldo futuro al solicitar.
- Historia previa por débito TOMADAS con referencia/motivo o apertura disponible certificada hoy.
  La apertura se permite una sola vez antes de ajustes/disfrutes; conserva los aniversarios del ingreso.
  Sin tasa histórica ni apertura se bloquea con un mensaje de configuración, sin inventar valores.
- Calendario inclusivo por asignación vigente del empleado y feriados nacionales/locales efectivos.
  Inicio/fin deben ser laborales; descansos/feriados interiores no consumen días. Todo traslape con
  ausencias, vacaciones vigentes o cierres bloquea, incluidos los días interiores del rango.
- Pendientes no reservan saldo. Aprobar lo revalida y registra DISFRUTE con fecha de aprobación,
  reservando inmediatamente y una sola vez. Locks compatibles con fases anteriores serializan
  aprobaciones, cambios de horario/feriados, cargas previas y ausencias; actor revalidado en transacción.
- SOLICITUDES/SOLICITUD_HISTORIAL conservan el flujo asociado a vacaciones. Notificaciones internas,
  actualización de estados, kardex y auditoría comparten commit/rollback. La campana consulta la API.
- prepararVacacionesFiniquito valora días pendientes × salario vigente / SALARIO_DIAS_MES, con Decimal
  y redondeo único. Fase 9 comparte conexión/transacción y realizará pago/consumo; se bloquea la
  valoración con movimientos o reservas posteriores al corte para evitar liquidaciones incorrectas.
- V015 es aditiva y mantiene las 53 tablas. UI derivada del mockup con componentes/tokens existentes,
  calendario react-day-picker, semáforo accesible, filtros/CSV y ayuda por rol; sin datos simulados.

## FASE 8 — Motor quincenal y cierre

- Se reutiliza V007 y se añade V016 para huella de fuentes, alertas, configuración IGSS y apertura
  fiscal; las migraciones anteriores permanecen inmutables. La apertura evita inventar acumulados
  al implantar el sistema a mitad del ejercicio. S005 incorpora devolución del ISR en exceso.
- Se guardan todas las versiones; calcular no cobra. Cerrar aplica cuotas/fijos y audita en una sola
  transacción. Reabrir revierte aplicaciones y exige nuevo cálculo. Locks compatibles con las fases
  anteriores, actor revalidado y control de versión impiden cobros dobles y aprobaciones obsoletas.
- Se compara SHA-256 de la fuente antes de revisar/aprobar/cerrar. Devolver a revisión permite
  corregir un aprobado cuyas fuentes cambiaron. Cierres posteriores bloquean reaperturas anteriores.
- Los parámetros, salarios y banderas se evalúan por fecha/segmento y también durante proyección
  futura. Líneas redondeadas, snapshots de entrada/resultado y versión del motor permiten reproducción.
- La quincena completa equivale a media mensualidad incluso en febrero/meses de 31 días; parciales
  usan días calendario con tope quincenal. Ausencias descuentan días laborales/feriados efectivos.
- El ISR usa reales acumulados + proyección de salario/bonificación restante, topes agrupados por
  tipo y escala continua. El periodo final ajusta retención y reintegra el exceso como ingreso exento.
- XLSX se escribe como OOXML con fflate y celdas monetarias numéricas sin conversión flotante; PDFKit
  produce documentos paginados. Exportaciones usan lectura Oracle consistente. La bitácora usa
  binds CLOB explícitos para configuraciones grandes.
- El formato IGSS 2.2.0 conserva estructura oficial y parametriza datos patronales/centros/tipos y
  asignaciones. Exige mes completo cerrado y datos reales; nunca inventa afiliación o apellidos.
  Las boletas del empleado están limitadas por propiedad y cierre, con tarjetas móviles.
- Prestaciones/finiquitos se consumirán según FASE 9: esta fase solo incorpora sus pagos ya
  registrados al tratamiento exento del ISR; no adelanta su cálculo o interfaz.

## FASE 9 — Prestaciones y finiquito

- Devengado y pagado tienen fuentes distintas: los promedios pueden usar salarios/novedades
  reales de quincenas no cerradas; las constancias solo acreditan pagos registrados. Se reutiliza
  el motor y las cantidades nominales de FASE 8 para no cambiar reglas de prorrateo entre módulos.
- Vista masiva y simulación devuelven huella; guardar/aprobar/pagar revalidan fuentes de anuales.
  El finiquito confirmado conserva snapshot y baja, y su pago no vuelve a valorar un saldo ya debitado.
  La auditoría y todos los efectos forman una transacción; no hay transferencia bancaria automática.
- La fórmula de indemnización sigue el RF-12 solicitado. La revisión de integración legal de
  alícuotas y el tratamiento operativo de obligaciones históricas se documentan en PRESTACIONES.md.
- RF-17 usa fecha de pago y documentos PDFKit paginados. El pie se escribe con margen inferior
  temporal cero para evitar que PDFKit cree una página vacía al numerar fuera del área de texto.
- V017 es aditiva y reemplaza la unicidad de ciclo por un índice condicional que conserva anulados.
  Los pagos conservan exenciones por componente y nómina consume solo la base gravada congelada.

## FASE 10 — Solicitudes, documentos y autogestión

- Reutilizar tablas de FASE 1 y la campana de FASE 7; API genérica `/notificaciones` compatible con
  avisos de vacaciones. Las vacaciones mantienen su motor y la bandeja genérica excluye ese tipo.
- Aprobar un documento crea su archivo/snapshots privados; entregar publica esos mismos bytes.
  BLOB Oracle permite rollback real junto con estados, historial y avisos, sin archivos huérfanos.
- Plantillas insertan nuevas versiones efectivas hoy; la selección toma la mayor versión vigente.
  Rechazada es terminal. La entrega solo sale de APROBADA y requiere confirmar el PDF vigente.
- Parqueo usa una primitiva interna de Fase 6 y el acuerdo FIJO consumido por Fase 8. Tarifa real
  confirmada por RH; no se asume monto. Alta, resolución, auditoría y avisos son atómicos.
- Contacto del expediente es autogestionable; correo de acceso sigue administrándose por separado.
  Los datos críticos requieren solicitud y comprobación del snapshot original para no sobrescribir
  correcciones de RH hechas mientras la solicitud estaba pendiente.
- PDF.js 5.5.207 fijado conserva Node 20.19, está fuera del rango afectado por
  [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j) y `npm audit` no reporta avisos.
  Renderiza dentro del portal porque el navegador integrado no muestra PDFs nativos en iframe.
  Solo usa bytes generados por el servidor; no carga recursos externos ni ejecuta expresiones.

## Fase 11 — Comunicación y tableros

- Los dashboards de nómina se derivan del lenguaje visual de MOCKUP (páginas 6/29/37); el PDF no
  contiene esas tres pantallas específicas. Se reutilizan tokens, componentes y recorridos por rol.
- Audiencias por pertenencia actual y unión OR. Publicar/editar notifica inmediatamente, incluidos
  anuncios programados cuya visibilidad comienza en su vigencia. Sin scheduler ni mensajería externa.
- VERSION y transacción única protegen edición/audiencias/avisos/auditoría. Edición retira avisos
  anteriores; eliminación lógica exige motivo y confirmación. No se reactivan publicaciones retiradas.
- Dashboard no materializa vacaciones ni recalcula nóminas: lee fuentes reales en snapshot Oracle,
  conserva importes decimales y muestra faltas de configuración/cálculo. Aportes patronales mantiene
  el significado informativo de Fase 8. Recharts solo convierte la escala de dibujo a Number.
- Calendario consulta el mes completo, separado del listado paginado; tope explícito de 2,000 eventos.
  Celebraciones/alertas: 50; resúmenes de comunicaciones: cinco y enlace al listado completo;
  sesiones/bitácora reciente: diez; exportaciones: 10,000. Sin datos falsos en pantallas.

## FASE 12 — Cierre, aceptación y operación

- Completar Usuarios y Datos de empresa conecta servicios/tablas ya existentes y permite preparar
  una instalación vacía desde la interfaz. Solo ADMIN crea accesos administrativos; EMPLEADO se
  genera desde el expediente. Alta, hash temporal y auditoría comparten transacción. Los secretos
  aparecen una sola vez en memoria; listados/CSV no los contienen.
- El recorrido conserva definiciones declarativas por módulo y agrega orientación de formato y
  errores de los campos visibles. Los objetivos son elementos del contexto activo, nunca selectores
  globales ambiguos. Se escapa HTML y se ofrece ayuda en todos los diálogos. Desde R2-2 el recorrido
  solo se inicia al pulsar Ayuda: se retiraron todas las ofertas automáticas y sus banderas.
- Compose sirve HTTPS local con certificado generado y volumen privado; conserva cookies Secure.
  Salud Oracle espera además la existencia del usuario de aplicación y sus grants, porque el
  healthcheck oficial puede aprobar cuando XEPDB1 abre y APP_USER todavía no está creado. nginx
  comprueba /api/salud para evitar seguir redirecciones hacia puertos externos al contenedor.
- La aceptación limpia usa un proyecto Compose distinto, env temporal con permisos 0600, puertos
  libres, Oracle y volúmenes nuevos. Comprueba primer login/cambio obligatorio y luego retira solo
  sus recursos. Los verificadores de regresión y E2E usan esquemas desechables sin modificar usuarios
  ni credenciales de aplicación. Las trazas/videos quedan apagados para evitar persistir secretos.
- V020 es aditiva; índices de empresa y consulta de usuarios, sin cambiar las 54 tablas de negocio
  ni checksums anteriores. SQL de usuarios usa predicados presentes y orden estático de lista blanca.
  INSTR sigue siendo búsqueda parcial; B-tree no garantiza evitar recorridos de texto.
- Los logs registran plantilla de ruta y un marcador para desconocidas, impidiendo que la URL
  arbitraria filtre DPI/NIT. Continúan depuración de auditoría, ausencia de cuerpos/binds y mensajes
  internos, RBAC global, comprobaciones de propiedad y CSRF de escrituras.

- El build del frontend impone NODE_ENV=production aunque el .env compartido sea de desarrollo.
  Evita incluir React de desarrollo en el artefacto y conserva carga diferida de módulos grandes.
- Al terminar ayuda se restaura foco y posición originales. En móvil, Mis solicitudes elimina la
  búsqueda de empleados y conserva filtros de gestiones propias, skeletons y vacío orientativo.

### Pendientes operativos y mejoras futuras

1. RH valida referencias legales, vigencias y documentos antes de nómina real; completar empresa,
   organización e historia certificada. Preparar calendarios posteriores a 2026.
2. Producción: certificado válido con renovación, backups Oracle verificados y restauración ensayada,
   monitoreo, almacenamiento y acceso de red restringido. Configurar proxies confiables exclusivos.
3. Para varias réplicas: compartir contador de login y clave CSRF previa; probar concurrencia de carga.
4. Con datos reales: estadísticas/planes y presupuesto de latencia, Oracle Text o prefijos si crece
   la búsqueda, paginación por cursor si se requiere. Ampliar compatibilidad automatizada a WebKit/Firefox.
5. Fuera del alcance actual: firma electrónica, antimalware, mensajería externa y trámites SAT/IGSS;
   ninguna pantalla anuncia estas integraciones como operativas.

Se reserva `direccion` de query para el orden asc/desc; dirección postal usa `direccionTexto` en
catálogos. La captura conserva su nombre de dominio `direccion`. La separación corrige listados
vacíos al ordenar centros/empresa y evita ampliar la lista blanca del sentido de ordenamiento.

### Confianza HTTPS local en macOS

El certificado local es autofirmado de servidor, con CA:FALSE y serverAuth. npm run tls:trust verifica
la firma, fechas y SAN exacto antes de registrarlo únicamente para SSL en el llavero del usuario.
No instala una autoridad certificadora ni modifica la validación TLS de los navegadores. Una entrada
macOS con Policy String no sirve en Chromium: su [implementación de confianza](https://chromium.googlesource.com/chromium/src/+/main/net/cert/internal/trust_store_mac.cc)
la omite. La restricción está en la identidad y naturaleza del certificado de servidor exacto.

## v1 — Automatización y cierre V1-12

Las decisiones siguientes sustituyen sus equivalentes quincenales/manuales de v0. Los detalles,
referencias y resultados por fase están en [PROGRESO_V1.md](PROGRESO_V1.md).

- Navegación horizontal y paleta comparten `navigation.config.ts`; roles y rutas del servidor siguen
  siendo la autoridad. Sinónimos, tolerancia a errores y cinco recientes solo buscan destinos,
  nunca expedientes. Menú, paleta y diálogos conservan teclado, foco y comportamiento móvil.
- Borradores locales por usuario/formulario/registro y versión, con restauración explícita y debounce
  de 500 ms. Se eliminan al guardar, descartar o cerrar sesión; otra cuenta purga los ajenos.
  La expiración conserva el borrador propio. Contraseñas, tokens, credenciales, archivos y resultados
  derivados quedan excluidos recursivamente. No se sincronizan con Oracle.
- Oracle asigna códigos con locks de contadores y reservas únicas dentro de la transacción de negocio;
  una vista previa no reserva. Códigos de empleado por departamento y transacciones por año nunca
  cambian; las claves anteriores y semánticas legales se conservan separadas.
- Geografía: archivo oficial INE versionado con huella, 22 departamentos y 340 municipios. Las
  coincidencias históricas solo se proponen; no se inventan direcciones, sexo, parentescos ni vehículos.
  Los datos anteriores se archivan y RH completa los campos pendientes al editar.
- Empresa y logo privado en Oracle. SVG se valida y normaliza a PNG sin contenido activo ni recursos
  externos. PDF compartido con membrete y firma de la ficha/puesto del aprobador. Las boletas v1
  archivan bytes y SHA-256; credenciales/PDF temporal solo viven en la respuesta original y memoria.
  Sin empresa completa o firmante verificable se bloquea la operación con una explicación.
- Horarios por bloques semanales, selectores de media hora, descanso y cruce de medianoche explícitos.
  Jornada y límites diarios/semanales se derivan; vacaciones y HE usan la asignación vigente real.
  La migración mantiene minutos históricos exactos, incluidos patrones que requieren revisión.
- Empleado, usuario, hash argon2id, contacto, salario, horario, código y auditoría se confirman juntos.
  La contraseña aparece una vez y exige cambio inicial; perderla requiere restablecimiento. NIT
  módulo 11, residencia, parentesco y contrato condicional se validan en ambas capas.
- Vacaciones: meses completos × tasa vigente al corte, sin materializar movimientos al consultar.
  Disponible conserva decimales; solicitables es su piso. Cancelar una aprobación futura devuelve
  exactamente su débito original. El finiquito sí liquida el remanente decimal.
- Novedades mensuales antes del pago; HE admite medias horas y tope de advertencia configurable.
  Parqueo cobra el mes completo desde aprobación hasta baja/suspensión, sin prorratear. Una novedad
  aplicada o afectada por cierre queda protegida. Las referencias v0 repetidas se conservan mediante
  la reparación acotada V027/V028, sin editar los archivos anteriores.
- Anticipo = mitad de SB + BI ajustada + COM/HE cargadas, sin deducciones; Pago liquida devengado
  mensual menos anticipo real, IGSS, ISR y descuentos. BI sigue literalmente A11; SB se prorratea.
  Simular no escribe; confirmar revalida fuentes y guarda pago/boletas/aplicaciones/avisos/auditoría
  de forma atómica y única por empleado/mes/tipo. El cierre no vuelve a cobrar. ADMIN revierte
  antes del cierre y respetando dependencias; una reapertura mantiene pagos para reversión explícita.
- Cuotas v0 se espacian mensualmente conservando capital, saldo, importe y número; vencimientos/fin
  anteriores se archivan. Los motores v0/v1 no se mezclan dentro de un periodo con resultados.
- A12 calcula Bono 14/Aguinaldo con promedios de fuentes reales y días inclusivos / divisor anual
  parametrizado, tope 100 %. Normaliza meses parciales sin doble prorrateo. ISR usa el excedente
  gravado una sola vez. Indemnización conserva promedio de seis meses × años/fracción solicitado;
  no añade alícuotas fuera del alcance. Los pagos no realizan transferencias bancarias.
- Las opciones de Prestaciones cambian de color sin interpolación: animar texto y fondo a la vez
  producía contraste insuficiente durante la transición. Su ayuda explica las tres gestiones.
- El cierre verifica todos los pasos visibles de ayuda, incluyendo los controles comunes. Cerrar
  durante la animación de driver.js también restaura el foco. Los días de calendarios son celdas
  seleccionables numéricas; los botones de acciones, navegación y calendario llevan iconos.
- `verify:migration` reconstruye una copia desechable con el código, migraciones y seeds de `v0.0`;
  agrega historia de regresión y aplica las pendientes hasta V035 sin tocar el esquema operativo. Compara todas las
  PK y columnas originales, documentos BLOB, snapshots, credenciales hash, saldos y conteos;
  solo admite las transformaciones descritas y comprueba idempotencia. No sustituye un ensayo de
  restauración de un respaldo particular de producción. La etiqueta `v0.0` debe estar disponible.
- Los verificadores usan Node 20 y el cargador `--import tsx`, sin depender del Node 24 del host.
  La instalación limpia usa un proyecto Compose aleatorio y retira también sus imágenes locales,
  además de volúmenes/credenciales temporales, evitando acumular artefactos de aceptación.

### Supuestos operativos y mejoras futuras de v1

- RH valida parámetros/vigencias reales, historia salarial y fiscal, tarifas, empresa, firmantes y
  datos históricos pendientes antes de pagar. No se completan con datos de ejemplo.
- Mantener backups cifrados, restauración ensayada, espacio libre de Docker, TLS válido/renovable,
  monitoreo y feriados de los próximos años. Ensayar también una copia del respaldo real al desplegar.
- Futuro: Firefox/WebKit, pruebas de carga con volúmenes reales, paginación por cursor/búsqueda
  especializada si los planes Oracle lo justifican, contador de login y estado CSRF compartidos al
  escalar réplicas. Revisar tamaño de chunks sin ocultar el aviso de Vite.
- Firma electrónica, antivirus de adjuntos, mensajería externa y presentación SAT/IGSS permanecen
  fuera de alcance; requieren diseño y autorización propios.

## Ronda 2 — cierre R2-10

- La aceptación E2E de producción usa los Dockerfile originales de API y web. El esquema aleatorio
  se prepara en un proceso que termina antes de arrancar el entrypoint compilado de la API.
  Node de producción, migraciones, seeds, cookies Secure, TLS, MIME/caché y RBAC se prueban así
  junto con la interfaz. Los fixtures permanecen fuera del build y los secretos pasan por entorno,
  nunca por argumentos de Docker. La red de pruebas usa el Compose `nomina2` existente.
- `verify:all` ejecuta Playwright en esa modalidad y las dos migraciones. El modo Vite sigue
  disponible para desarrollo. Las respuestas de negocio proceden de Oracle. El ensayo de pérdida de chunk inyecta un fallo
  de transporte, y el del asistente retiene la consulta real del contrato hasta liberar su respuesta;
  no se sustituyen los datos de la API.
- La copia reproducible v1 parte del corte Git V030 y agrega historia transaccional y duplicados.
  Se comparan todas las PK/columnas previas, documentos y hashes. Solo se admiten las transformaciones
  de R2: nombres recortados, duplicados archivados/inactivos, ambas direcciones renombradas y avance
  de contadores exactamente igual a las nuevas reservas. Se exigen restricciones validadas y
  reejecución de migraciones/seeds sin ninguna diferencia. No se modifica SQL histórico.
- No se entregó un respaldo externo v1; reconstruir el corte Git con datos de regresión comprueba
  la actualización reproducible, y no reemplaza ensayar el respaldo real antes del despliegue.
  Los reportes de aceptación incluyen únicamente conteos, huellas y correcciones sintéticas.
- Se revisan RBAC de agregaciones y selector de empleados, y propiedad/CSRF de notificaciones.
  Los salarios del equipo solo salen de las rutas RH/ADMIN; el selector devuelve identidad laboral
  mínima, sin DPI/NIT/salarios/cuenta. Incluso ADMIN solo puede borrar sus propias notificaciones.
- Axe no resuelve ciertos textos sobre tramas. La sigla naranja tenía contraste 4.22:1; las siglas
  ahora usan texto azul sobre una superficie blanca sólida dentro de la muestra, manteniendo los
  colores y tramas originales alrededor. Se verifica numéricamente un mínimo de 4.5:1, además de
  axe A/AA; los bordes de los segmentos mantienen contraste no textual y las etiquetas no dependen
  del color. La ayuda describe la lectura de esa leyenda y las decisiones reales al cancelar.
- La matriz de páginas y ventanas comprueba que no aparezcan oferta ni recorrido antes del clic,
  y que no se persista una bandera de ayuda. Conserva la auditoría completa de pasos, foco, hints,
  anchos proporcionales y accesibilidad. El arranque limpio comprueba también V035 y cero objetos
  inválidos o migraciones pendientes. Los proyectos/esquemas/volúmenes exclusivos se retiran.

- El cierre reprodujo una carrera en la edición de empleados: el paso laboral podía validarse
  antes de resolver la regla del contrato. Siguiente y Guardar esperan esa regla, también durante
  su cambio, y el envío implícito no abre revisión prematuramente. La espera muestra estado y
  tooltip; un fallo ofrece Reintentar regla sin perder entradas. Playwright retiene la consulta
  real, verifica el bloqueo y la libera para completar los pasos opcionales. Hints y ayuda actualizados.

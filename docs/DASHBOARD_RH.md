# Datos del dashboard de RRHH — R2-8

Las cuatro consultas usan `/api/tableros/rh`, sesión vigente y cambio de contraseña completado.
Solo RH y ADMIN pueden consultarlas; EMPLEADO recibe 403 antes de adquirir conexión de datos.
Responden `{ ok: true, data: ... }`, `Cache-Control: private, no-store` y `actualizadoEn`
en America/Guatemala. No hay escrituras ni datos de ejemplo en la aplicación.

| GET               | Filtros admitidos                                                                                              | Datos                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/remuneraciones` | `agrupar=empleado\|departamento`, `metrica=salarioBase\|comisiones\|horasExtra\|totalDevengado`, `mes=aaaa-mm` | Top cinco: ID, nombre, posición, cuatro importes y `valor` de la métrica elegida; GTQ            |
| `/inasistencias`  | `agrupar=empleado\|departamento`, `periodo=mes\|trimestre\|anio`, `fecha=aaaa-mm-dd`                           | Límites del periodo, top cinco, cuatro series con categoría/nombre/color/días y totales globales |
| `/vacaciones`     | `dias=30\|60\|90`, `pagina` (1…), `limite` (1–100, defecto 20)                                                 | `enCurso`, `proximas`, totales de ambas listas y `ausentesHoy`                                   |
| `/celebraciones`  | Sin filtros                                                                                                    | `cumpleanos` y `aniversarios` desde hoy hasta hoy + 30 días inclusive                            |

Los filtros desconocidos o inválidos devuelven 400. Mes/fecha omitidos usan hoy de Guatemala;
agrupar omiso usa empleado, métrica totalDevengado, periodo mes y horizonte 30.
Los importes y días son cadenas decimales de dos posiciones; se preserva Decimal/half-up.
Los IDs y posiciones son números y `esHoy` es booleano. Los nombres usan primer nombre/apellido.

## Criterios de las agregaciones

- **Remuneraciones:** pagos mensuales V1 confirmados (`PAGO`, PAGADO, activos), aunque aún no se
  cierre administrativamente su periodo. Excluye anticipos, prestaciones, reversiones y cálculos
  sin confirmar. El pago mensual ya contiene todas las comisiones/HE del anticipo. V0 suma las
  dos quincenas cerradas de la versión vigente. Salario base significa las líneas efectivamente
  devengadas, con sus prorrateos, en lugar de sumar el salario nominal mensual dos veces.
  Total devengado V1 = ingresos menos descuento de ausencias (antes de IGSS/ISR y anticipo);
  V0 usa sus ingresos históricos. No simula ni proyecta nómina impaga: sin pagos devuelve vacío.
  Agrupa por IDs y departamento del snapshot, conserva los importes aunque el empleado cambie
  de departamento o egrese. Empates se ordenan por ID. Métricas sin importe positivo no generan barras.
- **Inasistencias:** solo ausencias aprobadas activas, incluso aplicadas a nómina o de empleados
  que luego egresaron. Departamento actual del expediente. Intersecta el rango con el periodo;
  los días del registro son calendario inclusivos según la captura existente. Históricos con
  fracciones se distribuyen proporcionalmente, conservando el total original entre periodos.
  La leyenda suma todos los registros, incluidos quienes queden fuera del top cinco.
- **Vacaciones:** solicitudes aprobadas/tomadas activas de empleados activos. En curso incluye
  todo rango que contiene hoy; próximas empieza mañana y termina en hoy + horizonte inclusive.
  `diasLaborales` conserva el total aprobado del rango completo, sin cortarlo al mes/horizonte.
  El contador deduplica empleados y comprueba que hoy sea laboral según bloques/asignación vigente,
  excluyendo feriados nacionales/locales. Un descanso puede pertenecer al rango En curso y no
  sumar al contador de ausentes. La paginación se aplica por separado a ambas listas; los totales
  y el contador no dependen de la página. No hay consultas por cada empleado.
- **Celebraciones:** empleados activos con ingreso hasta hoy; excluye fechas posteriores al
  egreso. No hay truncamiento silencioso de la lista. Incluye hoy y el día 30; cumpleaños nunca
  entrega edad, año de nacimiento ni años cumplidos. Aniversarios entrega `anios`, mínimo uno.
  Un 29/02 se conmemora el 28/02 en años comunes y el 29/02 en bisiestos; un 28/02 siempre
  permanece 28. El endpoint anterior `/api/tableros/rh` también deja de publicar la edad: conserva `anios=0`
  como valor reservado en cumpleaños para su contrato numérico previo, sin romper el cliente actual.

## Categoría editable y esquema

V035 agrega `TIPOS_AUSENCIA.CATEGORIA_INASISTENCIA`, NOT NULL, CHECK e índice. El catálogo
compartido admite `categoriaInasistencia` al crear/editar, filtrar, ordenar y exportar, con hint;
las consultas devuelven `colorInasistencia`. Colores fijos: IGSS_JUSTIFICADA verde,
JUSTIFICADA_CON_GOCE amarillo, JUSTIFICADA_SIN_GOCE naranja y SIN_JUSTIFICAR rojo.
La categoría clasifica estadísticas y se puede corregir aun si el tipo tiene usos; el efecto
salarial mantiene su bloqueo previo. Cambiar categoría se audita y reclasifica su historia visible,
sin recalcular importes ni cambiar nóminas/documentos cerrados.

La migración deriva IGSS/con goce/sin goce por EFECTO y reconoce la clave histórica INJUSTIFICADA
como SIN_JUSTIFICAR. Crea «Inasistencia sin justificación», efecto SIN_GOCE, con código automático.
Un trigger deriva la categoría omitida en altas antiguas/seeds; al editar por API sin enviarla
se conserva la anterior. No modifica PK, códigos anteriores, ausencias ni snapshots existentes.

V035 añade índices compuestos de estado/actividad/rango para ausencias y vacaciones,
mes/tipo/estado/actividad/resultado para pagos e índices funcionales por mes/día de cumpleaños
y aniversarios. Los filtros de rangos mantienen las columnas de fecha sin TRUNC.
Las consultas agrupan antes de limitar, aplican filtros antes de leer detalles de nómina y
usan un calendario acotado de 31 fechas para celebraciones. Toda lectura usa una transacción
READ ONLY para compartir el mismo corte de datos y finaliza con rollback.

## Verificación

Node 20 y Oracle saludable: `npm run verify:tableros`. El runner crea y elimina su propio esquema
N2SEC aleatorio, aplica primero V000–V034 con tipos previos y después V035; verifica preservación,
restricciones, repetición, catálogo, RBAC/CSRF de edición, top/series, versiones/reversión/V0,
cruces de mes/año, descansos/feriados, paginación y 29 de febrero.
El reloj se fija únicamente desde la dependencia del servicio en pruebas; la API pública no
permite cambiar hoy para vacaciones ni celebraciones.

La suite ejecuta EXPLAIN PLAN y las cuatro consultas, genera `tmp/dashboard-rh-planes.json`
con DBMS_XPLAN, coste/predicados y tiempo local. El archivo no contiene datos personales y está
ignorado por Git. Los tiempos son evidencia de ese ensayo, no una garantía para otro volumen/host.
Regresión: `npm test`, `npm run verify:comunicacion`, `npm run verify:catalogos`, `npm run db:verify`.
La interfaz y sus recorridos de dashboard pertenecen a la fase siguiente; esta entrega solo
actualiza backend, esquema, documentación y fixtures/pruebas de contrato.

## Aplicación al entorno operativo

V035 está validada en esquemas desechables. La revisión automática requiere autorización explícita
para aplicarla al Oracle operativo. Tras autorizar, se prepara un respaldo del esquema y se verifica
su restauración en un esquema temporal; después se actualiza solo nomina2-api, conservando web,
Oracle y sus volúmenes. Se comparan versión, objetos válidos y los conteos operativos guardados.
Ante fallo, se conserva la imagen anterior y el respaldo probado; una corrección de esquema usa
una migración nueva o la restauración del respaldo, sin editar migraciones aplicadas.

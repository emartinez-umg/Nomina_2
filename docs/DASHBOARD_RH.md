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

## Interfaz de RRHH — R2-9

`/rh` saluda con el nombre mostrado de la sesión y la fecha de Guatemala. Su primera sección
es una cuadrícula de cuatro tarjetas blancas con los tokens de la página 6 del mockup;
en móvil se apilan. Los indicadores, accesos, gráficas anteriores y alertas de perfiles
incompletos continúan debajo. ADMIN conserva su tablero administrativo y EMPLEADO su portal.

- Remuneraciones: agrupación, cuatro métricas y selector de mes/año; posición, importe GTQ
  exacto y barra relativa al mayor. La pantalla no proyecta importes donde no hay pagos.
- Inasistencias: empleado/departamento y mes/trimestre/año actual. Cada categoría conserva
  color fijo y texto; las tramas y siglas distinguen también las categorías sin depender
  del color. Hover/foco muestra las cuatro cantidades; Escape cierra el detalle. La leyenda
  suma todos los registros y la lista muestra el top cinco.
- Vacaciones: En curso y Próximas (30/60/90 días), fechas completas, días laborales, contador
  de personas ausentes hoy y páginas de cinco registros. Cada pestaña/plazo vuelve a página 1.
- Celebraciones: hoy y 30 días siguientes, pestañas accesibles por flechas/Inicio/Fin, enlaces
  a expedientes, marca textual «¡Hoy!» y años únicamente en aniversarios. Lista desplazable
  sin truncar las celebraciones recibidas.

Las cuatro consultas se cancelan mediante AbortSignal y se cachean por filtro. Son independientes
del tablero anterior y entre sí, con skeleton, vacío orientativo, error/reintento y antigüedad
del corte. Actualizar vuelve a consultar los cinco endpoints; las estadísticas se refrescan
cada minuto mientras la pestaña está activa. Un fallo de actualización conserva el último
resultado con un aviso explícito. Los filtros son consultas, no borradores de formularios.

Framer Motion anima entrada escalonada, escala de barras, conteos y transición de pestañas.
`useReducedMotion` desactiva esas animaciones y las gráficas secundarias cuando el dispositivo
pide movimiento reducido. Los importes accesibles conservan las cadenas exactas de la API;
Number se usa únicamente para escalas/interpolación visual, sin recalcular dinero.
La ayuda declarativa de `/rh` explica primero los cuatro recuadros y se abre solo desde Ayuda.

Los enlaces de remuneraciones abren `/planilla?historial=1&anio=…&mes=…&idEmpleado=…`
o `idDepartamento`, usando el departamento histórico. Inasistencias abre
`/novedades/ausencias?idEmpleado=…&desde=…&hasta=…&estado=APROBADA` o `idDepartamento`
actual. Vacaciones abre su bandeja con `empleado`, `desde`, `hasta` y todos los estados.
Los listados leen únicamente filtros conocidos con formato válido y los aplican al montar;
la API sigue validando entrada, sesión, rol y propiedad. Los chips permiten revisar/retirar
los filtros y las exportaciones conservan la misma consulta.

Componentes: `npm run test -w frontend -- src/features/inicio/dashboard.test.tsx`.
E2E: `npm run test:e2e -- --production dashboard-rh.spec.ts`, con nginx/TLS y API/Oracle reales.
Las fixtures SQL verifican primero el nombre del esquema N2E2E desechable; se eliminan al
terminar la suite y el runner elimina el esquema completo. No se instalan datos de ejemplo
en la aplicación operativa.

## Aplicación al entorno operativo

V035 quedó aplicada al entorno operativo el 20/10/2026, tras la solicitud explícita de reiniciar
el sistema con los ajustes nuevos. Se verificó una exportación Data Pump y su restauración exacta
(77 tablas, 916 filas), y después se reconstruyeron/recrearon API y web conservando Oracle y sus
volúmenes. Las 72 tablas sin transformaciones esperadas permanecen idénticas al respaldo; cero
objetos inválidos y migraciones pendientes. Detalle en PROGRESO_V1.md, «Despliegue operativo».

Para futuras actualizaciones, preparar el respaldo del esquema y verificar su restauración antes
de aplicar migraciones; conservar las imágenes anteriores y comparar versión, objetos y datos.
Ante fallo, usar una migración nueva o restaurar el respaldo probado; no editar migraciones aplicadas.

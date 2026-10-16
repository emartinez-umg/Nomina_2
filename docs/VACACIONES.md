# Vacaciones — FASE V1-8 (A9)

## Saldo determinista

Al consultar, acumulado = meses completos × VACACIONES_ACUMULACION_MENSUAL vigente al corte
(referencia configurada 1.25). Disponible = acumulado − tomados/aprobados − previas/ajustes.
Solicitables = floor(disponible): cinco meses = 6.25 disponibles y seis días completos solicitables.
Se utiliza Decimal; se conserva la fracción. El egreso limita el corte. Una contratación futura
todavía no acumula. El aniversario de un día inexistente usa el último día del mes y recupera
el día original en el siguiente mes. No se prorratean meses incompletos.

Consultar no crea movimientos ni auditorías de acumulación. El kardex contiene consumos, reversos,
cargas certificadas y ajustes; las ACUMULACION v0 permanecen visibles como respaldo sin sumarse.
SALDO_INICIAL mantiene el disponible certificado de su fecha y su diferencia respecto al acumulado
se presenta en previas/ajustes. TOMADAS carga consumos anteriores con referencia única, motivo y
confirmación. Una apertura se permite una sola vez antes de ajustes/disfrutes. No cargar dos veces
la misma historia. Una compensación positiva o apertura superior al acumulado puede mostrar
previas/ajustes negativos; representa un crédito certificado.

V026 conserva todas las solicitudes, aprobadores, fechas, débitos, aperturas y snapshots v0.
Cuando la suma histórica difiere del cálculo A9 añade un AJUSTE con clave MIGRACION_V1_8
por la diferencia al corte, conservando el disponible anterior. Si v0 carecía de tasas históricas
y no tenía apertura, no existía un saldo verificable que compensar; A9 lo calcula con la tasa actual.
Las migraciones anteriores permanecen intactas. Las vigencias siguen en BD y los documentos/cierres
históricos no se recalculan. La tasa del corte rige la fórmula A9 del saldo consultado.

## Calendario y aprobación

diasLaboralesRango de V1-6 consulta asignaciones por fecha, bloques y feriados nacionales/locales.
Solo cuenta días laborables; deduplica bloques del mismo día y respeta descansos distintos de
sábado/domingo. Un rango puede comenzar/terminar en descanso o feriado. Del 1 al 15/11/2026,
Lun–Vie son diez días y Lun–Sáb doce, sin feriados laborales. Un feriado de jornada parcial se
excluye como día completo porque se solicitan días enteros.

Rangos inclusivos de hasta 366 días, sin fechas pasadas, huecos/ambigüedad de horarios ni traslapes
con solicitudes pendientes/aprobadas/tomadas, ausencias o periodos cerrados. El portal permite
navegar un año. Días laborales ≤ solicitables habilita enviar. La comparación informa disponible,
solicitables y días del rango; rojo bloquea con mensaje y tooltip.

Abrir Ver solicitud, Aprobar, Rechazar o Cancelar consulta nuevamente detalle y saldo. RH ve
acumulados, tomados/aprobados, disponibles decimales y solicitables enteros. La aprobación vuelve
a calcular todo con el calendario y saldo actuales; guarda el resultado y un único DISFRUTE
negativo SOLICITUD:id. Conserva solicitante, rango, días, aprobador y fecha; notifica y audita
dentro de la misma transacción. Una pendiente no reserva días. Rechazar exige motivo de al menos
diez caracteres y no debita.

## Cancelación

Empleado propietario, RH o ADMIN pueden cancelar una APROBADA solo si inicio > hoy de Guatemala
y el rango no afecta un periodo cerrado. Se exige motivo y confirmación. Devuelve exactamente el
débito original mediante REVERSO con clave CANCELACION:id; un cambio posterior de horario/feriado
no cambia la devolución. Conserva aprobación y agrega CANCELADO_POR, CANCELADO_EN y
MOTIVO_CANCELACION; sincroniza SOLICITUDES e historial APROBADA → CANCELADA, notifica y audita.
Las canceladas dejan de bloquear rangos. Repetir/concurrir devuelve conflicto, sin duplicar días.
Un fallo revierte estado, movimiento, historial, notificación y auditoría.

## API autenticada /api/vacaciones

Entradas Zod estrictas; POST requiere CSRF. El servidor obtiene al empleado desde su sesión.
RH/ADMIN pueden consultar expedientes ajenos; EMPLEADO solo sus propios recursos.

| Método y ruta                            | Resultado                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| GET /mi-saldo                            | EMPLEADO: todos los saldos, meses/tasa/corte y kardex propios                |
| GET /mi-calendario?inicio&fin            | EMPLEADO: calendario, bloqueos y hoy                                         |
| POST /previsualizar                      | EMPLEADO: inicio/fin → comparación actual                                    |
| POST /solicitudes                        | EMPLEADO: solicitud e historial sin débito                                   |
| GET /solicitudes                         | Bandeja paginada con comparaciones actuales                                  |
| GET /solicitudes/:id                     | Detalle actualizado con identidad, fechas, saldo y permisos                  |
| POST /solicitudes/:id/resolver           | RH/ADMIN: estado APROBADA o RECHAZADA, motivo, confirmado                    |
| POST /solicitudes/:id/cancelar           | Propietario/RH/ADMIN: motivo, confirmado                                     |
| GET /empleados/:id/saldo                 | RH/ADMIN: saldos y kardex del expediente                                     |
| GET /empleados/:id/calendario?inicio&fin | RH/ADMIN: calendario del expediente                                          |
| POST /empleados/:id/cargar               | RH/ADMIN: tipo SALDO_INICIAL o TOMADAS, dias, referencia, motivo, confirmado |
| GET /empleados/:id/finiquito?corte       | RH/ADMIN: valoración informativa                                             |
| GET /opciones                            | RH/ADMIN: empleados paginados                                                |
| GET /exportar                            | CSV completo de la consulta, restringido por propiedad                       |
| GET /notificaciones                      | Contador/últimos 30 avisos propios                                           |
| POST /notificaciones/:id/leida           | Marcar solo aviso propio                                                     |

Filtros: buscar, idEmpleado, estado, desde/hasta (intersección), pagina/limite,
ordenarPor (id/empleado/inicio/fin/dias/estado) y direccion. Exportación hasta 100,000 filas.
Todos los saldos se actualizan al abrir/volver a la ventana, cada minuto y tras operaciones.
El portal Inicio consume el mismo cálculo. Los motivos/rangos usan borradores sin confirmar
automáticamente acciones restauradas. Hints y ayuda por rol explican fracciones y cancelación.

prepararVacacionesFiniquito comparte conexión/locks/transacción con prestaciones y calcula
sin materializar meses. Exige corte no futuro dentro de la relación laboral, sin reservas ni
movimientos posteriores. Usa salario/divisor vigentes y Decimal; el endpoint no paga.

## Verificación

npm test; npm run verify:vacaciones (migración Oracle); npm run verify:security (API/Supertest);
npm run db:verify; npm run test:e2e -- --grep 'vacaciones|FASE V1-8'.
Cobertura: meses incompletos/bisiestos, cinco meses, fracciones, horarios/feriados, rango obligatorio,
traslapes, saldo insuficiente/revalidación, propiedad/CSRF, concurrencia, cancelación y rollback.

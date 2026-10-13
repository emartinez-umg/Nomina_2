# Vacaciones — FASE 7

## Saldo y fechas

Saldo disponible = acumulaciones mensuales + apertura certificada − previas/tomadas − reservas
aprobadas. El mes se cumple en cada aniversario del ingreso; si ese día no existe, se usa el último
del mes, conservando el día original para el siguiente aniversario. No hay fracción diaria.
La tasa `VACACIONES_ACUMULACION_MENSUAL` se consulta con vigencia en Oracle (referencia inicial 1.25).
Al consultar u operar se materializan meses faltantes con `MES:fecha`; repetir no duplica movimientos.
El egreso limita la acumulación. Los snapshots ya registrados no cambian al editar parámetros.

Si faltan tasas históricas, RRHH configura sus vigencias o carga una apertura certificada hoy.
SALDO_INICIAL reconoce **días disponibles**, incluso cero, sustituye el saldo anterior al corte y
solo admite una apertura antes de ajustes/disfrutes. TOMADAS resta días anteriores del saldo
calculado. Ambas cargas exigen referencia única, motivo y confirmación; no admiten saldo negativo.
Se conserva el kardex anterior para auditoría. No se deben cargar ambas modalidades para la misma historia.

Los días de un rango se determinan fecha por fecha con EMPLEADO_HORARIO/HORARIO_DIAS y FERIADOS
nacionales o de la localidad del centro de trabajo. Se excluye el día feriado completo, incluso
registros de medio día, porque la unidad solicitada es el día laboral. Un hueco/ambigüedad de horario
bloquea. Inicio/fin deben ser laborales; descansos/feriados interiores no consumen saldo.
Rangos inclusivos de hasta 366 días; calendario del portal hasta hoy + 365 días. Fechas visibles
dd/mm/aaaa y fecha actual obtenida del servidor en America/Guatemala.

## API autenticada `/api/vacaciones`

Respuestas uniformes del proyecto. Todas las entradas se validan con Zod estricto. Los POST
requieren CSRF. La identidad del empleado se obtiene de su sesión y vínculo en Oracle.

| Método y ruta                              | Rol / resultado                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| GET `/mi-saldo`                            | EMPLEADO: saldo y kardex propios                                             |
| GET `/mi-calendario?inicio&fin`            | EMPLEADO: días laborales, bloqueos y hoy                                     |
| POST `/previsualizar`                      | EMPLEADO: `{inicio, fin}` → días, disponible, alcanza, puedeAprobar, bloqueo |
| POST `/solicitudes`                        | EMPLEADO: `{inicio, fin}` → alta, historial y aviso a RH/ADMIN               |
| GET `/solicitudes`                         | Todos: bandeja paginada; empleado restringido a sus solicitudes              |
| GET `/exportar`                            | Todos: CSV completo de filtros, restringido por propiedad                    |
| GET `/opciones`                            | RH/ADMIN: empleados buscables/paginados                                      |
| GET `/empleados/:id/saldo`                 | RH/ADMIN: saldo y kardex del expediente                                      |
| GET `/empleados/:id/calendario?inicio&fin` | RH/ADMIN: calendario del expediente                                          |
| POST `/empleados/:id/cargar`               | RH/ADMIN: carga previa/apertura                                              |
| POST `/solicitudes/:id/resolver`           | RH/ADMIN: aprobar o rechazar con confirmación                                |
| GET `/empleados/:id/finiquito?corte`       | RH/ADMIN: valoración informativa para Fase 9                                 |
| GET `/notificaciones`                      | Todos: contador sin leer y últimos 30 avisos propios                         |
| POST `/notificaciones/:id/leida`           | Todos: marcar únicamente un aviso propio                                     |

Filtros: `buscar` (código/nombre), `idEmpleado`, `estado`, `desde`, `hasta`, `pagina`, `limite`,
`ordenarPor` (id/empleado/inicio/fin/dias/estado), `direccion` (asc/desc). Desde/Hasta intersectan
el rango de vacaciones. Campos no permitidos se rechazan. La exportación limita a 100,000 filas.

Carga: `{tipo: 'SALDO_INICIAL'|'TOMADAS', dias: textoDecimal, referencia, motivo, confirmado: true}`.
Resolución: `{estado: 'APROBADA'|'RECHAZADA', motivo, confirmado: true}`. Rechazo requiere al menos
10 caracteres. Un duplicado/resolución repetida devuelve conflicto y no produce otro débito.

## Aprobación y concurrencia

Una solicitud en proceso no reserva días. Solicitar y aprobar revalidan saldo **actual**, horario,
feriados, relación laboral, fecha no pasada y traslapes contra ausencias/vacaciones/cierres.
La bandeja muestra verde cuando alcanza y rojo cuando no; el botón bloqueado explica el motivo.
El backend rechaza aunque se evada la UI. Un periodo cerrado también impide rechazar o cargar historia.

Aprobar registra un DISFRUTE negativo con `SOLICITUD:id`, actualiza ambas solicitudes e historial,
notifica al empleado y audita en la misma transacción. La fecha del débito es hoy para reservar el
saldo inmediatamente. No se vuelve a descontar al llegar la fecha de disfrute. Rechazar no debita.
Se usan los locks compartidos con administración/catálogos/periodos y revalidación del actor para
evitar dobles aprobaciones, sobreconsumo o traslapes concurrentes. Los fallos hacen rollback completo.

## Consumo por Fase 9

`prepararVacacionesFiniquito(conexion, actor, idEmpleado, corte)` devuelve id/corte/días/salario/divisor/monto.
El llamador comparte conexión, orden de locks y transacción; no debe hacer commit intermedio.
Usa salario vigente al corte y `SALARIO_DIAS_MES` vigente. Decimal calcula el importe completo antes
de redondear half-up a dos decimales. Exige corte no futuro dentro de la relación; si existe egreso,
exige exactamente esa fecha. Rechaza movimientos o solicitudes/reservas posteriores al corte.
La primitiva valora y materializa acumulaciones faltantes; el endpoint no paga ni descuenta días.
Pago efectivo, resolución/reversión de reservas y registro de liquidación corresponden a Fase 9.

## Verificación

`npm test` cubre acumulación, bisiestos/vigencias/apertura, calendarios distintos con descanso entre
semana, traslapes, igualdad/saldo insuficiente, finiquito, semáforo y saneo. `npm run verify:security`
usa Oracle desechable y Supertest: propiedad/RBAC/CSRF, kardex idempotente, feriados locales/nacionales,
solicitar→aprobar/rechazar, carga previa→rojo, concurrencia y rollback. `npm run db:verify` comprueba V015.
Prueba manual: empleado solicita rango libre; RRHH aprueba y verifica saldo/kardex/notificación.
Crear otra pendiente y cargar días tomados suficientes para que el saldo quede menor a lo solicitado:
la fila pasa a rojo y no permite aprobar; rechazar exige motivo y notifica sin debitar.

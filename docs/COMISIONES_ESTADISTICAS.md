# Estadísticas de comisiones — contrato R3-9

API de lectura para C6. Sesión autenticada con contraseña definitiva. RH y ADMIN consultan
todo el historial; EMPLEADO requiere `VER_COMISIONES_EQUIPO` vigente en una jefatura que
dirige. Cada petición resuelve sus ramas autorizadas desde la sesión según R3-8, excluye
al propio jefe y a personas/ramas inactivas. No concede acceso a otras vistas de RH.

## Rutas

Base: `/api/tableros/comisiones`. Todas responden `{ ok, data }`, con
`Cache-Control: private, no-store`. No escriben datos; usan snapshot READ ONLY.

| GET                         | Datos                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `/resumen`                  | Indicadores globales del conjunto filtrado                                                        |
| `/tendencia`                | `registros`: un total por mes, con ceros y comparación alineada opcional                          |
| `/ranking`                  | Vendedores, total, promedio, participación porcentual, comparación y posición                     |
| `/tabla`                    | Vendedores × meses: `registros[].serie`, `meses`, `totalesMensuales`, `totalComisiones`           |
| `/vendedores/:id/historial` | Vendedor, indicadores propios, evolución, promedio del equipo y comisiones individuales paginadas |
| `/opciones`                 | Vendedores y departamentos con comisiones en el rango/filtros/alcance                             |
| `/anios`                    | Años únicos con datos y año actual; `anioMin`, `anioMax`, `anioActual`, `anios`                   |

`GET /api/tableros/anios?fuente=comisiones` conserva el contrato de R3-4 y comparte la
misma lectura y autorización que `/comisiones/anios`. Las otras fuentes mantienen su RBAC.

## Query

Excepto `/anios`, todas exigen `desde` y `hasta` en `aaaa-mm`; ambos inclusivos.
Máximo 60 meses, desde ≤ hasta, sin meses futuros según el reloj de Oracle en Guatemala.

| Parámetro          | Regla                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `idDepartamento`   | ID positivo; opcional. Organización actual de la ficha                       |
| `vendedores`       | IDs separados por coma o parámetros repetidos; 1–500 únicos; opcional        |
| `estado`           | `todas` (predeterminado), `pendientes` o `aplicadas`                         |
| `comparar`         | `true` o `false` (predeterminado); no se admiten otros valores               |
| `pagina`, `limite` | Solo ranking, tabla e historial; 1 y 20 por defecto, límite máximo 100       |
| `ordenarPor`       | Solo ranking/tabla: `total` (defecto), `promedioMensual`, `nombre`, `codigo` |
| `direccion`        | Solo ranking/tabla: `desc` (defecto) o `asc`; desempate por ID ascendente    |

Ejemplo: `/api/tableros/comisiones/resumen?desde=2026-01&hasta=2026-03&comparar=true`.
No acepta raíces, propietarios ni listas de alcance. Filtros desconocidos, formatos y rangos
inválidos devuelven 400. IDs de vendedor o departamento inexistentes devuelven 404 para RH/ADMIN;
IDs ajenos al equipo devuelven 403. Una lista mixta de vendedores propios/ajenos se rechaza
completa. Los filtros nunca amplían el alcance, tampoco los años u opciones.

`data` incluye `actualizadoEn`, `moneda: GTQ`, estado, periodo, periodo anterior opcional y
`alcance: { tipo: GENERAL | EQUIPO, personas: null | N }`. N es el equipo autorizado completo,
antes de filtrar; con cero personas sigue limitado. `/anios` mantiene el DTO de R3-4.

## Fuente y cálculos

- Fuente única: `NOVEDADES_MENSUALES`, `TIPO=COMISION`, activa y autorizada como APROBADA.
  Estado refiere a PENDIENTE/APLICADA, no al estado del pago. Excluye anuladas y autorizaciones
  pendientes/rechazadas. V027 ya migró v0: `COMISIONES`/`NOVEDADES_ORIGEN` son respaldos,
  nunca se suman otra vez. Una comisión retroactiva pertenece a su MES de origen.
- Vendedor es cualquier empleado con al menos una comisión válida en el rango y estado
  filtrados, independientemente del puesto o monto. RH/ADMIN conservan el historial de bajas;
  el equipo conserva la regla de personas activas de R3-8. Sin registros actuales no hay fila
  de ranking/matriz aunque existan comisiones anteriores. La comparación global sí incluye
  todos los vendedores del periodo anterior que satisfacen los mismos filtros/alcance.
- Montos y porcentajes son strings decimales con dos posiciones, Decimal y half-up. Total =
  suma; promedio mensual = total / meses inclusivos, también los vacíos. Mejor/peor mes
  consideran ceros; empates usan el primer mes. Sin registros, ambos son null.
- Comparación: igual cantidad de meses inmediatamente anteriores. Enero–marzo se compara
  con octubre–diciembre. Mismos filtros y alcance actual en ambos periodos. Variación =
  `(actual − anterior) / anterior × 100`. Anterior cero y actual positivo: null con
  `sinBaseComparacion=true`; ambos cero: `0.00`; actual cero y anterior positivo: `-100.00`.
  Sin comparar, `totalAnterior` y `variacionPorcentual` son null.
- Con comparar, cada punto de la serie contiene `mesAnterior` y `totalAnterior`, incluso cero.
  Ranking incluye participación para el gráfico de reparto; porcentajes individuales se
  redondean y pueden sumar 99.99/100.01. Totales de matriz/ranking abarcan todas las páginas.
- Historial: `evolucion` continua, mejor/peor/promedio propios y registros individuales en
  orden mes/ID descendente. `promedioMensualEquipo` = total filtrado / vendedores del rango /
  meses; `evolucion[].promedioEquipo` = total del mes / esos mismos vendedores (incluye sus
  meses vacíos). El ID de la ruta no reduce al equipo de comparación. Los filtros explícitos
  de departamento/vendedores sí se conservan; se indica el denominador en `vendedoresEquipo`.
  Un empleado autorizado sin comisiones devuelve indicadores cero y registros vacíos.
- Solo se proyectan nombre abreviado, código, puesto, departamento, centro y datos de comisión.
  Nunca salario, banco, DPI/NIT, contacto, expediente, actas ni credenciales.

## Rendimiento y pruebas

V041 añade índices compuestos de tipo/activo/autorización/mes/empleado/estado/importe y
empleado/tipo/activo/autorización/mes/estado/importe. Cubren las agregaciones de dinero sin
leer cada fila de la tabla. No modifica datos, migraciones previas ni pagos confirmados.
El SQL agrega una vez por vendedor/mes usando rangos DATE indexables y binds/JSON_TABLE CLOB.
La aplicación completa ceros y calcula porcentajes/orden/páginas sobre esos agregados, sin N+1.
Historial individual pagina en Oracle. No se consultan boletas ni fichas sensibles completas.

`npm run verify:comisiones` crea y retira un esquema N2SEC exclusivo; incluye integración
Supertest real, V041, RBAC/alcance/revocación, filtros, centavos, vacíos y 24,000 comisiones
históricas para revisar planes general/por vendedor/por equipo. Escribe planes/tiempos en
`tmp/comisiones-planes.json` con ejecución en host. Con imagen de pruebas actualizada admite
`-- --docker` para Node 20. No se fijan hints ni se exige que Oracle elija un índice nuevo
si uno previo cuesta menos. La prueba impide un full scan mensual para estos rangos selectivos.

La interfaz, atajos, gráficas, descargas y ayuda C6 se conectarán en su fase de frontend.

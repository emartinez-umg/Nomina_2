# Catálogos y parametrización — FASE 4

Acceso desde **Catálogos** en el menú de RH y ADMIN, o `/catalogos`. EMPLEADO no tiene acceso
ni por URL ni por API. Se conservan las sesiones, CSRF y cambio obligatorio de la fase 2.
Las pantallas consultan Oracle; no contienen datos de ejemplo.

## Catálogos disponibles

| Ruta `/catalogos/…`  | Datos                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| `departamentos`      | Código, nombre, descripción y estado.                                               |
| `puestos`            | Departamento, rango salarial referencial opcional y datos generales.                |
| `jefaturas`          | Unidad, departamento y empleado responsable del mismo departamento.                 |
| `horarios`           | Jornada y siete días independientes, con entrada/salida, descanso y cruce nocturno. |
| `feriados`           | Calendario anual, fechas efectiva/nominal, ámbito, localidad, franja y fundamento.  |
| `tipos-ausencia`     | Efecto con goce, sin goce o subsidio IGSS.                                          |
| `tipos-descuento`    | Catálogo existente, incluyendo parqueo y consumo en tienda.                         |
| `tipos-contrato`     | Indica si exige fecha de fin.                                                       |
| `parametros-legales` | Valores, unidades, fundamento e historial de vigencias.                             |
| `tramos-isr`         | Límites de renta, tasa, cuota fija e historial de vigencias.                        |

Los rangos salariales no cambian el salario de ningún empleado. Jefaturas permite dejar pendiente
el responsable hasta disponer de empleados reales; no se adelanta su CRUD de fase 5.
Las horas efectivas se derivan de la salida menos entrada menos descanso, con cruce opcional de
medianoche. El detalle conserva siete días y los horarios pueden variar entre lunes y viernes.
Un patrón asignado conserva días/jornada; se crea otro para cambiar las asignaciones futuras.

## API

Todas las rutas siguientes parten de `/api/catalogos`, responden `{ ok, data, meta? }` y usan
los guards globales. Las escrituras requieren cookie y `X-CSRF-Token`.

| Método/ruta                                           | Operación                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /`                                               | Definiciones de campos y formatos para la interfaz; sin SQL ni nombres de tablas.             |
| `GET /restricciones`                                  | Fecha final del último periodo cerrado.                                                       |
| `GET /opciones/departamentos` o `/opciones/empleados` | Referencias activas, `buscar` y `pagina`; lotes de 100.                                       |
| `GET /:catalogo`                                      | Listado filtrado y paginado.                                                                  |
| `GET /:catalogo/:id`                                  | Detalle, nombres de referencias y distribución semanal cuando corresponde.                    |
| `POST /:catalogo`                                     | Alta validada y auditada.                                                                     |
| `PATCH /:catalogo/:id`                                | Edición o nueva versión legal.                                                                |
| `PATCH /:catalogo/:id/estado`                         | Activar/desactivar: `{ activo, motivo }`; legal añade `confirmado: true`.                     |
| `DELETE /:catalogo/:id`                               | `{ motivo, confirmado: true, fisica?: boolean }`. Baja lógica por defecto; física solo ADMIN. |

El listado devuelve `registros`, `total`, `pagina`, `limite`. Cada fila incluye `id`, `activo` y
`enUso`. Dinero/tasas viajan como cadenas decimales; booleanos como JSON boolean. Fechas ISO en API,
`dd/mm/aaaa` en la interfaz. Importes Oracle se convierten con NLS decimal explícito.

Filtros comunes: `buscar`, `activo=0|1`, `pagina` (desde 1), `limite` (1–100), `ordenarPor` y
`direccion=asc|desc`. Orden solo por `id`, `activo` o un campo declarado del catálogo.
Textos/códigos/descripciones filtran por coincidencia parcial sin distinguir mayúsculas;
opciones, referencias y booleanos por igualdad. Los filtros se combinan con AND.

Cada fecha y número admite sufijos `Min`/`Max`: por ejemplo `salarioMinimoMin=1234.56`,
`salarioMaximoMax=6000`, `fechaMin=2026-01-01`, `vigenteDesdeMax=2027-12-31`.
Feriados añade `anio`. Horarios añade `diaSemana` (ISO lunes=1), `laborable`, `cruzaMedianoche`,
`entradaMin/Max`, `salidaMin/Max`, `descansoMin/Max` (minutos) y `horasMin/Max`.
Todos los filtros diarios coinciden en la misma fila; por defecto se buscan días laborables.
Los campos/órdenes desconocidos y rangos invertidos se rechazan. SQL usa binds para todos los datos;
los identificadores proceden de definiciones internas y de las FK del esquema.

La interfaz ofrece filtros colapsables, etiquetas removibles, limpieza, orden por encabezados,
selección de tamaño, paginación del servidor y CSV con todos los resultados de la consulta.
La exportación recorre las páginas y escapa comillas, saltos de línea y prefijos de fórmulas.
Las referencias se buscan en el servidor y permiten cargar páginas adicionales.

## Vigencias, protección y auditoría

Guardar parámetros o tramos abre **ADVERTENCIA**, muestra anterior/nuevo, vigencias y exige motivo
(5–500 caracteres). El servidor también exige `confirmado: true`. No se toman tasas de constantes.
Los seeds de referencia de fase 1 no se actualizan ni se consideran validación de legislación.

- Con una fecha posterior al inicio seleccionado, se termina la vigencia anterior el día previo
  (sin extender un fin previamente menor) y se inserta la nueva versión atómicamente.
- Una corrección con el mismo inicio solo procede si no afecta periodos cerrados ni una versión
  referenciada. Se preserva código/unidad de parámetro y límite inferior del tramo.
- Los rangos de vigencia del mismo parámetro/tramo no se traslapan; los tramos de renta activos
  tampoco se traslapan durante una misma vigencia. Un límite superior vacío representa infinito.
- La nueva fecha debe ser posterior al último cierre: bloquea también cambios retroactivos que
  comenzarían antes de un periodo cerrado. Desactivar/eliminar historia utilizada o cerrada se rechaza.
- Un bloqueo de administración serializa las escrituras; las legales bloquean modificaciones
  concurrentes de PERIODOS_NOMINA durante la comprobación. Sesión y rol se revalidan en la transacción.
- Toda creación, edición, cambio de estado, baja, eliminación y cierre/alta de vigencia registra
  actor/rol/IP, entidad/id, anterior/nuevo y motivo cuando corresponde. Un fallo de auditoría revierte
  también los datos y el cierre de vigencia. La bitácora global permanece exclusiva de ADMIN.
- Una FK existente, incluso histórica/inactiva, impide eliminar. La UI bloquea el botón y ofrece
  Desactivar, que mantiene las referencias e impide nuevas asignaciones.

Migración aditiva V013: `SALARIO_MINIMO`/`SALARIO_MAXIMO` en PUESTOS, CHECK de ambos límites e
índices para los filtros nuevos. V000–V012 y seeds existentes permanecen intactos.

## Comprobación

1. `npm run db:setup` o `docker compose up --build` aplica V013; no modifica credenciales existentes.
2. `NODE_ENV=development npm run dev`; entrar como RH/ADMIN y abrir `/catalogos`.
3. Crear departamento y puesto con rango; filtrar/ordenar/exportar; crear jefatura y horario con
   viernes distinto; revisar calendario y los catálogos de tipos.
4. Editar un parámetro con nueva vigencia, revisar advertencia, exigir motivo y consultar ambas versiones.
   ADMIN puede consultar su auditoría mediante `/api/auditoria?entidad=PARAMETROS_LEGALES`.
5. Probar ayuda del listado y formulario; dentro del diálogo el recorrido conserva foco y sus controles.
6. `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
7. `npm run verify:security`: suite Oracle/Supertest ampliada con catálogos en esquema N2SEC desechable.
   `npm run db:verify`: migraciones desde cero, idempotencia, índices y restricciones.

# Gestión de empleados — FASE V1-7

## Uso

RH y ADMIN acceden a `/empleados`. EMPLEADO no accede al módulo ni a sus APIs.
Antes del alta, crear departamentos, puestos, jefaturas opcionales, centros de trabajo y horarios
activos en Catálogos. Bancos se administran allí cuando se utiliza depósito bancario.
Los IDs de los catálogos se obtienen de sus exportaciones CSV o APIs; no se deben inventar.

El formulario separa datos personales, laborales, salario, contacto principal de emergencia y banco.
Código EMP_<departamento>_<contador> automático e inmutable; la vista previa no reserva números.
Residencia con UbicacionSelect: Guatemala/Guatemala por defecto solo en altas, zona 1–25 obligatoria
en el municipio de Guatemala, y número de vivienda alfanumérico con guiones (12-A). Edición muestra
DIRECCION_ANTERIOR como referencia y exige completar la ubicación real de los históricos.
Sexo solo Masculino/Femenino; parentesco desde PARENTESCOS; datos históricos ajenos a las opciones
se conservan para revisión. La fecha de ingreso comienza en hoy de Guatemala. REQUIERE_FECHA_FIN
exige fin posterior al ingreso; indefinido mantiene vacío/bloqueado el campo y cambiar tipo lo ajusta.
La creación inline usa ConstructorHorario, selecciona el ID real y mantiene el borrador del empleado.
Las fechas se muestran como dd/mm/aaaa; la API y el CSV utilizan aaaa-mm-dd.
DPI tiene 13 dígitos; NIT verifica módulo 11 (incluido K); teléfonos tienen 8 dígitos.
DPI, NIT, afiliación IGSS, correo y código son únicos también frente a expedientes egresados.
Banco, cuenta y tipo son opcionales como conjunto. Puesto y jefatura deben pertenecer al departamento.

El salario y horario iniciales comienzan en la fecha de ingreso. El ingreso queda protegido tras el alta.
Cambiar horario requiere fecha efectiva y motivo. Las nuevas vigencias salariales y de horario deben
ser posteriores a la última registrada, incluidas las programadas, y al último periodo cerrado.
No se modifica la asignación laboral de un expediente con periodos cerrados; se conserva su historia.
Los datos personales y de contacto siguen siendo corregibles con motivo y auditoría.
La baja es lógica: exige fecha de egreso desde el ingreso, posterior al último cierre, motivo y
confirmación. Conserva el expediente y desactiva inmediatamente el usuario, incluso si la fecha es futura.

La ficha tiene resumen, salario, descuentos, vacaciones, documentos e historial, todos desde Oracle.
Descuentos, kardex y documentos muestran registros existentes; las operaciones y cálculos de esos módulos
se implementarán cuando se soliciten sus fases. No se inventan saldos ni documentos.
El historial del expediente muestra acción, motivo, usuario y fecha; RH no recibe bitácora global.

## Salario mínimo y edades

Las edades se consultan de `EMPLEADO_EDAD_MINIMA` y `EMPLEADO_EDAD_MAXIMA` vigentes hoy en Guatemala.
Para la advertencia salarial, RH debe crear `SALARIO_MINIMO_MENSUAL`, unidad `QUETZALES`, en Parámetros
legales, con importe, fundamento, motivo y vigencia correspondientes a la actividad/categoría de la empresa.
No se agrega un importe de referencia nuevo sin validación de RH. Si falta el parámetro se muestra un
aviso de configuración; si el salario es inferior, se advierte y se permite guardar como solicita la fase.
El aviso consulta la vigencia de la fecha de ingreso/cambio, no un valor fijo del frontend.

Los cambios salariales se realizan desde la ficha: nuevo importe mensual, fecha efectiva, motivo,
comparación anterior/nuevo y confirmación. Se cierra la vigencia anterior el día previo. Un salario
programado no reemplaza el salario de hoy en la ficha ni en los filtros. Los montos viajan como texto
con dos decimales; se validan con Decimal y se convierten en Oracle con NLS explícito.

## Usuarios y credenciales

El alta siempre genera únicamente rol EMPLEADO, usando primer nombre y primer apellido sin acentos,
y sufijo desde 2 si está ocupado. Usuario, contacto, salario, horario y auditoría forman una transacción.
La contraseña temporal aleatoria se muestra una sola vez y permite copiar o descargar un PDF membretado. Se mantiene solo
en memoria del componente, fuera de TanStack Query, almacenamiento local, reportes, logs y auditoría.
El modal exige copiar/descargar y confirmar antes de cerrar; el PDF se descarga una sola vez.
Al cerrar no puede recuperarse: RH/ADMIN puede restablecer una temporal desde la ficha, con motivo
y confirmación; revoca sesiones y exige cambiarla al ingresar. Solo cuentas EMPLEADO activas.
Completa Configuración de empresa antes del alta: si falta membrete no se escribe ningún registro.
El primer inicio obliga a cambiar contraseña. Todas las respuestas privadas usan `Cache-Control: no-store`.

## Carga masiva

1. Descargar la plantilla desde Carga masiva. Conserva las 30 columnas y reemplaza la fila ilustrativa.
2. CSV UTF-8 con BOM opcional, comas, comillas dobles escapadas, fechas ISO, IDs reales de catálogos,
   salario sin Q ni separadores, `codigoHorario` del catálogo, sexo M/F y parentesco de la lista oficial.
   La residencia usa idDepartamentoGt/idMunicipioGt, zona (obligatoria en Guatemala) y numeroCasa.
   No se envían código de empleado, usuario ni bandera generarUsuario. Máximo 100 filas y 1 MB.
3. Validar muestra nombre, número de fila, errores por campo y advertencias; todavía no crea empleados.
   Los duplicados dentro del archivo invalidan todas sus apariciones. La carga persistida no guarda claves.
4. Confirmar `TODO_O_NADA` o `SOLO_VALIDAS`. El servidor revalida edades, catálogos, pertenencia y unicidad.
   Todas las filas elegidas se insertan en una transacción. Una falla de escritura/auditoría revierte
   empleados, usuarios, contactos, historiales y resultados, incluso en modalidad solo válidas.
5. Copiar o descargar el único PDF de credenciales (una página por empleado) antes de cerrar; descargar el reporte de estados/IDs/usuarios sin claves.
   Una carga importada no puede confirmarse de nuevo. Solo su creador puede confirmar o descargar su reporte.

La exportación del listado abarca todas las páginas de los filtros aplicados (hasta 100,000 registros).
DPI/NIT se conservan enmascarados. Los CSV neutralizan fórmulas al abrirse con una hoja de cálculo.

## Contrato HTTP

Todos los endpoints conservan `{ ok, data, error? }`, sesión, cambio obligatorio y RBAC de FASE 2.
Cada escritura exige header `X-CSRF-Token`; los cuerpos y parámetros usan Zod estricto.

| Método y ruta bajo `/api/empleados` | Uso                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| GET `/parentescos`                  | Opciones activas del catálogo de parentescos                                                |
| POST `/:id/restablecer-contrasena`  | Motivo; temporal nueva y PDF solo en esa respuesta                                          |
| GET `/reglas?fecha=aaaa-mm-dd`      | Hoy/edades/último cierre y mínimo vigente para la fecha opcional                            |
| GET `/opciones/:referencia`         | Referencias buscables; buscar, pagina, seleccionado y departamento opcionales               |
| GET `/`                             | Listado paginado con filtros combinables                                                    |
| GET `/exportar`                     | CSV como texto JSON, con los mismos filtros                                                 |
| GET `/:id`                          | Expediente completo de uso exclusivo RH/ADMIN                                               |
| GET `/:id/pestanas/:tipo?pagina=1`  | salario, descuentos, vacaciones, documentos, historial; páginas de 50                       |
| POST `/`                            | Alta individual con usuario automático; credenciales y pdfCredenciales solo en la respuesta |
| PATCH `/:id`                        | Datos completos sin salario ni usuario; motivo y fechaHorario al cambiar horario            |
| POST `/:id/salario`                 | salarioBase, fechaEfectiva, motivo, confirmado=true                                         |
| POST `/:id/baja` o DELETE `/:id`    | fechaEgreso, motivo, confirmado=true; siempre baja lógica                                   |
| GET `/cargas/plantilla`             | Plantilla CSV con ejemplo claramente identificado                                           |
| POST `/cargas`                      | nombreArchivo, csv; devuelve id y vista previa                                              |
| POST `/cargas/:id/confirmar`        | modalidad, confirmado=true; resultados y claves de una sola entrega                         |
| GET `/cargas/:id/reporte`           | CSV de resultados persistidos sin contraseñas                                               |

Filtros: nombre, dpi, nit, idDepartamento, idPuesto, idJefatura, idTipoContrato, estado,
ingresoDesde/Hasta, salarioMin/Max. Orden por id, codigo, nombre, departamento, puesto,
fechaIngreso, salarioBase o estado; direccion asc/desc. pagina desde 1, limite 1–100 (predeterminado 20).
Referencias: idDepartamento, idPuesto, idJefatura, idTipoContrato, idCentroTrabajo, idHorario, idBanco.

## Pruebas

`npm run verify:empleados` verifica migración sin pérdida de dirección/sexo/parentesco/código.
`npm run test:e2e -- --grep 'FASE V1-7'` cubre alta/edición/contratos/entrega/restablecimiento y lote.

`npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
`npm run verify:security` incluye Supertest con Oracle thin, esquemas N2SEC desechables y rollback
provocado con triggers de prueba. No modifica empleados/cuentas reales.
`npm run verify:security -- --docker` utiliza la imagen `nomina2-security-tests` (Node 20):
`docker build --target build -f backend/Dockerfile -t nomina2-security-tests .`.

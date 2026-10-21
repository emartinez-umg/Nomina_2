# Dataset demo de nomina2 — fase 2

Conjunto `nomina2-demo-v1`, versión 1. Fecha de referencia **20/10/2026**, zona `America/Guatemala`.
La fase 2 preparó estos datos; el cargador de fase 3 ya está disponible y el conjunto básico
se cargó en Oracle local. Ver [instrucciones de carga](CARGA.md).
Los datos personales, teléfonos, cuentas, direcciones y cantidades de demostración son ficticios.

## Fuente única

| Archivo en `data/`   | Contenido                                                                           |
| -------------------- | ----------------------------------------------------------------------------------- |
| `departamentos.json` | 5 departamentos, con nombre, descripción y clave del conjunto.                      |
| `puestos.json`       | 30 puestos, seis por departamento; salario mensual de referencia y rango permitido. |
| `centros.json`       | 10 centros, ubicaciones INE y dirección ficticia; teléfono de referencia.           |
| `horarios.json`      | 7 horarios por bloques, jornada y descansos de 30/60 minutos.                       |
| `empleados.json`     | 32 expedientes completos, referencias naturales, rol y extras opcionales.           |
| `bancos.json`        | 5 bancos guatemaltecos para resolver las cuentas de los empleados.                  |
| `configuracion.json` | Versión, fecha, fuentes, contratos existentes, tipos de ausencia y parámetros demo. |

Los dos archivos adicionales a los cinco originalmente solicitados contienen los bancos añadidos
por el usuario y la configuración común; evitan repetir valores y crear fuentes paralelas.
No hay contraseñas, hashes, tokens ni IDs Oracle en los JSON. La contraseña temporal se tomará
de `SEED_DEFAULT_PASSWORD` durante la futura carga, usando el hash existente de la aplicación.

## Composición

| Departamento                 | Clave del conjunto | Puestos | Empleados |
| ---------------------------- | ------------------ | ------- | --------- |
| Tecnología e Ingeniería      | TI                 | 6       | 7         |
| Recursos Humanos             | RH                 | 6       | 6         |
| Finanzas y Contabilidad      | FC                 | 6       | 6         |
| Operaciones y Logística      | OL                 | 6       | 7         |
| Ventas y Servicio al Cliente | VSA                | 6       | 6         |

- Cada puesto tiene al menos un empleado. Analista de Soporte Técnico y Auxiliar de Bodega tienen dos.
- 24 contratos indefinidos y 8 temporales: 5 a plazo fijo y 3 para obra determinada.
- 2 usuarios RH vinculados a sus expedientes y 30 EMPLEADO; se conservará el ADMIN existente.
- 15 mujeres y 17 hombres. Todos tienen salario, banco, cuenta, tipo y contacto de emergencia.
- 3 empleados tienen menos de un año y 4 más de diez años a la fecha de referencia.
- Hay 6 cumpleaños y 6 aniversarios en los siguientes 30 días, contando el día de referencia.
- Todos los centros, horarios y bancos tienen empleados asignados.
- Salarios mensuales individuales entre **Q4,200.00 y Q28,000.00**; total base **Q332,000.00**.

## Claves y códigos automáticos

`clave` identifica una fila dentro del conjunto y las referencias usan esa clave. Las claves de
catálogos se obtuvieron con `generarCodigoGenerico` y `resolverCodigoGenerico`, en el orden de
sus JSON y considerando las colisiones del propio conjunto. No representan IDs de base de datos.

Al cargar se resolverá el registro por su nombre normalizado y las relaciones que corresponda;
no se insertará `clave` como un código manual. Los triggers y `N2_CODIGOS` asignarán el código
definitivo y sus reservas, según los registros del destino. Por ejemplo, sin reservas anteriores,
un empleado de Tecnología e Ingeniería tendrá el patrón `EMP_TI_0001`.
Un destino con datos previos puede producir otro correlativo o una alternativa de catálogo.

Las colisiones reales del conjunto incluyen Sede Central, Sucursal Cobán y Sucursal Chiquimula:
sus claves son `SC`, `SCRS` y `SC2`, respectivamente, resueltas por la función existente.
Nunca se cambiarán los códigos de registros que ya existan en la base.

Por instrucción del usuario, **no se crean jerarquías ni jefaturas**: todos los expedientes
declaran `jefatura: null`. Se retiran los criterios anteriores de jefe obligatorio y tres niveles;
la futura verificación deberá comprobar esta decisión, sin exigir un jefe para cada empleado.

## Ubicaciones, teléfono y bancos

`departamentoGt` y `municipioGt` son códigos INE como cadenas, con sus ceros iniciales. Se
contrastaron contra `db/data/ubicaciones-gt.json`, procedente del archivo oficial ya versionado;
no se copiarán los municipios ni se inventarán nuevos. Los empleados del municipio Guatemala
incluyen zona del 1 al 25; los demás usan `null`. `direccion` corresponde al campo actual de
100 caracteres, no al antiguo NUMERO_CASA.

Los 10 teléfonos de centro se conservan como `telefonoReferencia`, de ocho dígitos. **No se
persistirán** porque CENTROS_TRABAJO no tiene esa columna; tampoco se esconderán en Dirección
o Descripción. Los teléfonos de empleado y contacto sí tienen columnas en el esquema.

Los nombres de Banco Industrial, Banco de Desarrollo Rural, Banco G&T Continental, Banco de
América Central y Banco Agromercantil de Guatemala se contrastaron con el listado del
[Banco de Guatemala](https://banguat.gob.gt/page/bancos-nacionales), consultado el 20/10/2026.
Se omite el sufijo societario para reutilizar nombres de catálogo como Banco Industrial, ya
existente. Se trata de **cinco bancos en el conjunto**: reutilizar uno existente no exige crear
cinco filas nuevas ni duplicar el catálogo. Sus cuentas de empleado son ficticias.

## Parámetros y salarios demo

El usuario autorizó elegir el mínimo de referencia: **Q4,000.00**, con vigencia desde
01/01/2014 para cubrir los ingresos históricos del conjunto. Está definido una sola vez en
`configuracion.json`, con fundamento que indica expresamente su carácter ficticio.
**No representa un salario mínimo legal ni una afirmación sobre la normativa vigente.**

La fase 3 lo creará únicamente si falta configuración aplicable y no ocasiona solapamientos;
conservará las vigencias existentes y validará los salarios contra el mínimo efectivo del destino.
Si ese mínimo es mayor que los salarios del JSON, la carga deberá explicar el conflicto y
revertirse, sin reducir parámetros ni modificar el salario real de registros existentes.

Los importes son cadenas decimales de dos posiciones. Los salarios individuales conservan
la referencia de cada puesto o una variación de hasta ±10 %. El rango de puesto usa esa misma
ventana, con piso en el mínimo demo. SALARIO_BASE se insertará en HISTORIAL_SALARIAL; no se
inventará una columna de salario en PUESTOS ni en EMPLEADOS.

Los salarios iniciales y las asignaciones de horario comienzan en la fecha de ingreso. Sin extras,
el salario actual se usa desde esa fecha como supuesto de demostración; con extras, los tres
expedientes con historia usan las vigencias indicadas y cierran cada anterior el día previo.
La ausencia de pagos previos y vacaciones tomadas es intencional: no se simula historia pagada.

## Contratos y usuarios

Los identificadores INDEFINIDO, PLAZO_FIJO y OBRA_DETERMINADA son claves semánticas conservadas
por los seeds del proyecto. `configuracion.json` incluye sus nombres y REQUIERE_FECHA_FIN para
resolver los contratos existentes; no se crearán variantes nuevas de esos contratos.
Los ocho fines de contrato son posteriores al ingreso y al 20/10/2026; los indefinidos no tienen fin.

Los nombres de usuario no se fijan en JSON: se generarán con las funciones de la app a partir
del primer nombre y el primer apellido, con sufijos si hay colisiones en el destino. El rol está
en cada expediente, pero no se cambia el rol de un usuario ajeno para conseguir la distribución.
El hash y la bandera de cambio obligatorio se asignarán durante la carga, nunca desde datos
versionados. La reejecución no restablecerá credenciales ni la bandera de usuarios existentes.

## Extras preparados, sin cargar

La verificación de fase 5 añadió 31 aperturas fiscales **ficticias**, con corte 30/09/2026,
en los mismos JSON de empleados. Se usan únicamente con `--with-extras`, para completar la
historia que el Pago mensual exige desde enero/ingreso. Los importes se derivaron con el motor
existente y parámetros locales, sin escribir Oracle, considerando las vigencias salariales
del conjunto y excluyendo novedades pendientes. Los motivos identifican expresamente que no
son certificaciones reales. El alta de octubre no requiere apertura previa. No se alteran
aperturas existentes ajenas ni empleados anteriores. El Anticipo funciona con el conjunto básico.

`empleados.json` incluye `extras` solo donde corresponde. La carga deberá ignorar toda esa
sección salvo que se solicite `--with-extras`; las tarifas de parqueo demo también dependen
de esa bandera. El mínimo salarial demo es parte de la carga básica.

| Caso               | Cantidad    | Contenido                                                                          |
| ------------------ | ----------- | ---------------------------------------------------------------------------------- |
| Historia salarial  | 3 empleados | Tres vigencias por empleado; el último monto coincide con salarioBase.             |
| Parqueo            | 3 empleados | Dos carros y una moto, placas ficticias y mes de inicio.                           |
| Tarifas de parqueo | 2           | Referencias demo mensuales de Q200 carro y Q75 moto desde septiembre de 2026.      |
| Préstamo           | 1           | Q1,200 en seis cuotas; desembolso 20/10/2026 y primera cuota 31/10/2026.           |
| Anticipo           | 1           | Q300 en una cuota; independiente del anticipo ordinario de nómina.                 |
| Ausencias          | 2           | Incapacidad IGSS de tres días y permiso sin goce de un día, en septiembre de 2026. |
| Comisiones         | 4 empleados | Solo Ventas, mes septiembre de 2026, referencias únicas.                           |

Las tarifas son valores de prueba, no precios bancarios ni datos legales; no sustituirán tarifas
operativas. La futura carga debe comprobar que no haya vigencias contradictorias.
Parqueo utilizará el flujo de solicitud/aprobación/suscripción; no se insertará un descuento
mensual manual que evite la lógica existente. Las ausencias usan días calendario inclusivos
como el servicio, mientras las vacaciones conservan el conteo laboral por horario y feriados.

## Validación de esta fase y pendientes

Los siete JSON se comprobaron contra los esquemas Zod y funciones de la app: catálogos,
expediente, identificación, fechas, grupo salarial/bancario, bloques, zona y novedades.
Se comprobaron referencias, duplicados, 30 puestos cubiertos, distribución, contratos, roles,
salarios con decimal.js, casos de antigüedad y celebraciones de los próximos 30 días.
Para validar Zod se resolvieron las claves a identificadores transitorios solo en memoria;
ningún identificador de validación está guardado en JSON ni corresponde a una FK real.

La validación se hizo con referencia fija al 20/10/2026. La futura carga deberá revalidar
también contra la fecha y configuración del destino; un contrato puede vencer con el tiempo.
La fuente JSON no realiza escrituras por sí sola. El cargador de fase 3 está implementado y
la instalación local tiene 32 demo y los 3 empleados anteriores. Quedan la exportación de fase 4
y el verificador independiente de fase 5, sujetos a confirmación.
La ERS original sigue sin estar disponible para certificar la numeración RF campo por campo;
esto no impide revisar los datos y las reglas existentes del proyecto.

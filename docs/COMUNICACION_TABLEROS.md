# Comunicación y tableros — Fase 11

## Pantallas y referencia visual

- `/rh`: indicadores, accesos rápidos, distribución por departamento, evolución de seis periodos,
  alertas, cumpleaños y aniversarios próximos.
- `/mis-gestiones`: ocho tarjetas, saldo real, última boleta cerrada, anuncios vigentes y eventos.
- `/admin`: usuarios por rol, sesiones recientes, bitácora y diagnóstico del esquema/Oracle.
- `/admin/bitacora`: filtros combinados, detalle de cambios, orden/paginación y CSV.
- `/comunicacion/anuncios` y `/comunicacion/eventos`: CRUD RH/ADMIN, calendario mensual, audiencias.
- `/mis-gestiones/anuncios` y `/mis-gestiones/eventos`: lectura propia, filtros y calendario.

El PDF de MOCKUP tiene 38 páginas de referencia del ERP, sin dashboards específicos de nómina.
Se derivan de las páginas 6 (Dashboard), 29 (Administración) y 37 (Estadísticas): sidebar azul,
acciones verdes, tarjetas blancas, fondo gris, tipografía y tokens existentes. Las cifras y personas
ilustrativas del PDF nunca se usan como datos del producto. Gráficas con Recharts, carga diferida,
navegación por teclado y alternativa textual de cifras exactas. Referencia técnica:
[accesibilidad de Recharts](https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx).

## API

Todos los endpoints privados exigen sesión, cambio inicial completado y respuestas uniformes.
Toda escritura exige CSRF y revalida sesión/rol dentro de su transacción.

| Método / ruta bajo `/api`          | Permiso y uso                                            |
| ---------------------------------- | -------------------------------------------------------- |
| GET `/tableros/rh`                 | RH/ADMIN, agregación consistente de RRHH                 |
| GET `/tableros/admin`              | ADMIN, datos administrativos sin tokens ni credenciales  |
| GET `/tableros/empleado`           | EMPLEADO, identidad derivada exclusivamente de sesión    |
| GET `/comunicacion/:tipo`          | Listado paginado (`anuncios` o `eventos`)                |
| GET `/comunicacion/:tipo/:id`      | Detalle, vuelve a comprobar audiencia y vigencia         |
| GET `/comunicacion/:tipo/exportar` | CSV completo de la consulta, hasta 10,000 registros      |
| POST `/comunicacion/:tipo`         | RH/ADMIN, crear y notificar                              |
| PATCH `/comunicacion/:tipo/:id`    | RH/ADMIN, editar con versión actual                      |
| DELETE `/comunicacion/:tipo/:id`   | RH/ADMIN, baja lógica, versión, motivo y confirmación    |
| GET `/auditoria`                   | ADMIN, listado existente ampliado con rol, recurso e IP  |
| GET `/auditoria/exportar`          | ADMIN, CSV de metadatos y motivos, hasta 10,000 acciones |

Publicación: `titulo`, `contenido`, `inicio`, `fin`, `lugar`, `paraTodos`, `destinatarios`, `version`.
Anuncios usan `aaaa-mm-dd`; eventos `aaaa-mm-ddThh:mm`, siempre hora local de Guatemala.
Audiencias: `{tipo: DEPARTAMENTO | PUESTO | JEFATURA, id}`. Solo grupos activos, hasta 100,
sin duplicados. Todos exige lista vacía; por grupos exige al menos uno. Las audiencias se unen por OR.
La pertenencia actual se consulta en EMPLEADOS mediante EXISTS; coincidir con varios grupos no duplica
publicaciones ni avisos. Sin usuario activo no se genera notificación; la publicación sigue disponible
al expediente que posteriormente tenga acceso y pertenezca a la audiencia.

Filtros de comunicación: `buscar` (título), `desde`, `hasta` (intersección inclusiva), `activo`,
`paraTodos`, `grupo` + `idGrupo`; `pagina`, `limite` (máximo 100), `ordenarPor` (titulo/inicio/fin/id),
`direccion`. El empleado queda restringido en SQL aunque envíe filtros más amplios; no se acepta
un ID de empleado/usuario del cliente. Bitácora: usuario actor por ID, rol, entidad, idEntidad,
acción e IP exactas, desde/hasta, página/límite y orden por fecha/id.

## Reglas y transacciones

- Anuncios incluyen ambos días de vigencia. Se permite programarlos y no se guarda un fin pasado.
- Eventos nuevos y ediciones exigen inicio estrictamente futuro, hasta el minuto, según Oracle en
  America/Guatemala, fin >= inicio y lugar. Eventos iniciados conservan historia y pueden retirarse.
- Crear/editar guarda publicación, relaciones, notificaciones y auditoría en una sola transacción.
  El lock de organización usa el orden existente; VERSION evita sobrescribir cambios concurrentes.
- Cada versión avisa una vez a cada empleado activo con ingreso efectivo y usuario EMPLEADO activo.
  Editar desactiva avisos previos y emite la nueva versión. Retirar audiencia o eliminar retira avisos;
  un enlace guardado vuelve a comprobar la autorización. Eliminar exige motivo >= 10 caracteres.
- Anuncios programados notifican al guardar y el portal los muestra durante su vigencia. No existe
  un scheduler nuevo ni envío de correo/SMS. La campana abre el recurso protegido y conserva su
  marcado de lectura propio. Los avisos no incluyen el cuerpo de la publicación.
- Empleados ven anuncios vigentes y eventos próximos/en curso dirigidos a sus grupos actuales.
  RRHH puede consultar publicaciones pasadas/eliminadas. Cada cambio queda en bitácora inmutable.

## Fuentes, consistencia y rendimiento

Lecturas de tableros, comunicación y exportaciones usan transacción Oracle READ ONLY; count, filas
y agregados ven el mismo snapshot. No hay consultas por empleado en las agregaciones de RRHH.
Consultas agrupadas, EXISTS y límites de filas controlan volumen; se reutilizan índices existentes y
V019 agrega índices compuestos de vigencias, agenda, versión de nómina, empleados activos,
notificaciones propias, sesiones y bitácora. Los identificadores SQL proceden de listas internas;
valores del cliente siempre viajan con binds. Dinero se agrega en Oracle y viaja como texto decimal;
Decimal formatea valores y solo las coordenadas de Recharts se convierten a Number.

- Empleados activos: ACTIVO=1, ESTADO=ACTIVO e ingreso hasta hoy. Altas/bajas: fechas efectivas del
  mes hasta hoy, también cuando el expediente ya fue dado de baja.
- Nómina actual: periodo que contiene hoy, solo NOMINA_EMPLEADO de VERSION_CALCULO vigente y ACTIVO=1.
  Ausencia de periodo/cálculo se muestra explícitamente; no se toma otra quincena como si fuera actual.
- Costo patronal: aportes informativos, coherente con Fase 8, sin sumarlos al neto ni confundirlos con
  salario más aportes. Evolución: últimos seis periodos existentes iniciados hasta hoy; abiertos son
  provisionales y ausencia de cálculo es null, no cero. Versiones anteriores no se suman.
- Solicitudes pendientes incluye las vacaciones que también aparecen separadas para facilitar gestión.
- Celebraciones: hoy y próximos 30 días, hasta 50, ordenadas por fecha; años cumplidos para aniversarios.
  ADD_MONTHS ajusta 29 de febrero al calendario del año, incluso al cruzar diciembre/enero.
- Alertas: hasta 50 periodos iniciados sin cerrar y contratos activos vencidos o que vencen en 30 días.
- Saldo propio: reutiliza calcularSaldo de Fase 7 con parámetros y kardex; calcula meses faltantes sin
  materializar desde el tablero. Falta de vigencia/configuración se informa y no inventa un saldo.
- Última boleta: exclusivamente propia, cerrada, activa y versión actual del periodo más reciente.
- ADMIN: usuarios activos/registrados por rol, diez sesiones por actividad y diez acciones recientes.
  Sesiones activas excluyen vencidas/revocadas y usuarios/roles inactivos. Diagnóstico consulta Oracle,
  versión aplicada, migraciones sin completar y objetos inválidos. Una caída produce error de carga.
- Agenda mensual carga todas sus páginas (máximo 2,000 eventos por mes); si se supera lo informa y
  ofrece consultar el listado. El calendario no se construye solamente con la primera página.

## Verificación y operación

`docker compose up --build` aplica V019 sobre el volumen existente. Para HTTP local:
`NODE_ENV=development npm run dev` con Node 20. Entrar con los usuarios reales de cada rol.
Publicar anuncio a todos y luego por departamento/puesto/jefatura; comprobar campana, detalle,
programación/vencimiento y retiro de audiencia. Crear evento desde una fecha de calendario y probar
hora pasada/fin anterior. Combinar filtros, orden, páginas, CSV y recorrer Ayuda en cada pantalla.

Ejecutar `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`,
`npm run db:verify`, `npm run verify:security`, `npm run verify:prestaciones`,
`npm run verify:solicitudes`, `npm run verify:comunicacion` y `npm run verify:infra`.
La integración de fase 11 también admite `-- --docker` con imagen `nomina2-security-tests` actualizada.
Los verificadores crean/eliminan esquemas aleatorios N2TEST/N2SEC; no siembran fixtures en aplicación.

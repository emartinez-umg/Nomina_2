import type { DefinicionAyuda } from '../../components/help/HelpProvider';
import { ayudaSaldosVacaciones } from '../vacaciones/help/saldos';
export const ayudaPermisosEquipo: DefinicionAyuda = {
  id: 'permisos-jefatura-r3-8',
  pasos: [
    {
      elemento: 'permisos-jefatura',
      titulo: 'Selecciona la jefatura',
      descripcion:
        'Busca una jefatura real. El resumen cuenta empleados activos de esa jefatura y sus descendientes activas, sin incluir a su propio jefe. Completa el responsable desde Organización si falta; no se inventan asignaciones.',
    },
    {
      elemento: 'permisos-interruptores',
      titulo: 'Permisos independientes',
      descripcion:
        'Cada interruptor concede una consulta al responsable de esta jefatura. Ver equipo habilita el directorio; Ver vacaciones habilita saldos y exportaciones sin aprobar solicitudes. Ver comisiones habilita Estadísticas de comisiones en Mi equipo, con filtros, historial por vendedor y exportaciones limitadas a esas ramas. Una jefatura sin permiso no amplía el alcance de otra. El usuario conserva el rol Empleado. Nunca se concede acceso al salario, banco, DPI, NIT, expediente ni actas.',
    },
    {
      elemento: 'permisos-guardar',
      titulo: 'Revisa y confirma el cambio',
      descripcion:
        'Explica el motivo, revisa los permisos activos y confirma. Se registra anterior, nuevo, usuario, fecha y motivo en el historial de la jefatura. Si otra persona cambió la configuración, recarga y revisa. El servidor comprueba permisos en cada consulta; el menú se actualiza al recuperar el foco o actualizar la sesión, sin volver a iniciar sesión.',
    },
  ],
};
export const ayudaMiEquipo: DefinicionAyuda = {
  id: 'mi-equipo-r3-8',
  pasos: [
    {
      elemento: 'equipo-resumen',
      titulo: 'Tu equipo y tus permisos',
      descripcion:
        'El equipo reúne empleados activos de las jefaturas que diriges y sus descendientes activas, excluyéndote. Los permisos los administra Recursos Humanos. Estadísticas de comisiones abre tendencia, ranking e historial por vendedor solo con el permiso correspondiente. Cada vista usa solo las ramas que tienen su permiso; no cambia tu rol de Empleado ni permite aprobar solicitudes.',
    },
    {
      elemento: 'equipo-filtros',
      titulo: 'Busca dentro de tu equipo',
      descripcion:
        'Combina nombre o código con departamento, centro y jefatura. Los filtros y las opciones solo se calculan sobre tu equipo autorizado. Cambiar filtros vuelve a la primera página; Limpiar filtros los retira sin ampliar el equipo. Ordena por los encabezados y usa Anterior y Siguiente.',
    },
    {
      elemento: 'equipo-listado',
      titulo: 'Directorio de consulta',
      descripcion:
        'Se muestran únicamente código, nombre, puesto, departamento y centro. No hay enlaces a expedientes ni acciones sobre otras personas. Actualizar vuelve a consultar la jerarquía y los permisos vigentes; si se retira el permiso se bloquea la consulta.',
    },
  ],
};
export const ayudaSaldosEquipo: DefinicionAyuda = {
  ...ayudaSaldosVacaciones,
  id: 'saldos-equipo-r3-8',
  pasos: ayudaSaldosVacaciones.pasos.map((p) =>
    p.elemento === 'saldos-umbral'
      ? {
          ...p,
          descripcion:
            'La alerta aparece cuando el saldo supera estrictamente el umbral vigente. Recursos Humanos configura el umbral. Esta vista es de consulta: no modifica saldos ni permite aprobar o cancelar solicitudes.',
        }
      : {
          ...p,
          descripcion: `${p.descripcion.replace('Todos también permite consultar bajas.', 'El equipo solo incluye empleados activos.')} Todos los resultados, opciones, indicadores y exportaciones se limitan a las jefaturas para las que tienes permiso de vacaciones.`,
        },
  ),
};

import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaUsuarios: DefinicionAyuda = {
  id: 'usuarios',
  pasos: [
    {
      elemento: 'usuarios-filtros',
      titulo: 'Consultar accesos',
      descripcion:
        'Combina usuario, correo, rol, estado y cambio obligatorio. Los filtros consultan Oracle; quitar un chip o limpiar amplía resultados. Ordena columnas o cambia de página; CSV exporta toda la consulta sin contraseñas ni tokens.',
      roles: ['ADMIN'],
    },
    {
      elemento: 'usuarios-listado',
      titulo: 'Administrar permisos',
      descripcion:
        'Crear acceso registra ADMIN o RH con contraseña temporal. Para EMPLEADO usa el alta de Empleados y genera su usuario vinculado al expediente. Cambiar rol, activar, desactivar o restablecer exige motivo y confirmación, revoca sesiones y registra bitácora. Debe quedar un ADMIN activo; no desactives tu propio acceso durante el trabajo.',
      roles: ['ADMIN'],
    },
    {
      elemento: 'usuarios-formulario',
      titulo: 'Revisar el cambio de acceso',
      descripcion:
        'Verifica la persona y el rol: ADMIN tiene control total y RH gestiona personal y nómina. Explica por qué autorizas el cambio. Revisa antes de confirmar; si un administrador cambió el registro, consulta de nuevo. La contraseña temporal se muestra una sola vez, debe entregarse en privado y cambiarse en el primer ingreso.',
      roles: ['ADMIN'],
    },
  ],
};

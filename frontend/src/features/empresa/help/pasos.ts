import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaEmpresa: DefinicionAyuda = {
  id: 'empresa-v1-5',
  pasos: [
    {
      elemento: 'empresa-datos',
      titulo: 'Identidad que aparecerá en documentos',
      descripcion:
        'Completa la razón social y el NIT del RTU. El sistema comprueba el dígito verificador. La dirección, teléfono y correo son obligatorios para emitir PDF. Nombre comercial y sitio web son opcionales. Estos datos forman el encabezado y pie de todas las páginas.',
    },
    {
      elemento: 'empresa-logo',
      titulo: 'Logo privado',
      descripcion:
        'Selecciona un PNG, JPG o SVG de hasta 2 MB y revisa la vista previa. El servidor verifica el contenido real, rechaza SVG con scripts o referencias externas y guarda una copia PNG privada. Quitar logo requiere confirmación; el membrete puede conservar solo los datos de empresa.',
    },
    {
      elemento: 'empresa-vista-previa',
      titulo: 'Comprueba el membrete',
      descripcion:
        'Revisa logo, razón social, NIT, dirección y contacto antes de guardar. Los próximos PDF usarán estos datos; los documentos ya aprobados conservan el archivo emitido y su firma.',
    },
    {
      elemento: 'empresa-guardar',
      titulo: 'Guarda con auditoría',
      descripcion:
        'Guardar actualiza la empresa y registra valores anteriores, nuevos y la huella del logo en bitácora. Si otra persona guardó primero, recarga y revisa los cambios antes de volver a guardar. Los borradores conservan texto, pero debes seleccionar de nuevo el archivo.',
    },
    {
      elemento: 'empresa-firma',
      titulo: 'Firma de RRHH',
      descripcion:
        'La firma utiliza los nombres y apellidos de tu ficha de empleado y el nombre del puesto activo. ADMIN debe vincular tu usuario al expediente. Sin esa información no puedes aprobar documentos ni emitir constancias de salario. La firma se conserva con usuario y fecha de aprobación.',
    },
  ],
};

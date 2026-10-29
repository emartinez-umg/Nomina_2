import type { DefinicionAyuda } from '../../components/help/HelpProvider';
export const ayudaExpediente: DefinicionAyuda = {
  id: 'expediente-digital',
  pasos: [
    {
      elemento: 'expediente-resumen',
      titulo: 'Expediente X de Y',
      descripcion:
        'Cuenta los tipos obligatorios con una versión actual activa y vigente. Un documento vencido, dado de baja o sin fecha cuando se exige no completa el expediente. Las versiones reemplazadas se conservan en Historial. El empleado solo consulta sus propios documentos; los permisos de jefatura no autorizan consultar expedientes del equipo.',
    },
    {
      elemento: 'expediente-tipos',
      titulo: 'Documentos y versiones',
      descripcion:
        'RH y ADMIN pueden cargar un archivo por tipo y reemplazar su versión actual. Historial permite recorrer todas las versiones, consultar su SHA-256 y dar de baja una versión con un motivo. La baja no elimina físicamente el archivo ni vuelve a activar versiones anteriores. Ver y Descargar vuelven a comprobar tu acceso y registran la consulta en bitácora.',
    },
    {
      elemento: 'expediente-carga',
      titulo: 'Carga segura',
      descripcion:
        'Arrastra un solo PDF, JPG o PNG o pulsa Seleccionar archivo. Revisa el límite mostrado, el tipo y el vencimiento; no se aceptan archivos vacíos, extensión engañosa ni contenido distinto del declarado. El progreso muestra transferencia y luego validación. Guarda una sola vez y espera la confirmación. El archivo no se guarda en borradores del navegador. Un vencimiento pasado se admite como antecedente, pero avisa y no completa el expediente.',
    },
    {
      elemento: 'expediente-motivo',
      titulo: 'Baja y configuración motivadas',
      descripcion:
        'Revisa la versión elegida antes de confirmar. Escribe de 5 a 500 caracteres explicando la baja o el cambio de obligatoriedad/vencimiento. La baja bloquea nuevas consultas y descargas, conserva bytes y metadatos y registra quién la efectuó. Configurar los tipos afecta el indicador de todos los empleados; revisa el valor anterior y el nuevo.',
    },
    {
      elemento: 'expediente-vista',
      titulo: 'Vista previa privada',
      descripcion:
        'La vista previa obtiene el archivo mediante el endpoint autenticado y registra una visualización. Las imágenes se muestran temporalmente en memoria y los PDF se dibujan sin ejecutar JavaScript del documento. Descargar realiza una petición nueva y registra su propia auditoría. Cierra la ventana al terminar.',
    },
  ],
};

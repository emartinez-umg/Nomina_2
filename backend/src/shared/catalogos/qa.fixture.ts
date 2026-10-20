// Matriz de QA utilizada solo por pruebas unitarias, Oracle y navegador.
export const nombresInvalidosQa = [
  '/*%$#&/@#^',
  '*****',
  '@#$%^&*()<>',
  '@*#$%&(/)/<<<>',
  '1234578',
  '123456',
  '   ',
];
export function datosCatalogoQa(
  cat: {
    slug: string;
    legal?: boolean;
    campos: {
      nombre: string;
      tipo: string;
      requerido?: boolean;
      opciones?: string[];
      referencia?: string;
    }[];
  },
  nombre: string,
  referencias: { departamento: number; departamentoGt: number; municipioGt: number },
) {
  const datos: Record<string, unknown> = {};
  for (const f of cat.campos) {
    if (f.tipo === 'codigo') continue;
    datos[f.nombre] =
      f.nombre === 'nombre'
        ? nombre
        : !f.requerido
          ? null
          : f.tipo === 'codigo-postal'
            ? '01001'
            : f.tipo === 'codigo-iso'
              ? 'GT'
              : f.tipo === 'booleano'
                ? false
                : f.tipo === 'opcion'
                  ? f.opciones![0]
                  : f.tipo === 'fecha'
                    ? '2099-01-01'
                    : f.tipo === 'referencia'
                      ? f.referencia === 'departamentos-gt'
                        ? referencias.departamentoGt
                        : f.referencia === 'municipios-gt'
                          ? referencias.municipioGt
                          : referencias.departamento
                      : f.tipo === 'entero'
                        ? f.nombre === 'minutoFin'
                          ? 1440
                          : 0
                        : ['dinero', 'decimal'].includes(f.tipo)
                          ? '0'
                          : f.nombre === 'localidad'
                            ? '*'
                            : 'Referencia de QA';
  }
  if (cat.slug === 'horarios') {
    delete datos.jornada;
    datos.bloques = [
      { dias: [1], entrada: '08:00', salida: '12:30', cruzaMedianoche: false, minutosDescanso: 30 },
    ];
  }
  if (cat.legal) Object.assign(datos, { motivo: 'Validación de QA', confirmado: true });
  return datos;
}

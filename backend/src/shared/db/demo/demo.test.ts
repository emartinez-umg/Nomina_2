import { describe, expect, it } from 'vitest';
import { cargarDataset, datosEmpleado, validarDataset } from './datos.js';
import { opcionesDemo } from './service.js';

describe('Datos demo y opciones del cargador', () => {
  it('valida los datos versionados y las referencias sin asignar códigos definitivos', async () => {
    const d = await cargarDataset();
    expect(() =>
      validarDataset(
        d,
        { hoy: '2026-10-20', edadMinima: 18, edadMaxima: 75, ultimoCierre: null },
        {
          DIURNA: { diarias: 8, semanales: 44 },
          MIXTA: { diarias: 7, semanales: 42 },
          NOCTURNA: { diarias: 6, semanales: 36 },
        },
      ),
    ).not.toThrow();
    expect(d.empleados.filter((e) => e.rol === 'RH')).toHaveLength(2);
    expect(d.empleados.every((e) => e.jefatura === null)).toBe(true);
  });
  it('rechaza una FK lógica inexistente antes de escribir', async () => {
    const d = await cargarDataset();
    d.empleados[0]!.puesto = 'NO_EXISTE';
    expect(() =>
      validarDataset(
        d,
        { hoy: '2026-10-20', edadMinima: 18, edadMaxima: 75, ultimoCierre: null },
        {
          DIURNA: { diarias: 8, semanales: 44 },
          MIXTA: { diarias: 7, semanales: 42 },
          NOCTURNA: { diarias: 6, semanales: 36 },
        },
      ),
    ).toThrow('Departamento/puesto');
  });
  it('no permite mezclar DDL con una validación ni con un borrado', () => {
    expect(() => opcionesDemo(['--apply-schema', '--dry-run'])).toThrow('no se combina');
    expect(() => opcionesDemo(['--apply-schema', '--reset-demo'])).toThrow('no se combina');
    expect(() => opcionesDemo(['--bandera-inexistente'])).toThrow('Opción desconocida');
  });
  it('conserva reset como operación exclusiva y permite inspeccionarlo sin escrituras', () => {
    expect(opcionesDemo(['--reset-demo', '--dry-run'])).toEqual({
      resetDemo: true,
      dryRun: true,
      withExtras: false,
      applySchema: false,
    });
  });
  it('mapea las claves a IDs resueltos, sin confiar en la clave como código', async () => {
    const d = await cargarDataset();
    const e = datosEmpleado(d.empleados[0]!, {
      departamentoGt: 60,
      municipioGt: 100,
      departamento: 82,
      puesto: 77,
      centroTrabajo: 31,
      horario: 45,
      banco: 19,
      tipoContrato: 8,
    });
    expect(e.idDepartamento).toBe(82);
    expect(e.idBanco).toBe(19);
    expect(e.codigo).toBe('');
    expect(e).not.toHaveProperty('clave');
    expect(e).not.toHaveProperty('extras');
  });
});

import { describe, it, expect } from 'vitest';
import {
  dpiSchema,
  nitValido,
  telefonoSchema,
  correoSchema,
  fechaValida,
  validarNacimiento,
  validarIngreso,
  validarEgreso,
  validarRango,
  validarVacaciones,
  validarFechaEfectiva,
  validarEvento,
  esDiaLaboral,
  limpiarNombre,
  limpiarUsuario,
  limpiarCorreo,
  limpiarNumero,
  formatearDpi,
  formatearTelefono,
  formatearNit,
  fechaIso,
  fechaVisible,
} from './validadores';
const hoy = '2026-10-12';
describe('identificación y contacto', () => {
  it('acepta DPI de exactamente 13 dígitos, con o sin máscara', () => {
    expect(dpiSchema.parse('1234 56789 0101')).toBe('1234567890101');
    expect(dpiSchema.safeParse('123456789012').success).toBe(false);
    expect(dpiSchema.safeParse('12345678901234').success).toBe(false);
    expect(dpiSchema.safeParse('12345678901ab').success).toBe(false);
  });
  it.each([
    ['1234567-9', true],
    ['12345679', true],
    ['1234567-5', false],
    ['1234567-k', false],
    ['6-K', true],
    ['6-k', true],
    ['0-0', false],
    ['CF', false],
    ['123-A', false],
  ])('verifica NIT %s', (nit, esperado) => expect(nitValido(nit)).toBe(esperado));
  it('valida teléfono y correo sin aceptar formatos incompletos', () => {
    expect(telefonoSchema.safeParse('5555 1234').success).toBe(true);
    expect(telefonoSchema.safeParse('+50255551234').success).toBe(false);
    expect(correoSchema.safeParse('rh@empresa.com').success).toBe(true);
    expect(correoSchema.safeParse('rh@').success).toBe(false);
  });
  it('sanea textos, números y máscaras sin ejecutar contenido pegado', () => {
    expect(limpiarNombre('Ana123 Pérez!')).toBe('Ana Pérez');
    expect(limpiarUsuario(' ANA.PEREZ! ')).toBe('ana.perez');
    expect(limpiarCorreo(' ana @empresa.com 😄')).toBe('ana@empresa.com');
    expect(limpiarNumero('Q 1,234.567', 2)).toBe('1234.56');
    expect(limpiarNumero('-2abc', 0, true)).toBe('-2');
    expect(formatearDpi('1234567890101xx')).toBe('1234 56789 0101');
    expect(formatearTelefono('55551234xx')).toBe('5555 1234');
    expect(formatearNit('1234567-9')).toBe('1234567-9');
  });
});
describe('coherencia de fechas', () => {
  it.each([
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-02-31', false],
    ['2026-13-01', false],
    ['12/10/2026', false],
  ])('valida fecha real %s', (v, r) => expect(fechaValida(v)).toBe(r));
  it('convierte el formato visible sin depender de UTC local', () => {
    expect(fechaVisible(hoy)).toBe('12/10/2026');
    expect(fechaIso('12/10/2026')).toBe(hoy);
  });
  it('respeta límites inclusivos de edad y rechaza nacimiento futuro', () => {
    expect(validarNacimiento('2008-10-12', hoy)).toBeUndefined();
    expect(validarNacimiento('2008-10-13', hoy)).toContain('18');
    expect(validarNacimiento('1950-10-13', hoy)).toBeUndefined();
    expect(validarNacimiento('1950-10-12', hoy)).toContain('75');
    expect(validarNacimiento('2027-01-01', hoy)).toContain('futura');
    expect(validarNacimiento('2010-10-12', hoy, 16, 70)).toBeUndefined();
  });
  it('limita ingreso por edad mínima y máximo 30 días futuros', () => {
    expect(validarIngreso('2026-11-11', '2000-01-01', hoy)).toBeUndefined();
    expect(validarIngreso('2026-11-12', '2000-01-01', hoy)).toContain('30 días');
    expect(validarIngreso('2026-10-12', '2008-10-13', hoy)).toContain('18 años');
  });
  it('impide egreso anterior al ingreso y traslapes inclusivos', () => {
    expect(validarEgreso('2026-10-01', hoy)).toContain('anterior');
    expect(validarEgreso(hoy, hoy)).toBeUndefined();
    expect(validarRango({ inicio: '2026-10-15', fin: hoy })).toContain('anterior');
    expect(
      validarRango({ inicio: hoy, fin: '2026-10-15' }, [
        { inicio: '2026-10-15', fin: '2026-10-16' },
      ]),
    ).toContain('coincide');
    expect(
      validarRango({ inicio: hoy, fin: '2026-10-15' }, [
        { inicio: '2026-10-16', fin: '2026-10-31' },
      ]),
    ).toBeUndefined();
  });
  it('admite horarios distintos a lunes a viernes y excluye feriados', () => {
    expect(esDiaLaboral('2026-10-17', [2, 3, 4, 5, 6])).toBe(true);
    expect(esDiaLaboral('2026-10-17', [2, 3, 4, 5, 6], ['2026-10-17'])).toBe(false);
    expect(
      validarVacaciones({ inicio: '2026-10-13', fin: '2026-10-17' }, [2, 3, 4, 5, 6], [], [], hoy),
    ).toBeUndefined();
    expect(
      validarVacaciones({ inicio: '2026-10-11', fin: '2026-10-17' }, [1, 2, 3, 4, 5], [], [], hoy),
    ).toContain('hoy');
    expect(
      validarVacaciones({ inicio: '2026-10-13', fin: '2026-10-17' }, [1, 2, 3, 4, 5], [], [], hoy),
    ).toContain('laborales');
  });
  it('impide fechas efectivas en periodos cerrados y eventos pasados', () => {
    expect(validarFechaEfectiva(hoy, [{ inicio: '2026-10-01', fin: '2026-10-15' }])).toContain(
      'cerrado',
    );
    expect(
      validarFechaEfectiva('2026-10-16', [{ inicio: '2026-10-01', fin: '2026-10-15' }]),
    ).toBeUndefined();
    expect(
      validarEvento(
        '2026-10-12T09:00:00-06:00',
        '2026-10-12T10:00:00-06:00',
        new Date('2026-10-12T16:00:00Z'),
      ),
    ).toContain('futuro');
    expect(
      validarEvento(
        '2026-10-13T10:00:00-06:00',
        '2026-10-13T09:00:00-06:00',
        new Date('2026-10-12T16:00:00Z'),
      ),
    ).toContain('anterior');
  });
});

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { departamentosQuery, municipiosQuery, zonaValida } from './ubicaciones.schemas.js';

interface DatosIne {
  fuente: { sha256: string; url: string };
  departamentos: { codigo: string; nombre: string }[];
  municipios: { codigo: string; codigoDepartamento: string; nombre: string }[];
}
const datos: DatosIne = JSON.parse(
  await readFile(new URL('../../../../db/data/ubicaciones-gt.json', import.meta.url), 'utf8'),
);
describe('Catálogo oficial de ubicaciones del INE', () => {
  it('contiene exactamente 22 departamentos y 340 municipios, códigos únicos y relaciones válidas', () => {
    expect(datos.departamentos).toHaveLength(22);
    expect(datos.municipios).toHaveLength(340);
    expect(new Set(datos.departamentos.map((d) => d.codigo)).size).toBe(22);
    expect(new Set(datos.municipios.map((m) => m.codigo)).size).toBe(340);
    // Distribución departamental contrastada con la fuente, independiente del seed.
    const totales = [
      17, 8, 16, 16, 14, 14, 19, 8, 24, 21, 9, 30, 33, 21, 8, 17, 14, 5, 11, 11, 7, 17,
    ];
    datos.departamentos.forEach((d, i) => {
      expect(d.codigo).toBe(String(i + 1).padStart(2, '0'));
      expect(datos.municipios.filter((m) => m.codigoDepartamento === d.codigo)).toHaveLength(
        totales[i]!,
      );
    });
    for (const m of datos.municipios) {
      expect(m.codigo).toMatch(/^\d{4}$/);
      expect(m.codigo.slice(0, 2)).toBe(m.codigoDepartamento);
      expect(datos.departamentos.some((d) => d.codigo === m.codigoDepartamento)).toBe(true);
      expect(m.nombre.trim()).not.toBe('');
    }
    expect(datos.municipios.find((m) => m.codigo === '0101')?.nombre).toBe('Guatemala');
  });
  it('conserva el archivo oficial con su SHA-256 y carga todos los pares sin alterar nombres', async () => {
    const original = await readFile(
      new URL('../../../../db/data/ine/lugares-poblados-censo-2018.xlsx', import.meta.url),
    );
    expect(createHash('sha256').update(original).digest('hex')).toBe(datos.fuente.sha256);
    expect(new URL(datos.fuente.url).hostname).toBe('datos.ine.gob.gt');
    const seed = await readFile(
      new URL('../../../../db/seeds/S006__ubicaciones_guatemala.sql', import.meta.url),
      'utf8',
    );
    const municipios = [
      ...seed.matchAll(
        /SELECT '([^']+)' CODIGO_INE,'((?:[^']|'')+)' NOMBRE,ID_DEPARTAMENTO_GT FROM DEPARTAMENTOS_GT WHERE CODIGO_INE='([^']+)'/g,
      ),
    ].map((m) => ({ codigo: m[1], nombre: m[2]!.replaceAll("''", "'"), codigoDepartamento: m[3] }));
    expect(municipios).toEqual(datos.municipios);
    expect(seed.match(/MERGE INTO DEPARTAMENTOS_GT/g)).toHaveLength(22);
    expect(seed.match(/MERGE INTO MUNICIPIOS_GT/g)).toHaveLength(340);
  });
  it('rechaza filtros no permitidos y departamentos inválidos', () => {
    expect(departamentosQuery.parse({})).toEqual({ buscar: '' });
    expect(municipiosQuery.parse({ idDepartamentoGt: '1' })).toEqual({
      buscar: '',
      idDepartamentoGt: 1,
    });
    for (const q of [
      { idDepartamentoGt: '0' },
      { idDepartamentoGt: '1 OR 1=1' },
      { otro: 'x' },
      { buscar: ['x'] },
    ])
      expect(municipiosQuery.safeParse(q).success).toBe(false);
  });
  it('exige zona 1–25 solo en Guatemala y permite No aplica fuera de ella', () => {
    expect(zonaValida('0101', null)).toBe(false);
    expect(zonaValida('0108', null)).toBe(true);
    expect(zonaValida('0101', 1)).toBe(true);
    expect(zonaValida('0101', 25)).toBe(true);
    for (const zona of [0, 26, 1.5]) expect(zonaValida('0108', zona)).toBe(false);
  });
});

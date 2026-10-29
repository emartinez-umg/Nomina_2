import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estados, etiquetaEstado } from './estados.js';
import { etiquetaCodigo, textoPresentacion } from './codigos.js';
describe('R3-4: registro compartido de estados', () => {
  it('cubre los estados persistidos, incluidos documentos y cargas', () => {
    const dir = new URL('../../../../db/migrations/', import.meta.url);
    const codigos = new Set<string>();
    for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(new URL(archivo, dir), 'utf8');
      for (const grupo of sql.matchAll(/\bESTADO\s+IN\s*\(([^)]+)\)/gi))
        for (const codigo of grupo[1]!.matchAll(/'([A-Z_]+)'/g)) codigos.add(codigo[1]!);
    }
    expect(codigos.size).toBeGreaterThan(20);
    for (const codigo of codigos) {
      expect(estados, codigo).toHaveProperty(codigo);
      expect(etiquetaEstado(codigo)).not.toMatch(/_/);
    }
  });
  it('traduce estados incrustados en alertas, conservando siglas y códigos públicos', () => {
    expect(textoPresentacion('Periodo sin cerrar · CALCULADO; ISR e IGSS; EMP_ING_0001')).toBe(
      'Periodo sin cerrar · Calculado; ISR e IGSS; EMP_ING_0001',
    );
  });
  it('las exportaciones usan la misma etiqueta de la pantalla', () => {
    expect(etiquetaCodigo('EN_PROCESO')).toBe(etiquetaEstado('EN_PROCESO'));
    expect(etiquetaCodigo('VISTA_PREVIA')).toBe('Vista previa');
  });
});

import { describe, expect, it } from 'vitest';
import { estadoDocumento } from './expedientes.service.js';
import { bajaExpedienteSchema, cargaExpedienteSchema } from './expedientes.schemas.js';
describe('Expediente: fechas, metadatos y baja motivada', () => {
  it('incluye el día del vencimiento, el límite de aviso y exige fecha cuando corresponde', () => {
    expect(estadoDocumento({ vencimiento: '2026-10-28' }, true, '2026-10-29', 30)).toBe('Vencido');
    expect(estadoDocumento({ vencimiento: '2026-10-29' }, true, '2026-10-29', 0)).toBe(
      'Por vencer',
    );
    expect(estadoDocumento({ vencimiento: '2026-11-28' }, true, '2026-10-29', 30)).toBe(
      'Por vencer',
    );
    expect(estadoDocumento({ vencimiento: '2026-11-29' }, true, '2026-10-29', 30)).toBe('Vigente');
    expect(estadoDocumento({ vencimiento: null }, true, '2026-10-29', 30)).toBe(
      'Falta vencimiento',
    );
    expect(estadoDocumento({ vencimiento: null }, false, '2026-10-29', 30)).toBe('Vigente');
  });
  it('rechaza fecha imposible, IDs ajenos a contrato y baja sin confirmación/motivo', () => {
    expect(cargaExpedienteSchema.safeParse({ tipo: 1, vencimiento: '2026-02-30' }).success).toBe(
      false,
    );
    expect(cargaExpedienteSchema.safeParse({ tipo: 1, empleado: 3 }).success).toBe(false);
    expect(bajaExpedienteSchema.safeParse({ motivo: '', confirmado: true }).success).toBe(false);
    expect(
      bajaExpedienteSchema.safeParse({ motivo: 'Corrección documental', confirmado: false })
        .success,
    ).toBe(false);
  });
});

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { registrarPeticiones } from './request-logger.js';
import { crearLogger } from '../../config/logger.js';
describe('Logs sin entrada privada', () => {
  it('registra plantillas y excluye documentos en URL, query, headers y cuerpo', async () => {
    const logger = crearLogger('silent'),
      info = vi.spyOn(logger, 'info'),
      app = express();
    app.use(express.json(), registrarPeticiones(logger));
    app.post('/empleados/:id', (_r, s) => s.sendStatus(204));
    await request(app)
      .post('/empleados/1234567890123?nit=1234567-9')
      .set('Cookie', 'token=privado')
      .send({ cuentaBancaria: '987654321', contrasena: 'NoRegistrar!2026' })
      .expect(204);
    await request(app).get('/1234567890123').expect(404);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).toContain('/empleados/:id');
    expect(logs).toContain('(sin coincidencia)');
    expect(logs).not.toMatch(/1234567890123|1234567-9|987654321|NoRegistrar|privado/);
  });
});

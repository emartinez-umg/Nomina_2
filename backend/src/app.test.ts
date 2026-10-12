import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { crearApp } from './app.js';
import { crearLogger } from './config/logger.js';
import { crearSaludService } from './modules/salud/salud.service.js';

const logger = crearLogger('silent');

function preparar(verificarConexion = vi.fn().mockResolvedValue(undefined)) {
  return {
    verificarConexion,
    app: crearApp(crearSaludService({ verificarConexion }, logger), logger),
  };
}

describe('API de salud', () => {
  it('responde OK solo después de verificar Oracle y añade headers de seguridad', async () => {
    const { app, verificarConexion } = preparar();
    const respuesta = await request(app).get('/api/salud').expect(200);
    expect(verificarConexion).toHaveBeenCalledOnce();
    expect(respuesta.body).toMatchObject({
      ok: true,
      data: { estado: 'OK', baseDatos: 'CONECTADA', modo: 'thin' },
    });
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-request-id']).toBeTruthy();
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('responde 503 sin filtrar SQL, contraseña o stack cuando falla Oracle', async () => {
    const { app } = preparar(
      vi.fn().mockRejectedValue(new Error('SELECT secreto, password FROM SYS')),
    );
    const respuesta = await request(app).get('/api/salud').expect(503);
    expect(respuesta.body).toMatchObject({
      ok: false,
      data: null,
      error: { codigo: 'BD_NO_DISPONIBLE' },
    });
    expect(respuesta.body.meta.requestId).toBe(respuesta.headers['x-request-id']);
    expect(respuesta.text).not.toMatch(/SELECT|password|stack|SYS/);
  });

  it('rechaza parámetros desconocidos antes de consultar Oracle', async () => {
    const { app, verificarConexion } = preparar();
    const respuesta = await request(app).get('/api/salud?sql=SELECT').expect(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(verificarConexion).not.toHaveBeenCalled();
  });

  it('normaliza rutas desconocidas', async () => {
    const { app } = preparar();
    const respuesta = await request(app).get('/api/desconocido').expect(404);
    expect(respuesta.body).toMatchObject({
      ok: false,
      data: null,
      error: { codigo: 'NO_ENCONTRADO' },
    });
  });

  it('normaliza JSON mal formado', async () => {
    const { app } = preparar();
    const respuesta = await request(app)
      .post('/api/salud')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(respuesta.body.error.codigo).toBe('JSON_INVALIDO');
  });

  it('normaliza errores inesperados sin exponer detalles internos', async () => {
    const app = crearApp(
      { consultar: vi.fn().mockRejectedValue(new Error('detalle privado')) },
      logger,
    );
    const respuesta = await request(app).get('/api/salud').expect(500);
    expect(respuesta.body.error.codigo).toBe('ERROR_INTERNO');
    expect(respuesta.text).not.toContain('detalle privado');
  });

  it('limita el tamaño de los cuerpos', async () => {
    const { app } = preparar();
    const respuesta = await request(app)
      .post('/api/salud')
      .send({ texto: 'a'.repeat(110000) })
      .expect(413);
    expect(respuesta.body.error.codigo).toBe('CUERPO_GRANDE');
  });
});

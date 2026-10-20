import { describe, expect, it } from 'vitest';
import { verify } from 'argon2';
import { cargarDataset } from './datos.js';
import { generarSqlDemo, literalSql } from './exportar.js';
import { generarContrasenaTemporal } from '../../security/credenciales.js';

describe('Generación privada del SQL demo', () => {
  it('escapa comillas y evita la sustitución de ampersands de SQLPlus', () => {
    expect(literalSql("O'Brien & compañía")).toBe("'O''Brien '||CHR(38)||' compañía'");
  });
  it('genera un único bloque sin DDL ni clave temporal y con hashes individuales de la app', async () => {
    const contrasena = generarContrasenaTemporal();
    const sql = await generarSqlDemo(await cargarDataset(), contrasena);
    expect(sql).not.toContain(contrasena);
    expect(sql).not.toMatch(/CREATE\s+(?:TABLE|USER|PACKAGE|PROCEDURE)|ALTER\s+(?:TRIGGER|TABLE)/i);
    expect(sql).not.toMatch(/^(?:SET|WHENEVER|CONNECT) /m);
    expect(sql).not.toContain('&');
    expect(sql).toContain('ROLLBACK;');
    expect(sql).toContain('COMMIT;');
    expect(sql.trim().endsWith('END;\n/')).toBe(true);
    expect(sql.split('\n').every((linea) => Buffer.byteLength(linea) < 2499)).toBe(true);
    const hashes = sql.match(/\$argon2id\$v=19\$[^"\s]+/g) ?? [];
    expect(hashes).toHaveLength(32);
    expect(new Set(hashes).size).toBe(32);
    expect(await verify(hashes[0]!, contrasena)).toBe(true);
  }, 15000);
  it('rechaza una contraseña inválida antes de preparar el archivo', async () => {
    await expect(generarSqlDemo(await cargarDataset(), '')).rejects.toThrow();
  });
});

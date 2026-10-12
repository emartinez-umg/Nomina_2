import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { z } from 'zod';

export const politicaContrasena = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .max(128, 'Usa como máximo 128 caracteres.')
  .regex(/[A-Z]/, 'Incluye una letra mayúscula.')
  .regex(/[a-z]/, 'Incluye una letra minúscula.')
  .regex(/[0-9]/, 'Incluye un número.')
  .regex(/[^A-Za-z0-9\s]/, 'Incluye un símbolo.');

export const hashearContrasena = (contrasena: string) =>
  hash(contrasena, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const generarToken = () => randomBytes(32).toString('hex');
export const hashToken = (token: string) => createHash('sha256').update(token).digest();
export const tokenValido = (token: unknown): token is string =>
  typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export const coincideToken = (token: unknown, esperado: Buffer) =>
  tokenValido(token) && timingSafeEqual(hashToken(token), esperado);

export function generarContrasenaTemporal(): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_'];
  const todos = grupos.join('');
  const caracteres = grupos.map((grupo) => grupo[randomInt(grupo.length)]!);
  while (caracteres.length < 24) caracteres.push(todos[randomInt(todos.length)]!);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j]!, caracteres[i]!];
  }
  return caracteres.join('');
}

export function baseNombreUsuario(nombre: string, apellido: string) {
  const limpiar = (valor: string) =>
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const base = `${limpiar(nombre).slice(0, 30)}.${limpiar(apellido).slice(0, 30)}`;
  if (!/^[a-z][a-z0-9]*\.[a-z0-9]+$/.test(base)) {
    throw new Error('Nombre y apellido deben contener letras para generar el usuario.');
  }
  return base;
}

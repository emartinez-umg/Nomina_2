import type { IdentidadEmpresa, FirmaDocumento } from './documento.js';
export const empresaPrueba: IdentidadEmpresa = {
  razonSocial: 'Empresa de prueba, S. A.',
  nombreComercial: 'Empresa',
  nit: '1234567-9',
  direccion: 'Ciudad de Guatemala, zona 1',
  telefono: '55551234',
  correo: 'rh@example.test',
  sitioWeb: 'https://example.test',
  logo: null,
};
export const firmaPrueba: FirmaDocumento = {
  idUsuario: 7,
  nombre: 'María López Pérez',
  cargo: 'Jefa de Recursos Humanos',
  fecha: '2026-10-14 10:30:00',
};

export const prefijoBorrador = 'nomina2:borrador:';
export const claveSesionBorradores = 'nomina2:borradores:sesion';
export const eventoBorradores = 'nomina2:borradores-cambiados';

export interface Borrador {
  version: number;
  guardado: number;
  valores: Record<string, unknown>;
  paso?: string | number | undefined;
}
const sensible = (nombre: string) =>
  /contrasena|password|passwd|secret|token|csrf|archivo|adjunto|file|attachment|upload|base64|credencial|credential|__proto__|constructor|prototype/i.test(
    nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );

// Solo datos JSON: nunca se serializan archivos ni objetos del navegador o credenciales.
export function sanearBorrador(valor: unknown): unknown {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (Array.isArray(valor)) return valor.map(sanearBorrador).filter((v) => v !== undefined);
  if (typeof valor !== 'object' || !valor || Object.getPrototypeOf(valor) !== Object.prototype)
    return undefined;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([k]) => !sensible(k))
      .map(([k, v]) => [k, sanearBorrador(v)])
      .filter(([, v]) => v !== undefined),
  );
}
export const claveBorrador = (usuario: number, formulario: string, registro?: string | number) =>
  `${prefijoBorrador}${usuario}:${formulario}:${registro ?? 'nuevo'}`;

export function leerBorrador(clave: string, version: number): Borrador | null {
  const texto = localStorage.getItem(clave);
  if (!texto) return null;
  try {
    const d = JSON.parse(texto) as Borrador;
    if (
      d.version !== version ||
      !Number.isFinite(d.guardado) ||
      d.guardado < 0 ||
      !d.valores ||
      Array.isArray(d.valores) ||
      typeof d.valores !== 'object' ||
      (d.paso !== undefined && typeof d.paso !== 'string' && !Number.isInteger(d.paso))
    )
      throw new Error('Borrador incompatible.');
    return { ...d, valores: sanearBorrador(d.valores) as Record<string, unknown> };
  } catch {
    localStorage.removeItem(clave);
    return null;
  }
}
export function sesionPermiteBorrador(usuario: number) {
  const sesion = localStorage.getItem(claveSesionBorradores);
  return sesion === null || (JSON.parse(sesion) as { usuario: number | null }).usuario === usuario;
}
function cambiarSesionBorradores(usuario: number | null) {
  // El evento cancela escrituras pendientes incluso si localStorage está lleno o bloqueado.
  window.dispatchEvent(new CustomEvent(eventoBorradores, { detail: { usuario } }));
  try {
    const conservar = usuario === null ? null : `${prefijoBorrador}${usuario}:`;
    for (const clave of Object.keys(localStorage))
      if (clave.startsWith(prefijoBorrador) && (!conservar || !clave.startsWith(conservar)))
        localStorage.removeItem(clave);
    localStorage.setItem(claveSesionBorradores, JSON.stringify({ usuario, fecha: Date.now() }));
  } catch {
    // La sesión y los formularios siguen funcionando sin almacenamiento disponible.
  }
}
export const activarBorradoresUsuario = (usuario: number) => cambiarSesionBorradores(usuario);
export const limpiarBorradoresSesion = () => cambiarSesionBorradores(null);

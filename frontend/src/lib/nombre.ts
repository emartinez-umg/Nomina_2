export function nombreUsuario(persona: { nombreMostrado?: string | undefined; usuario: string }) {
  return (
    persona.nombreMostrado ??
    persona.usuario
      .split('.')
      .filter(Boolean)
      .map(
        (parte) =>
          parte.charAt(0).toLocaleUpperCase('es-GT') + parte.slice(1).toLocaleLowerCase('es-GT'),
      )
      .join(' ')
  );
}
export const nombreEmpleado = (nombres: string, apellidos: string) =>
  [nombres, apellidos]
    .map((parte) => parte.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
    .join(' ');

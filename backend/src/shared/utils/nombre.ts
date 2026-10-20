// La ficha y los documentos conservan los nombres completos; las vistas usan el primer nombre y apellido.
export function nombrePersona(nombres: string, apellidos: string) {
  return [nombres, apellidos]
    .map((parte) => parte.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
    .join(' ');
}
// Solo recibe expresiones SQL internas del repository, nunca entradas del cliente.
export const nombrePersonaSql = (nombres: string, apellidos: string) =>
  `TRIM(REGEXP_SUBSTR(${nombres}, '[^[:space:]]+')||' '||REGEXP_SUBSTR(${apellidos}, '[^[:space:]]+'))`;
export const nombreUsuarioSql = (alias: string) =>
  `COALESCE((SELECT ${nombrePersonaSql('PERSONA.NOMBRES', 'PERSONA.APELLIDOS')} FROM EMPLEADOS PERSONA WHERE PERSONA.ID_USUARIO=${alias}.ID_USUARIO), INITCAP(REPLACE(${alias}.USUARIO,'.',' ')))`;

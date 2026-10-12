export function FormErrorSummary({
  mensajes,
  mensajeServidor,
}: {
  mensajes: (string | undefined)[];
  mensajeServidor?: string | undefined;
}) {
  const errores = [...new Set(mensajes.filter((m): m is string => !!m))];
  if (!errores.length && !mensajeServidor) return null;
  return (
    <div role="alert" className="resumen-error">
      <p>{mensajeServidor ?? 'Revisa estos datos antes de continuar:'}</p>
      {errores.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {errores.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Skeleton({ lineas = 3 }: { lineas?: number }) {
  return (
    <div role="status" aria-label="Cargando información" className="space-y-4">
      {Array.from({ length: lineas }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-5 animate-pulse rounded-control bg-borde"
          style={{ width: i === lineas - 1 ? '65%' : '100%' }}
        />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

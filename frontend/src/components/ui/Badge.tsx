import type { PropsWithChildren } from 'react';
export function Badge({
  children,
  tono = 'informacion',
}: PropsWithChildren<{
  tono?: 'correcto' | 'peligro' | 'aviso' | 'informacion';
}>) {
  return <span className={`badge badge-${tono}`}>{children}</span>;
}

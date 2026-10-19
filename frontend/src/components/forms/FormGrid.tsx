import type { HTMLAttributes } from 'react';

/** Conserva la grilla de secciones; los campos interiores fluyen con su tamaño propio. */
export function FormGrid({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`form-grid ${className}`}>
      <div className="form-fields">{children}</div>
    </div>
  );
}

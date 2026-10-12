import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { iconos } from './icons';
import type { NombreIcono } from './icons';
import { Tooltip } from './Tooltip';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icono: NombreIcono;
  variante?: 'primario' | 'secundario' | 'peligro' | 'texto';
  cargando?: boolean;
  soloIcono?: boolean;
  motivoDeshabilitado?: string | undefined;
};
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    icono,
    variante = 'primario',
    cargando = false,
    soloIcono = false,
    motivoDeshabilitado,
    children,
    className = '',
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const Icono = iconos[cargando ? 'cargando' : icono];
  const etiqueta = props['aria-label'] ?? (typeof children === 'string' ? children : 'Acción');
  const boton = (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando}
      aria-label={soloIcono ? etiqueta : props['aria-label']}
      className={`boton boton-${variante} ${soloIcono ? 'boton-icono' : ''} ${className}`}
    >
      <Icono aria-hidden="true" size={19} className={cargando ? 'animate-spin' : ''} />
      {!soloIcono && children}
    </button>
  );
  return motivoDeshabilitado || soloIcono ? (
    <Tooltip texto={motivoDeshabilitado ?? etiqueta}>{boton}</Tooltip>
  ) : (
    boton
  );
});

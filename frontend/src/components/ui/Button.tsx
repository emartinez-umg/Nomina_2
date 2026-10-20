import { forwardRef, useContext } from 'react';
import { DraftExitContext } from '../forms/DraftExitContext';
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
  cancelarFormulario?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    icono,
    variante = 'primario',
    cargando = false,
    soloIcono = false,
    motivoDeshabilitado,
    cancelarFormulario = false,
    children,
    className = '',
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const salida = useContext(DraftExitContext);
  const Icono = iconos[cargando ? 'cargando' : icono];
  const etiqueta = props['aria-label'] ?? (typeof children === 'string' ? children : 'Acción');
  const boton = (
    <button
      {...props}
      onClick={(evento) => {
        if (cancelarFormulario) salida.solicitar(() => props.onClick?.(evento));
        else props.onClick?.(evento);
      }}
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

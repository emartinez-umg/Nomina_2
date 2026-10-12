import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Button } from './Button';
import { iconos } from './icons';
type Aviso = { id: number; mensaje: string; tono: 'correcto' | 'peligro' };
const Contexto = createContext<(mensaje: string, tono?: Aviso['tono']) => void>(() => {});
export const useToast = () => useContext(Contexto);
export function ToastProvider({ children }: PropsWithChildren) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const mostrar = useCallback((mensaje: string, tono: Aviso['tono'] = 'correcto') => {
    const id = ++siguiente.current;
    setAvisos((a) => [...a.slice(-3), { id, mensaje, tono }]);
    timers.current.push(setTimeout(() => setAvisos((a) => a.filter((v) => v.id !== id)), 8000));
  }, []);
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className="toasts" aria-live="polite">
        {avisos.map((a) => {
          const Icono = iconos[a.tono === 'correcto' ? 'correcto' : 'error'];
          return (
            <div
              key={a.id}
              role={a.tono === 'peligro' ? 'alert' : 'status'}
              className={`toast badge-${a.tono}`}
            >
              <Icono aria-hidden="true" />
              <p>{a.mensaje}</p>
              <Button
                icono="cancelar"
                variante="texto"
                soloIcono
                aria-label="Cerrar aviso"
                onClick={() => setAvisos((v) => v.filter((x) => x.id !== a.id))}
              />
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

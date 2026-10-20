import { createContext } from 'react';
import type { FormDraft } from '../../hooks/useFormDraft';

// Cada ventana tiene su propio alcance: cerrar un modal hijo no cancela el formulario padre.
export const DraftExitContext = createContext<{
  registrar: (draft: FormDraft) => () => void;
  solicitar: (salir: () => void) => void;
}>({ registrar: () => () => {}, solicitar: (salir) => salir() });

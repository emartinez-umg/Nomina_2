import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { HelpProvider } from '../components/help/HelpProvider';
import { ErrorApi } from '../lib/http';
import { SessionProvider } from './session';
export function Providers({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (intento, error) =>
              intento < 1 && !(error instanceof ErrorApi && error.estado > 0 && error.estado < 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <HelpProvider>
          <SessionProvider>{children}</SessionProvider>
        </HelpProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

import { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/react-query';

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Provider component that makes React Query available to any nested component
 * @param children - React components that will have access to React Query
 */
export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

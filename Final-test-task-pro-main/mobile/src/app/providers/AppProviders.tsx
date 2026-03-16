import React, { PropsWithChildren, useEffect } from 'react';
import { QueryProvider } from './QueryProvider';
import { initializeOneSignal } from '../../services/notifications/oneSignal';

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    void initializeOneSignal();
  }, []);

  return <QueryProvider>{children}</QueryProvider>;
}

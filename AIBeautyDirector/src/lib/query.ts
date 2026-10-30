import { QueryClient } from '@tanstack/react-query';

// One retry: offline should reach the offline state quickly, not after 3 backoffs.
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

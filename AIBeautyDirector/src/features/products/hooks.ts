import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { homeKey } from '@/features/routine/hooks';
import { useAuth } from '@/lib/auth-context';
import { listProducts, productsKey, saveProduct } from './api';
import type { ProductFormInput } from './schemas';

export function useProducts() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: productsKey(userId), queryFn: () => listProducts(userId), enabled: !!userId });
  return { ...query, userId };
}

// Home shows product names on routine steps, so it is refreshed too.
export function useSaveProduct(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string | null; values: ProductFormInput }) => saveProduct(userId, id, values),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: productsKey(userId) });
      client.invalidateQueries({ queryKey: homeKey(userId) });
    },
  });
}

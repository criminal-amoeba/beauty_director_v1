import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { ProductForm } from '@/components/products/ProductForm';
import type { AuthErrorKey } from '@/features/auth/schemas';
import { ChatError, sendAction } from '@/features/chat/api';
import { CATEGORIES, isOneOf } from '@/features/onboarding/codes';
import { productsKey } from '@/features/products/api';
import { useProducts, useSaveProduct } from '@/features/products/hooks';
import { emptyProduct, toFormInput, toInsert, type ProductFormInput } from '@/features/products/schemas';
import { DataError, isOffline } from '@/features/routine/api';

// Add (/product-edit) or edit (/product-edit?id=…) one product. `prefill` (JSON {name, brand?, category?})
// pre-fills a new product from a chat product card; with `thread`, `message` and `block` the save is sent as the
// card's `add_product` action (the server inserts it and logs the tap). A plain Screen, not a sheet: the keyboard
// would cover a sheet's fields on Android.
export default function EditProductScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id, prefill, thread, message, block } = useLocalSearchParams<{ id?: string; prefill?: string; thread?: string; message?: string; block?: string }>();
  const client = useQueryClient();
  const { data, error, isPending, refetch, isRefetching, userId } = useProducts();
  const save = useSaveProduct(userId);
  const editing = typeof id === 'string' && id ? id : null;
  const viaChat = !editing && typeof thread === 'string' && typeof message === 'string' && typeof block === 'string' ? { thread, message, block } : null;
  const addViaChat = useMutation({
    mutationFn: (values: ProductFormInput) => sendAction(viaChat!.thread, viaChat!.message, viaChat!.block, { type: 'add_product', product: toInsert(values) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: productsKey(userId) });
      client.invalidateQueries({ queryKey: ['chat', userId] });
    },
  });

  if (editing && isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Screen>
    );
  }
  if (editing && error) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
      </Screen>
    );
  }
  const row = editing ? data?.find((p) => p.id === editing) ?? null : null;
  const initial: ProductFormInput = row ? toFormInput(row) : { ...emptyProduct, ...parsePrefill(prefill) };
  const err = viaChat ? addViaChat.error : save.error;
  const offline = (err instanceof DataError && err.offline) || (err instanceof ChatError && err.code === 'offline');
  const saveError: AuthErrorKey | null = err ? (offline ? 'auth.errors.network' : 'auth.errors.generic') : null;

  return (
    <Screen edges={['bottom']}>
      <Text variant="h1">{row ? t('products.editTitle') : t('products.addTitle')}</Text>
      <ProductForm
        key={row?.id ?? 'new'}
        initial={initial}
        showStatus={!!row}
        submitLabel={t('products.save')}
        saving={save.isPending || addViaChat.isPending}
        error={saveError}
        onSubmit={(values) =>
          viaChat
            ? addViaChat.mutate(values, { onSuccess: () => router.back() })
            : save.mutate({ id: row?.id ?? null, values }, { onSuccess: () => router.back() })
        }
      />
    </Screen>
  );
}

function parsePrefill(raw: string | undefined): Partial<ProductFormInput> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as { name?: unknown; brand?: unknown; category?: unknown };
    return {
      name: typeof v.name === 'string' ? v.name.slice(0, 120) : '',
      brand: typeof v.brand === 'string' ? v.brand.slice(0, 80) : '',
      category: isOneOf(CATEGORIES, v.category) ? v.category : null,
    };
  } catch {
    return {};
  }
}

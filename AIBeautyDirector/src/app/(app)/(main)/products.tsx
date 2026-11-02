import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Package, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { ProductRow } from '@/components/products/ProductRow';
import { PRODUCT_STATUSES } from '@/features/onboarding/codes';
import { useProducts } from '@/features/products/hooks';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

// My products: everything the user owns, grouped by status. Add / edit happens on /product-edit.
export default function ProductsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { data, error, isPending, refetch, isRefetching } = useProducts();

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="h1">{t('products.title')}</Text>
        <Skeleton height={space.xxxl * 2} />
        <Skeleton height={space.xxxl * 2} />
        <Skeleton height={space.xxxl * 2} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="h1">{t('products.title')}</Text>
        <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
      </Screen>
    );
  }

  const groups = PRODUCT_STATUSES.map((status) => ({ status, items: data.filter((p) => p.status === status) })).filter((g) => g.items.length > 0);
  return (
    <Screen edges={['bottom']}>
      <Text variant="h1">{t('products.title')}</Text>
      {data.length === 0 ? (
        <EmptyState icon={Package} title={t('products.empty.title')} message={t('products.empty.message')} action={{ label: t('products.add'), onPress: () => router.push('/product-edit') }} />
      ) : (
        <>
          <Button title={t('products.add')} icon={Plus} onPress={() => router.push('/product-edit')} />
          {groups.map((g) => (
            <View key={g.status} style={{ gap: space.sm }}>
              <Text variant="label" color="textMuted">{t(`products.group.${g.status}`)}</Text>
              {g.items.map((p) => (
                <ProductRow key={p.id} product={p} onPress={() => router.push({ pathname: '/product-edit', params: { id: p.id } })} />
              ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

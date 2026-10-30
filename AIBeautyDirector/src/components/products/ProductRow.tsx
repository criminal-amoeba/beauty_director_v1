import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Pill, Text } from '@/components/ui';
import { isOneOf, PRODUCT_STATUSES, USE_TIMES, type Category } from '@/features/onboarding/codes';
import type { ProductRow as Row } from '@/features/products/schemas';
import { useTheme } from '@/theme/useTheme';

// One product in the list: name, brand · category, and pills for when it is used and (unless in use) its status.
export function ProductRow({ product, onPress }: { product: Row; onPress: () => void }) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const category = t(`codes.category.${product.category as Category}`);
  const useTime = isOneOf(USE_TIMES, product.use_time) ? product.use_time : 'both';
  const status = isOneOf(PRODUCT_STATUSES, product.status) ? product.status : 'active';
  return (
    <Card onPress={onPress} accessibilityLabel={t('products.edit', { name: product.name })}>
      <View style={{ gap: space.xs }}>
        <Text variant="label">{product.name}</Text>
        <Text variant="caption" color="textMuted">{[product.brand, category].filter(Boolean).join(' · ')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Pill label={t(`codes.useTime.${useTime}`)} tone={useTime === 'both' ? 'neutral' : useTime} />
          {status !== 'active' && <Pill label={t(`codes.productStatus.${status}`)} />}
        </View>
      </View>
    </Card>
  );
}

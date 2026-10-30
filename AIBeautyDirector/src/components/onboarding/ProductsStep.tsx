import { useState } from 'react';
import { View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card, PressableScale, Text } from '@/components/ui';
import { ProductForm } from '@/components/products/ProductForm';
import type { Product } from '@/features/onboarding/schemas';
import { emptyProduct } from '@/features/products/schemas';
import { useTheme } from '@/theme/useTheme';
import { StepFooter, StepScroll, type StepProps } from './parts';

const sameProduct = (a: Product, b: Product) =>
  a.name.toLowerCase() === b.name.toLowerCase() && a.brand.toLowerCase() === b.brand.toLowerCase();

// Inline compact form (name + brand + category; the rest can be filled in My products later) + the list added so
// far. Optional step: with nothing added the button skips. Editing = remove and add again.
export function ProductsStep({ initial, onSubmit, saving, error }: StepProps<Product[]>) {
  const { t } = useTranslation();
  const { colors, space, layout } = useTheme();
  const [items, setItems] = useState(initial);

  return (
    <>
      <StepScroll>
        <Card>
          <ProductForm
            key={items.length} // remount = a fresh form after each add
            compact
            initial={emptyProduct}
            submitLabel={t('onboarding.products.add')}
            submitIcon={Plus}
            submitVariant="secondary"
            validate={(v) => (items.some((it) => sameProduct(it, { name: v.name, brand: v.brand, category: v.category! })) ? 'onboarding.validation.duplicate' : null)}
            onSubmit={(v) => setItems([...items, { name: v.name, brand: v.brand, category: v.category! }])}
          />
        </Card>
        {items.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Text variant="label">{t('onboarding.products.listTitle', { count: items.length })}</Text>
            <Card style={{ gap: 0, paddingVertical: space.xs }}>
              {items.map((it, i) => (
                <View
                  key={`${it.name}|${it.brand}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
                  <View style={{ flex: 1, paddingVertical: space.sm }}>
                    <Text>{it.name}</Text>
                    <Text variant="caption" color="textMuted">
                      {[it.brand, t(`codes.category.${it.category}`)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <PressableScale
                    onPress={() => setItems(items.filter((x) => x !== it))}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.products.remove', { name: it.name })}
                    style={{ width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} color={colors.textMuted} />
                  </PressableScale>
                </View>
              ))}
            </Card>
          </View>
        )}
      </StepScroll>
      <StepFooter
        title={t(items.length ? 'onboarding.finish' : 'onboarding.products.skip')}
        onPress={() => onSubmit(items)}
        saving={saving}
        error={error}
      />
    </>
  );
}

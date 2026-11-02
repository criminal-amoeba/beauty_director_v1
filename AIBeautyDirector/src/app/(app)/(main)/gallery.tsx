import { useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Flame, Inbox, Moon, Sparkles, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  Avatar, Button, Card, Checkbox, ChecklistItem, Chip, EmptyState, ErrorState, Input, Pill,
  ProgressBar, Screen, Sheet, Skeleton, Steps, Text,
} from '@/components/ui';
import { GallerySamples } from '@/components/chat/GallerySamples';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import type { ColorScheme } from '@/theme/tokens';
import { ThemeOverride, useTheme } from '@/theme/useTheme';

// Dev-only catalogue of every UI primitive and state. Hidden in production builds.
export default function GalleryRoute() {
  const system = useColorScheme();
  const [scheme, setScheme] = useState<ColorScheme>(system === 'dark' ? 'dark' : 'light');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ThemeOverride.Provider value={scheme}>
      <Gallery scheme={scheme} setScheme={setScheme} />
    </ThemeOverride.Provider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { space, colors } = useTheme();
  return (
    <View style={{ gap: space.md, paddingTop: space.xl, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text variant="h2">{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>{children}</View>;
}

const zh = '今天的保養很棒！記得在睡前溫和清潔，並使用保濕產品，讓肌膚好好休息。';

function Gallery({ scheme, setScheme }: { scheme: ColorScheme; setScheme: (s: ColorScheme) => void }) {
  const { space } = useTheme();
  const { t } = useTranslation();
  const [checked, setChecked] = useState(true);
  const [steps, setSteps] = useState({ cleanse: true, serum: false, spf: false });
  const [skipped, setSkipped] = useState(false);
  const [chip, setChip] = useState('Hydration');
  const [sheet, setSheet] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const noop = () => {};
  const retry = () => { setRetrying(true); setTimeout(() => setRetrying(false), 1200); };

  return (
    <Screen edges={['bottom']}>
      <View style={{ gap: space.sm }}>
        <Text variant="display">Gallery</Text>
        <Text color="textMuted">Every primitive and state. Dev builds only.</Text>
        <Row>
          <Chip label="Light" icon={Sun} selected={scheme === 'light'} onPress={() => setScheme('light')} />
          <Chip label="Dark" icon={Moon} selected={scheme === 'dark'} onPress={() => setScheme('dark')} />
        </Row>
        <LanguageSwitch />
      </View>

      <Section title={t('gallery.language')}>
        <Text variant="h1">{t('home.greeting.morning')}</Text>
        <Text>{t('gallery.sample')}</Text>
        <Text variant="caption" color="textMuted">{t('rebuilding.message')}</Text>
        <Button title={t('common.retry')} variant="secondary" onPress={noop} />
      </Section>

      <Section title="Text">
        <Text variant="display">Display 32</Text>
        <Text variant="h1">Heading 1 · 26</Text>
        <Text variant="h2">Heading 2 · 20</Text>
        <Text>Body 16. Your skin is doing its best, and so are you.</Text>
        <Text variant="label">Label 16 semibold</Text>
        <Text variant="caption" color="textMuted">Caption 13 · muted</Text>
        <Text>{zh}</Text>
      </Section>

      <Section title="Button">
        <Text variant="caption" color="textMuted">Tap to see the pressed state (scale + darker fill).</Text>
        <Button title="Primary" onPress={noop} />
        <Button title="Primary with icon" icon={Sparkles} onPress={noop} />
        <Button title="Loading" loading onPress={noop} />
        <Button title="Disabled" disabled onPress={noop} />
        <Button title="Secondary" variant="secondary" onPress={noop} />
        <Button title="Secondary disabled" variant="secondary" disabled onPress={noop} />
        <Button title="Ghost" variant="ghost" onPress={noop} />
        <Button title="開始每週肌膚檢測，看看這週的變化" onPress={noop} />
      </Section>

      <Section title="Card">
        <Card>
          <Text variant="label">Static card</Text>
          <Text color="textMuted">Surface, soft warm shadow.</Text>
        </Card>
        <Card onPress={noop} accessibilityLabel="Pressable card">
          <Text variant="label">Pressable card</Text>
          <Text color="textMuted">Deeper shadow, scales on press.</Text>
        </Card>
        <Card tone="am" onPress={noop}><Text variant="label">AM tone</Text><Text>2 of 4 steps done</Text></Card>
        <Card tone="pm" onPress={noop}><Text variant="label">PM tone</Text><Text>Not started</Text></Card>
        <Card tone="primary"><Text variant="label">Primary tone</Text><Text>The Beauty Director has arrived</Text></Card>
      </Section>

      <Section title="Input">
        <Input label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="Password" helper="At least 8 characters." secureTextEntry />
        <Input label="Phone" defaultValue="0912" error="Enter a valid Taiwan mobile number." />
        <Input label="Disabled" defaultValue="Can't edit this" editable={false} />
        <Input label="暱稱" placeholder="請輸入你的名字" />
      </Section>

      <Section title="Checkbox & ChecklistItem">
        <Checkbox label="Toggle me" checked={checked} onChange={setChecked} />
        <Checkbox label="Unchecked" checked={false} onChange={noop} />
        <Checkbox label="Disabled (checked)" checked disabled onChange={noop} />
        <ChecklistItem
          title="Gentle cleanser"
          subtitle="Step 1 · 60 seconds"
          checked={steps.cleanse}
          onToggle={() => setSteps((s) => ({ ...s, cleanse: !s.cleanse }))}
          onSkip={noop}
        />
        <ChecklistItem
          title="Niacinamide serum"
          subtitle="Step 2"
          checked={steps.serum}
          skipped={skipped}
          onToggle={() => setSteps((s) => ({ ...s, serum: !s.serum }))}
          onSkip={() => setSkipped(true)}
        />
        <ChecklistItem
          title="防曬乳 SPF50，出門前 15 分鐘使用"
          checked={steps.spf}
          onToggle={() => setSteps((s) => ({ ...s, spf: !s.spf }))}
          onSkip={noop}
        />
        {skipped && <Button title="Reset skip" variant="ghost" onPress={() => setSkipped(false)} />}
      </Section>

      <Section title="Chip">
        <Row>
          {['Hydration', 'Pores', 'Even tone', '舒緩泛紅'].map((c) => (
            <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
          ))}
          <Chip label="Disabled" disabled />
          <Chip label="Small" size="sm" selected />
        </Row>
      </Section>

      <Section title="Pill">
        <Row>
          <Pill label="5-day streak" tone="am" icon={Flame} />
          <Pill label="Due today" tone="primary" icon={Sparkles} />
          <Pill label="Evening" tone="pm" icon={Moon} />
          <Pill label="Self-reported" />
        </Row>
      </Section>

      <Section title="Progress & Steps">
        <ProgressBar value={0} accessibilityLabel="0%" />
        <ProgressBar value={0.4} accessibilityLabel="40%" />
        <ProgressBar value={1} accessibilityLabel="100%" />
        <Steps current={1} total={7} label="Step 1 of 7" />
        <Steps current={4} total={7} label="Step 4 of 7" />
      </Section>

      <Section title="Skeleton (loading)">
        <Card>
          <Skeleton width="60%" height={26} />
          <Skeleton />
          <Skeleton width="80%" />
        </Card>
        <Row>
          <Skeleton width={44} height={44} radius={22} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton width="50%" />
            <Skeleton width="30%" height={18} />
          </View>
        </Row>
      </Section>

      <Section title="Empty / Error / Offline">
        <Card><EmptyState icon={Inbox} title="No products yet" message="Add what you already use. You may not need anything new." action={{ label: 'Add a product', onPress: noop }} /></Card>
        <Card><ErrorState onRetry={retry} retrying={retrying} /></Card>
        <Card><ErrorState offline onRetry={retry} retrying={retrying} /></Card>
      </Section>

      <Section title="Avatar">
        <Row>
          <Avatar name="Mei Lin" size="sm" />
          <Avatar name="Mei Lin" />
          <Avatar name="林美" size="lg" />
          <Avatar name="Alex" size="lg" />
        </Row>
      </Section>

      <Section title="Sheet">
        <Button title="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
        <Sheet visible={sheet} onClose={() => setSheet(false)} title="Add sign-in method">
          <Text color="textMuted">Link LINE or a phone number to this account.</Text>
          <Button title="Continue" onPress={() => setSheet(false)} />
        </Sheet>
      </Section>

      <Section title="Chat">
        <GallerySamples />
      </Section>
    </Screen>
  );
}

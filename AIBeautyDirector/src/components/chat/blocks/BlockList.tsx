import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, Droplets, Minus, Package, Plus, Sparkles, Sun, TrendingDown, TrendingUp, UserPen, X, type LucideIcon } from 'lucide-react-native';
import { Button, Card, Chip, Pill, Text } from '@/components/ui';
import type { ActedMap, ChatMessage } from '@/features/chat/api';
import type { Block, ChatAction, DiffStep } from '@/features/chat/blocks';
import { changeLabel } from '@/features/chat/change-label';
import { applyDiff, type Step } from '@/features/chat/diff';
import type { Category } from '@/features/onboarding/codes';
import type { Period, StepType } from '@/features/routine/steps';
import { useTheme } from '@/theme/useTheme';

export type UsedMap = Record<string, string>; // `${messageId}:${blockId}` → tapped option id (quick replies / choice)

export type BlockListProps = {
  message: ChatMessage;
  threadId: string;
  acted: ActedMap;
  used: UsedMap;
  // Only the newest assistant message keeps its taps live; older blocks are shown but inert.
  live: boolean;
  acting: string | null; // `${messageId}:${blockId}` of the action in flight
  routines?: Partial<Record<Period, Step[]>>; // current steps per period, for the before/after view
  productNames?: Record<string, string>; // product id → "Brand Name", for confirm cards
  onSend: (text: string, source?: { key: string; optionId: string }) => void;
  onAction: (messageId: string, blockId: string, action: ChatAction) => void;
};

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); // no haptics engine on web/simulators
const select = () => Haptics.selectionAsync().catch(() => {});

const CATEGORY_ICON: Record<Category, LucideIcon> = {
  cleanser: Droplets, toner: Droplets, serum: Droplets, moisturizer: Package, sunscreen: Sun, treatment: Sparkles, mask: Package, other: Package,
};

// Renders the fixed whitelist of block types under an assistant bubble. Unknown types never reach here
// (parseBlocks drops them). Anything the Director suggests is labelled as a suggestion.
export function BlockList(p: BlockListProps) {
  const { space } = useTheme();
  if (p.message.blocks.length === 0) return null;
  return (
    <View style={{ gap: space.sm, alignSelf: 'stretch' }}>
      {p.message.blocks.map((block) => (
        <OneBlock key={block.id} block={block} {...p} />
      ))}
    </View>
  );
}

function OneBlock({ block, message, threadId, acted, used, live, acting, routines, productNames, onSend, onAction }: BlockListProps & { block: Block }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { space, colors } = useTheme();
  const key = `${message.id}:${block.id}`;
  const done = acted[key];
  const busy = acting === key;
  const act = (action: ChatAction) => { tap(); onAction(message.id, block.id, action); };
  const stepLabel = (s: DiffStep | Step) => [t(`codes.stepType.${s.step_type as StepType}`), s.product_name].filter(Boolean).join(' · ');
  const verdict = done && <Pill label={t(done === 'applied' ? 'chat.blocks.applied' : 'chat.blocks.declined')} tone={done === 'applied' ? 'primary' : 'neutral'} icon={done === 'applied' ? Check : X} />;
  const actions = (yes: ChatAction, yesLabel: string, no: ChatAction) =>
    done ? verdict : (
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <View style={{ flexGrow: 1 }}><Button title={yesLabel} icon={Check} onPress={() => act(yes)} loading={busy} disabled={!live} /></View>
        <View style={{ flexGrow: 1 }}><Button title={t('chat.blocks.decline')} icon={X} variant="ghost" onPress={() => act(no)} disabled={!live || busy} /></View>
      </View>
    );
  const heading = (Icon: LucideIcon, title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Icon size={18} color={colors.primary} />
      <Text variant="label" style={{ flex: 1 }}>{title}</Text>
    </View>
  );

  switch (block.type) {
    case 'quick_replies':
    case 'choice': {
      const picked = used[key];
      return (
        <View style={{ gap: space.sm }}>
          {block.type === 'choice' && <Text variant="caption" color="textMuted">{block.question}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {block.options.map((o) => (
              <Chip key={o.id} label={o.label} selected={picked === o.id} disabled={!live || !!picked} onPress={() => { select(); onSend(o.label, { key, optionId: o.id }); }} />
            ))}
          </View>
        </View>
      );
    }
    case 'product_card': {
      const category = block.category ? t(`codes.category.${block.category as Category}`) : null;
      const prefill = JSON.stringify({ name: block.name, brand: block.brand ?? '', category: block.category });
      return (
        <Card>
          {heading(block.category ? CATEGORY_ICON[block.category as Category] : Package, block.name)}
          <Text variant="caption" color="textMuted">{[block.brand, category].filter(Boolean).join(' · ') || t('chat.suggestedBy')}</Text>
          {block.mode === 'owned' && block.product_id ? (
            <Button title={t('chat.blocks.open')} variant="ghost" onPress={() => router.push({ pathname: '/product-edit', params: { id: block.product_id! } })} />
          ) : done ? verdict : (
            <Button
              title={t('chat.blocks.addProduct')}
              icon={Plus}
              variant="secondary"
              disabled={!live}
              onPress={() => { tap(); router.push({ pathname: '/product-edit', params: { prefill, thread: threadId, message: message.id, block: block.id } }); }}
            />
          )}
        </Card>
      );
    }
    case 'routine_proposal': {
      const current = routines?.[block.period];
      const view = current ? applyDiff(current, block.diff) : null;
      return (
        <Card tone={block.period}>
          <Text variant="caption" color="textMuted">{t('chat.suggestedBy')}</Text>
          {heading(block.period === 'am' ? Sun : Sparkles, t('chat.blocks.proposalTitle', { period: t(`home.${block.period}.title`) }))}
          {block.reason ? <Text variant="caption">{block.reason}</Text> : null}
          {view ? (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              {(['before', 'after'] as const).map((side) => (
                <View key={side} style={{ flex: 1, gap: space.xs }}>
                  <Text variant="caption" color="textMuted">{t(`chat.blocks.${side}`)}</Text>
                  {view[side].map((s, i) => <Text key={`${s.step_type}${i}`} variant="caption" bold={side === 'after' && !view.before.some((b) => b.step_type === s.step_type && b.product_name === s.product_name && b.position === s.position)}>{`${i + 1}. ${stepLabel(s)}`}</Text>)}
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: space.xs }}>
              {block.diff.added.map((s) => <Text key={`a${s.position}`} variant="caption">{t('chat.blocks.added', { step: stepLabel(s) })}</Text>)}
              {block.diff.removed.map((s) => <Text key={`r${s.position}`} variant="caption">{t('chat.blocks.removed', { step: stepLabel(s) })}</Text>)}
              {block.diff.moved.map((s) => <Text key={`m${s.position}`} variant="caption" color="textMuted">{t('chat.blocks.moved', { step: stepLabel(s), position: s.position })}</Text>)}
            </View>
          )}
          {actions({ type: 'accept_routine' }, t('chat.blocks.accept'), { type: 'decline_routine' })}
        </Card>
      );
    }
    case 'confirm_change':
      return (
        <Card>
          <Text variant="caption" color="textMuted">{t('chat.suggestedBy')}</Text>
          {heading(UserPen, t('chat.blocks.changeTitle'))}
          <Text variant="caption">{changeLabel(block, t, (id) => productNames?.[id])}</Text>
          {block.reason ? <Text variant="caption" color="textMuted">{block.reason}</Text> : null}
          {actions({ type: 'confirm_change' }, t('chat.blocks.confirm'), { type: 'decline_change' })}
        </Card>
      );
    case 'scan_summary': {
      const date = new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${block.date}T00:00:00`));
      return (
        <Card>
          {heading(Sparkles, t('chat.blocks.scanTitle', { date }))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {block.metrics.map((m) => {
              const Icon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : m.trend === 'flat' ? Minus : undefined;
              const label = `${m.label} ${Math.round(m.value)}`;
              return (
                <View key={m.label} accessible accessibilityLabel={t('chat.blocks.metric', { label: m.label, value: Math.round(m.value), trend: t(`chat.blocks.trend.${m.trend ?? 'none'}`) })}>
                  <Pill label={label} icon={Icon} tone={m.trend === 'up' ? 'primary' : 'neutral'} />
                </View>
              );
            })}
          </View>
          <Text variant="caption" color="textMuted">{t('scan.disclaimer')}</Text>
        </Card>
      );
    }
  }
}

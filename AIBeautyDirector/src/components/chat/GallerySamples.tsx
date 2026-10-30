import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import type { ChatMessage } from '@/features/chat/api';
import type { Block } from '@/features/chat/blocks';
import { useTheme } from '@/theme/useTheme';
import { BlockList } from './blocks/BlockList';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { Welcome } from './Welcome';

// Dev gallery only: every bubble and block type from static fixtures, so the chat UI can be checked in both
// languages, both schemes and at 360 px without a real LLM. Never used by the chat screen.
const AT = '2026-10-30T09:00:00Z';
const UUID = 'dddddddd-0000-4000-8000-000000000001';
const REPLY: Record<string, string> = {
  en: 'Seven mornings and seven evenings. That is a real win, and it is exactly the kind of consistency your skin notices before you do. 😊\n\n**Keep doing what you are doing.** Tonight can be simple:\n\n1. Cleanse with your Gentle Foam\n2. Hydra Serum on slightly damp skin\n3. Cream to seal it in\n\nIf your cheeks still feel tight afterwards, a second *thin* layer of Cream is fine. # not a heading, [not a link](http://x)',
  'zh-TW': '七個早上、七個晚上，全部做到了。這是很實在的進步，肌膚會比你更早感覺到這份穩定。😊\n\n**維持現在的做法就好。** 今晚簡單就好：\n\n1. 用溫和潔顏慕斯洗臉\n2. 臉還微濕時上保濕精華\n3. 最後用乳霜鎖住\n\n如果洗完臉頰還是覺得*緊繃*，再薄薄補一層乳霜也可以。',
};
const blocksA: Block[] = [
  { type: 'quick_replies', id: 'b1', options: [{ id: 'o1', label: 'Show my routine' }, { id: 'o2', label: 'What could I change?' }] },
  { type: 'choice', id: 'b2', question: 'Which bothers you more right now?', options: [{ id: 'o1', label: 'Redness' }, { id: 'o2', label: 'Pores' }, { id: 'o3', label: 'Dryness' }] },
  { type: 'scan_summary', id: 'b3', scan_id: UUID, date: '2026-10-28', metrics: [{ label: 'pore visibility', value: 70, trend: 'up' }, { label: 'redness appearance', value: 64, trend: 'down' }, { label: 'oil balance', value: 68, trend: 'flat' }, { label: 'texture smoothness', value: 79, trend: null }] },
];
const blocksB: Block[] = [
  { type: 'product_card', id: 'b1', mode: 'suggest_add', product_id: null, name: 'Foaming Facial Cleanser', brand: 'CeraVe', category: 'cleanser' },
  { type: 'routine_proposal', id: 'b2', candidate_routine_id: UUID, period: 'pm', reason: 'A serum before the cream helps with hydration.', diff: { added: [{ step_type: 'serum', product_name: 'Acme Hydra Serum', position: 2 }], removed: [], moved: [{ step_type: 'moisturize', product_name: 'Cream', position: 3 }] } },
  { type: 'confirm_change', id: 'b3', entity: 'skin_profile', row_id: null, field: 'budget', new_value: 'low', label: 'budget: "low"', reason: 'You said your budget is tight this month.' },
];
const msg = (id: string, blocks: Block[]): ChatMessage => ({ id, role: 'assistant', content: '', blocks, created_at: AT });
const routines = { pm: [{ step_type: 'cleanse' as const, product_name: null, position: 1 }, { step_type: 'moisturize' as const, product_name: 'Cream', position: 2 }] };

export function GallerySamples() {
  const { i18n } = useTranslation();
  const { space } = useTheme();
  const noop = () => {};
  const common = { threadId: UUID, acted: {}, used: { [`a:b1`]: 'o2' }, live: true, acting: null, routines, onSend: noop, onAction: noop };
  return (
    <View style={{ gap: space.lg }}>
      <Text variant="caption" color="textMuted">Welcome state</Text>
      <View style={{ height: 300 }}><Welcome onAsk={noop} /></View>
      <Text variant="caption" color="textMuted">Bubbles (grouped), long markdown reply, typing</Text>
      <ChatBubble role="user" content="did my routine every day this week" createdAt={AT} first last animate={false} />
      <ChatBubble role="assistant" content={REPLY[i18n.language] ?? REPLY.en} createdAt={AT} first last={false} animate={false} />
      <ChatBubble role="assistant" content="One more thing: sunscreen tomorrow morning." createdAt={AT} first={false} last animate={false}>
        <BlockList message={msg('a', blocksA)} {...common} />
      </ChatBubble>
      <TypingIndicator />
      <Text variant="caption" color="textMuted">Cards</Text>
      <BlockList message={msg('b', blocksB)} {...common} />
    </View>
  );
}

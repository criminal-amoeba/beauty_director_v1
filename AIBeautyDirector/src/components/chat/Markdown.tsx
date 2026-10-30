import { View } from 'react-native';
import { Text } from '@/components/ui';
import { parseMarkdown, type Run } from '@/features/chat/markdown';
import type { Colors, TextVariant } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = { text: string; variant?: TextVariant; color?: keyof Colors };

// Renders the chat markdown subset (features/chat/markdown.ts) with the Text primitive only, so CJK bold and
// font scaling behave exactly like any other text. Lists are rows: marker + wrapping item.
export function Markdown({ text, variant = 'body', color = 'text' }: Props) {
  const { space } = useTheme();
  const runs = (rs: Run[]) =>
    rs.map((r, i) => (r.bold || r.italic ? <Text key={i} variant={variant} color={color} bold={r.bold} italic={r.italic}>{r.text}</Text> : r.text));
  return (
    <View style={{ gap: space.sm }}>
      {parseMarkdown(text).map((b, i) =>
        b.kind === 'paragraph' ? (
          <Text key={i} variant={variant} color={color}>{runs(b.runs)}</Text>
        ) : (
          <View key={i} style={{ gap: space.xs }}>
            {b.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text variant={variant} color={color} style={{ minWidth: space.lg }}>{b.ordered ? `${j + 1}.` : '•'}</Text>
                <Text variant={variant} color={color} style={{ flex: 1 }}>{runs(item)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

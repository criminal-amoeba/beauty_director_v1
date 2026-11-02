import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

const sizes = { sm: 32, md: 44, lg: 64 } as const;

// Latin names -> up to 2 initials ("Mei Lin" -> "ML"); CJK names -> first character ("林美" -> "林").
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (/[㐀-鿿]/.test(words[0][0])) return words[0][0];
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
};

type Props = { name: string; uri?: string; size?: keyof typeof sizes };

export function Avatar({ name, uri, size = 'md' }: Props) {
  const { colors, radii } = useTheme();
  const px = sizes[size];
  const frame = { width: px, height: px, borderRadius: radii.full };

  if (uri) return <Image source={{ uri }} style={frame} accessibilityLabel={name} />;
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[frame, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
      <Text variant={size === 'lg' ? 'h2' : 'caption'}>{initials(name)}</Text>
    </View>
  );
}

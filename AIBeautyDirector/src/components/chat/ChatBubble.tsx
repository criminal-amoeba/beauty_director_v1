import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Avatar, Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';
import { Markdown } from './Markdown';

type Props = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  tz?: string;
  first: boolean; // first of a group: avatar + name (assistant), wider gap above
  last: boolean; // last of a group: timestamp
  animate: boolean; // entrance slide for messages that arrived after the screen opened
  children?: ReactNode;
};

const AVATAR = 32; // Avatar size "sm"

// Assistant: avatar + name, surface bubble with a soft shadow, markdown. User: rose-clay-soft bubble on the right.
export function ChatBubble({ role, content, createdAt, tz, first, last, animate, children }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, space, radii, layout, shadow, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const mine = role === 'user';
  const time = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(createdAt));
  const name = t('chat.title');
  return (
    <Animated.View
      entering={animate && !reduceMotion ? FadeInDown.duration(motion.normal) : undefined}
      style={{ paddingTop: first ? space.lg : space.xs, flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.sm }}>
      {!mine && <View style={{ width: AVATAR, alignSelf: 'flex-end' }}>{first && <Avatar name={name} size="sm" />}</View>}
      <View style={{ maxWidth: layout.maxContentWidth * 0.85, flexShrink: 1, alignItems: mine ? 'flex-end' : 'flex-start', gap: space.xs }}>
        {!mine && first && <Text variant="caption" color="textMuted">{name}</Text>}
        <View
          style={[
            {
              backgroundColor: mine ? colors.primarySoft : colors.surface,
              borderRadius: radii.md,
              [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: radii.sm,
              padding: space.lg,
            },
            mine ? null : shadow.sm,
          ]}>
          {mine ? <Text>{content}</Text> : <Markdown text={content} />}
        </View>
        {last && <Text variant="caption" color="textMuted">{time}</Text>}
        {children}
      </View>
    </Animated.View>
  );
}

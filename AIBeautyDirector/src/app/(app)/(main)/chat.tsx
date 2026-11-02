import { useState } from 'react';
import { FlatList, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { Composer } from '@/components/chat/Composer';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { Welcome } from '@/components/chat/Welcome';
import { BlockList, type UsedMap } from '@/components/chat/blocks/BlockList';
import { ChatError, chatErrorKey, type ChatMessage } from '@/features/chat/api';
import type { ChatAction } from '@/features/chat/blocks';
import { groupFlags } from '@/features/chat/group';
import { useSendAction, useSendMessage, useThread } from '@/features/chat/hooks';
import { isOffline } from '@/features/routine/api';
import { useProducts } from '@/features/products/hooks';
import { useHome } from '@/features/routine/hooks';
import { i18n } from '@/lib/i18n';
import { useTheme } from '@/theme/useTheme';

// Chat with the Beauty Director: the requested thread (`?thread=`) or the latest one. Messages come from the
// `chat` function only; block taps go back through it. Text is persisted server-side, windowed to 50 here.
// The list is inverted (newest at the bottom, data reversed): it opens at the latest message and stays pinned
// to the bottom when the keyboard resizes the window. shortcut: no iOS header offset for keyboard avoidance;
// add it when iOS testing starts.
export default function ChatScreen() {
  const { t } = useTranslation();
  const { colors, space, type } = useTheme();
  const { thread: threadParam } = useLocalSearchParams<{ thread?: string }>();
  const threadId = typeof threadParam === 'string' && threadParam ? threadParam : null;
  const { data, error, isPending, refetch, isRefetching, userId } = useThread(threadId);
  const home = useHome().data;
  const tz = home?.tz;
  const routines = home && {
    am: home.routines.am.steps.map((s) => ({ step_type: s.stepType, product_name: s.product, position: s.position })),
    pm: home.routines.pm.steps.map((s) => ({ step_type: s.stepType, product_name: s.product, position: s.position })),
  };
  const send = useSendMessage(userId, threadId, data?.id ?? threadId);
  const action = useSendAction(userId, threadId, data?.id ?? null);
  const [draft, setDraft] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null); // optimistic user bubble
  const [acting, setActing] = useState<string | null>(null);
  const products = useProducts().data;
  const productNames = products && Object.fromEntries(products.map((p) => [p.id, [p.brand, p.name].filter(Boolean).join(' ')]));
  const [used, setUsed] = useState<UsedMap>({}); // quick replies / choices already tapped on this screen
  const [openedAt] = useState(() => Date.now()); // only messages newer than this animate in

  const errorKey = (e: unknown) => (e instanceof ChatError ? chatErrorKey(e.code) : 'generic');
  // Title in the native header, level with the back button (CJK uses the system font like the Text primitive).
  const header = (
    <Stack.Screen options={{ headerTitle: t('chat.title'), headerTitleStyle: { color: colors.text, fontSize: type.h2.fontSize, fontFamily: i18n.language === 'zh-TW' ? undefined : type.h2.fontFamily } }} />
  );

  const submit = (text: string, source?: { key: string; optionId: string }) => {
    const clean = text.trim();
    if (!clean || send.isPending) return;
    if (source) setUsed((u) => ({ ...u, [source.key]: source.optionId }));
    setPendingText(clean);
    setDraft('');
    send.mutate(clean, {
      onSuccess: () => setPendingText(null),
      onError: () => { setDraft(clean); setPendingText(null); },
    });
  };
  const onAction = (messageId: string, blockId: string, a: ChatAction) => {
    const key = `${messageId}:${blockId}`;
    setActing(key);
    action.mutate({ messageId, blockId, action: a }, {
      onSettled: () => setActing(null),
      onSuccess: (r) => { if (r.result === 'applied') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
    });
  };

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <Skeleton width="80%" height={space.xxxl * 3} />
        <Skeleton width="40%" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
      </Screen>
    );
  }

  const messages = data?.messages ?? [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const rows: ChatMessage[] = pendingText
    ? [...messages, { id: 'pending', role: 'user', content: pendingText, blocks: [], created_at: new Date().toISOString() }]
    : messages;
  const flags = groupFlags(rows);
  const items = rows.map((m, i) => ({ ...m, ...flags[i] })).reverse();

  return (
    <Screen edges={['bottom']} scroll={false} keyboard="shift">
      {header}
      {rows.length === 0 ? (
        <Welcome onAsk={submit} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          inverted
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: space.lg }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          renderItem={({ item }) => (
            <ChatBubble role={item.role} content={item.content} createdAt={item.created_at} tz={tz} first={item.first} last={item.last} animate={Date.parse(item.created_at) > openedAt}>
              {item.role === 'assistant' && data && (
                <BlockList
                  message={item}
                  threadId={data.id}
                  acted={data.acted}
                  used={used}
                  live={item.id === lastAssistant && !send.isPending}
                  acting={acting}
                  routines={routines}
                  productNames={productNames}
                  onSend={submit}
                  onAction={onAction}
                />
              )}
            </ChatBubble>
          )}
          // inverted: the header sits visually at the bottom, right under the newest message
          ListHeaderComponent={
            <View style={{ gap: space.md, paddingTop: space.md }}>
              {send.isPending && <TypingIndicator />}
              <Text variant="caption" color="textMuted">{t('scan.disclaimer')}</Text>
            </View>
          }
        />
      )}
      {send.error && !send.isPending && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="caption" color="danger" style={{ flex: 1 }}>{t(`chat.errors.${errorKey(send.error)}`)}</Text>
          <Button title={t('chat.retry')} variant="ghost" onPress={() => submit(draft)} disabled={!draft.trim()} />
        </View>
      )}
      {action.error && !action.isPending && <Text variant="caption" color="danger">{t(`chat.errors.${errorKey(action.error)}`)}</Text>}
      <Composer value={draft} onChange={setDraft} onSend={() => submit(draft)} sending={send.isPending} />
    </Screen>
  );
}

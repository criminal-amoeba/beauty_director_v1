import type { Period } from '@/features/routine/steps';
import { CompletionCheck } from './CompletionCheck';

// Web (dev preview only): static check, so lottie-react-native and its web peer stay out of the bundle.
export function CompletionBurst({ onDone }: { period: Period; onDone: () => void }) {
  return <CompletionCheck onDone={onDone} />;
}

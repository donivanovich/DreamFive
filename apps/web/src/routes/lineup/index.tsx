import { createFileRoute } from '@tanstack/react-router';

import { LineupPage } from '@/features/lineup/LineupPage';

export const Route = createFileRoute('/lineup/')({
  component: LineupPage,
});

import { createFileRoute } from '@tanstack/react-router';

import { RankingsPage } from '@/features/rankings/RankingsPage';

export const Route = createFileRoute('/rankings/')({
  component: RankingsPage,
});

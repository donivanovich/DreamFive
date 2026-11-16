import { createFileRoute } from '@tanstack/react-router';

import { MatchesPage } from '@/features/matches/MatchesPage';

export const Route = createFileRoute('/matches/')({
  component: MatchesPage,
});

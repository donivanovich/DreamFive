import { createFileRoute } from '@tanstack/react-router';

import { LeaguesPage } from '@/features/leagues/LeaguesPage';

export const Route = createFileRoute('/leagues/')({
  component: LeaguesPage,
});

import { createFileRoute } from '@tanstack/react-router';

import { PlayersPage } from '@/features/players/PlayersPage';

export const Route = createFileRoute('/players/')({
  component: PlayersPage,
});

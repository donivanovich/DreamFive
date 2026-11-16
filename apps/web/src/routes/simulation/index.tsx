import { createFileRoute } from '@tanstack/react-router';

import { SimulationPage } from '@/features/simulation/SimulationPage';

export const Route = createFileRoute('/simulation/')({
  component: SimulationPage,
});

import { createFileRoute } from '@tanstack/react-router';

import { MailPage } from '@/features/mail/MailPage';

export const Route = createFileRoute('/mail/')({
  component: MailPage,
});

export const subscribers: {
  email: string;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
  /** Free text (≤ 50); null = no source, which every pre-source row has. */
  source: string | null;
  unsubscribedDaysAgo?: number;
}[] = [
  // TASK-2569: a subscriber with no source — what a row from before sources
  // existed, or one subscribed without a form id, looks like in the admin list.
  { email: 'svitlana.subscriber@example.com', status: 'SUBSCRIBED', source: null },
  { email: 'oksana@example.com', status: 'SUBSCRIBED', source: 'home' },
  { email: 'taras@example.com', status: 'SUBSCRIBED', source: 'promo' },
  { email: 'mariia@example.com', status: 'SUBSCRIBED', source: 'blog' },
  { email: 'andrii.subscriber@example.com', status: 'SUBSCRIBED', source: 'home' },
  {
    email: 'olena.subscriber@example.com',
    status: 'UNSUBSCRIBED',
    source: 'promo',
    unsubscribedDaysAgo: 3,
  },
  {
    email: 'ihor.subscriber@example.com',
    status: 'UNSUBSCRIBED',
    source: 'home',
    unsubscribedDaysAgo: 15,
  },
];

export const subscribers: {
  email: string;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
  source: string;
  unsubscribedDaysAgo?: number;
}[] = [
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

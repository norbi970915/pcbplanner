import { useEffect, useState } from 'react';
import { OPERATOR } from '../config';

/**
 * The operator's email. The prerendered HTML only has "user (at) domain"; the clickable address is
 * assembled after the page loads, so simple address scrapers don't find it.
 */
export default function ContactEmail() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const { user, domain } = OPERATOR.email;
  if (!ready) return <span>{user} (at) {domain}</span>;
  const address = [user, domain].join('@');
  return <a href={'mailto:' + address}>{address}</a>;
}

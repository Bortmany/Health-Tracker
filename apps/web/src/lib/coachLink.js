// The coach's shareable profile link, always a full address that works when
// pasted anywhere. The server may send a bare path ("/coach/sam?ref=ABC")
// when no public address is configured, so the page adds its own origin.
export function absoluteProfileLink(profile, origin) {
  const base = String(origin ?? '').replace(/\/+$/, '');
  const raw = profile?.referralLink || `/coach/${profile?.slug}?ref=${profile?.referralCode}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

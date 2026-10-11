import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absoluteProfileLink } from './coachLink.js';

test('a relative path from the server becomes a full address', () => {
  const profile = { referralLink: '/coach/sam?ref=ABC', slug: 'sam', referralCode: 'ABC' };
  assert.equal(absoluteProfileLink(profile, 'https://cut.app'), 'https://cut.app/coach/sam?ref=ABC');
});

test('an address the server already made absolute is kept as is', () => {
  const profile = { referralLink: 'https://app.example.com/coach/sam?ref=ABC' };
  assert.equal(absoluteProfileLink(profile, 'https://cut.app'), 'https://app.example.com/coach/sam?ref=ABC');
});

test('with no link from the server it is built from the slug and code', () => {
  const profile = { slug: 'sam', referralCode: 'ABC' };
  assert.equal(absoluteProfileLink(profile, 'https://cut.app/'), 'https://cut.app/coach/sam?ref=ABC');
});

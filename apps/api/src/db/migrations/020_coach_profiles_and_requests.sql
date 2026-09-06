-- Coach profiles, the public directory, referral sign-up and student requests.
--
-- Every approved coach gets one profile: a web address (slug), a headline, a
-- bio, which specialties they cover (from a fixed list, nothing free-typed),
-- whether they are taking new clients, whether the profile is visible to the
-- public (off by default — the coach opts in), and a referral code that lets
-- someone sign up through the coach's share link without a Cut invite code.
CREATE TABLE coach_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  headline TEXT,
  bio TEXT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  accepting_clients BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  referral_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Specialties can only come from this fixed list (shown in plain words in the app).
  CONSTRAINT coach_profiles_specialties_check CHECK (
    specialties <@ ARRAY['fat-loss', 'muscle-gain', 'beginners', 'strength', 'running',
                         'injury-safe', 'nutrition', 'womens-training', 'over-40', 'online-only']::text[]
  )
);

-- The public directory only ever lists public profiles.
CREATE INDEX coach_profiles_is_public_idx ON coach_profiles(is_public);

-- The coach-student link grows new states. 'requested' = waiting on someone's
-- answer (the coach's, for a student request or referral sign-up; the
-- student's, for a coach's in-app invite). 'declined' and 'ended' keep the
-- history of who asked and who coached whom instead of deleting the row.
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check
  CHECK (status IN ('pending', 'requested', 'active', 'declined', 'ended', 'revoked'));

-- Requests have no invite code, so the code is no longer required.
ALTER TABLE coach_clients ALTER COLUMN invite_code DROP NOT NULL;
-- Who asked for the link: the coach (invite by email), the student (from the
-- directory) or a referral sign-up. Invite-code links leave this empty.
ALTER TABLE coach_clients ADD COLUMN requested_by TEXT
  CHECK (requested_by IN ('coach', 'client', 'referral'));
-- When a link was ended (by either side).
ALTER TABLE coach_clients ADD COLUMN ended_at TIMESTAMPTZ;
-- The address a coach typed into "Invite by email", kept so the coach can
-- recognise the invite later.
ALTER TABLE coach_clients ADD COLUMN invite_email TEXT;

-- A coach and student who worked together, ended (or were declined), and later
-- want to reconnect must not be blocked by the old row. Only live links count
-- towards "one link per coach and client".
DROP INDEX coach_clients_coach_id_client_id_idx;
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx
  ON coach_clients(coach_id, client_id)
  WHERE client_id IS NOT NULL AND status NOT IN ('revoked', 'ended', 'declined');

-- Which coach's referral link a person signed up through, if any. Feeds the
-- later referral-attribution work; never shown publicly.
ALTER TABLE users ADD COLUMN referred_by_coach_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX users_referred_by_coach_id_idx ON users(referred_by_coach_id);

-- Backfill: anyone who is already a coach gets a profile now, so no existing
-- coach is stranded without one. The slug is their display name plus a short
-- random suffix; the referral code is random. New coaches get theirs the
-- moment the owner approves them (see routes/admin.js).
INSERT INTO coach_profiles (user_id, slug, referral_code)
SELECT u.id,
       left(trim(BOTH '-' FROM regexp_replace(lower(u.display_name), '[^a-z0-9]+', '-', 'g')), 40)
         || '-' || substr(md5(random()::text || u.id::text), 1, 4),
       upper(substr(md5(random()::text || u.id::text), 1, 10))
FROM users u
WHERE u.role = 'coach'
  AND NOT EXISTS (SELECT 1 FROM coach_profiles p WHERE p.user_id = u.id);

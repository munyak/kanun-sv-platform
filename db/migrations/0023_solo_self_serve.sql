-- Self-serve SOLO-monitor tier. Additive + nullable, safe on live DB.
-- A solo monitor signs up with no admin approval, gets their own 1-person org, an
-- agency_owner role (so the access gate passes on membership), and a 14-day trial.

alter table sv_organizations
  add column if not exists plan text,                 -- 'solo' | 'agency' | null
  add column if not exists subscription_status text,  -- 'trialing' | 'active' | 'past_due' | 'canceled'
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_subscription_id text,
  add column if not exists is_solo boolean default false;

comment on column sv_organizations.plan is 'Billing plan: solo (self-serve individual) or agency.';
comment on column sv_organizations.subscription_status is 'trialing | active | past_due | canceled — drives paywall.';
comment on column sv_organizations.trial_ends_at is 'When the free trial ends (self-serve solo signups).';
comment on column sv_organizations.is_solo is 'True for a single-person self-serve solo org.';

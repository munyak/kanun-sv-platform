-- Stripe customer id for solo self-serve billing. Additive + nullable, safe on live DB.
-- Set the first time a solo org starts a subscription checkout; reused so we don't
-- create a duplicate Stripe Customer on every upgrade attempt.

alter table sv_organizations
  add column if not exists stripe_customer_id text;

comment on column sv_organizations.stripe_customer_id is 'Stripe Customer id for this org (solo self-serve billing).';

-- LOCAL CANDIDATE ONLY. No Auth configuration or existing data is changed.
-- A receipt may remain after a failed submission. Retention/erasure must be
-- approved operationally before deployment; it is not copied by guest claim.
begin;
create table public.posting_consents (
  owner_id uuid not null,
  purpose text not null check (purpose in ('image','sns-create','sns-edit')),
  request_key uuid not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  terms_version text not null check (terms_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  privacy_version text not null check (privacy_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  terms_sha256 text not null check (terms_sha256 ~ '^[a-f0-9]{64}$'),
  privacy_sha256 text not null check (privacy_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz not null default now(),
  primary key (owner_id,purpose,request_key,terms_version,privacy_version)
);
alter table public.posting_consents enable row level security;
revoke all on table public.posting_consents from PUBLIC, anon, authenticated;
-- Supabase default privileges may already grant ALL to service_role.
-- Reset those inherited defaults before granting the intended append-only API.
revoke all on table public.posting_consents from service_role;
grant select, insert on table public.posting_consents to service_role;
comment on table public.posting_consents is 'Server verified public-submission consent; no IP, fingerprint, tokens, or content; retention approval required';
commit;

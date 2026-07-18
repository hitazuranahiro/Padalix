\set ON_ERROR_STOP on

begin;

select exists(
  select 1 from identity.member where auth_subject = :'auth_subject'
) as demo_account_exists \gset

\if :demo_account_exists
update identity.member
set verification_level = 'verified', account_status = 'active', updated_at = now()
where auth_subject = :'auth_subject';

update platform.wallet wallet
set available_balance = 1000, updated_at = now()
from platform.account account
where account.auth_subject = :'auth_subject'
  and wallet.account_id = account.id
  and wallet.asset_code = 'USDC'
  and wallet.network = 'sandbox';

with demo_account as (
  select id from platform.account where auth_subject = :'auth_subject'
), demo_recipient(id, display_name, payout_method, payout_reference_masked) as (
  values
    ('demo-recipient-maria-' || substr(md5(:'auth_subject'), 1, 12), 'Maria Santos', 'wallet', 'GCASH **** 1024'),
    ('demo-recipient-jose-' || substr(md5(:'auth_subject'), 1, 12), 'Jose Santos', 'bank', 'BANK **** 8841'),
    ('demo-recipient-liza-' || substr(md5(:'auth_subject'), 1, 12), 'Liza Santos', 'cash_pickup', 'CLAIM **** 3007')
)
insert into platform.recipient(id, account_id, display_name, country_code, payout_method, payout_reference_masked)
select recipient.id, account.id, recipient.display_name, 'PH', recipient.payout_method, recipient.payout_reference_masked
from demo_account account cross join demo_recipient recipient
on conflict(id) do update set
  display_name = excluded.display_name,
  payout_method = excluded.payout_method,
  payout_reference_masked = excluded.payout_reference_masked,
  updated_at = now();

commit;

select account.id as account_id, member.email, member.verification_level, wallet.available_balance, wallet.asset_code
from platform.account account
join identity.member member on member.id = account.member_id
join platform.wallet wallet on wallet.account_id = account.id and wallet.asset_code = 'USDC' and wallet.network = 'sandbox'
where account.auth_subject = :'auth_subject';
\else
rollback;
do $$ begin raise exception 'Demo account not found. Sign in once before running the seed.'; end $$;
\endif

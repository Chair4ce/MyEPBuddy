-- New reward types must be added in their own migration (Postgres enum txn rule).

ALTER TYPE credit_reward_type ADD VALUE IF NOT EXISTS 'first_managed_member';

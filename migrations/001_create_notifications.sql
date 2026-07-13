create table if not exists notifications (
  id bigserial primary key,
  user_id varchar(128) not null,
  type varchar(64) not null,
  title varchar(160) not null,
  message text not null,
  data jsonb null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id
  on notifications (user_id);

create index if not exists idx_notifications_created_at
  on notifications (created_at desc);

create index if not exists idx_notifications_user_created_at
  on notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_id_id
  on notifications (user_id, id);

create index if not exists idx_notifications_unread_by_user
  on notifications (user_id, created_at desc)
  where read_at is null;

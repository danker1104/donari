begin;

create table if not exists public.rhythm_leaderboard_records (
  board_key text not null check (char_length(board_key) between 1 and 160),
  nickname_key text not null,
  nickname text not null check (char_length(nickname) between 1 and 16),
  run_id uuid not null unique,
  score bigint not null check (score between 0 and 1000000000),
  accuracy double precision not null check (accuracy between 0 and 1),
  max_combo integer not null check (max_combo between 0 and 100000),
  rank text not null check (rank in ('SS', 'S', 'A', 'B', 'C', 'D')),
  played_at timestamptz not null default clock_timestamp(),
  primary key (board_key, nickname_key)
);

create index if not exists rhythm_leaderboard_order on public.rhythm_leaderboard_records
  (board_key, score desc, accuracy desc, max_combo desc, played_at, run_id);

create table if not exists public.rhythm_submission_limits (
  client_hash text primary key check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  submissions integer not null check (submissions > 0)
);

create index if not exists rhythm_submission_expiry on public.rhythm_submission_limits (window_start);
alter table public.rhythm_leaderboard_records enable row level security;
alter table public.rhythm_submission_limits enable row level security;
revoke all on public.rhythm_leaderboard_records, public.rhythm_submission_limits from public, anon, authenticated;
grant select, insert, update on public.rhythm_leaderboard_records to service_role;
grant select, insert, update, delete on public.rhythm_submission_limits to service_role;

create or replace function public.rhythm_get_leaderboard(p_board_key text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', records.run_id, 'nickname', records.nickname, 'score', records.score,
    'accuracy', records.accuracy, 'maxCombo', records.max_combo, 'rank', records.rank, 'playedAt', records.played_at
  ) order by records.score desc, records.accuracy desc, records.max_combo desc, records.played_at, records.run_id), '[]'::jsonb)
  from (
    select * from public.rhythm_leaderboard_records where board_key = p_board_key
    order by score desc, accuracy desc, max_combo desc, played_at, run_id limit 100
  ) records;
$$;

create or replace function public.rhythm_submit_leaderboard(
  p_board_key text, p_nickname text, p_run_id uuid, p_score bigint,
  p_accuracy double precision, p_max_combo integer, p_rank text, p_client_hash text
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_existing public.rhythm_leaderboard_records%rowtype;
  v_nickname_key text := lower(p_nickname);
  v_count integer;
  v_updated integer;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
begin
  select * into v_existing from public.rhythm_leaderboard_records where run_id = p_run_id;
  if found then
    if v_existing.board_key <> p_board_key or v_existing.nickname_key <> v_nickname_key then
      raise exception 'RUN_ALREADY_SUBMITTED' using errcode = '23505';
    end if;
    return jsonb_build_object('updated', false, 'entries', public.rhythm_get_leaderboard(p_board_key));
  end if;

  delete from public.rhythm_submission_limits where window_start < clock_timestamp() - interval '1 day';
  insert into public.rhythm_submission_limits as limits (client_hash, window_start, submissions)
    values (p_client_hash, v_window, 1)
    on conflict (client_hash) do update set window_start = excluded.window_start,
      submissions = case when limits.window_start = excluded.window_start then limits.submissions + 1 else 1 end
    returning submissions into v_count;
  if v_count > 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.rhythm_leaderboard_records as records
    (board_key, nickname_key, nickname, run_id, score, accuracy, max_combo, rank)
    values (p_board_key, v_nickname_key, p_nickname, p_run_id, p_score, p_accuracy, p_max_combo, p_rank)
    on conflict (board_key, nickname_key) do update set
      nickname = excluded.nickname, run_id = excluded.run_id, score = excluded.score,
      accuracy = excluded.accuracy, max_combo = excluded.max_combo, rank = excluded.rank,
      played_at = clock_timestamp()
    where (excluded.score, excluded.accuracy, excluded.max_combo) > (records.score, records.accuracy, records.max_combo);
  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated > 0, 'entries', public.rhythm_get_leaderboard(p_board_key));
end;
$$;

revoke all on function public.rhythm_get_leaderboard(text) from public, anon, authenticated;
revoke all on function public.rhythm_submit_leaderboard(text, text, uuid, bigint, double precision, integer, text, text) from public, anon, authenticated;
grant execute on function public.rhythm_get_leaderboard(text) to service_role;
grant execute on function public.rhythm_submit_leaderboard(text, text, uuid, bigint, double precision, integer, text, text) to service_role;

commit;
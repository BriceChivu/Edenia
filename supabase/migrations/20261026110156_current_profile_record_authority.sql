-- Current typed records share the existing head and owner write lock. Historical
-- versions remain immutable; their pointer is materialized before legacy APIs
-- read or protect a complete current profile.
alter table public.learner_profile_heads
  add column records_active boolean not null default false,
  add column records_profile_bytes integer,
  add column records_video_count integer,
  add column records_anki_count integer,
  add column records_exported_at text;
alter table private.learner_profile_access_control
  add column record_write_interval_ms integer not null default 5000
    check (record_write_interval_ms in (5000, 30000));
alter table public.learner_profile_write_receipts
  add column protocol text not null default 'envelope-v1'
    check (protocol in ('envelope-v1', 'records-v1'));

create table private.learner_profile_current_records (
  user_id uuid not null references public.learner_profile_heads(user_id) on delete cascade,
  profile_id uuid not null,
  generation bigint not null check (generation >= 1),
  kind text not null check (kind in ('section', 'video', 'anki')),
  record_key text not null,
  value jsonb not null,
  entry_bytes integer not null check (entry_bytes > 0),
  primary key (user_id, kind, record_key)
);
alter table private.learner_profile_current_records enable row level security;
revoke all on table private.learner_profile_current_records from public, anon, authenticated, service_role;

create function private.profile_record_entry_bytes(p_kind text, p_key text, p_value jsonb)
returns integer language sql stable security invoker set search_path = '' as $$
  select pg_catalog.octet_length(pg_catalog.convert_to(pg_catalog.to_jsonb(p_key)::text || ':' ||
    case when p_kind = 'section' and p_key = 'tinySwordsIsland'
      then private.canonical_island_jsonb_text(p_value) else private.canonical_jsonb_text(p_value) end || ',', 'UTF8'));
$$;

create function private.make_current_profile_envelope(p_profile jsonb, p_exported_at text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; payload jsonb; bytes integer := 0; measured integer;
begin
  payload := pg_catalog.jsonb_build_object('schema','edenia-portable-learner-profile',
    'version',1,'exportedAt',p_exported_at,'profile',p_profile);
  result := payload || pg_catalog.jsonb_build_object('integrity',pg_catalog.jsonb_build_object(
    'algorithm','SHA-256','byteLength',0,'payloadSha256',pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(private.canonical_jsonb_text(payload),'UTF8'),'sha256'),'base64'),'+/','-_'),'=')));
  loop
    measured := pg_catalog.octet_length(pg_catalog.convert_to(private.canonical_jsonb_text(result),'UTF8'));
    exit when measured = bytes;
    bytes := measured;
    result := pg_catalog.jsonb_set(result,'{integrity,byteLength}',pg_catalog.to_jsonb(bytes));
  end loop;
  return result;
end;
$$;

create function private.current_profile_envelope_bytes(p_profile_bytes integer, p_exported_at text)
returns integer language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; bytes integer := 0; measured integer;
begin
  result := pg_catalog.jsonb_build_object('schema','edenia-portable-learner-profile','version',1,
    'exportedAt',p_exported_at,'profile','{}'::jsonb,'integrity',pg_catalog.jsonb_build_object(
      'algorithm','SHA-256','byteLength',0,'payloadSha256',pg_catalog.repeat('A',43)));
  loop
    measured := pg_catalog.octet_length(pg_catalog.convert_to(private.canonical_jsonb_text(result),'UTF8')) + p_profile_bytes - 2;
    exit when measured = bytes;
    bytes := measured;
    result := pg_catalog.jsonb_set(result,'{integrity,byteLength}',pg_catalog.to_jsonb(bytes));
  end loop;
  return bytes;
end;
$$;

create function private.seed_current_profile_records(p_owner uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare head public.learner_profile_heads%rowtype; profile jsonb; exported_at text; source_envelope jsonb;
begin
  select h.* into strict head from public.learner_profile_heads h where h.user_id=p_owner for update;
  if head.records_active then return; end if;
  select v.envelope into source_envelope
    from public.learner_profile_versions v where v.id=head.current_version_id and v.user_id=p_owner
      and v.profile_id=head.profile_id and v.generation=head.generation and v.revision=head.revision;
  if source_envelope is null then raise exception 'Current learner profile cannot initialize records' using errcode='22023'; end if;
  perform private.assert_learner_profile_envelope(source_envelope);
  profile:=source_envelope->'profile'; exported_at:=source_envelope->>'exportedAt';
  delete from private.learner_profile_current_records r where r.user_id=p_owner;
  insert into private.learner_profile_current_records(user_id,profile_id,generation,kind,record_key,value,entry_bytes)
    select p_owner,head.profile_id,head.generation,'section',item.key,item.value,
      private.profile_record_entry_bytes('section',item.key,item.value)
    from pg_catalog.jsonb_each(profile - 'videos' - 'anki') item;
  insert into private.learner_profile_current_records(user_id,profile_id,generation,kind,record_key,value,entry_bytes)
    select p_owner,head.profile_id,head.generation,'video',item.key,item.value,
      private.profile_record_entry_bytes('video',item.key,item.value) from pg_catalog.jsonb_each(profile->'videos') item;
  insert into private.learner_profile_current_records(user_id,profile_id,generation,kind,record_key,value,entry_bytes)
    select p_owner,head.profile_id,head.generation,'anki',item.key,item.value,
      private.profile_record_entry_bytes('anki',item.key,item.value) from pg_catalog.jsonb_each(profile->'anki') item;
  update public.learner_profile_heads set records_active=true,
    records_profile_bytes=pg_catalog.octet_length(pg_catalog.convert_to(private.canonical_jsonb_text(profile),'UTF8')),
    records_video_count=(select pg_catalog.count(*)::integer from pg_catalog.jsonb_each(profile->'videos')),
    records_anki_count=(select pg_catalog.count(*)::integer from pg_catalog.jsonb_each(profile->'anki')),
    records_exported_at=exported_at where user_id=p_owner;
end;
$$;

create function private.assemble_current_profile(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(r.record_key,r.value) filter(where r.kind='section'),'{}'::jsonb)
    || pg_catalog.jsonb_build_object('videos',coalesce(pg_catalog.jsonb_object_agg(r.record_key,r.value) filter(where r.kind='video'),'{}'::jsonb),
      'anki',coalesce(pg_catalog.jsonb_object_agg(r.record_key,r.value) filter(where r.kind='anki'),'{}'::jsonb))
  from private.learner_profile_current_records r join public.learner_profile_heads h on h.user_id=r.user_id
    and h.profile_id=r.profile_id and h.generation=r.generation where r.user_id=p_owner;
$$;

create function private.materialize_current_profile(p_owner uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare head public.learner_profile_heads%rowtype; previous public.learner_profile_versions%rowtype;
  envelope jsonb; profile jsonb; version_id uuid; measured integer; stored_bytes integer;
begin
  if p_owner is null then return false; end if;
  perform 1 from auth.users u where u.id=p_owner for update;
  select h.* into head from public.learner_profile_heads h where h.user_id=p_owner for update;
  if not found or not head.records_active then return false; end if;
  select v.* into strict previous from public.learner_profile_versions v where v.id=head.current_version_id and v.user_id=p_owner;
  if previous.profile_id=head.profile_id and previous.generation=head.generation and previous.revision=head.revision then return true; end if;
  profile := private.assemble_current_profile(p_owner);
  envelope := private.make_current_profile_envelope(profile,head.records_exported_at);
  if (envelope#>>'{integrity,byteLength}')::integer <> private.current_profile_envelope_bytes(head.records_profile_bytes,head.records_exported_at) then
    -- Keep the raw profile intact and expose the mismatch as an explicitly
    -- invalid envelope. The established resolver can then choose a trusted
    -- predecessor while the displaced candidate is protected below.
    envelope:=envelope||pg_catalog.jsonb_build_object('currentRecordsRecovery',pg_catalog.jsonb_build_object(
      'reason','byte-accounting-mismatch','expectedProfileBytes',head.records_profile_bytes));
    loop
      stored_bytes:=(envelope#>>'{integrity,byteLength}')::integer;
      measured:=pg_catalog.octet_length(pg_catalog.convert_to(private.canonical_jsonb_text(envelope),'UTF8'));
      exit when measured=stored_bytes;
      envelope:=pg_catalog.jsonb_set(envelope,'{integrity,byteLength}',pg_catalog.to_jsonb(measured));
    end loop;
  end if;
  version_id := extensions.gen_random_uuid();
  insert into public.learner_profile_versions(id,user_id,profile_id,generation,revision,base_revision,envelope,payload_sha256,payload_bytes)
    values(version_id,p_owner,head.profile_id,head.generation,head.revision,previous.revision,envelope,
      envelope#>>'{integrity,payloadSha256}',(envelope#>>'{integrity,byteLength}')::integer);
  update public.learner_profile_heads set current_version_id=version_id where user_id=p_owner;
  return true;
end;
$$;

-- Preserve the historical complete-copy contract before legacy entry points.
-- A denied caller cannot trigger even this content-preserving bookkeeping.
create function private.materialize_my_current_profile()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); gate private.learner_profile_access_control%rowtype;
begin
  if owner_id is null then return; end if;
  select g.* into strict gate from private.learner_profile_access_control g where g.singleton;
  if gate.rollout_state='off' or (gate.rollout_state='developer-canary' and gate.developer_user_id is distinct from owner_id)
    or not private.learner_profile_trial_allows_owner() or private.learner_profile_account_is_locked(owner_id)
    or not exists(select 1 from auth.users u where u.id=owner_id and u.confirmed_at is not null
      and u.deleted_at is null and not coalesce(u.is_anonymous,false)) then return; end if;
  perform private.materialize_current_profile(owner_id);
end;
$$;

-- Full-envelope writes (including older clients, resets and restores) replace
-- current records atomically after advancing the very same head. Materializing
-- a snapshot at an unchanged revision never invalidates the current records.
create function private.reset_current_records_after_full_head()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.revision is distinct from old.revision or new.generation is distinct from old.generation or new.profile_id is distinct from old.profile_id)
    and exists(select 1 from public.learner_profile_versions v where v.id=new.current_version_id and v.user_id=new.user_id
      and v.profile_id=new.profile_id and v.generation=new.generation and v.revision=new.revision) then
    delete from private.learner_profile_current_records r where r.user_id=new.user_id;
    new.records_active:=false; new.records_profile_bytes:=null; new.records_video_count:=null;
    new.records_anki_count:=null; new.records_exported_at:=null;
  end if;
  return new;
end;
$$;
create trigger learner_profile_current_records_full_head before update on public.learner_profile_heads
  for each row execute function private.reset_current_records_after_full_head();

-- Automatic trusted-predecessor recovery must retain the displaced invalid
-- current candidate with the same protection as other recoveries. This private
-- source does not add a browser conflict-choice mode.
alter table private.learner_profile_recoveries drop constraint learner_profile_recoveries_source_check;
alter table private.learner_profile_recoveries add constraint learner_profile_recoveries_source_check check (
  (source='local' and source_candidate_id is null)
  or (source='operator' and source_candidate_id is null)
  or (source='current-records' and source_candidate_id is null)
  or (source='protected' and source_candidate_id is not null));
create function private.protect_invalid_current_records()
returns trigger language plpgsql security definer set search_path = '' as $$
declare displaced public.learner_profile_versions%rowtype; instant timestamptz:=pg_catalog.clock_timestamp();
begin
  if not old.records_active or new.records_active or old.current_version_id=new.current_version_id then return new; end if;
  select v.* into displaced from public.learner_profile_versions v where v.id=old.current_version_id
    and v.user_id=old.user_id and v.profile_id=old.profile_id and v.generation=old.generation and v.revision=old.revision;
  if not found or private.is_valid_learner_profile_envelope(displaced.envelope) then return new; end if;
  insert into private.learner_profile_recoveries(user_id,operation_id,request_sha256,source,source_profile_id,source_generation,source_revision,
    restored_profile_id,restored_generation,restored_revision,restored_version_id,
    displaced_profile_id,displaced_generation,displaced_revision,displaced_version_id,restored_at,protected_until)
    values(old.user_id,extensions.gen_random_uuid(),displaced.payload_sha256,'current-records',old.profile_id,old.generation,old.revision,
      new.profile_id,new.generation,new.revision,new.current_version_id,
      old.profile_id,old.generation,old.revision,old.current_version_id,instant,instant+interval '30 days');
  return new;
end;
$$;
create trigger learner_profile_current_records_invalid after update on public.learner_profile_heads
  for each row execute function private.protect_invalid_current_records();

create function learner_profile_rpc.commit_my_learner_profile_records(
  p_operation_id uuid,p_profile_id uuid,p_generation bigint,p_base_revision bigint,p_batch jsonb,p_session_boundary boolean default false)
returns table(status text,profile_id uuid,generation bigint,revision bigint,base_revision bigint,request_sha256 text,retry_after_ms integer)
language plpgsql volatile security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); gate private.learner_profile_access_control%rowtype;
  head public.learner_profile_heads%rowtype; receipt public.learner_profile_write_receipts%rowtype;
  request_digest text; unit jsonb; k text; record_kind text; unit_key text; present boolean; after_value jsonb;
  previous private.learner_profile_current_records%rowtype; entry_size integer; profile_bytes integer; video_count integer; anki_count integer;
  check_profile jsonb; exported_at text; instant timestamptz:=pg_catalog.clock_timestamp(); urgent boolean; interval_ms integer;
  metadata_keys text[]:=array['aspectRatio','channelId','channelImageUrl','channelTitle','duration','id','isShort','publishedAt','source','thumbnail','title'];
  personal_keys text[]:=array['favorite','hiddenFromGrid','hiddenFromGridAt','manuallyAdded','pausedAt','removedFromFeedAt','resumeAtSeconds','status','watchLater','watchProgress','watchProgressTracked','watchedAt','watchedConfirmationUnlockedAt'];
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select g.* into strict gate from private.learner_profile_access_control g where g.singleton;
  if gate.rollout_state='off' or (gate.rollout_state='developer-canary' and gate.developer_user_id is distinct from owner_id)
    or not private.learner_profile_trial_allows_owner() or private.learner_profile_account_is_locked(owner_id) then
    raise exception 'Learner profile access disabled' using errcode='42501'; end if;
  perform 1 from auth.users u where u.id=owner_id and u.confirmed_at is not null and u.deleted_at is null
    and not coalesce(u.is_anonymous,false) for update;
  if not found then raise exception 'Verified account required' using errcode='42501'; end if;
  if p_operation_id is null or p_profile_id is null or p_generation is null or p_generation<1 or p_base_revision is null or p_base_revision<1
    or pg_catalog.jsonb_typeof(p_batch) is distinct from 'object' or p_batch->'version' is distinct from '1'::jsonb
    or not p_batch ?& array['version','exportedAt','units'] or p_batch-array['version','exportedAt','units']<>'{}'::jsonb
    or pg_catalog.jsonb_typeof(p_batch->'units') is distinct from 'array' then
    raise exception 'Learner profile record request is invalid' using errcode='22023'; end if;
  exported_at:=p_batch->>'exportedAt';
  if not coalesce(private.is_canonical_profile_timestamp(exported_at),false) or pg_catalog.jsonb_array_length(p_batch->'units') not between 1 and 2048
    or pg_catalog.octet_length(pg_catalog.convert_to(private.canonical_island_jsonb_text(p_batch),'UTF8'))>2097152 then
    raise exception 'Learner profile record request is invalid' using errcode='22023'; end if;
  request_digest:=pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    private.canonical_island_jsonb_text(pg_catalog.jsonb_build_object('ownerId',owner_id,'operationId',p_operation_id,
      'profileId',p_profile_id,'generation',p_generation,'baseRevision',p_base_revision,'batch',p_batch)),'UTF8'),'sha256'),'base64'),'+/','-_'),'=');
  select r.* into receipt from public.learner_profile_write_receipts r where r.user_id=owner_id and r.operation_id=p_operation_id;
  if found then
    if receipt.protocol<>'records-v1' or receipt.request_sha256<>request_digest or receipt.profile_id<>p_profile_id
      or receipt.generation<>p_generation or receipt.base_revision<>p_base_revision then
      raise exception 'Learner profile operation input mismatch' using errcode='22023'; end if;
    return query select 'already_accepted'::text,receipt.profile_id,receipt.generation,receipt.accepted_revision,receipt.base_revision,request_digest,0; return;
  end if;
  if exists(select 1 from private.learner_profile_conflicts c where c.user_id=owner_id and c.operation_id=p_operation_id) then
    raise exception 'Learner profile operation input mismatch' using errcode='22023';
  end if;
  select h.* into head from public.learner_profile_heads h where h.user_id=owner_id for update;
  if not found or head.profile_id<>p_profile_id or head.generation<>p_generation or head.revision<>p_base_revision then
    return query select 'head_changed'::text,head.profile_id,head.generation,head.revision,p_base_revision,request_digest,0; return;
  end if;
  interval_ms:=gate.record_write_interval_ms;
  urgent:=coalesce(p_session_boundary,false) and head.updated_at>instant-(interval_ms*interval '1 millisecond')
    and (head.last_session_flush_at is null or head.last_session_flush_at<=instant-interval '5 minutes');
  if not urgent and head.updated_at>instant-(interval_ms*interval '1 millisecond') then
    return query select 'deferred'::text,head.profile_id,head.generation,head.revision,p_base_revision,request_digest,
      greatest(1,ceil(extract(epoch from head.updated_at+(interval_ms*interval '1 millisecond')-instant)*1000)::integer); return;
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_batch->'units') u group by u->>'kind',u->>'key' having count(*)>1) then
    raise exception 'Duplicate learner profile records' using errcode='22023'; end if;
  perform private.seed_current_profile_records(owner_id);
  select h.* into strict head from public.learner_profile_heads h where h.user_id=owner_id;
  profile_bytes:=head.records_profile_bytes; video_count:=head.records_video_count; anki_count:=head.records_anki_count;
  select pg_catalog.jsonb_object_agg(r.record_key,r.value) into check_profile
    from private.learner_profile_current_records r where r.user_id=owner_id and r.kind='section'
      and r.record_key in ('config','learnerProfile','cityProgress','noAnkiFrequentUserPrompt','onboarding');
  check_profile:=check_profile||'{"videos":{},"anki":{},"activityLog":[]}'::jsonb;
  for unit in select value from pg_catalog.jsonb_array_elements(p_batch->'units') loop
    if pg_catalog.jsonb_typeof(unit) is distinct from 'object' or not unit ?& array['kind','key','afterPresent']
      or unit-array['kind','key','afterPresent','after','metadata']<>'{}'::jsonb
      or pg_catalog.jsonb_typeof(unit->'afterPresent') is distinct from 'boolean'
      or pg_catalog.jsonb_typeof(unit->'key') is distinct from 'string' then
      raise exception 'Learner profile record unit is invalid' using errcode='22023'; end if;
    k:=unit->>'kind'; unit_key:=unit->>'key'; present:=(unit->>'afterPresent')::boolean;
    if pg_catalog.length(unit_key)>512 or unit_key in ('__proto__','constructor','prototype') or not private.is_canonical_profile_identifier(unit_key)
      or (present and not unit ? 'after') or (not present and unit ?|array['after','metadata']) then
      raise exception 'Learner profile record unit is invalid' using errcode='22023'; end if;
    if k in ('video','anki') then record_kind:=k;
    elsif (k='settings' and unit_key in ('config','learnerProfile','noAnkiFrequentUserPrompt','onboarding'))
      or (k='island' and unit_key='tinySwordsIsland')
      or (k='progression' and unit_key in ('cityProgress','legacyCityProgress','townEconomy')) then record_kind:='section';
    else raise exception 'Unsupported learner profile record unit' using errcode='22023'; end if;
    if k<>'video' and unit ? 'metadata' then raise exception 'Unexpected record metadata' using errcode='22023'; end if;
    if not present and k='settings' or (not present and unit_key='cityProgress') then
      raise exception 'Required learner profile section cannot be deleted' using errcode='22023'; end if;
    select r.* into previous from private.learner_profile_current_records r where r.user_id=owner_id and r.kind=record_kind and r.record_key=unit_key;
    after_value:=unit->'after';
    if present and k='video' then
      if pg_catalog.jsonb_typeof(after_value) is distinct from 'object' or not after_value ?& personal_keys
        or after_value-personal_keys<>'{}'::jsonb then raise exception 'Video personal fields are invalid' using errcode='22023'; end if;
      if unit ? 'metadata' then
        if pg_catalog.jsonb_typeof(unit->'metadata') is distinct from 'object' or not (unit->'metadata') ?& metadata_keys
          or (unit->'metadata')-metadata_keys<>'{}'::jsonb then raise exception 'Video metadata is invalid' using errcode='22023'; end if;
        after_value:=after_value||(unit->'metadata');
      else
        if previous.user_id is null then raise exception 'New video requires metadata' using errcode='22023'; end if;
        after_value:=after_value||(previous.value-personal_keys);
      end if;
      check_profile:=pg_catalog.jsonb_set(check_profile,array['videos',unit_key],after_value);
    elsif present and k='anki' then
      if not private.is_canonical_profile_date_key(unit_key) then raise exception 'Anki date is invalid' using errcode='22023'; end if;
      check_profile:=pg_catalog.jsonb_set(check_profile,array['anki',unit_key],after_value);
    elsif present then check_profile:=pg_catalog.jsonb_set(check_profile,array[unit_key],after_value);
    end if;
    if previous.user_id is not null then
      profile_bytes:=profile_bytes-previous.entry_bytes;
      if k='video' then video_count:=video_count-1; if video_count=0 then profile_bytes:=profile_bytes+1; end if;
      elsif k='anki' then anki_count:=anki_count-1; if anki_count=0 then profile_bytes:=profile_bytes+1; end if; end if;
    end if;
    if present then
      -- Preserve legacy full-envelope readability: outside the opaque island,
      -- accepted JSON must have the same canonical number/key representation as
      -- the existing portable format, including JavaScript enumeration rules.
      if not (record_kind='section' and unit_key='tinySwordsIsland')
        and private.canonical_jsonb_text(after_value)<>private.canonical_island_jsonb_text(after_value) then
        raise exception 'Record canonical representation is invalid' using errcode='22023';
      end if;
      entry_size:=private.profile_record_entry_bytes(record_kind,unit_key,after_value);
      profile_bytes:=profile_bytes+entry_size;
      if k='video' then if video_count=0 then profile_bytes:=profile_bytes-1; end if; video_count:=video_count+1;
      elsif k='anki' then if anki_count=0 then profile_bytes:=profile_bytes-1; end if; anki_count:=anki_count+1; end if;
      insert into private.learner_profile_current_records(user_id,profile_id,generation,kind,record_key,value,entry_bytes)
        values(owner_id,p_profile_id,p_generation,record_kind,unit_key,after_value,entry_size)
        on conflict on constraint learner_profile_current_records_pkey do update set value=excluded.value,entry_bytes=excluded.entry_bytes;
    else delete from private.learner_profile_current_records r where r.user_id=owner_id and r.kind=record_kind and r.record_key=unit_key;
    end if;
  end loop;
  -- Existing canonical, study-observation, economy and island checks run on only
  -- changed units plus the small required sections. No untouched video/history scan.
  perform private.assert_learner_profile_envelope(private.make_current_profile_envelope(check_profile,exported_at));
  if private.current_profile_envelope_bytes(profile_bytes,exported_at)>2097152 then
    raise exception 'Learner profile byte length is invalid' using errcode='22023'; end if;
  update public.learner_profile_heads set revision=p_base_revision+1,updated_at=instant,
    records_profile_bytes=profile_bytes,records_video_count=video_count,records_anki_count=anki_count,
    records_exported_at=exported_at,last_session_flush_at=case when urgent then instant else last_session_flush_at end where user_id=owner_id;
  insert into public.learner_profile_write_receipts(user_id,operation_id,request_sha256,profile_id,generation,base_revision,accepted_revision,result_sha256,protocol)
    values(owner_id,p_operation_id,request_digest,p_profile_id,p_generation,p_base_revision,p_base_revision+1,request_digest,'records-v1');
  perform private.prune_learner_profile_write_receipts(owner_id);
  if exists(select 1 from public.learner_profile_versions v where v.id=head.current_version_id and v.created_at<=instant-interval '30 seconds') then
    perform private.materialize_current_profile(owner_id);
  end if;
  return query select 'accepted'::text,p_profile_id,p_generation,p_base_revision+1,p_base_revision,request_digest,0;
end;
$$;

create function learner_profile_rpc.read_my_learner_profile_record_receipt(p_operation_id uuid)
returns table(status text,profile_id uuid,generation bigint,revision bigint,base_revision bigint,request_sha256 text,last_replacement_revision bigint,retry_after_ms integer)
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); allowed record;
begin
  -- Reuse the current gate, verified owner, admission and lock checks.
  select r.* into strict allowed from learner_profile_rpc.read_my_learner_profile_write_receipt(p_operation_id) r;
  return query select 'already_accepted'::text,r.profile_id,r.generation,r.accepted_revision,r.base_revision,r.request_sha256,allowed.last_replacement_revision,0
    from public.learner_profile_write_receipts r where r.user_id=owner_id and r.operation_id=p_operation_id and r.protocol='records-v1';
  if not found then return query select 'not_accepted'::text,null::uuid,null::bigint,null::bigint,null::bigint,null::text,allowed.last_replacement_revision,0; end if;
end;
$$;

create function public.commit_my_learner_profile_records(p_operation_id uuid,p_profile_id uuid,p_generation bigint,p_base_revision bigint,p_batch jsonb,p_session_boundary boolean default false)
returns table(status text,profile_id uuid,generation bigint,revision bigint,base_revision bigint,request_sha256 text,retry_after_ms integer)
language sql volatile security invoker set search_path = '' as $$ select * from learner_profile_rpc.commit_my_learner_profile_records(p_operation_id,p_profile_id,p_generation,p_base_revision,p_batch,p_session_boundary); $$;
create function public.read_my_learner_profile_record_receipt(p_operation_id uuid)
returns table(status text,profile_id uuid,generation bigint,revision bigint,base_revision bigint,request_sha256 text,last_replacement_revision bigint,retry_after_ms integer)
language sql stable security invoker set search_path = '' as $$ select * from learner_profile_rpc.read_my_learner_profile_record_receipt(p_operation_id); $$;

-- These wrappers retain the existing admission, conflict/reset identities and
-- return shapes. All protection continues to refer to immutable complete rows.
-- Generate only fixed named wrappers, never change arbitrary function bodies.
do $wrappers$
declare target record; original regprocedure; arguments text; result_type text; call_arguments text; renamed text; preparation text; admitted boolean;
begin
  for target in select * from (values
    ('learner_profile_rpc','resolve_my_learner_profile','owner'),
    ('learner_profile_rpc','commit_my_learner_profile','owner'),
    ('learner_profile_rpc','choose_my_learner_profile_conflict','owner'),
    ('learner_profile_rpc','start_over_my_learner_profile','owner'),
    ('learner_profile_rpc','undo_my_learner_profile_start_over','owner'),
    ('learner_profile_rpc','restore_my_learner_profile','owner'),
    ('learner_profile_rpc','import_my_learner_profile','owner'),
    ('learner_profile_rpc','rollback_my_learner_profile_import','owner'),
    ('learner_profile_rpc','list_my_learner_profile_recovery_candidates','owner'),
    ('private','restore_trusted_learner_profile_predecessor','owner'),
    ('private','begin_learner_profile_recovery','target'),
    ('private','list_learner_profile_operator_candidates','incident'),
    ('private','restore_learner_profile_from_operator_candidate','incident')
  ) as functions(schema_name,function_name,scope) loop
    select p.oid::regprocedure,pg_catalog.pg_get_function_arguments(p.oid),pg_catalog.pg_get_function_result(p.oid),
      (select pg_catalog.string_agg(pg_catalog.quote_ident(p.proargnames[i]),',' order by i) from pg_catalog.generate_series(1,p.pronargs) i),
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      into strict original,arguments,result_type,call_arguments,admitted
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname=target.schema_name and p.proname=target.function_name;
    renamed:=target.function_name||'_before_records';
    execute pg_catalog.format('alter function %s rename to %I',original,renamed);
    execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',original);
    preparation:=case target.scope
      when 'target' then 'perform private.materialize_current_profile(p_target_user_id);'
      when 'incident' then 'perform private.materialize_current_profile((select i.target_user_id from private.learner_profile_operator_recovery_incidents i where i.incident_id=p_incident_id));'
      else 'perform private.materialize_my_current_profile();' end;
    execute pg_catalog.format('create function %I.%I(%s) returns %s language plpgsql volatile security definer set search_path = '''' as $boundary$ begin %s return query select * from %I.%I(%s); end; $boundary$;',
      target.schema_name,target.function_name,arguments,result_type,preparation,target.schema_name,renamed,coalesce(call_arguments,''));
    execute pg_catalog.format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',target.schema_name,target.function_name,
      pg_catalog.pg_get_function_identity_arguments(original));
    if admitted then execute pg_catalog.format('grant execute on function %I.%I(%s) to authenticated',target.schema_name,target.function_name,
      pg_catalog.pg_get_function_identity_arguments(original)); end if;
  end loop;
end;
$wrappers$;

-- Share bounded pruning between protocols. Intentional deletion and account
-- cascades must remain ordinary DELETEs; retention is not a row-delete trigger.
create function private.prune_learner_profile_write_receipts(p_owner uuid)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.learner_profile_write_receipts r where r.user_id=p_owner
    and (r.protocol<>'records-v1' or r.accepted_at<=pg_catalog.clock_timestamp()-interval '3 hours')
    and r.operation_id in (select old.operation_id from public.learner_profile_write_receipts old
      where old.user_id=p_owner order by old.accepted_at desc,old.operation_id desc offset 2048);
$$;

-- Include accepted current progress in the existing verified server export.
-- The billing/reminder/account fields and its service-only bridge stay intact.
alter function private.export_account_server_data() rename to export_account_server_data_before_records;
create function private.export_account_server_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); current_profile jsonb; head public.learner_profile_heads%rowtype;
begin
  if owner_id is null then raise exception 'account_export_authentication_required' using errcode='42501'; end if;
  select h.* into head from public.learner_profile_heads h where h.user_id=owner_id;
  if found then
    if head.records_active then
      current_profile:=private.make_current_profile_envelope(private.assemble_current_profile(owner_id),head.records_exported_at);
    else
      select v.envelope into current_profile from public.learner_profile_versions v
        where v.id=head.current_version_id and v.user_id=owner_id and v.profile_id=head.profile_id
          and v.generation=head.generation and v.revision=head.revision;
    end if;
  end if;
  return private.export_account_server_data_before_records() || pg_catalog.jsonb_build_object(
    'learner_profile',case when current_profile is null then null else pg_catalog.jsonb_build_object(
      'profile_id',head.profile_id,'generation',head.generation,'revision',head.revision,'envelope',current_profile) end);
end;
$$;

-- Count current authoritative payloads and the current-record relation in the
-- existing capacity report without changing retention or admission thresholds.
create or replace function private.learner_profile_capacity_report(
  p_owner_id uuid
)
returns table (
  capacity_status text,
  cleanup_allowed boolean,
  cleanup_enabled boolean,
  capacity_evidence_current boolean,
  capacity_policy_current boolean,
  database_size_bytes bigint,
  database_plan text,
  database_limit_bytes bigint,
  warning_threshold_bytes bigint,
  pause_threshold_bytes bigint,
  database_read_only boolean,
  profile_count bigint,
  version_count bigint,
  profile_payload_bytes bigint,
  profile_payload_p50_bytes bigint,
  profile_payload_p95_bytes bigint,
  profile_payload_max_bytes bigint,
  protected_version_count bigint,
  protected_version_payload_bytes bigint,
  protected_candidate_payload_bytes bigint,
  protected_projected_cost_bytes bigint,
  ordinary_eligible_version_count bigint,
  ordinary_prunable_version_count bigint,
  profile_relation_bytes bigint,
  operational_relation_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with config as (
    select value.*
    from private.learner_profile_maintenance_config as value
    where value.singleton
  ),
  protected_version_ids as (
    select head.current_version_id as version_id, head.user_id
    from public.learner_profile_heads as head
    where p_owner_id is null or head.user_id = p_owner_id

    union

    select conflict.cloud_version_id, conflict.user_id
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and (
        conflict.state = 'open'
        or conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )

    union

    select conflict.selected_version_id, conflict.user_id
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and conflict.selected_version_id is not null
      and (
        conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )

    union

    select reset.prior_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.protected_until > pg_catalog.now()

    union

    select reset.reset_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.protected_until > pg_catalog.now()

    union

    select reset.restored_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.restored_version_id is not null
      and reset.protected_until > pg_catalog.now()

    union

    select backup.previous_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.protected_until > pg_catalog.now()

    union

    select backup.imported_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.imported_version_id is not null
      and backup.protected_until > pg_catalog.now()

    union

    select backup.restored_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.restored_version_id is not null
      and backup.protected_until > pg_catalog.now()

    union

    select recovery.restored_version_id, recovery.user_id
    from private.learner_profile_recoveries as recovery
    where (p_owner_id is null or recovery.user_id = p_owner_id)
      and recovery.protected_until > pg_catalog.now()

    union

    select recovery.displaced_version_id, recovery.user_id
    from private.learner_profile_recoveries as recovery
    where (p_owner_id is null or recovery.user_id = p_owner_id)
      and recovery.displaced_version_id is not null
      and recovery.protected_until > pg_catalog.now()

    union

    select receipt.version_id, receipt.user_id
    from private.learner_profile_accountless_migration_receipts as receipt
    where p_owner_id is null or receipt.user_id = p_owner_id
  ),
  version_metrics as (
    select
      count(*)::bigint as version_count
    from public.learner_profile_versions as version
    where p_owner_id is null or version.user_id = p_owner_id
  ),
  profile_metrics as (
    select
      coalesce(sum(case when head.records_active then private.current_profile_envelope_bytes(head.records_profile_bytes,head.records_exported_at) else version.payload_bytes end), 0)::bigint
        as profile_payload_bytes,
      percentile_cont(0.5) within group (
        order by case when head.records_active then private.current_profile_envelope_bytes(head.records_profile_bytes,head.records_exported_at) else version.payload_bytes end
      )::bigint as profile_payload_p50_bytes,
      percentile_cont(0.95) within group (
        order by case when head.records_active then private.current_profile_envelope_bytes(head.records_profile_bytes,head.records_exported_at) else version.payload_bytes end
      )::bigint as profile_payload_p95_bytes,
      coalesce(max(case when head.records_active then private.current_profile_envelope_bytes(head.records_profile_bytes,head.records_exported_at) else version.payload_bytes end), 0)::bigint
        as profile_payload_max_bytes
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
    where p_owner_id is null or head.user_id = p_owner_id
  ),
  protected_metrics as (
    select
      count(*)::bigint as protected_version_count,
      coalesce(sum(version.payload_bytes), 0)::bigint
        as protected_version_payload_bytes
    from protected_version_ids as protected
    join public.learner_profile_versions as version
      on version.id = protected.version_id
     and version.user_id = protected.user_id
  ),
  candidate_metrics as (
    select coalesce(sum(conflict.device_payload_bytes), 0)::bigint
      as protected_candidate_payload_bytes
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and (
        conflict.state = 'open'
        or conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )
  ),
  ordinary_ranked as (
    select
      version.id,
      row_number() over (
        partition by version.profile_id
        order by version.created_at desc, version.id desc
      ) as ordinary_rank
    from public.learner_profile_versions as version
    where (p_owner_id is null or version.user_id = p_owner_id)
      and not exists (
        select 1
        from protected_version_ids as protected
        where protected.version_id = version.id
          and protected.user_id = version.user_id
      )
  ),
  ordinary_metrics as (
    select
      count(*)::bigint as ordinary_eligible_version_count,
      count(*) filter (
        where ordinary_rank > config.ordinary_retention_count
      )::bigint as ordinary_prunable_version_count
    from ordinary_ranked
    cross join config
  ),
  database_metrics as (
    select
      pg_catalog.pg_database_size(pg_catalog.current_database())::bigint
        as database_size_bytes,
      (
        pg_catalog.current_setting('transaction_read_only', true) = 'on'
        or pg_catalog.current_setting('default_transaction_read_only', true) = 'on'
        or pg_catalog.pg_is_in_recovery()
      ) as database_read_only
  ),
  relation_metrics as (
    select
      (
        pg_catalog.pg_total_relation_size(
          'public.learner_profile_versions'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'public.learner_profile_heads'::pg_catalog.regclass
        ) + pg_catalog.pg_total_relation_size('private.learner_profile_current_records'::pg_catalog.regclass)
      )::bigint as profile_relation_bytes,
      (
        pg_catalog.pg_total_relation_size(
          'public.learner_profile_write_receipts'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_conflicts'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_resets'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_import_backups'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_recoveries'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_accountless_migration_receipts'::pg_catalog.regclass
        )
      )::bigint as operational_relation_bytes
  ),
  evidence as (
    select exists (
      select 1
      from private.learner_profile_capacity_checks as check_row
      cross join config
      where check_row.singleton
        and check_row.checked_at > pg_catalog.now() - interval '7 days'
        and check_row.database_limit_bytes = config.database_limit_bytes
        and check_row.warning_threshold_bytes = floor(
          config.database_limit_bytes::numeric * config.warning_fraction
        )::bigint
        and check_row.pause_threshold_bytes = floor(
          config.database_limit_bytes::numeric * config.pause_fraction
        )::bigint
    ) as capacity_evidence_current
  ),
  policy as (
    select exists (
      select 1
      from config
      where config.database_limit_verified_at
          > pg_catalog.now() - interval '7 days'
        and config.pause_restore_constraints_verified_at
          > pg_catalog.now() - interval '7 days'
    ) as capacity_policy_current
  ),
  metrics as (
    select
      case
        when database_metrics.database_size_bytes >= floor(
          config.database_limit_bytes::numeric * config.pause_fraction
        )::bigint then 'pause'::text
        when database_metrics.database_size_bytes >= floor(
          config.database_limit_bytes::numeric * config.warning_fraction
        )::bigint then 'warning'::text
        else 'ok'::text
      end as capacity_status,
      config.cleanup_enabled,
      config.database_plan,
      config.database_limit_bytes,
      floor(
        config.database_limit_bytes::numeric * config.warning_fraction
      )::bigint as warning_threshold_bytes,
      floor(
        config.database_limit_bytes::numeric * config.pause_fraction
      )::bigint as pause_threshold_bytes,
      database_metrics.*,
      version_metrics.*,
      profile_metrics.*,
      protected_metrics.*,
      candidate_metrics.*,
      (
        (
          protected_metrics.protected_version_payload_bytes
          + candidate_metrics.protected_candidate_payload_bytes
        ) * 2
      )::bigint as protected_projected_cost_bytes,
      ordinary_metrics.*,
      relation_metrics.*,
      evidence.capacity_evidence_current,
      policy.capacity_policy_current,
      count(distinct head.user_id)::bigint as profile_count
    from config
    cross join database_metrics
    cross join version_metrics
    cross join profile_metrics
    cross join protected_metrics
    cross join candidate_metrics
    cross join ordinary_metrics
    cross join relation_metrics
    cross join evidence
    cross join policy
    left join public.learner_profile_heads as head
      on p_owner_id is null or head.user_id = p_owner_id
    group by
      config.cleanup_enabled,
      config.database_plan,
      config.database_limit_bytes,
      config.warning_fraction,
      config.pause_fraction,
      database_metrics.database_size_bytes,
      database_metrics.database_read_only,
      version_metrics.version_count,
      profile_metrics.profile_payload_bytes,
      profile_metrics.profile_payload_p50_bytes,
      profile_metrics.profile_payload_p95_bytes,
      profile_metrics.profile_payload_max_bytes,
      protected_metrics.protected_version_count,
      protected_metrics.protected_version_payload_bytes,
      candidate_metrics.protected_candidate_payload_bytes,
      ordinary_metrics.ordinary_eligible_version_count,
      ordinary_metrics.ordinary_prunable_version_count,
      relation_metrics.profile_relation_bytes,
      relation_metrics.operational_relation_bytes,
      evidence.capacity_evidence_current,
      policy.capacity_policy_current
  )
  select
    metrics.capacity_status,
    (
      metrics.cleanup_enabled
      and metrics.capacity_evidence_current
      and not metrics.database_read_only
    ) as cleanup_allowed,
    metrics.cleanup_enabled,
    metrics.capacity_evidence_current,
    metrics.capacity_policy_current,
    metrics.database_size_bytes,
    metrics.database_plan,
    metrics.database_limit_bytes,
    metrics.warning_threshold_bytes,
    metrics.pause_threshold_bytes,
    metrics.database_read_only,
    metrics.profile_count,
    metrics.version_count,
    metrics.profile_payload_bytes,
    metrics.profile_payload_p50_bytes,
    metrics.profile_payload_p95_bytes,
    metrics.profile_payload_max_bytes,
    metrics.protected_version_count,
    metrics.protected_version_payload_bytes,
    metrics.protected_candidate_payload_bytes,
    metrics.protected_projected_cost_bytes,
    metrics.ordinary_eligible_version_count,
    metrics.ordinary_prunable_version_count,
    metrics.profile_relation_bytes,
    metrics.operational_relation_bytes
  from metrics;
$$;

revoke all on function private.profile_record_entry_bytes(text,text,jsonb),
  private.make_current_profile_envelope(jsonb,text),private.current_profile_envelope_bytes(integer,text),
  private.seed_current_profile_records(uuid),private.assemble_current_profile(uuid),
  private.materialize_current_profile(uuid),private.materialize_my_current_profile(),
  private.reset_current_records_after_full_head(),private.protect_invalid_current_records(),private.prune_learner_profile_write_receipts(uuid),
  private.export_account_server_data(),private.export_account_server_data_before_records(),
  private.learner_profile_capacity_report(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.learner_profile_capacity_report(uuid) to service_role;
revoke all on function learner_profile_rpc.commit_my_learner_profile_records(uuid,uuid,bigint,bigint,jsonb,boolean),
  learner_profile_rpc.read_my_learner_profile_record_receipt(uuid),
  public.commit_my_learner_profile_records(uuid,uuid,bigint,bigint,jsonb,boolean),
  public.read_my_learner_profile_record_receipt(uuid)
  from public,anon,authenticated,service_role;
grant execute on function learner_profile_rpc.commit_my_learner_profile_records(uuid,uuid,bigint,bigint,jsonb,boolean),
  learner_profile_rpc.read_my_learner_profile_record_receipt(uuid),
  public.commit_my_learner_profile_records(uuid,uuid,bigint,bigint,jsonb,boolean),
  public.read_my_learner_profile_record_receipt(uuid)
  to authenticated;
-- The operator boundaries remain service-only after wrapper replacement.
grant execute on function private.begin_learner_profile_recovery(uuid,text,uuid,text,text,text,boolean,boolean,boolean,timestamptz,text),
  private.list_learner_profile_operator_candidates(uuid),
  private.restore_learner_profile_from_operator_candidate(uuid,uuid,uuid,text) to service_role;

-- Both protocols use the same bounded pruning policy. Replace only the
-- existing, fixed pruning block; abort migration if that source boundary drifts.
do $receipt_bound$
declare definition text; prune_start integer; prune_end integer; pruning text;
begin
  definition:=pg_catalog.pg_get_functiondef('learner_profile_rpc.commit_my_learner_profile_before_records(uuid,uuid,bigint,bigint,jsonb)'::regprocedure);
  prune_start:=pg_catalog.strpos(definition,'  delete from public.learner_profile_write_receipts as receipt');
  if prune_start=0 then raise exception 'Unexpected learner profile receipt pruning definition'; end if;
  pruning:=pg_catalog.substr(definition,prune_start);
  prune_end:=pg_catalog.strpos(pruning,E'\n\n  return query select');
  if prune_end=0 or pg_catalog.strpos(pg_catalog.left(pruning,prune_end),'offset 256')=0 then
    raise exception 'Unexpected learner profile receipt pruning boundary';
  end if;
  execute pg_catalog.left(definition,prune_start-1)||E'  perform private.prune_learner_profile_write_receipts(owner_id);' ||pg_catalog.substr(pruning,prune_end);
end;
$receipt_bound$;

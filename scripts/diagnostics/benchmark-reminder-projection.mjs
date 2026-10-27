// Generate a rollback-only benchmark for an isolated local test database.
// Never run this fixture against hosted learner data. It compares the actual
// accepted typed-write API with only the two new reminder triggers toggled.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const root = new URL('../../', import.meta.url)
const fixture = await readFile(new URL('supabase/tests/accepted_reminder_eligibility.test.sql', root), 'utf8')
const marker = fixture.indexOf('-- An intentional reset')
if (marker < 0) throw new Error('Accepted projection benchmark fixture boundary changed')
const benchmark = `-- Measurement uses synthetic accepted fixtures only. No hosted data.
select private.materialize_current_profile('52100000-0000-4000-8000-000000000001');
create temporary table projection_bench_full as select private.make_current_profile_envelope(
 (v.envelope->'profile')||jsonb_build_object('videos',(v.envelope#>'{profile,videos}')||(
   select jsonb_object_agg('bench-'||n,jsonb_set(jsonb_set(v.envelope#>'{profile,videos,aaaaaaaaaaa}','{id}',to_jsonb('bench-'||n)),'{watchProgress}','[]')) from generate_series(1,500) n),
   'tinySwordsIsland',jsonb_build_object('version',38,'padding',repeat('x',180000))),
 '2026-10-27T02:00:00.000Z') as envelope
 from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id='52100000-0000-4000-8000-000000000001';
select r.status as synthetic_seed from public.learner_profile_heads h cross join projection_bench_full p cross join lateral
 public.commit_my_learner_profile(extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,p.envelope) r where h.user_id='52100000-0000-4000-8000-000000000001';
select private.seed_current_profile_records('52100000-0000-4000-8000-000000000001');
select private.refresh_reminder_eligibility('52100000-0000-4000-8000-000000000001','2026-10-27T11:00:00Z');
create temporary table projection_bench_results(mode text,kind text,iteration integer,ms numeric);
create function pg_temp.measure_projection_commit(p_mode text,p_kind text,p_count int) returns void language plpgsql volatile as $$
declare k int; started timestamptz; elapsed numeric; batch jsonb; n numeric; result text;
begin
 for k in 1..p_count loop
   update public.learner_profile_heads set updated_at=clock_timestamp()-interval '10 seconds' where user_id='52100000-0000-4000-8000-000000000001';
   if p_kind='island' then batch:=jsonb_build_object('version',1,'exportedAt','2026-10-27T02:00:00.000Z','units',jsonb_build_array(
     jsonb_build_object('kind','island','key','tinySwordsIsland','afterPresent',true,'after',jsonb_build_object('version',38,'iteration',k,'padding',repeat('x',180000)))));
   else
     select coalesce((r.value->>'experienceReviews')::numeric,0)+1 into n from private.learner_profile_current_records r
       where r.user_id='52100000-0000-4000-8000-000000000001' and r.kind='anki' and r.record_key='2026-10-27';
     batch:=jsonb_build_object('version',1,'exportedAt','2026-10-27T02:00:00.000Z','units',jsonb_build_array(
       jsonb_build_object('kind','anki','key','2026-10-27','afterPresent',true,'after',jsonb_build_object('created',0,'reviewed',n,'experienceReviews',n,'experienceWatermark',n,'observedAt','2026-10-27T02:00:00.000Z'))));
   end if;
   started:=clock_timestamp(); result:=pg_temp.send_projection_batch(batch);
   elapsed:=extract(epoch from clock_timestamp()-started)*1000;
   if result<>'accepted' then raise exception 'Benchmark commit did not accept: %',result; end if;
   insert into projection_bench_results values(p_mode,p_kind,k,elapsed);
   if p_mode='enabled' then perform private.refresh_reminder_eligibility('52100000-0000-4000-8000-000000000001','2026-10-27T11:00:00Z'); end if;
 end loop;
end; $$;

create function pg_temp.measure_projection_pair(p_kind text,p_pairs int) returns void language plpgsql volatile as $$
declare k int; m text; mode_order text[]; current_id uuid;
begin
 for k in 1..p_pairs loop
   mode_order:=case when k%2=0 then array['enabled','baseline'] else array['baseline','enabled'] end;
   foreach m in array mode_order loop
     if m='baseline' then
       alter table private.learner_profile_current_records disable trigger reminder_record_inputs;
       alter table public.learner_profile_heads disable trigger reminder_accepted_head;
     else
       alter table private.learner_profile_current_records enable trigger reminder_record_inputs;
       alter table public.learner_profile_heads enable trigger reminder_accepted_head;
     end if;
     -- Exclude the existing independent 30s complete-snapshot cadence from this
     -- paired measurement of the reminder change. This is synthetic fixture
     -- metadata and is rolled back with the entire experiment.
     update public.learner_profile_versions set created_at=clock_timestamp() where id=(
       select current_version_id from public.learner_profile_heads where user_id='52100000-0000-4000-8000-000000000001');
     perform pg_temp.measure_projection_commit(m,p_kind,1);
     if m='baseline' then perform private.refresh_reminder_eligibility('52100000-0000-4000-8000-000000000001','2026-10-27T11:00:00Z'); end if;
   end loop;
 end loop;
end; $$;
select pg_temp.measure_projection_pair('island',40);
select pg_temp.measure_projection_pair('study',40);
alter table private.learner_profile_current_records enable trigger reminder_record_inputs;
alter table public.learner_profile_heads enable trigger reminder_accepted_head;
select mode,kind,count(*),round(avg(ms),3) as average_ms,round(percentile_cont(0.5) within group(order by ms)::numeric,3) as median_ms,
 round(percentile_cont(0.95) within group(order by ms)::numeric,3) as p95_ms from projection_bench_results group by mode,kind order by kind,mode;
rollback;
`
await mkdir(new URL('.cache/', root), { recursive: true })
const output = new URL('.cache/reminder-projection-benchmark.sql', root)
await writeFile(output, fixture.slice(0, marker) + benchmark)
console.log(output.pathname)

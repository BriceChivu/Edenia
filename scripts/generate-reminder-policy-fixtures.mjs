import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const fixtures = JSON.parse(await readFile(new URL('tests/fixtures/study-qualification.json', root)))
const helper = await readFile(new URL('supabase/tests/helpers/reminder_521_fixtures.sql', root), 'utf8')
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const statements = fixtures.map(fixture => `select is(((${fixture.videoSeconds}::numeric / 60) + ${fixture.ankiReviews}) >= private.reminder_study_threshold(), ${fixture.qualifies}, ${quote(fixture.name)});`)
const sql = `-- Generated from shared app/server study qualification fixtures.
-- Exercise the real accepted authority, candidate selection, and provider fence.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select plan(${fixtures.length * 4});
${helper}
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
${statements.join('\n')}
create temporary table policy_cases as select
 ('52190000-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid as user_id,
 value->>'name' as name,(value->>'videoSeconds')::integer as seconds,
 (value->>'ankiReviews')::integer as reviews,(value->>'qualifies')::boolean as qualifies
 from pg_catalog.jsonb_array_elements(${quote(JSON.stringify(fixtures))}::jsonb) with ordinality;
do $cases$
declare item record; head public.learner_profile_heads; profile jsonb; video jsonb;
begin
 for item in select * from policy_cases order by user_id loop
  perform pg_temp.email_fixture(item.user_id,'Asia/Taipei','2026-10-26',item.reviews,10,true,false);
  if item.seconds>0 then
   select h.* into strict head from public.learner_profile_heads h where h.user_id=item.user_id;
   select v.envelope->'profile' into profile from public.learner_profile_versions v where v.id=head.current_version_id;
   video:=pg_catalog.jsonb_build_object('id','aaaaaaaaaaa','aspectRatio',null,'channelId',null,
    'channelImageUrl','','channelTitle','','duration',item.seconds,'isShort',false,'publishedAt',null,
    'source',null,'thumbnail','','title','Shared study policy fixture','favorite',false,
    'hiddenFromGrid',false,'hiddenFromGridAt',null,'manuallyAdded',false,'pausedAt',null,
    'removedFromFeedAt',null,'resumeAtSeconds',null,'status','unwatched','watchLater',false,
    'watchProgress',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','video:aaaaaaaaaaa:2026-10-26T10:00:00.000Z:'||item.seconds||':1',
     'watchedAt','2026-10-26T10:00:00.000Z','studyDay','2026-10-26',
     'seconds',item.seconds,'experienceSeconds',item.seconds)),
    'watchProgressTracked',true,'watchedAt',null,'watchedConfirmationUnlockedAt',null);
   profile:=pg_catalog.jsonb_set(profile,'{videos}',pg_catalog.jsonb_build_object('aaaaaaaaaaa',video));
   perform r.* from public.commit_my_learner_profile(extensions.gen_random_uuid(),head.profile_id,head.generation,head.revision,
    private.make_current_profile_envelope(profile,'2026-10-26T10:00:00.000Z')) r;
  end if;
  perform private.refresh_reminder_eligibility(item.user_id,'2026-10-26T11:00:00Z');
 end loop;
end; $cases$;
select is(private.reminder_study_points(user_id,'2026-10-26'),seconds::numeric/60+reviews,'accepted projection: '||name) from policy_cases order by user_id;
select is(exists(select 1 from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z') c where c.user_id=p.user_id),not p.qualifies,'candidate qualification: '||p.name) from policy_cases p order by user_id;
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
update private.reminder_delivery_control set delivery_enabled=true;
create temporary table policy_claims as select * from public.claim_due_typed_reminder_live('2026-10-26T11:00:00Z',10,3600,300);
select pg_temp.bind_email(claim_token,'2026-10-26T11:00:00Z') from policy_claims;
select is(coalesce((select public.begin_typed_reminder_provider_attempt(c.claim_token,'resend','2026-10-26T11:00:00Z') from policy_claims c where c.user_id=p.user_id),false),not p.qualifies,'provider-begin qualification: '||p.name) from policy_cases p order by user_id;
select * from finish();
rollback;
`
await mkdir(new URL('.cache/', root), { recursive: true })
await writeFile(new URL('.cache/reminder-policy-fixtures.test.sql', root), sql)

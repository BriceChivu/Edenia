import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson } from '../../src/state/portable-state.js'

const at = '2026-10-11T13:30:00.000Z'
// This diagnostic only executes in an explicitly selected local Docker database.
// All fixture writes and optional baseline definitions roll back together.
const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  assert.match(arg, /^--(?:container|docker-context|baseline-ref|videos|max-ms)=.+$/)
  const separator = arg.indexOf('=')
  return [arg.slice(2, separator), arg.slice(separator + 1)]
}))
assert.match(options.container || '', /^supabase_db_[a-zA-Z0-9_-]+$/,
  'Select an isolated local database with --container=supabase_db_<project>')
const dockerContext = options['docker-context'] || 'default'
assert.match(dockerContext, /^[a-zA-Z0-9_-]+$/)
const videos = Number(options.videos || 1600)
const maxMs = Number(options['max-ms'] || 500)
assert.ok(Number.isInteger(videos) && videos >= 1 && videos <= 1900)
assert.ok(Number.isFinite(maxMs) && maxMs > 0)
let baselineSql = ''
if (options['baseline-ref']) {
  const ref = options['baseline-ref']
  assert.match(ref, /^[a-zA-Z0-9][a-zA-Z0-9_/.:-]*$/)
  const sourceAt = path => {
    const result = spawnSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' })
    assert.equal(result.status, 0, `Cannot read diagnostic baseline ${path}`)
    return result.stdout
  }
  const serializer = sourceAt('supabase/migrations/20261008103444_optimize_profile_canonical_serialization.sql')
  const validation = sourceAt('supabase/migrations/20260928110239_pixel_town_economy_profile.sql')
  const start = validation.indexOf('create or replace function private.assert_learner_profile_envelope(')
  assert.ok(start >= 0)
  const end = validation.indexOf('\n$$;', start)
  assert.ok(end > start)
  baselineSql = serializer + '\n' + validation.slice(start, end + 4)
    .replace('private.assert_learner_profile_envelope(',
      'private.assert_learner_profile_envelope_before_current_experience(')
}

const profile = {
  config: {}, videos: {}, anki: { '2026-10-11': { reviewed: 1, created: 0 } },
  cityProgress: { maxLevelIndex: 0 },
  learnerProfile: { languages: ['french'], level: 'beginner', selectedChannelCatalogIds: [] },
  onboarding: { setupCompleted: true, walkthroughCompleted: true }
}
for (let i = 0; i < videos; i++) {
  const id = `library-${String(i).padStart(5, '0')}`
  profile.videos[id] = { id, title: `Lesson ${i}: ` + 'Language study 日本語 français '.repeat(12), duration: 600,
    watchProgressTracked: true, watchProgress: [{ seconds: 120, experienceSeconds: 60, watchedAt: at, studyDay: '2026-10-11' }] }
}
const base = (await createPortableLearnerProfileEnvelope(profile, { now: () => new Date(at) })).envelope
profile.anki['2026-10-11'].reviewed = 7
const edit = (await createPortableLearnerProfileEnvelope(profile, { now: () => new Date(at) })).envelope
const literal = value => `'${canonicalizeJson(value).replaceAll("'", "''")}'::jsonb`
const owner = '123e4567-e89b-42d3-a456-426614174000'
const profileId = '223e4567-e89b-42d3-a456-426614174000'
const operation = '323e4567-e89b-42d3-a456-426614174000'
const sql = `
begin;
${baselineSql}
set local statement_timeout='30s';
create temporary table perf_inputs (base jsonb, edit jsonb);
insert into perf_inputs values (${literal(base)},${literal(edit)});
grant select on perf_inputs to authenticated;
insert into auth.users(id,email,email_confirmed_at) values ('${owner}','perf@example.test',now());
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
insert into public.learner_profile_versions(id,user_id,profile_id,generation,revision,base_revision,envelope,payload_sha256,payload_bytes)
select '${profileId}','${owner}','${profileId}',1,1,0,base,base#>>'{integrity,payloadSha256}',(base#>>'{integrity,byteLength}')::int from perf_inputs;
insert into public.learner_profile_heads(user_id,profile_id,generation,revision,current_version_id)
values ('${owner}','${profileId}',1,1,'${profileId}');
select set_config('request.jwt.claim.sub','${owner}',true);
do $measure$ declare value jsonb; started timestamptz; result text; begin
select edit into value from perf_inputs;
started:=clock_timestamp(); perform private.assert_learner_profile_envelope(value);
raise notice 'PERF %',jsonb_build_object('stage','validation','ms',extract(epoch from clock_timestamp()-started)*1000);
started:=clock_timestamp(); result:=private.canonical_jsonb_text(value);
raise notice 'PERF %',jsonb_build_object('stage','canonical','ms',extract(epoch from clock_timestamp()-started)*1000);
end $measure$;
set local role authenticated;
do $measure$ declare value jsonb; started timestamptz; outcome record; begin
select edit into value from perf_inputs;
started:=clock_timestamp(); select * into outcome from public.commit_my_learner_profile('${operation}','${profileId}',1,1,value);
if outcome.status<>'accepted' then raise exception 'Unexpected commit: %',outcome.status; end if;
raise notice 'PERF %',jsonb_build_object('stage','commit','ms',extract(epoch from clock_timestamp()-started)*1000);
started:=clock_timestamp(); select * into outcome from public.commit_my_learner_profile('${operation}','${profileId}',1,1,value);
if outcome.status<>'already_accepted' then raise exception 'Unexpected retry: %',outcome.status; end if;
raise notice 'PERF %',jsonb_build_object('stage','retry','ms',extract(epoch from clock_timestamp()-started)*1000);
end $measure$;
reset role;
do $verify$ begin
if not exists(select 1 from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id
where h.user_id='${owner}' and h.revision=2 and v.envelope=(select edit from perf_inputs))
or not exists(select 1 from public.learner_profile_versions
where id='${profileId}' and user_id='${owner}' and envelope=(select base from perf_inputs))
or (select count(*) from public.learner_profile_versions where user_id='${owner}')<>2
or (select count(*) from public.learner_profile_write_receipts where user_id='${owner}')<>1
then raise exception 'Progress or retry preservation failed'; end if;
end $verify$;
rollback;
`
const run = spawnSync('docker', ['--context',dockerContext,'exec','-i',options.container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'], { input: sql, encoding:'utf8',maxBuffer: 4*1024*1024 })
if (run.status !== 0) throw new Error(run.stderr.slice(-2500))
const timings = [...run.stderr.matchAll(/PERF (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]))
assert.equal(timings.length,4)
console.log(JSON.stringify({ synthetic:true, videos, bytes: edit.integrity.byteLength, timings, progressPreserved:true }))
assert.ok(timings.find(t=>t.stage==='commit').ms < maxMs, `Routine learner save exceeded the local ${maxMs} ms diagnostic budget`)

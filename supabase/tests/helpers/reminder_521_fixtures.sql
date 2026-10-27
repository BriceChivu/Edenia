-- Transaction-scoped fixture builders: use the real accepted profile authority,
-- never forge the projection to make delivery tests pass.
create function pg_temp.email_fixture(p_user uuid,p_zone text,p_local_date date,
 p_today integer default 9,p_yesterday integer default 10,p_streak boolean default true,
 p_discovery boolean default true,p_language text default 'mandarin') returns void
language plpgsql as $$
declare profile jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values(p_user,p_user::text||'@example.test',now());
 insert into public.reminder_preferences(user_id,timezone,locale,consent_granted_at,
 consent_version,consent_source,streak_reminders_enabled,discovery_emails_enabled,
 streak_enrollment_version,discovery_enrollment_version)
 values(p_user,p_zone,'en',now(),'edenia-email-enrollment-v3','settings-enable-emails',p_streak,p_discovery,
 'edenia-email-enrollment-v3','edenia-email-enrollment-v3');
 profile:='{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":[],"level":"beginner","selectedChannelCatalogIds":["mandarin-grace"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}}'::jsonb;
 profile:=jsonb_set(profile,'{learnerProfile,languages}',jsonb_build_array(p_language));
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform * from public.resolve_my_learner_profile(private.make_current_profile_envelope(profile,'2026-08-20T21:00:00.000Z'));
 profile:=jsonb_set(profile,'{anki}',jsonb_build_object(
  (p_local_date-1)::text,jsonb_build_object('created',0,'reviewed',p_yesterday,'experienceReviews',p_yesterday,'experienceWatermark',p_yesterday,'observedAt',(p_local_date-1)::text||'T10:00:00.000Z'),
  p_local_date::text,jsonb_build_object('created',0,'reviewed',p_today,'experienceReviews',p_today,'experienceWatermark',p_today,'observedAt',p_local_date::text||'T10:00:00.000Z')));
 perform r.* from public.learner_profile_heads h cross join lateral public.commit_my_learner_profile(
   extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,
   private.make_current_profile_envelope(profile,p_local_date::text||'T10:00:00.000Z')) r where h.user_id=p_user;
 insert into private.reminder_delivery_testers(user_id) values(p_user);
end $$;
create function pg_temp.email_capacity(p_at timestamptz,p_daily integer default 0,p_monthly integer default 0)
returns void language plpgsql as $$
begin
 -- Test-local time may precede the real clock. The same service RPC still
 -- verifies argument shape; evidence is never written to a hosted account.
 perform public.record_reminder_free_capacity(true,true,true,p_daily,p_monthly,p_at,
  extensions.digest('re_test_key_1234567890','sha256'),
  extensions.digest('Edenia <reminders@example.test>','sha256'));
end $$;
create function pg_temp.bind_email(p_claim uuid,p_at timestamptz,p_payload text default 'stable-payload')
returns boolean language sql as $$
 select public.bind_reminder_payload(p_claim,extensions.digest(lower(btrim(u.email)),'sha256'),
  extensions.digest('Edenia <reminders@example.test>','sha256'),extensions.digest(p_payload,'sha256'),
  'edenia-reminder-v3','test-key-v1',extensions.digest('re_test_key_1234567890','sha256'),
  (select admission_mode from private.reminder_delivery_control where singleton),p_at)
 from private.reminder_deliveries d join auth.users u on u.id=d.user_id where d.claim_token=p_claim
$$;

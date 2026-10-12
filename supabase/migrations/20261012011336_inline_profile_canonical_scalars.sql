-- Large profiles contain tens of thousands of scalar values. Calling the
-- recursive PL/pgSQL function for each scalar dominated ordinary cloud saves.
-- Only containers need recursion; scalar bytes remain exactly value::text.
create or replace function private.canonical_jsonb_text(p_value jsonb)
returns text
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
declare
  result text;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text || ':' ||
        case when item.key = 'tinySwordsIsland'
          and p_value ?& array['activityLog','anki','cityProgress','config','learnerProfile','noAnkiFrequentUserPrompt','onboarding','videos']
          then private.canonical_island_jsonb_text(item.value)
          when pg_catalog.jsonb_typeof(item.value) in ('object', 'array')
          then private.canonical_jsonb_text(item.value)
          else item.value::text end,
        ',' order by item.key collate "C"
      ), '') || '}' into result
      from pg_catalog.jsonb_each(p_value) as item(key, value);
      return result;
    when 'array' then
      select '[' || coalesce(pg_catalog.string_agg(
        case when pg_catalog.jsonb_typeof(item.value) in ('object', 'array')
          then private.canonical_jsonb_text(item.value)
          else item.value::text end,
        ',' order by item.ordinality
      ), '') || ']' into result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return result;
    else return p_value::text;
  end case;
end;
$$;
revoke execute on function private.canonical_jsonb_text(jsonb)
  from public, anon, authenticated, service_role;

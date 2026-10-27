// Find a real 19:00 window with at least a minute left, so a CI run at
// xx:59:59 cannot cross the send cutoff halfway through a fixture. This only
// queries the disposable database; it never adjusts the product clock.
export async function reminderTestWindow(sql) {
  const deadline = Date.now() + 65_000
  while (Date.now() < deadline) {
    const result = sql("select coalesce((select json_build_object('zone',name,'date',(now() at time zone name)::date)::text from pg_timezone_names where extract(hour from now() at time zone name)=19 and extract(minute from now() at time zone name)<59 order by extract(minute from now() at time zone name),name limit 1),'null')")
    const point = JSON.parse(result)
    if (point) return point
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Disposable database clock did not reach an open reminder test window')
}

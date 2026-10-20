extends RefCounted

# Calendar days use the device's local date. Time spent away never consumes the
# return sequence; only a subsequent visit moves a hungry portal to returning.
static func today() -> int:
	return int(Time.get_unix_time_from_datetime_string(Time.get_date_string_from_system(false) + "T00:00:00") / 86400.0)

static func initial(day: int, delay: int) -> Dictionary:
	return {"phase": "idle", "day": day, "next_day": day + delay, "cell": [], "occupants": [], "facing_left": true}

static func valid(state: Variant) -> bool:
	if not state is Dictionary:
		return false
	if state.is_empty():
		return true # Pre-event saves.
	if state.size() not in [5, 6] or state.get("phase") not in ["idle", "hungry", "returning"]:
		return false
	for key in state:
		if key not in ["phase", "day", "next_day", "cell", "occupants", "facing_left"]: return false
	if not state.get("facing_left", true) is bool: return false
	for key in ["day", "next_day"]:
		var value = state.get(key)
		if not (value is float or value is int) or not is_finite(float(value)) or value < 0 or value > 10000000 or float(value) != floorf(float(value)):
			return false
	if not state.get("cell") is Array or not state.get("occupants") is Array or state.occupants.size() > 1024:
		return false
	if state.phase == "idle":
		return state.cell.is_empty() and state.occupants.is_empty()
	if state.cell.size() != 2:
		return false
	for coordinate in state.cell:
		if not (coordinate is float or coordinate is int) or not is_finite(float(coordinate)) or absf(float(coordinate)) > 1000 or float(coordinate) != floorf(float(coordinate)):
			return false
	var pawns := 0
	for kind in state.occupants:
		if kind not in ["pawn", "sheep", "chicken"]:
			return false
		if kind == "pawn": pawns += 1
	return pawns <= 1

static func count(state: Dictionary, kind: String) -> int:
	return state.get("occupants", []).count(kind)

static func normalized(state: Dictionary) -> Dictionary:
	var result := state.duplicate(true)
	if result.is_empty(): return result
	# JSON decodes numbers as floats. Keep the same integer representation used
	# by live events so a reload cannot change the gameplay sync fingerprint.
	result.day = int(result.day)
	result.next_day = int(result.next_day)
	for index in result.cell.size(): result.cell[index] = int(result.cell[index])
	return result

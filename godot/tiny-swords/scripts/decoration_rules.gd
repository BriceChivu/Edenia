extends RefCounted

const VARIANTS := {"flowers": 2, "bush": 2, "land_rock": 4, "water_rock": 4, "ducks": 1}
const WATER_KINDS := ["water_rock", "ducks"]

static func choose(rng, water_available: bool, ducks_exist: bool) -> String:
	var successes: Array[String] = []
	for kind in ["flowers", "bush", "land_rock", "water_rock", "ducks"]:
		if kind in WATER_KINDS and not water_available:
			continue
		if kind == "ducks" and ducks_exist:
			continue
		if rng.randi_range(1, 50 if kind == "ducks" else 15) == 1:
			successes.append(kind)
	if successes.is_empty():
		return ""
	return successes[rng.randi_range(0, successes.size() - 1)]

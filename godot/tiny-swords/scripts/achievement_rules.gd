extends RefCounted

# Stable save IDs; presentation order and level requirements are Godot-owned.
const DEFINITIONS := [
	{"id": "cut_tree", "title": "achievementTree", "level": 4},
	{"id": "build_house", "title": "achievementHouse", "level": 5},
	{"id": "pick_chicken", "title": "achievementChicken", "level": 2},
	{"id": "rubber_duck", "title": "achievementDuck", "level": 2},
	{"id": "lay_egg", "title": "achievementEgg", "level": 0}, # No egg-laying mechanic yet.
	{"id": "black_hole", "title": "achievementBlackHole", "level": 6},
]

static func requested() -> bool:
	return OS.has_feature("web") and bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('internal_test') === '1'"))

static func minimum_level(id: String) -> int:
	for item in DEFINITIONS:
		if item.id == id: return item.level
	return 0

static func valid(value: Variant) -> bool:
	if not value is Dictionary or value.size() > DEFINITIONS.size(): return false
	for id in value:
		if not id is String or minimum_level(id) == 0 or not value[id] is bool or value[id] != true:
			return false
	return true

static func backfill(layout) -> void:
	# Only recover actions evidenced by the saved island. An elapsed visit or
	# an empty inventory cannot prove a historical action took place.
	if not layout.achievements_enabled: return
	if not layout.tree_stumps.is_empty() or int(layout.resources.get("wood", 0)) > 0:
		layout.complete_achievement("cut_tree")
	for cell in layout.houses:
		if layout.house_build.is_empty() or cell != Vector2i(int(layout.house_build.x), int(layout.house_build.y)):
			layout.complete_achievement("build_house")
	if layout.chicken_release_at > 0.0 or not layout.sheep_chickens.is_empty():
		layout.complete_achievement("pick_chicken")
	if layout.has_ducks():
		layout.complete_achievement("rubber_duck")
	if "pawn" in layout.black_hole.get("occupants", []):
		layout.complete_achievement("black_hole")

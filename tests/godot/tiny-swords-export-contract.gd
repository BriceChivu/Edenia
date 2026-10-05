extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
 if not ok:
  failures += 1
  push_error(message)

func _initialize() -> void:
 run.call_deferred()

func run() -> void:
 var game = load(ProjectSettings.get_setting("application/run/main_scene")).instantiate()
 root.add_child(game)
 check(game.get_script().resource_path == "res://scripts/xp_bridge.gd", "Integrated export must run the XP bridge")
 var before = game.layout.snapshot()
 check(not game.restore_study_layout({"version": 999}), "Bridge must reject unsupported snapshots")
 check(game.layout.snapshot() == before, "Rejected bridge restore preserves live island")
 check(game.restore_study_layout(before), "Bridge restores a valid snapshot")
 check(game.layout.MAX_CELL - game.layout.MIN_CELL + Vector2i.ONE == Vector2i(37, 20), "Integrated export must retain the expanded build grid")
 game.layout.cells[Vector2i.ZERO] = "high_meadow"
 game.layout.elevations[Vector2i.ZERO] = 64
 game.pawn.position = game.layout.center(Vector2i.ZERO)
 game.pawn.walk_to(game.pawn.position)
 game.fall_into_water(Vector2(400, 208))
 check(game.water_phase == game.WaterPhase.READY and game.pawn.destination == game.pawn.position, "High ground must block water jumps")
 game.layout.cells[Vector2i.ZERO] = "meadow"
 game.layout.elevations[Vector2i.ZERO] = 0
 game.fall_into_water(Vector2(400, 208))
 check(game.water_phase != game.WaterPhase.READY, "Flat shore must still allow water jumps")
 var reserved = game.Layout.new()
 for level in range(2, 8):
  reserved.unlock(level)
 reserved.resources.wood = 6
 reserved.house_bundle = 6
 check(game.restore_study_layout(reserved.snapshot()), "Integrated restore accepts reserved construction logs")
 check(game.construction.phase == game.construction.Phase.PLACING and game.selected == "house", "Integrated restore resumes Godot-owned house placement")
 print("Integrated export contract: %s failures" % failures)
 quit(1 if failures else 0)

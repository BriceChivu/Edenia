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
 check(game.layout.MAX_CELL - game.layout.MIN_CELL + Vector2i.ONE == Vector2i(37, 20), "Integrated export must retain the expanded build grid")
 game.layout.cells[Vector2i.ZERO] = "high_meadow"
 game.pawn.position = game.layout.center(Vector2i.ZERO)
 game.pawn.walk_to(game.pawn.position)
 game.fall_into_water(Vector2(400, 208))
 check(game.water_phase == game.WaterPhase.READY and game.pawn.destination == game.pawn.position, "High ground must block water jumps")
 game.layout.cells[Vector2i.ZERO] = "meadow"
 game.fall_into_water(Vector2(400, 208))
 check(game.water_phase != game.WaterPhase.READY, "Flat shore must still allow water jumps")
 print("Integrated export contract: %s failures" % failures)
 quit(1 if failures else 0)

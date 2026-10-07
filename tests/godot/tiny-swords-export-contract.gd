extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
 if not ok:
  failures += 1
  push_error(message)

func check_text_sampling(node: Node) -> void:
 if (node is Label or node is Button) and not node.text.is_empty():
  var ancestor: Node = node
  while ancestor is CanvasItem and ancestor.oversampling_with_scale == CanvasItem.OVERSAMPLING_WITH_SCALE_PARENT_NODE:
   ancestor = ancestor.get_parent()
  check(ancestor is CanvasItem and ancestor.oversampling_with_scale == CanvasItem.OVERSAMPLING_WITH_SCALE_ENABLED, "Scaled UI text rasterizes at its displayed size: " + str(node.get_path()))
 for child in node.get_children():
  check_text_sampling(child)

func _initialize() -> void:
 run.call_deferred()

func run() -> void:
 var game = load(ProjectSettings.get_setting("application/run/main_scene")).instantiate()
 root.add_child(game)
 check_text_sampling(game.arrival.root)
 check_text_sampling(game.ui.root)
 if game.playground != null:
  check_text_sampling(game.playground.root)
 check(game.arrival.button.texture_filter == CanvasItem.TEXTURE_FILTER_NEAREST, "Start artwork retains nearest-neighbor pixel filtering")
 # Motion is presentation only: freeze drifting scenery and omit reward sparks
 # without changing the reward, inventory or animation/action clocks.
 var presentation = root.get_node("GamePresentation")
 var motion_snapshot = game.layout.snapshot()
 game.receive_reduced_motion([true])
 check(presentation.reduced_motion, "Browser motion preference reaches Godot")
 var cloud = game.get_node("Clouds").get_child(0)
 var cloud_position = cloud.position
 cloud._process(1.0)
 check(cloud.position == cloud_position, "Reduced motion freezes decorative cloud drift")
 game.ui.celebrate(2)
 check_text_sampling(game.ui.celebration)
 check(game.ui.celebration.modulate.a == 1.0 and game.ui.celebration_tweens.is_empty(), "Reduced motion presents rewards without fade or sparks")
 check(game.layout.snapshot() == motion_snapshot, "Motion preference cannot modify game progress")
 game.ui.celebration.free()
 game.ui.celebration = null
 game.receive_reduced_motion([false])
 game.ui.celebrate(2)
 check(not game.ui.celebration_tweens.is_empty(), "Normal presentation retains reward effects")
 game.receive_reduced_motion([true])
 check(game.ui.celebration_tweens.is_empty() and game.ui.celebration.modulate.a == 1.0, "Live preference change settles an active celebration")
 game.ui.celebration.free()
 game.ui.celebration = null
 game.receive_reduced_motion([false])
 check(game.get_script().resource_path == "res://scripts/xp_bridge.gd", "Integrated export must run the XP bridge")
 var before = game.layout.snapshot()
 check(not game.restore_study_layout({"version": 999}), "Bridge must reject unsupported snapshots")
 check(game.layout.snapshot() == before, "Rejected bridge restore preserves live island")
 check(game.restore_study_layout(before), "Bridge restores a valid snapshot")
 game.ui.max_preview_level = 10
 game.study_requires_save_acknowledgment = true
 game.playground_manual_progression = true
 game.apply_study_level(3)
 check(game.layout.level == 2 and game.pending_unlock_level == 2, "Active profile claims override sandbox flags and unlock sequentially")
 check(game.ui.celebration == null, "No successful unlock celebration before durable save")
 game.receive_layout_saved([2, false])
 game.apply_study_level(3)
 check(game.layout.level == 2 and game.ui.celebration == null, "Failed save cannot celebrate or grant the next reward")
 game.complete_level_unlock(1, true)
 check(game.pending_unlock_level == 2, "An earlier checkpoint cannot acknowledge this unlock")
 game.receive_layout_saved([2, true])
 check(game.ui.celebration != null and game.pending_unlock_level == 0, "A persisted unlock celebrates once")
 game.complete_level_unlock(2, true)
 game.ui.celebration.queue_free()
 game.ui.celebration = null
 game.apply_study_level(3)
 check(game.layout.level == 3 and game.pending_unlock_level == 3, "Delayed claims catch up one idempotent reward at a time")
 game.complete_level_unlock(3, true)
 game.ui.celebration.queue_free()
 game.ui.celebration = null
 check(game.restore_study_layout(before), "Restore the original fixture after unlock checks")
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
 # Inventory reachability uses the same authored controls at desktop and the
 # narrow phone width; hidden House/Bridge controls retain their owned policy.
 var original_size = root.size
 game.ui.refresh(true, "", false)
 for width in [1440, 360]:
  root.size = Vector2i(width, 800)
  game.ui.arrange()
  var viewport_size = game.get_viewport().get_visible_rect().size
  for button in game.ui.buttons.values() + game.ui.action_buttons + [game.ui.done_button]:
   if button.is_visible_in_tree():
    var bounds = button.get_global_rect()
    check(bounds.position.x >= 0 and bounds.position.y >= 0 and bounds.end.x <= viewport_size.x and bounds.end.y <= viewport_size.y, "High-level inventory controls remain within the viewport")
    check(button.get_theme_stylebox("focus") is StyleBoxFlat, "Inventory buttons have a visible focus border")
 root.size = original_size
 game.ui.refresh(false, "", false)
 # Locale delivery updates live Godot UI without changing island data.
 var copy = root.get_node("GameCopy")
 var retained = game.layout.snapshot()
 for locale in copy.LOCALES:
  game.receive_locale([locale])
  check(copy.locale == locale, "Bridge delivers locale to Godot")
  game.ui.refresh(false, "", false)
  check_text_sampling(game.arrival.root)
  check_text_sampling(game.ui.root)
  check(game.ui.launch.accessibility_name == copy.text("terrain"), "Live inventory label follows locale")
  game.ui.refresh(true, "", false)
  if locale.begins_with("zh"):
   for value in copy.catalogs[locale].values():
    for character in value:
     if character.unicode_at(0) > 127:
      check(copy.fonts[locale].has_char(character.unicode_at(0)), "Bundled Chinese font covers the game catalog")
  check(game.ui.buttons.chicken.accessibility_name.begins_with(copy.text("chicken")), "Duplicated chicken has its own accessible name")
  for level in range(2, 11):
   game.ui.celebrate(level)
   check(game.ui.celebration.get_node("Title").text == copy.text("level", {"level": level}), "All ten-level reward titles follow locale")
   game.ui.celebration.fit_text(0.5)
   check_text_sampling(game.ui.celebration)
   check(game.ui.celebration.get_node("BuildButton").get_theme_font_size("font_size") >= 28, "Phone confirmation remains readable after popup fitting")
   var title = game.ui.celebration.get_node("Title")
   if locale.begins_with("zh"):
    var font = title.get_theme_font("font")
    for character in copy.text("level", {"level": level}):
     check(font.has_char(character.unicode_at(0)), "Bundled Chinese title font covers every character")
   game.ui.celebration.free()
   game.ui.celebration = null
 check(game.layout.snapshot() == retained, "Changing locale cannot mutate gameplay or saves")
 game.receive_locale(["unsupported"])
 check(copy.locale == "en", "Unsupported locale falls back to English")
 print("Integrated export contract: %s failures" % failures)
 quit(1 if failures else 0)

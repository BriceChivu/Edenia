extends SceneTree
var failures: Array[String] = []
func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.resources.wood = 8
	scene.layout.carried_wood = 2
	var pile := Vector2i(0, 1)
	scene.layout.log_piles[pile] = 6
	scene.editing = false
	scene.rebuild_decorations()
	check(scene.construction.pickup(pile), "Pawn can route to pyramid")
	check(scene.layout.log_piles[pile] == 6 and scene.layout.house_bundle == 0, "Approach leaves pyramid intact")
	scene.waypoints.clear()
	scene.pawn.position = scene.layout.center(pile)
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0.0)
	check(not scene.layout.log_piles.has(pile) and scene.layout.house_bundle == 6 and scene.layout.carried_wood == 2 and scene.layout.resources.wood == 8, "Instant pickup reserves exactly six, preserving other harvest")
	var copy = scene.Layout.new()
	check(copy.restore(JSON.parse_string(JSON.stringify(scene.layout.snapshot()))) and copy.house_bundle == 6, "Reserved pyramid survives save and reload")
	var invalid: Dictionary = scene.layout.snapshot()
	invalid.house_bundle = 5
	check(not copy.restore(invalid), "Reject malformed bundle")
	check(not scene.construction.build(Vector2i(8, 4)) and scene.layout.house_bundle == 6 and scene.layout.houses.is_empty(), "Unreachable water site preserves reserved logs")
	scene.terrain.hover = Vector2i(8, 4)
	scene.terrain.valid = true
	scene.update_house_preview()
	scene.update_cursor()
	check(not scene.terrain.valid and scene.cursor_mode == "invalid" and scene.pointer.texture == scene.INVALID_CURSOR, "Unreachable house hover hides preview and uses Cursor_03")
	check(scene.layout.house_bundle == 6 and scene.layout.houses.is_empty(), "Hover validation preserves reserved bundle and layout")
	var site := Vector2i(1, 1)
	scene.terrain.hover = site
	scene.terrain.preview_position = scene.layout.center(site)
	scene.terrain.valid = true
	scene.update_house_preview()
	scene.update_cursor()
	check(scene.terrain.valid and scene.cursor_mode == "place", "Reachable house site keeps placement preview")
	scene.terrain.preview_position = scene.layout.center(site) + Vector2(31, 31)
	check(scene.terrain.placement_offset() == Vector2(31, 31), "Pointer preview follows freely without clamping")
	scene.terrain.preview_position = scene.layout.center(site) + Vector2.ZERO
	var preview: Rect2 = scene.terrain.house_preview_rect()
	check(scene.construction.build(site), "Reachable site starts carrying approach")
	check(scene.layout.house_bundle == 6 and scene.layout.houses.is_empty() and not scene.pawn.hammering, "Walking does not spend logs or start hammer")
	scene.pawn.position = scene.pawn.destination if scene.waypoints.is_empty() else scene.waypoints.back()
	scene.waypoints.clear()
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0.0)
	check(scene.pawn.hammering and scene.layout.houses.get(site) == 1 and scene.layout.house_bundle == 0 and scene.layout.carried_wood == 2 and scene.layout.resources.wood == 2, "Arrival builds side-view house, spends only bundle, and equips hammer")
	check(copy.restore(JSON.parse_string(JSON.stringify(scene.layout.snapshot()))) and not copy.house_build.is_empty(), "Active construction clock survives JSON reload")
	check(copy.house_offsets.get(site) == Vector2.ZERO, "Reload preserves chosen house offset")
	check(copy.edit(site, "house", Vector2i(-10, -10)) and copy.house_offsets[site] == Vector2.ZERO, "Rotation preserves free placement anchor")
	var old_placement: Dictionary = scene.layout.snapshot()
	old_placement.version = 26
	old_placement.houses[0][3] = 31
	old_placement.houses[0][4] = 31
	check(copy.restore(old_placement) and copy.house_offsets[site] == copy.legacy_house_placement_offset(Vector2(31, 31)), "Earlier overhanging save moves back onto the same foundation")
	check(copy.restore(scene.layout.snapshot()), "Restore construction after rotation check")
	var footprint: PackedVector2Array = scene.layout.house_footprint(site)
	var centered: PackedVector2Array = scene.layout.house_footprint(site, 1, Vector2.ZERO)
	check(footprint[0] - centered[0] == Vector2.ZERO, "House contacts follow the preview offset")
	check(scene.pawn.sprite.sprite_frames.get_frame_count("hammer_interact") == 3 and scene.pawn.sprite.sprite_frames.get_animation_speed("hammer_interact") == 10, "Three original hammer frames at website 10 fps")
	scene.construction.phase = scene.construction.Phase.READY
	scene.pawn.hammering = false
	scene.construction.resume_build()
	check(scene.pawn.hammering and scene.pawn.position.is_equal_approx(Vector2(copy.house_build.pawn_x, copy.house_build.pawn_y)), "Reload resumes worker at saved construction position")
	var house = scene.construction.house_sprite
	check((house.position + house.offset - house.texture.get_size() / 2).is_equal_approx(preview.position), "Built house stays exactly at the free pointer preview")
	var base: Vector2 = house.position + house.offset + Vector2(0, 82)
	scene.pawn.sprite.set_frame_and_progress(1, 0)
	scene.construction.update_impact()
	check(house.scale.x > 1 and house.scale.y < 1 and (house.position + (house.offset + Vector2(0, 82)) * house.scale).is_equal_approx(base), "Hammer impact squashes house with fixed base")
	scene.pawn.sprite.set_frame_and_progress(2, 0)
	scene.construction.update_impact()
	check(house.scale == Vector2.ONE, "Recovery restores house shape")
	scene.construction.advance_build(scene.construction.build_started_at)
	check(is_equal_approx(house.modulate.a, 0.5), "House begins at 50% opacity")
	scene.construction.advance_build(scene.construction.build_started_at + 10)
	check(is_equal_approx(house.modulate.a, 0.75) and scene.pawn.hammering, "Ten seconds is 75% opacity and still building")
	scene.construction.advance_build(scene.construction.build_started_at + 20)
	check(is_equal_approx(house.modulate.a, 1.0), "Twenty seconds is fully opaque")
	check(not scene.pawn.hammering and scene.construction.phase == scene.construction.Phase.READY, "Twenty seconds completes construction")
	var completed: Dictionary = scene.layout.snapshot()
	var occupied: Vector2i = scene.Layout.HOME
	var refund: Vector2i = scene.layout.house_refund_cell(site, occupied)
	check(scene.layout.edit(site + Vector2i.ONE, "remove", occupied), "Pickup from any foundation square removes house")
	check(scene.layout.houses.is_empty() and scene.layout.log_piles.get(refund) == 6 and scene.layout.resources.wood == 8 and scene.layout.stock.house == 0 and scene.layout.carried_wood == 2, "Pickup returns one six-log pyramid and preserves carried logs")
	check(copy.restore(JSON.parse_string(JSON.stringify(scene.layout.snapshot()))) and copy.log_piles.get(refund) == 6, "Refund pyramid survives reload")
	check(scene.layout.restore(completed) and scene.layout.houses.has(site) and not scene.layout.log_piles.has(refund) and scene.layout.resources.wood == 2, "Undo pickup restores house without duplicating logs")
	scene.toggle_editing()
	scene.undo()
	check(scene.layout.houses.is_empty() and scene.layout.house_bundle == 6 and scene.layout.resources.wood == 8, "Undo restores reserved logs without duplicating pyramid")
	scene.queue_free()
	await process_frame
	print("House construction checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)

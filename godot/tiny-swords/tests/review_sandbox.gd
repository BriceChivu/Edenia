extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures+=1
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var game = load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled = false
	root.add_child(game)
	await process_frame
	game.seed_scene()
	game.apply_items()
	game.refresh_review_ui()
	game.selected_id = 2
	var original: Vector2 = game.item_point(game.selected_item())
	game.nudge(Vector2(0.1,-1))
	check(game.item_point(game.selected_item()).distance_to(original+Vector2(0.1,-1))<0.001,'Subpixel nudges preserve exact coordinates')
	game.undo_review()
	check(game.item_point(game.selected_item()).is_equal_approx(original),'Undo restores exact ground positions')
	var first: int = game.insert_item('land_rock',1,original+Vector2(7.25,8.5))
	var second: int = game.insert_item('land_rock',4,original+Vector2(15.75,15.5))
	game.apply_items()
	var a := Vector2i(1000+first,1000)
	var b := Vector2i(1000+second,1000)
	check(game.layout.center(a).distance_to(original+Vector2(7.25,8.5))<0.001,'Rock render/contact center preserves fractional placement')
	check(game.layout.center(a)!=game.layout.center(b),'Two rocks on one grass tile remain independent')
	check(not game.layout.rocks_block_segment(original-Vector2(120,80),original-Vector2(100,80)),'Remote grass stays walkable')
	var face = game.layout.rock_footprint(a)
	var middle := Vector2.ZERO
	for vertex in face: middle+=vertex
	middle/=face.size()
	check(game.layout.rocks_block_segment(middle,middle),'Native rock collision follows the placed polygon')
	var tree: int = game.insert_item('tree',1,original+Vector2(-22.5,34.25))
	game.apply_items()
	var slot := Vector2i(1000+tree,1000)
	check(game.layout.tree_position(slot).distance_to(original+Vector2(-22.5,34.25))<0.001,'Tree native ground anchor preserves exact placement')
	check(not preload('res://scripts/tree_art.gd').shadow_ground(game.layout,slot).is_empty(),'Free tree placement retains real receiving-ground shadow clipping')
	var state: Dictionary = JSON.parse_string(JSON.stringify(game.scene_state()))
	game.seed_scene()
	game.apply_scene(state)
	game.apply_items()
	check(game.layout.tree_position(slot).distance_to(original+Vector2(-22.5,34.25))<0.001,'JSON scene roundtrip preserves exact positions and terrain')
	game.set_playing(true)
	check(game.pawn.is_physics_processing(),'Play enables real pawn movement')
	game.set_playing(false)
	check(not game.pawn.is_physics_processing(),'Pause freezes real pawn movement')
	game.selected_id = second
	game.remove_item()
	check(not game.layout.decorations.has(b),'Remove deletes the selected object independently')
	game.undo_review()
	check(game.layout.decorations.has(b),'Undo restores the removed object')
	check(paused,'Pause freezes scene tweens and animations as well as actors')
	if DisplayServer.get_name() != 'headless':
		game.note_text.text = 'Review test: exact placement and captured frame'
		await game.save_comment()
		check(game.notes.size()==1 and str(game.notes[0].screenshot_png).length()>100,'A comment captures a rendered PNG and restorable scene')
		var saved_point: Vector2 = game.item_point(game.selected_item())
		game.nudge(Vector2(10,0))
		game.note_list.select(1)
		game.load_comment()
		check(game.item_point(game.selected_item()).is_equal_approx(saved_point),'Loading a comment restores its exact placement')
	game.notes.clear()
	game.dirty_seconds = -1
	game.queue_free()
	await process_frame
	print('Precise review checks: %s'%('PASS' if failures==0 else 'FAIL'))
	quit(0 if failures==0 else 1)

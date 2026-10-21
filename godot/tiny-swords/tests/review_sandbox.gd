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
	check(Input.get_mouse_mode()==Input.MOUSE_MODE_VISIBLE,'Review opens with a visible system cursor')
	game.get_window().focus_exited.emit()
	game.get_window().focus_entered.emit()
	check(Input.get_mouse_mode()==Input.MOUSE_MODE_VISIBLE,'Review keeps the system cursor visible after regaining focus')
	await check_library(game)
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
	game.get_window().focus_exited.emit()
	game.get_window().focus_entered.emit()
	game.review_tick(0)
	check(Input.get_mouse_mode()==Input.MOUSE_MODE_VISIBLE and not game.pointer.visible,'Play keeps one visible system cursor after regaining focus')
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

func check_library(game) -> void:
	var origin: Vector2 = game.ORIGIN_POINT
	game.palette_search.text = 'house'
	game.palette_search.text_changed.emit('house')
	check(game.palette.item_count==4,'Search exposes all four house directions')
	game.palette_search.text = 'staircase'
	game.palette_search.text_changed.emit('staircase')
	check(game.palette.item_count==2,'Search exposes both staircase directions')
	game.palette_search.text = 'does not exist'
	game.palette_search.text_changed.emit('does not exist')
	check(game.selected_choice().is_empty() and game.place_button.disabled,'An empty search cannot place a stale selection')
	game.palette_search.clear()
	game.palette_search.text_changed.emit('')
	var initial: Dictionary = game.scene_state()
	for i in game.palette.item_count:
		game.apply_scene(initial)
		game.apply_items()
		game.palette.select(i)
		game.choose_palette_item()
		var choice: Dictionary = game.selected_choice()
		var kind: String = choice.kind
		game.place_at(origin)
		if kind not in ['grass','stairs','water','bridge']:
			var item: Dictionary = game.selected_item()
			check(item.kind==kind and int(item.variant)==int(choice.variant),'Library places the selected '+str(choice.name))
			check(is_instance_valid(game.item_nodes.get(int(item.id))),str(choice.name)+' creates real game artwork')
			if choice.get('stump',false): check(game.layout.tree_stumps.has(game.slot_for(item)),'Stump selection uses native cut-tree artwork')
		else:
			var cell: Vector2i = game.layout.cell_at(origin)
			if kind=='grass': check(game.layout.height_at(cell)==int(choice.floor)*64,'Grass choice sets the selected floor')
			elif kind=='stairs':
				check(game.layout.cells[cell]=='stairs' and game.layout.stair_direction(cell)==(Vector2i.RIGHT if int(choice.variant)==1 else Vector2i.LEFT),'Staircase uses the selected native slope direction')
			elif kind=='water': check(not game.layout.cells.has(cell),'Water tool removes ground')
			elif kind=='bridge':
				check(game.layout.bridges.has(cell) and not game.layout.cells.has(cell) and not game.layout.cells.has(cell+Vector2i.RIGHT),'Bridge placement spans two water cells with native banks')
				var saved: Dictionary = JSON.parse_string(JSON.stringify(game.scene_state()))
				game.seed_scene()
				game.apply_scene(saved)
				check(game.layout.bridges.has(cell),'JSON roundtrip preserves bridges')
				game.undo_review()
				check(game.layout.bridges.is_empty(),'Undo restores the terrain before bridge placement')
		await process_frame
	game.apply_scene(initial)
	game.apply_items()
	game.history_states.clear()

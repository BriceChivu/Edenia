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
	await check_contacts(game)
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
	var isolated: Dictionary = initial.duplicate(true)
	isolated.items = [isolated.items[0]]
	isolated.items[0].point = [origin.x-200,origin.y+180]
	for i in game.palette.item_count:
		game.apply_scene(isolated)
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

func choose_kind(game, kind: String, variant: int = 1) -> void:
	for i in game.palette.item_count:
		var choice: Dictionary = game.tool_choices[int(game.palette.get_item_metadata(i))]
		if choice.kind==kind and int(choice.variant)==variant:
			game.palette.select(i)
			game.choose_palette_item()
			return
	check(false,'Missing tool '+kind)

func check_contacts(game) -> void:
	var origin: Vector2 = game.ORIGIN_POINT
	var initial: Dictionary = game.scene_state()
	game.items = [game.items[0]]
	game.items[0].point = [origin.x-200,origin.y+180]
	game.apply_items()
	choose_kind(game,'land_rock',4)
	game.place_at(origin)
	var rock: Dictionary = game.selected_item()
	var face: PackedVector2Array = game.layout.rock_footprint(game.slot_for(rock))
	var middle := Vector2.ZERO
	for vertex in face: middle+=vertex
	middle/=face.size()
	var original_pawn: Vector2 = game.item_point(game.items[0])
	var history_size: int = game.history_states.size()
	choose_kind(game,'pawn')
	game.place_at(middle)
	check(game.item_point(game.items[0])==original_pawn,'Click placement cannot put the pawn inside a rock face')
	check(game.history_states.size()==history_size,'Rejected placement does not consume undo history')
	check(not game.rejected_item.is_empty(),'Rejected placement exposes a red contact preview')
	game.selected_id = int(game.items[0].id)
	check(not game.move_selected(middle,false),'Drag movement cannot enter a blocked rock contact')
	game.x_input.set_value_no_signal(middle.x-origin.x)
	game.y_input.set_value_no_signal(middle.y-origin.y)
	game.set_coordinate(0)
	check(game.item_point(game.items[0])==original_pawn,'Coordinate entry keeps the last valid position when blocked')
	check(is_equal_approx(game.x_input.value,original_pawn.x-origin.x),'Rejected coordinates restore the fields to the accepted position')
	var safe := origin+Vector2(-50,middle.y-origin.y)
	for x in range(-50,50):
		var candidate := Vector2(origin.x+x,middle.y)
		if game.contact_rules.error_for(game.layout,game.items,game.items[0],candidate,int(game.items[0].id)).is_empty() and not game.contact_rules.error_for(game.layout,game.items,game.items[0],candidate+Vector2.RIGHT,int(game.items[0].id)).is_empty():
			safe = candidate
			break
	check(game.move_selected(safe),'A clear point beside the footprint is accepted')
	game.nudge(Vector2.RIGHT)
	check(game.item_point(game.items[0])==safe,'A one-pixel nudge cannot cross a solid contact boundary')
	check(game.move_selected(origin+Vector2(0,-25)),'The rock silhouette above its contact stays available for behind-rock perspective')
	choose_kind(game,'land_rock',1)
	var count: int = game.items.size()
	game.place_at(origin+Vector2(0,3))
	check(game.items.size()==count,'Objects cannot partially overlap another object contact')
	choose_kind(game,'stairs')
	var cells: Dictionary = game.layout.cells.duplicate()
	game.place_at(origin)
	check(game.layout.cells==cells,'A staircase cannot remove flat support from an existing object')
	choose_kind(game,'land_rock',1)
	game.place_at(origin+Vector2(0,90))
	check(game.items.size()==count+1,'Clear supported object placement still succeeds')
	var new_rock: Dictionary = game.selected_item()
	check(game.move_selected(game.item_point(new_rock)+Vector2(0.1,0)),'Moving an object ignores its own old contact')
	game.undo_review()
	check(game.item_point(game.selected_item())==origin+Vector2(0,90),'Undo retains exact valid coordinates')
	game.apply_scene(initial)
	game.apply_items()
	game.history_states.clear()
	await check_contact_variants(game)
	await process_frame

func check_contact_variants(game) -> void:
	var initial: Dictionary = game.scene_state()
	var isolated: Dictionary = initial.duplicate(true)
	isolated.items = [isolated.items[0]]
	var origin: Vector2 = game.ORIGIN_POINT
	isolated.items[0].point = [origin.x-200,origin.y+180]
	for kind in ['land_rock','tree','house','logs']:
		for variant in range(1,7 if kind=='logs' else 5):
			game.apply_scene(isolated)
			game.apply_items()
			choose_kind(game,kind,variant)
			game.place_at(origin)
			var item: Dictionary = game.selected_item()
			check(item.kind==kind,'Contact fixture placed '+kind)
			var slot: Vector2i = game.slot_for(item)
			var patch := PackedVector2Array()
			match kind:
				'land_rock': patch = game.layout.rock_footprint(slot)
				'tree': patch = game.layout.tree_footprint(origin,game.layout.TREE_VARIANTS[variant-1])
				'house': patch = game.layout.house_footprint(slot)
				'logs': patch = game.layout.log_footprint(slot)
			var inside := Vector2.ZERO
			for vertex in patch: inside+=vertex
			inside/=patch.size()
			choose_kind(game,'pawn')
			game.place_at(inside)
			check(game.item_point(game.items[0])==Vector2(isolated.items[0].point[0],isolated.items[0].point[1]),'Pawn placement respects %s %d native contact'%[kind,variant])
			await process_frame
	game.apply_scene(initial)
	game.apply_items()
	game.history_states.clear()

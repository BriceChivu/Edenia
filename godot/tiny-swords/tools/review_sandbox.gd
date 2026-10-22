extends "res://scripts/level_two_preview.gd"

const ReviewLayout = preload('res://tools/review_layout.gd')
const Resolutions = preload('res://tools/review_resolutions.gd')
const STORAGE_KEY := 'edenia-precise-island-review-v1'
const NATIVE_FILE := 'user://precise-island-review.json'
const ORIGIN_POINT := Vector2(544,208)
const PANEL_WIDTH := 280.0
var review_persistence_enabled := true
var review_stock_enabled := true
var stock_rules = preload('res://tools/review_stock.gd').new()
var terrain_rules = preload('res://tools/review_terrain.gd').new()
var motion_rules = preload('res://tools/review_motion.gd').new()
var movement_review = preload('res://tools/review_tour.gd').new()
var toolbar: HBoxContainer
var selected_label: Label
var carry_control: CheckButton
var items: Array = []
var notes: Array = []
var resolved_notes: Array = []
var selected_id := 1
var next_id := 1
var playing := false
var placing := false
var dragging := false
var drag_offset := Vector2.ZERO
var pending_drag_point := Vector2(INF,INF)
var model_ready := false
var updating_ui := false
var dirty_seconds := -1.0
var history_states: Array = []
var panel: PanelContainer
var palette: ItemList
var palette_category: OptionButton
var palette_search: LineEdit
var palette_count: Label
var item_list: ItemList
var x_input: SpinBox
var y_input: SpinBox
var color_input: OptionButton
var facing_input: CheckButton
var mode_button: Button
var place_button: Button
var markers: CheckButton
var contacts: CheckButton
var status_label: Label
var note_text: TextEdit
var note_list: OptionButton
var zoom_control: HSlider
var floor_input: SpinBox
var overlay: Node2D
var ui_root: Control
var tool_choices: Array = []
var item_nodes: Dictionary = {}
var selected_note := -1
var effect_clock := 0.0
var view_center := ORIGIN_POINT
var panning := false
var pan_button := MOUSE_BUTTON_NONE
var pan_start := Vector2.ZERO
var pan_origin := Vector2.ZERO
var contact_status: Label
var contact_rules = preload('res://tools/review_contacts.gd').new()
var placement_warning := ''
var rejected_item: Dictionary = {}
var rejected_point := Vector2.ZERO
var problem_rect := Rect2()
var problem_start := Vector2.ZERO
var problem_previous := Rect2()
var marking_problem := false
var drawing_problem := false
var annotation_button: Button

func _ready() -> void:
	use_system_cursor = true
	preview_save_enabled = false
	camera_save_enabled = false
	island_start_enabled = false
	black_hole_enabled = true
	layout = ReviewLayout.new()
	layout.bridges_enabled = true
	super._ready()
	set_process_input(true)
	ui.hide()
	pointer.hide()
	get_node('Clouds').hide()
	get_node('PassingCloud').hide()
	get_node('WaterRocks').hide()
	movement_review.review = self
	build_review_ui()
	overlay = preload('res://tools/review_overlay.gd').new()
	overlay.review = self
	overlay.process_mode = Node.PROCESS_MODE_ALWAYS
	overlay.z_index = 120
	add_child(overlay)
	var loaded = load_review()
	var reviews_archived := false
	if loaded is Dictionary and loaded.get('scene') is Dictionary:
		var review_groups := Resolutions.partition(loaded.get('notes',[]),loaded.get('resolved_notes',[]))
		notes = review_groups.pending
		resolved_notes = review_groups.resolved
		reviews_archived = notes.size()!=loaded.get('notes',[]).size()
		note_text.text = loaded.get('draft_comment','')
		apply_scene(loaded.scene)
	else:
		seed_scene()
		zoom_control.value = clampf((get_window().size.x/ui.scale_ui-PANEL_WIDTH-40)/420.0,0.4,1.6)
	var stocked := stock_rules.populate(self) if review_stock_enabled else false
	model_ready = true
	var controller := preload('res://tools/review_controller.gd').new()
	controller.review = self
	controller.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(controller)
	get_tree().paused = true
	apply_items()
	refresh_review_ui()
	get_viewport().size_changed.connect(arrange_review)
	arrange_review()
	if reviews_archived: mark_dirty()
	if stocked:
		show_all_items()
		mark_dirty()
	status_label.text = 'Drag an item to arrange it. Drag empty ground to pan; scroll gently to zoom.'

func seed_scene() -> void:
	stop_annotation_mode()
	problem_rect = Rect2()
	layout.cells.clear()
	layout.elevations.clear()
	layout.stair_directions.clear()
	layout.bridges.clear()
	for y in range(-4,5):
		for x in range(-5,6): layout.cells[Vector2i(x,y)] = 'meadow'
	items.clear()
	next_id = 1
	for entry in [['pawn',1,Vector2(-70,80)],['bush',1,Vector2.ZERO],['bush',2,Vector2(130,0)],['land_rock',4,Vector2(100,110)],['tree',2,Vector2(-150,-20)],['sheep',1,Vector2(25,24)],['chicken',1,Vector2(-35,38)]]:
		insert_item(entry[0],int(entry[1]),ORIGIN_POINT+entry[2])
	selected_id = 1

func insert_item(kind: String, variant: int, point: Vector2) -> int:
	if kind in ['pawn','portal']:
		for item in items:
			if item.kind == kind:
				item.point = [point.x,point.y]
				item.variant = variant
				item.hidden = false
				if kind == 'pawn':
					for field in ['pose','frame','alpha','sprite_y']: item.erase(field)
					for other in items:
						if other.kind == 'portal': other.get('occupants',[]).erase('pawn')
				elif item.get('phase','hungry') == 'idle': item.phase = 'hungry'
				return int(item.id)
	var id := next_id
	next_id += 1
	items.append({'id':id,'kind':kind,'variant':variant,'point':[point.x,point.y],'flip':false,'color':0,'hidden':false,'stump':false})
	return id

func item_point(item: Dictionary) -> Vector2:
	return Vector2(float(item.point[0]),float(item.point[1]))

func slot_for(item: Dictionary) -> Vector2i:
	return Vector2i(1000+int(item.id),1000)

func selected_item() -> Dictionary:
	for item in items:
		if int(item.id) == selected_id: return item
	return {}

func pawn_review_id() -> int:
	for item in items:
		if item.kind=='pawn': return int(item.id)
	return -1

func restore_review_pawn() -> bool:
	var item: Dictionary={}
	for candidate in items:
		if candidate.kind=='pawn': item=candidate; break
	if item.is_empty(): return false
	if not item.hidden: return true
	var original := item_point(item)
	var point := original
	var distance := INF
	if not contact_rules.error_for(layout,items,item,point,int(item.id)).is_empty():
		point=Vector2.INF
		for cell in layout.cells:
			for offset in [Vector2.ZERO,Vector2(-16,0),Vector2(16,0),Vector2(0,-16),Vector2(0,16)]:
				var target: Vector2=layout.center(cell)+offset
				if original.distance_squared_to(target)>=distance: continue
				if not contact_rules.error_for(layout,items,item,target,int(item.id)).is_empty(): continue
				distance=original.distance_squared_to(target)
				point=target
	if not point.is_finite(): return false
	push_history()
	item.hidden=false
	item.point=[point.x,point.y]
	for field in ['pose','frame','alpha','sprite_y']: item.erase(field)
	for other in items:
		if other.kind=='portal': other.get('occupants',[]).erase('pawn')
	selected_id=int(item.id)
	rebuild_review()
	view_center=point-Vector2(0,ground_height(point))
	arrange_review()
	return true

func freeze_game() -> void:
	pawn.set_physics_process(playing)
	harvesting.set_process(playing)
	construction.set_process(playing)
	portal_event.set_process(playing)
	for node in asset_nodes:
		if is_instance_valid(node) and node.has_method('animal_positions'): node.set_process(playing)
	for node in flora_nodes+tree_nodes:
		if is_instance_valid(node):
			if node.has_method('update_depth'): node.update_depth()
			node.set_process(playing)
	if not playing: pawn.sprite.pause()
	get_node('Clouds').hide()
	get_node('PassingCloud').hide()
	ui.hide()
	pointer.hide()

func apply_items() -> void:
	movement_review.stop(false)
	pending_drag_point = Vector2(INF,INF)
	movement_generation += 1
	water_fall_generation += 1
	navigation_pending = false
	world_pointer_down = null
	holds.cancel()
	splash.stop()
	splash.hide()
	construction.phase = construction.Phase.READY
	construction.house_sprite = null
	layout.house_build.clear()
	harvesting.cancel()
	for tween in get_tree().get_processed_tweens():
		if tween.is_valid(): tween.kill()
	portal_event.reset_visit()
	for key in ['flora','decorations','trees','tree_types','tree_stumps','tree_cut_remaining','houses','house_offsets','house_colors','house_free_tiles','log_piles','black_hole']:
		layout.get(key).clear()
	layout.review_points.clear()
	layout.review_kinds.clear()
	layout.chickens.clear()
	layout.sheep.clear()
	layout.level = 10
	layout.resources.wood = 0
	layout.carried_wood = 0
	layout.house_bundle = 0
	pawn.portal_absorbed = false
	pawn.carrying_wood = false
	pawn.carrying_chicken = false
	pawn.axe_equipped = false
	pawn.hammering = false
	pawn.chopping = false
	pawn.sprite.modulate = Color.WHITE
	pawn.sprite.rotation = 0
	var portal_item := {}
	for item in items:
		var point := item_point(item)
		var slot: Vector2i = layout.register_object(int(item.id),item.kind,point)
		match item.kind:
			'pawn':
				pawn.position = point
				pawn.walk_to(point)
				layout.pawn_color = int(item.color)
				layout.carried_wood = int(item.variant == 2)
				layout.resources.wood += layout.carried_wood
				pawn.carrying_wood = layout.carried_wood > 0
				pawn.portal_absorbed = item.hidden
			'tree':
				layout.trees[slot] = Vector2.ZERO
				layout.tree_types[slot] = Layout.TREE_VARIANTS[int(item.variant)-1]
				if item.get('stump',false): layout.tree_stumps[slot] = Time.get_unix_time_from_system()+300
			'bush','flowers','land_rock','water_rock','ducks':
				layout.decorations[slot] = {'kind':item.kind,'variant':int(item.variant),'water':slot}
			'logs':
				if int(item.variant) > 0:
					layout.log_piles[slot] = int(item.variant)
					layout.resources.wood += int(item.variant)
			'house':
				layout.houses[slot] = int(item.variant)-1
				layout.house_colors[slot] = int(item.color)
			'portal': portal_item = item
			'chicken','sheep':
				if not item.hidden: (layout.chickens if item.kind == 'chicken' else layout.sheep).append(point)
	if not portal_item.is_empty():
		var passengers: Array = portal_item.get('occupants',[]).duplicate()
		layout.black_hole = {'phase':portal_item.get('phase','hungry'),'day':preload('res://scripts/black_hole_state.gd').today(),'next_day':99999,'cell':[slot_for(portal_item).x,1000],'occupants':passengers,'facing_left':not portal_item.flip}
	waypoints.clear()
	log_pickup = Vector2i(999,999)
	log_delivery = Vector2i(999,999)
	water_phase = WaterPhase.READY
	rebuild_decorations()
	terrain.layout = layout
	terrain.queue_redraw()
	pawn.set_color(layout.pawn_color)
	pawn.visible = not pawn.portal_absorbed
	pawn.sprite.position.y = -32-ground_height(pawn.position)
	pawn.z_index = int(ceil(ground_height(pawn.position)/64.0))
	pawn.sprite.play('wood_idle' if pawn.carrying_wood else 'idle')
	portal_event.visited = true
	portal_event.update_portal()
	portal_event.previous.clear()
	portal_event.last_art_revision = inventory_art_revision
	portal_event._process(0)
	bind_item_nodes()
	freeze_game()
	if overlay != null: overlay.queue_redraw()

func bind_item_nodes() -> void:
	item_nodes.clear()
	var assigned := {}
	for item in items:
		var id: int = int(item.id)
		if item.kind == 'pawn': item_nodes[id] = pawn; continue
		if item.kind == 'portal': item_nodes[id] = portal_event.portal; continue
		for node in asset_nodes+flora_nodes+tree_nodes:
			if not is_instance_valid(node) or node.is_queued_for_deletion() or assigned.has(node): continue
			var match_node := false
			if item.kind in ['chicken','sheep']:
				match_node = node.has_method('animal_positions') and node.get_script() == load('res://scripts/'+item.kind+'_visual.gd') and (node.position.distance_to(item_point(item)) < 0.1 or item.hidden)
				if match_node:
					item.point = [node.position.x,node.position.y]
					item.hidden = false
			elif item.kind == 'tree': match_node = node.get_meta('cell',Vector2i.ZERO) == slot_for(item)
			elif item.kind == 'logs': match_node = node.get_meta('log_pile',Vector2i.ZERO) == slot_for(item)
			elif item.kind == 'house': match_node = node.get_meta('house_cell',Vector2i.ZERO) == slot_for(item)
			else: match_node = node.get_meta('random_decoration','') == item.kind and node.position.distance_to(item_point(item)) < 65
			if match_node:
				item_nodes[id] = node
				assigned[node] = true
				node.set_meta('review_id',id)
				if node is Sprite2D: node.flip_h = item.flip if item.kind != 'house' else node.flip_h
				break
	for item in items:
		if item.kind == 'pawn':
			pawn.sprite.flip_h = item.flip
			if item.has('pose') and pawn.sprite.sprite_frames.has_animation(item.pose):
				pawn.sprite.position.y = float(item.get('sprite_y',-32-ground_height(pawn.position)))
				pawn.sprite.modulate.a = float(item.get('alpha',1.0))
				pawn.sprite.animation = item.pose
				pawn.sprite.frame = mini(int(item.get('frame',0)),pawn.sprite.sprite_frames.get_frame_count(item.pose)-1)
		if item.kind in ['chicken','sheep'] and item_nodes.has(int(item.id)) and item.has('frame'):
			var node = item_nodes[int(item.id)]
			var pose: String = item.get('pose','idle')
			node.texture = node.run_texture if pose=='run' else (node.grass_texture if pose=='grass' else node.idle_texture)
			node.hframes = node.run_frames if pose=='run' else (12 if pose=='grass' else 6)
			node.frame = mini(int(item.frame),node.hframes-1)

func rebuild_decorations(display_layout = null) -> void:
	if model_ready and playing: sync_items()
	super.rebuild_decorations(display_layout)
	if model_ready:
		bind_item_nodes()
		freeze_game()

func sync_items() -> void:
	for item in items:
		var slot := slot_for(item)
		if item.kind == 'pawn':
			item.point = [pawn.position.x,pawn.position.y]
			item.flip = pawn.sprite.flip_h
			item.color = layout.pawn_color
			item.variant = 2 if layout.carried_wood > 0 else 1
			item.hidden = pawn.portal_absorbed
			item.sprite_y = pawn.sprite.position.y
			item.alpha = pawn.sprite.modulate.a
			item.pose = pawn.sprite.animation
			item.frame = pawn.sprite.frame
		elif item.kind in ['sheep','chicken']:
			var node = item_nodes.get(int(item.id))
			if is_instance_valid(node) and not node.is_queued_for_deletion():
				var positions: Array = layout.chickens if item.kind == 'chicken' else layout.sheep
				item.hidden = not positions.has(node.position)
				item.point = [node.position.x,node.position.y]
				item.flip = node.flip_h
				item.frame = node.frame
				item.pose = 'run' if node.texture == node.run_texture else ('grass' if node.texture == node.grass_texture else 'idle')
		elif item.kind == 'logs': item.variant = int(layout.log_piles.get(slot,0))
		elif item.kind == 'tree': item.stump = layout.tree_stumps.has(slot)
		elif item.kind == 'house': item.color = layout.house_colors.get(slot,0)
		elif item.kind == 'portal' and not layout.black_hole.is_empty():
			item.occupants = layout.black_hole.occupants.duplicate()
			item.phase = layout.black_hole.phase
			if layout.black_hole.cell.size()==2:
				var point: Vector2 = portal_event.center()
				item.point = [point.x,point.y]
			item.flip = not layout.black_hole.facing_left

func rebuild_review() -> void:
	if playing: return
	apply_items()
	refresh_review_ui()
	mark_dirty()

func push_history() -> void:
	record_history(scene_state())

func record_history(state: Dictionary) -> void:
	history_states.append(state)
	if history_states.size()>40: history_states.pop_front()

func scene_state() -> Dictionary:
	if model_ready: sync_items()
	var tiles: Array = []
	for cell in layout.cells:
		tiles.append([cell.x,cell.y,layout.cells[cell],layout.height_at(cell),layout.stair_directions.get(cell,Vector2i.RIGHT).x])
	var bridges: Array = []
	for cell in layout.bridges: bridges.append([cell.x,cell.y,layout.bridges[cell]])
	return {'items':items.duplicate(true),'tiles':tiles,'bridges':bridges,'selected':selected_id,'next_id':next_id,'zoom':zoom_control.value if zoom_control != null else 2.0,'view_center':[view_center.x,view_center.y],'effect_clock':effect_clock,'portal_clock':portal_event.frame_clock,'problem_rect':[problem_rect.position.x,problem_rect.position.y,problem_rect.size.x,problem_rect.size.y]}

func apply_scene(state: Dictionary) -> void:
	stop_annotation_mode()
	var rectangle: Array = state.get('problem_rect',[0,0,0,0])
	problem_rect = Rect2(float(rectangle[0]),float(rectangle[1]),float(rectangle[2]),float(rectangle[3])).abs()
	clear_contact_warning()
	effect_clock = float(state.get('effect_clock',0))
	portal_event.frame_clock = float(state.get('portal_clock',0))
	items = state.get('items',[]).duplicate(true)
	next_id = int(state.get('next_id',1))
	selected_id = int(state.get('selected',1))
	var saved_view = state.get('view_center',[ORIGIN_POINT.x,ORIGIN_POINT.y])
	view_center = Vector2(saved_view[0],saved_view[1])
	layout.cells.clear()
	layout.elevations.clear()
	layout.stair_directions.clear()
	for tile in state.get('tiles',[]):
		var cell := Vector2i(int(tile[0]),int(tile[1]))
		layout.cells[cell] = tile[2]
		layout.elevations[cell] = float(tile[3])
		if tile[2] == 'stairs': layout.stair_directions[cell] = Vector2i(int(tile[4]),0)
	layout.bridges.clear()
	for bridge in state.get('bridges',[]):
		layout.bridges[Vector2i(int(bridge[0]),int(bridge[1]))] = float(bridge[2])
	zoom_control.set_value_no_signal(float(state.get('zoom',2.0)))

func mark_dirty() -> void:
	dirty_seconds = 0.4

func load_review():
	if not review_persistence_enabled: return null
	var json = JavaScriptBridge.eval("localStorage.getItem('%s')"%STORAGE_KEY) if OS.has_feature('web') else (FileAccess.get_file_as_string(NATIVE_FILE) if FileAccess.file_exists(NATIVE_FILE) else '')
	return JSON.parse_string(json) if json is String and not json.is_empty() else null

func persist_review() -> void:
	if not review_persistence_enabled:
		dirty_seconds = -1
		return
	var data := JSON.stringify({'version':1,'scene':scene_state(),'notes':notes,'resolved_notes':resolved_notes,'draft_comment':note_text.text})
	if OS.has_feature('web'):
		var result = JavaScriptBridge.eval("(()=>{const data=%s; if(location.hostname==='localhost'&&document.querySelector('meta[name=review-local-archive]'))fetch('/__precise-review-store',{method:'POST',headers:{'Content-Type':'application/json'},body:data}).catch(()=>{});try{localStorage.setItem('%s',data);return true}catch(e){return false}})()"%[JSON.stringify(data),STORAGE_KEY])
		if result != true: status_label.text = 'Browser storage is full. Export your reviews to keep them.'
	else:
		var file := FileAccess.open(NATIVE_FILE,FileAccess.WRITE)
		if file: file.store_string(data)
	dirty_seconds = -1

func save_layout(_animal_checkpoint: bool = false) -> void:
	if model_ready: mark_dirty()

func _process(_delta: float) -> void:
	pass

func _input(_event: InputEvent) -> void:
	pass

func _unhandled_input(_event: InputEvent) -> void:
	pass

func review_tick(delta: float) -> void:
	if not model_ready: return
	flush_review_drag()
	movement_review.tick(delta)
	if playing:
		effect_clock += delta
		super._process(delta)
		ui.hide()
		pointer.hide()
	else:
		portal_event.previous.clear()
		portal_event.last_art_revision = inventory_art_revision
		portal_event._process(0)
		portal_event.previous.clear()
		get_node('World')._process(0)
		overlay.queue_redraw()
	portal_event.lens.material.set_shader_parameter('effect_time',effect_clock)
	get_node('Clouds').hide()
	get_node('PassingCloud').hide()
	if dirty_seconds >= 0 and not dragging:
		dirty_seconds -= delta
		if dirty_seconds <= 0: persist_review()

func arrange_review() -> void:
	var viewport_size := get_viewport_rect().size
	ui_root.scale = Vector2.ONE*ui.scale_ui
	toolbar.position = Vector2(0,0)
	toolbar.size = Vector2(viewport_size.x/ui.scale_ui,36)
	panel.position.y = 40
	panel.size = Vector2(PANEL_WIDTH,viewport_size.y/ui.scale_ui-40)
	game_camera.zoom = Vector2.ONE * zoom_control.value * ui.scale_ui
	game_camera.position = view_center-Vector2(panel.size.x/(2*zoom_control.value),40)
	game_camera.force_update_scroll()

func set_playing(value: bool) -> void:
	if value: movement_review.stop(false)
	if value and not playing: repair_review_animal_contacts()
	stop_annotation_mode()
	clear_contact_warning()
	placing = false
	dragging = false
	pending_drag_point = Vector2(INF,INF)
	panning = false
	if value == playing: return
	if value:
		push_history()
		for item in items:
			item.erase('pose')
			item.erase('frame')
		playing = true
		get_tree().paused = false
		harvesting.set_inventory_open(false)
		pawn.sprite.play()
	else:
		sync_items()
		playing = false
		harvesting.set_inventory_open(true)
		get_tree().paused = true
		pawn.walk_to(pawn.position)
		waypoints.clear()
		if review_stock_enabled and stock_rules.populate(self): apply_items()
	freeze_game()
	mode_button.text = 'Pause & arrange' if playing else 'Play scene'
	status_label.text = 'Playing: click grass to walk; click a tree to harvest. Pause to arrange or comment.' if playing else 'Paused: select, drag, or nudge an item. Your scene is saved.'
	refresh_review_ui()
	mark_dirty()

func ground_from_pointer() -> Vector2:
	var projected := get_global_mouse_position()
	var cell := surface_cell(projected)
	return projected + Vector2(0,layout.height_at(cell))

func review_input(event: InputEvent) -> void:
	if not model_ready: return
	if drawing_problem:
		if event is InputEventMouseMotion:
			update_problem_rectangle(get_global_mouse_position())
			get_viewport().set_input_as_handled()
			return
		if event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT and not event.pressed:
			finish_problem_rectangle(get_global_mouse_position())
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton:
		if panning and event.button_index == pan_button and not event.pressed:
			panning = false
			pan_button = MOUSE_BUTTON_NONE
			mark_dirty()
			get_viewport().set_input_as_handled()
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_RIGHT and not over_review_ui(event.position):
			begin_review_pan(event)
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseMotion:
		if panning:
			if event.position.distance_to(pan_start) < world_drag_threshold: return
			view_center = pan_origin-(event.position-pan_start)/game_camera.zoom.x
			arrange_review()
			get_viewport().set_input_as_handled()
			return
		if dragging and not playing:
			var item := selected_item()
			if not item.is_empty():
				var point := ground_from_pointer()+drag_offset
				point = point.snapped(Vector2.ONE*(0.1 if Input.is_key_pressed(KEY_SHIFT) else 1.0))
				pending_drag_point = point
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		if dragging:
			flush_review_drag()
			dragging = false
			persist_review()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventKey and event.pressed and not event.echo and not playing:
		var focus := get_viewport().gui_get_focus_owner()
		if focus is LineEdit or focus is TextEdit or focus is ItemList or focus is OptionButton or focus is Range: return
		var offset := Vector2.ZERO
		match event.keycode:
			KEY_LEFT: offset.x = -1
			KEY_RIGHT: offset.x = 1
			KEY_UP: offset.y = -1
			KEY_DOWN: offset.y = 1
			KEY_ESCAPE:
				if drawing_problem: problem_rect = problem_previous
				stop_annotation_mode()
				placing = false
				place_button.text = 'Place selected item'
		if offset != Vector2.ZERO:
			nudge(offset*(0.1 if event.shift_pressed else 1.0))
			get_viewport().set_input_as_handled()
			return
	if playing:
		super._input(event)
		# Play mode pans the native camera directly. Retain that location when
		# zooming or returning to Arrange mode.
		view_center = game_camera.position+Vector2(panel.size.x/(2*zoom_control.value),40)

func flush_review_drag() -> void:
	if not pending_drag_point.is_finite(): return
	var point := pending_drag_point
	pending_drag_point = Vector2(INF,INF)
	if dragging and not playing: move_selected(point,false)

func over_review_ui(point: Vector2) -> bool:
	return panel.get_global_rect().has_point(point) or toolbar.get_global_rect().has_point(point)

func begin_review_pan(event: InputEventMouseButton) -> void:
	panning = true
	pan_button = event.button_index
	pan_start = event.position
	pan_origin = view_center

func review_unhandled_input(event: InputEvent) -> void:
	if not model_ready: return
	if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
		if over_review_ui(event.position): return
		# Fractional trackpad events must stay fractional. Multiplicative steps
		# keep the same gentle speed at every zoom level.
		var direction := 1.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else -1.0
		zoom_control.value *= exp(direction*minf(absf(event.factor),2.0)*0.035)
		get_viewport().set_input_as_handled()
		return
	if playing:
		super._unhandled_input(event)
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point := ground_from_pointer()
		var ui_focus := get_viewport().gui_get_focus_owner()
		if ui_focus != null: ui_focus.release_focus()
		if marking_problem:
			begin_problem_rectangle(get_global_mouse_position())
		elif placing:
			place_at(point)
		else:
			var best := 8.0/zoom_control.value
			var picked := -1
			for item in items:
				var distance := (item_point(item)-Vector2(0,contact_rules.height(layout,item_point(item)))).distance_to(get_global_mouse_position())
				if not item.hidden and distance < best:
					picked = int(item.id)
					best = distance
			if picked < 0: picked = item_at_art(get_global_mouse_position())
			if picked >= 0:
				movement_review.stop(false)
				selected_id = picked
				push_history()
				dragging = true
				drag_offset = item_point(selected_item())-point
				refresh_review_ui()
				var focus := get_viewport().gui_get_focus_owner()
				if focus != null: focus.release_focus()
			else:
				begin_review_pan(event)
		get_viewport().set_input_as_handled()

func place_at(point: Vector2) -> void:
	var choice := selected_choice()
	if choice.is_empty(): return
	if choice.kind not in ['grass','stairs','water','bridge']:
		var candidate := {'kind':choice.kind,'variant':int(choice.variant)}
		var ignored := -1
		if choice.kind in ['pawn','portal']:
			for existing in items:
				if existing.kind==choice.kind: ignored=int(existing.id)
		if not accept_contact(candidate,point.snapped(Vector2.ONE),ignored): return
	clear_contact_warning()
	var previous_errors := {}
	if choice.kind in ['grass','stairs','water','bridge']:
		for item in items:
			if contact_rules.active(item): previous_errors[int(item.id)] = contact_rules.error_for(layout,items,item,item_point(item),int(item.id))
	var previous_scene := scene_state()
	var cell: Vector2i = layout.cell_at(point)
	if choice.kind == 'bridge':
		var height := maxf(64,floor_input.value*64)
		for bank in Layout.BridgeRules.ends(cell):
			layout.cells[bank] = layout.kind_at_height(height)
			layout.elevations[bank] = height
			layout.stair_directions.erase(bank)
		for gap in [cell,cell+Vector2i.RIGHT]:
			layout.cells.erase(gap)
			layout.elevations.erase(gap)
			layout.stair_directions.erase(gap)
		layout.bridges[cell] = height
	elif choice.kind in ['grass','stairs','water']:
		if choice.kind == 'water':
			layout.bridges.erase(Layout.BridgeRules.owner(layout,cell))
			layout.cells.erase(cell)
			layout.elevations.erase(cell)
			layout.stair_directions.erase(cell)
		else:
			var height := floor_input.value*64
			layout.cells[cell] = layout.kind_at_height(height) if choice.kind == 'grass' else 'stairs'
			layout.elevations[cell] = height
			if choice.kind == 'stairs':
				var direction := Vector2i.RIGHT if int(choice.variant)==1 else Vector2i.LEFT
				layout.stair_directions[cell] = direction
				layout.cells[cell+direction] = layout.kind_at_height(height+64)
				layout.elevations[cell+direction] = height+64
	else:
		selected_id = insert_item(choice.kind,int(choice.variant),point.snapped(Vector2.ONE))
		if choice.get('stump',false): selected_item().stump = true
	for item in items:
		if previous_errors.get(int(item.id),'invalid')!='': continue
		var reason: String = contact_rules.error_for(layout,items,item,item_point(item),int(item.id))
		if not reason.is_empty():
			apply_scene(previous_scene)
			reject_contact(choice,point,'Terrain change blocked: '+reason)
			return
	record_history(previous_scene)
	placing = false
	place_button.text = 'Place selected item'
	rebuild_review()
	status_label.text = 'Placed on the game grid.' if choice.kind in ['grass','stairs','water','bridge'] else 'Placed. Enter X / Y or use arrow keys (Shift = 0.1 px).'

func clear_contact_warning() -> void:
	placement_warning = ''
	rejected_item.clear()
	if overlay != null: overlay.queue_redraw()

func accept_contact(item: Dictionary, point: Vector2, ignored_id: int = -1) -> bool:
	var reason: String = contact_rules.error_for(layout,items,item,point,ignored_id)
	if reason.is_empty(): return true
	reject_contact(item,point,reason)
	return false

func reject_contact(item: Dictionary, point: Vector2, reason: String) -> void:
	placement_warning = reason
	rejected_item = item.duplicate(true)
	rejected_point = point
	refresh_review_ui()
	status_label.text = reason+' Choose a clear contact area.'

func move_selected(point: Vector2, record_undo: bool = true) -> bool:
	if playing or selected_item().is_empty(): return false
	if movement_review.planning or not movement_review.points.is_empty(): movement_review.stop(false)
	var item := selected_item()
	if item.kind in terrain_rules.KINDS: return move_terrain_sample(item,layout.cell_at(point))
	if not accept_contact(item,point,int(item.id)): return false
	if record_undo: push_history()
	clear_contact_warning()
	var previous := item_point(item)
	if point.is_equal_approx(previous): return true
	item.point = [point.x,point.y]
	motion_rules.move(self,item,previous)
	x_input.set_value_no_signal(point.x-ORIGIN_POINT.x)
	y_input.set_value_no_signal(point.y-ORIGIN_POINT.y)
	mark_dirty()
	return true

func nudge(offset: Vector2) -> void:
	if playing or selected_item().is_empty(): return
	if selected_item().kind in terrain_rules.KINDS:
		move_terrain_sample(selected_item(),layout.cell_at(item_point(selected_item()))+Vector2i(signf(offset.x),signf(offset.y)))
		return
	move_selected((item_point(selected_item())+offset).snapped(Vector2.ONE*0.1))

func set_coordinate(_value: float) -> void:
	if updating_ui or playing or selected_item().is_empty(): return
	move_selected(Vector2(x_input.value+ORIGIN_POINT.x,y_input.value+ORIGIN_POINT.y))

func remove_item() -> void:
	if playing or selected_item().is_empty(): return
	clear_contact_warning()
	if review_stock_enabled and stock_rules.last_example(self,selected_item()):
		status_label.text = 'Keep one of each item on the island. Move this example instead.'
		return
	if selected_item().kind == 'pawn':
		status_label.text = 'The scene keeps one pawn. Move it or change its carry state.'
		return
	push_history()
	if selected_item().kind in terrain_rules.KINDS: terrain_rules.restore(layout,selected_item(),layout.cell_at(item_point(selected_item())))
	if selected_item().kind == 'portal':
		for item in items:
			if item.kind in ['pawn','sheep','chicken']: item.hidden = false
	items = items.filter(func(item): return int(item.id)!=selected_id)
	selected_id = int(items[0].id) if not items.is_empty() else -1
	rebuild_review()

func undo_review() -> void:
	if history_states.is_empty(): return
	set_playing(false)
	apply_scene(history_states.pop_back())
	rebuild_review()
	arrange_review()
	status_label.text = 'Restored the previous scene.'

func save_comment() -> void:
	movement_review.pause()
	if note_text.text.strip_edges().is_empty():
		status_label.text = 'Write what happened and what you expected, then Save comment.'
		return
	set_playing(false)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var screenshot := get_viewport().get_texture().get_image().save_png_to_buffer()
	var id := Resolutions.next_id(notes,resolved_notes)
	notes.append({'id':id,'comment':note_text.text.strip_edges(),'created_at':Time.get_datetime_string_from_system(),'scene':scene_state(),'screenshot_png':Marshalls.raw_to_base64(screenshot)})
	note_text.text = ''
	persist_review()
	refresh_note_list()
	status_label.text = 'Comment %d saved with this exact scene and a screenshot.'%id

func export_reviews() -> void:
	movement_review.pause()
	set_playing(false)
	var payload := {'format':'tiny-swords-precise-review','version':1,'scene':scene_state(),'notes':notes,'resolved_notes':resolved_notes}
	var bytes := JSON.stringify(payload,'  ').to_utf8_buffer()
	if OS.has_feature('web'): JavaScriptBridge.download_buffer(bytes,'tiny-swords-scene-reviews.json','application/json')
	else:
		var file := FileAccess.open('user://tiny-swords-scene-reviews.json',FileAccess.WRITE)
		if file: file.store_buffer(bytes)
	status_label.text = 'Exported the scene, comments and screenshots.'

func refresh_note_list() -> void:
	note_list.clear()
	note_list.add_item('Saved comments (%d)'%notes.size())
	for note in notes: note_list.add_item('#%d · %s'%[int(note.id),str(note.comment).split('\n')[0].left(38)])

func repair_review_animal_contacts() -> void:
	layout.settle_animal_contacts()
	for item in items:
		if item.kind not in ['sheep','chicken'] or item.hidden: continue
		var node = item_nodes.get(int(item.id))
		if not is_instance_valid(node): continue
		var positions: Array = layout.chickens if item.kind=='chicken' else layout.sheep
		if node.sheep_index>=positions.size(): continue
		var point: Vector2 = positions[node.sheep_index]
		var previous := item_point(item)
		if point.is_equal_approx(previous): continue
		item.point=[point.x,point.y]
		motion_rules.move(self,item,previous)
	mark_dirty()

func load_comment() -> void:
	var index := note_list.selected-1
	if index<0 or index>=notes.size(): return
	set_playing(false)
	push_history()
	apply_scene(notes[index].scene)
	if review_stock_enabled: stock_rules.populate(self)
	rebuild_review()
	arrange_review()
	repair_review_animal_contacts()
	note_text.text = notes[index].comment
	status_label.text = 'Loaded comment #%d and its saved scene.'%int(notes[index].id)

func refresh_review_ui() -> void:
	if item_list == null: return
	updating_ui = true
	item_list.clear()
	var chosen := -1
	for i in items.size():
		var item: Dictionary = items[i]
		item_list.add_item('%d · %s%s'%[int(item.id),item_name(item),' · inside portal' if item.hidden else ''])
		if int(item.id)==selected_id: chosen=i
	if chosen>=0:
		item_list.select(chosen)
		item_list.ensure_current_is_visible()
	var item := selected_item()
	selected_label.text = 'Selected: '+item_name(item) if not item.is_empty() else 'Click an item on the island'
	carry_control.visible = item.get('kind','')=='pawn'
	carry_control.disabled = playing
	carry_control.set_pressed_no_signal(int(item.get('variant',1))==2)
	if not item.is_empty():
		var point := item_point(item)-ORIGIN_POINT
		x_input.set_value_no_signal(point.x)
		y_input.set_value_no_signal(point.y)
		facing_input.set_pressed_no_signal(item.flip)
		color_input.select(int(item.color))
	if contact_status != null:
		contact_status.text = 'Feet: '+('clear ground' if layout.walkable_point(item_point(item),item.kind in ['sheep','chicken']) else 'overlaps solid contact / water') if item.get('kind','') in ['pawn','sheep','chicken'] else 'Ground marker: exact object anchor'
		if item.get('kind','') in terrain_rules.KINDS: contact_status.text = 'Terrain: 64 px grid · arrows move one tile'
		if not placement_warning.is_empty(): contact_status.text = placement_warning
	color_input.disabled = playing or item.get('kind','') not in ['pawn','house']
	facing_input.disabled = playing or item.get('kind','') in terrain_rules.KINDS
	x_input.editable = not playing
	y_input.editable = not playing
	place_button.disabled = playing or selected_choice().is_empty()
	updating_ui = false
	refresh_note_list()
	movement_review.refresh_actors()
	movement_review.select_actor(selected_id)
	if overlay != null: overlay.queue_redraw()

func item_name(item: Dictionary) -> String:
	match item.kind:
		'pawn': return 'Pawn'+(' + log' if int(item.variant)==2 else '')
		'tree': return 'Tree %d%s'%[int(item.variant),' stump' if item.get('stump',false) else '']
		'logs': return '%d logs'%int(item.variant)
		'portal': return 'Black hole'
		'grass': return 'Grass · floor %d'%int(item.get('floor',0))
		'stairs': return 'Staircase · rises '+('right' if int(item.variant)==1 else 'left')
		'bridge': return 'Rope bridge'
		'sheep','chicken': return str(item.kind).capitalize()
	return '%s %d'%[str(item.kind).replace('_',' ').capitalize(),int(item.variant)]

func button(text: String, callback: Callable, parent: Node) -> Button:
	var result := Button.new()
	result.text = text
	result.pressed.connect(callback)
	parent.add_child(result)
	return result

func label(text: String, parent: Node) -> Label:
	var result := Label.new()
	result.text = text
	parent.add_child(result)
	return result

func row(parent: Node) -> HBoxContainer:
	var result := HBoxContainer.new()
	parent.add_child(result)
	return result

func spin(parent: Node) -> SpinBox:
	var result := SpinBox.new()
	result.min_value = -2000
	result.max_value = 2000
	result.step = 0.1
	result.custom_minimum_size.x = 104
	result.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(result)
	return result

func build_review_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 40
	layer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(layer)
	ui_root = Control.new()
	var review_theme := Theme.new()
	review_theme.default_font_size = 14
	for type in ['Label','Button','OptionButton','CheckButton','LineEdit','TextEdit','ItemList']:
		review_theme.set_color('font_color',type,Color('#143e42'))
		review_theme.set_color('font_hover_color',type,Color('#143e42'))
		review_theme.set_color('font_focus_color',type,Color('#143e42'))
		review_theme.set_color('font_pressed_color',type,Color('#143e42'))
		for state in ['normal','hover','pressed','focus']:
			var style := StyleBoxFlat.new()
			style.bg_color = Color('#f4faf5') if state != 'pressed' else Color('#b4d8c8')
			style.set_border_width_all(1)
			style.border_color = Color('#86aba2')
			style.set_corner_radius_all(4)
			style.content_margin_left = 7
			style.content_margin_right = 7
			style.content_margin_top = 4
			style.content_margin_bottom = 4
			review_theme.set_stylebox(state,type,style)
	var list_style := StyleBoxFlat.new()
	list_style.bg_color = Color('#f4faf5')
	list_style.set_content_margin_all(5)
	review_theme.set_stylebox('panel','ItemList',list_style)
	review_theme.set_color('font_selected_color','ItemList',Color('#143e42'))
	review_theme.set_color('font_placeholder_color','TextEdit',Color('#55766d'))
	review_theme.set_color('font_placeholder_color','LineEdit',Color('#55766d'))
	ui_root.theme = review_theme
	ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(ui_root)
	panel = PanelContainer.new()
	var background := StyleBoxFlat.new()
	background.bg_color = Color('#d6ece1')
	panel.add_theme_stylebox_override('panel',background)
	panel.custom_minimum_size.x = PANEL_WIDTH
	ui_root.add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	var margin := MarginContainer.new()
	for side in ['left','right','top','bottom']: margin.add_theme_constant_override('margin_'+side,12)
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override('separation',7)
	column.add_theme_font_size_override('font_size',14)
	margin.add_child(column)
	movement_review.build_ui(column)
	toolbar = HBoxContainer.new()
	toolbar.mouse_filter = Control.MOUSE_FILTER_STOP
	ui_root.add_child(toolbar)
	label('  PRECISE SCENE REVIEW',toolbar)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar.add_child(spacer)
	mode_button = button('Play scene',func(): set_playing(not playing),toolbar)
	var spacer_right := Control.new()
	spacer_right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar.add_child(spacer_right)
	var library := VBoxContainer.new()
	library.hide()
	column.add_child(library)
	label('ELEMENT LIBRARY',library)
	palette_category = OptionButton.new()
	palette_category.add_item('All elements')
	tool_choices = catalog_choices()
	var categories: Array = []
	for choice in tool_choices:
		if not categories.has(choice.category):
			categories.append(choice.category)
			palette_category.add_item(choice.category)
	library.add_child(palette_category)
	palette_search = LineEdit.new()
	palette_search.placeholder_text = 'Search: house, staircase, tree…'
	library.add_child(palette_search)
	palette_count = label('',library)
	palette = ItemList.new()
	palette.custom_minimum_size = Vector2(240,116)
	library.add_child(palette)
	palette_category.item_selected.connect(func(_index): filter_palette())
	palette_search.text_changed.connect(func(_text): filter_palette())
	palette.item_selected.connect(func(_index): choose_palette_item())
	filter_palette()
	place_button = button('Place selected item',func():
		if playing: return
		stop_annotation_mode()
		placing = true
		place_button.text = 'Click the scene to place · Esc cancels'
		status_label.text = 'Click an exact location in the scene.'
		var focus := get_viewport().gui_get_focus_owner()
		if focus != null: focus.release_focus()
	,library)
	var floor_row := row(library)
	label('Terrain floor',floor_row)
	floor_input = spin(floor_row)
	floor_input.min_value = 0
	floor_input.max_value = 4
	floor_input.step = 1
	label('Scene items · select one to arrange',library)
	item_list = ItemList.new()
	item_list.custom_minimum_size = Vector2(240,116)
	item_list.item_selected.connect(func(index):
		if playing: set_playing(false)
		selected_id = int(items[index].id)
		refresh_review_ui()
	)
	library.add_child(item_list)
	var selection_details := VBoxContainer.new()
	selection_details.hide()
	column.add_child(selection_details)
	selected_label = label('Click an item on the island',selection_details)
	selected_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	selected_label.custom_minimum_size.x = 240
	carry_control = CheckButton.new()
	carry_control.text = 'Carry a log'
	column.add_child(carry_control)
	carry_control.toggled.connect(func(value):
		if updating_ui or playing or selected_item().get('kind','')!='pawn': return
		push_history()
		selected_item().variant = 2 if value else 1
		rebuild_review()
	)
	var coordinates := row(selection_details)
	label('X',coordinates)
	x_input = spin(coordinates)
	label('Y',coordinates)
	y_input = spin(coordinates)
	x_input.value_changed.connect(set_coordinate)
	y_input.value_changed.connect(set_coordinate)
	contact_status = label('',selection_details)
	contact_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	contact_status.custom_minimum_size.x = 240
	var nudges := row(selection_details)
	for entry in [['-X',Vector2.LEFT],['-Y',Vector2.UP],['+Y',Vector2.DOWN],['+X',Vector2.RIGHT]]:
		button(entry[0],func(): nudge(entry[1]*(0.1 if Input.is_key_pressed(KEY_SHIFT) else 1.0)),nudges)
	button('Remove',remove_item,nudges)
	var appearance := row(column)
	facing_input = CheckButton.new()
	facing_input.text = 'Mirror'
	appearance.add_child(facing_input)
	facing_input.toggled.connect(func(value):
		if updating_ui or selected_item().is_empty(): return
		push_history()
		selected_item().flip = value
		rebuild_review()
	)
	color_input = OptionButton.new()
	for color in ['Blue','Red','Purple','Yellow','Black']: color_input.add_item(color)
	appearance.add_child(color_input)
	color_input.item_selected.connect(func(index):
		if updating_ui or selected_item().is_empty(): return
		push_history()
		selected_item().color = index
		rebuild_review()
	)
	var display_row := row(column)
	markers = CheckButton.new()
	markers.text = 'Markers'
	markers.button_pressed = true
	display_row.add_child(markers)
	contacts = CheckButton.new()
	contacts.text = 'Contacts'
	display_row.add_child(contacts)
	var zoom_row := row(column)
	label('Zoom',zoom_row)
	zoom_control = HSlider.new()
	zoom_control.scrollable = false
	zoom_control.min_value = 0.1
	zoom_control.max_value = 4
	zoom_control.step = 0.0
	zoom_control.value = 1.6
	zoom_control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zoom_control.value_changed.connect(func(_value): arrange_review(); mark_dirty())
	zoom_row.add_child(zoom_control)
	var focus_row := row(column)
	button('Focus selected',func():
		if selected_item().is_empty(): return
		view_center = item_point(selected_item())-Vector2(0,ground_height(item_point(selected_item()))+(80 if selected_item().kind=='tree' else 0))
		zoom_control.value = 1.6 if selected_item().kind=='tree' else 2.0
		arrange_review()
		mark_dirty()
	,focus_row)
	button('Show island',show_all_items,focus_row)
	var scene_row := row(column)
	button('Undo',undo_review,scene_row)
	button('New arrangement',func():
		set_playing(false)
		push_history()
		seed_scene()
		if review_stock_enabled: stock_rules.populate(self)
		rebuild_review()
		show_all_items()
	,scene_row)
	button('Next-day visit',func():
		if layout.black_hole.is_empty(): return
		portal_event.preview_tomorrow()
		mark_dirty()
	, column)
	var annotation_row := row(column)
	annotation_button = button('Mark problem area',toggle_annotation_mode,annotation_row)
	button('Clear box',clear_problem_rectangle,annotation_row)
	note_text = TextEdit.new()
	note_text.custom_minimum_size = Vector2(240,76)
	note_text.placeholder_text = 'What happened? What did you expect?'
	note_text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	note_text.text_changed.connect(mark_dirty)
	column.add_child(note_text)
	button('Save comment + scene',save_comment,column)
	note_list = OptionButton.new()
	note_list.fit_to_longest_item = false
	note_list.clip_text = true
	column.add_child(note_list)
	button('Load selected comment scene',load_comment,column)
	button('Export scene & reviews',export_reviews,column)
	status_label = Label.new()
	status_label.hide()
	status_label.custom_minimum_size = Vector2(240,60)
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status_label)

# The library lists game elements, rather than every unused asset in the art pack.
func catalog_choices() -> Array:
	var choices: Array = []
	for facing in range(1,5):
		choices.append({'name':'House · '+['front','right','back','left'][facing-1],'kind':'house','variant':facing,'category':'Houses'})
	for entry in [['Staircase · rises right','stairs',1],['Staircase · rises left','stairs',2],['Rope bridge','bridge',1]]:
		choices.append({'name':entry[0],'kind':entry[1],'variant':entry[2],'category':'Staircases & terrain'})
	for floor in range(Layout.FLOOR_PALETTES.size()):
		choices.append({'name':'Grass tile · floor %d'%floor,'kind':'grass','variant':1,'floor':floor,'category':'Staircases & terrain'})
	choices.append({'name':'Water / remove terrain','kind':'water','variant':1,'category':'Staircases & terrain'})
	for entry in [['Pawn','pawn',1],['Pawn carrying a log','pawn',2],['Sheep','sheep',1],['Chicken','chicken',1],['Duck 1','ducks',1],['Duck 2','ducks',2]]:
		choices.append({'name':entry[0],'kind':entry[1],'variant':entry[2],'category':'Pawn & animals'})
	for variant in range(1,Layout.TREE_VARIANTS.size()+1):
		for stump in [false,true]:
			choices.append({'name':'Tree %d%s'%[variant,' · stump' if stump else ''],'kind':'tree','variant':variant,'stump':stump,'category':'Trees & stumps'})
	for kind in ['bush','flowers','land_rock','water_rock']:
		for variant in range(1,Layout.DecorationRules.VARIANTS[kind]+1):
			var title: String = ('Large bush' if variant==1 else 'Small bush') if kind=='bush' else '%s %d'%[kind.replace('_',' ').capitalize(),variant]
			choices.append({'name':title,'kind':kind,'variant':variant,'category':'Rocks' if kind.ends_with('rock') else 'Bushes & flowers'})
	for amount in range(1,7):
		choices.append({'name':'1 log' if amount==1 else '%d logs'%amount,'kind':'logs','variant':amount,'category':'Logs'})
	choices.append({'name':'Black hole','kind':'portal','variant':1,'category':'Black hole'})
	return choices

func selected_choice() -> Dictionary:
	var selected_items := palette.get_selected_items()
	return tool_choices[int(palette.get_item_metadata(selected_items[0]))] if not selected_items.is_empty() else {}

func filter_palette() -> void:
	var previous := selected_choice() if palette.item_count>0 else {}
	palette.clear()
	var category := palette_category.get_item_text(palette_category.selected)
	var query := palette_search.text.strip_edges().to_lower()
	var chosen := 0
	for index in tool_choices.size():
		var choice: Dictionary = tool_choices[index]
		if palette_category.selected>0 and choice.category!=category: continue
		if not query.is_empty() and not str(choice.name).to_lower().contains(query): continue
		palette.add_item(choice.name)
		palette.set_item_metadata(palette.item_count-1,index)
		if choice==previous: chosen=palette.item_count-1
	if palette.item_count>0: palette.select(chosen)
	palette_count.text = '%d of %d elements'%[palette.item_count,tool_choices.size()]
	choose_palette_item()

func choose_palette_item() -> void:
	clear_contact_warning()
	if model_ready: refresh_review_ui()
	placing = false
	var choice := selected_choice()
	if floor_input != null and choice.has('floor'): floor_input.value = choice.floor
	if place_button != null:
		place_button.disabled = playing or choice.is_empty()
		place_button.text = 'Place selected item'

func stop_annotation_mode() -> void:
	marking_problem = false
	drawing_problem = false
	if annotation_button != null: annotation_button.text = 'Mark problem area'
	if overlay != null: overlay.queue_redraw()

func toggle_annotation_mode() -> void:
	movement_review.pause()
	var enabled := not marking_problem
	set_playing(false)
	marking_problem = enabled
	annotation_button.text = 'Draw box · Esc cancels' if enabled else 'Mark problem area'
	status_label.text = 'Drag a rectangle around the problem, then write and save your comment.' if enabled else 'Rectangle tool cancelled.'
	var focus := get_viewport().gui_get_focus_owner()
	if focus != null: focus.release_focus()

func begin_problem_rectangle(point: Vector2) -> void:
	push_history()
	problem_previous = problem_rect
	problem_start = point
	problem_rect = Rect2(point,Vector2.ZERO)
	drawing_problem = true
	overlay.queue_redraw()

func update_problem_rectangle(point: Vector2) -> void:
	problem_rect = Rect2(problem_start,point-problem_start).abs()
	overlay.queue_redraw()

func finish_problem_rectangle(point: Vector2) -> void:
	update_problem_rectangle(point)
	if problem_rect.size.x*game_camera.zoom.x<3 or problem_rect.size.y*game_camera.zoom.y<3:
		problem_rect = problem_previous
	stop_annotation_mode()
	persist_review()
	status_label.text = 'Problem area marked. Write your comment, then Save comment + scene.'

func clear_problem_rectangle() -> void:
	stop_annotation_mode()
	if not problem_rect.has_area(): return
	push_history()
	problem_rect = Rect2()
	overlay.queue_redraw()
	mark_dirty()

func show_all_items() -> void:
	var bounds := Rect2(ORIGIN_POINT,Vector2.ONE)
	for cell in layout.cells: bounds = bounds.merge(layout.ground_surface_rect(cell))
	for item in items:
		var point := item_point(item)-Vector2(0,contact_rules.height(layout,item_point(item)))
		bounds = bounds.merge(Rect2(point-Vector2(90,160),Vector2(180,200)))
	view_center = bounds.get_center()+Vector2(0,40)
	var area: Vector2 = get_viewport_rect().size/ui.scale_ui-Vector2(panel.size.x+32,80)
	zoom_control.value = clampf(minf(area.x/bounds.size.x,area.y/bounds.size.y),0.1,1.6)
	arrange_review()
	mark_dirty()

func item_at_art(point: Vector2) -> int:
	var picked := -1
	var order := -INF
	for item in items:
		if item.hidden: continue
		var owner = item_nodes.get(int(item.id))
		if not is_instance_valid(owner): continue
		var node = pawn.sprite if owner==pawn else owner
		var opaque := false
		if node is Sprite2D: opaque = node.is_pixel_opaque(node.to_local(point))
		elif node is AnimatedSprite2D:
			var texture: Texture2D = node.sprite_frames.get_frame_texture(node.animation,node.frame)
			var local: Vector2 = node.to_local(point)-node.offset
			if node.centered: local+=texture.get_size()/2
			if node.flip_h: local.x=texture.get_width()-1-local.x
			if node.flip_v: local.y=texture.get_height()-1-local.y
			if Rect2(Vector2.ZERO,texture.get_size()).has_point(local): opaque=texture.get_image().get_pixelv(Vector2i(local)).a>0.1
		if opaque:
			var rank: float = owner.z_index*100000+owner.get_index()
			if rank>=order: picked=int(item.id); order=rank
	return picked

func terrain_change_error(previous: Dictionary) -> String:
	for item in items:
		if not contact_rules.active(item): continue
		var before: String = previous.get(int(item.id),'invalid')
		if not before.is_empty(): continue
		var reason: String = contact_rules.error_for(layout,items,item,item_point(item),int(item.id))
		if not reason.is_empty(): return reason
	return ''

func current_contact_errors() -> Dictionary:
	var result := {}
	for item in items:
		if contact_rules.active(item): result[int(item.id)] = contact_rules.error_for(layout,items,item,item_point(item),int(item.id))
	return result

func add_terrain_sample(choice: Dictionary, cell: Vector2i) -> bool:
	if terrain_rules.overlaps(self,choice,cell): return false
	var before := current_contact_errors()
	var specimen := choice.duplicate(true)
	specimen.floor = choice.get('floor',0)
	terrain_rules.place(layout,specimen,cell)
	if not terrain_change_error(before).is_empty():
		terrain_rules.restore(layout,specimen,cell)
		return false
	var id := insert_item(choice.kind,int(choice.variant),layout.center(cell))
	for item in items:
		if int(item.id)==id:
			item.floor = specimen.floor
			item.terrain_underlay = specimen.terrain_underlay
	return true

func move_terrain_sample(item: Dictionary, cell: Vector2i) -> bool:
	var old: Vector2i = layout.cell_at(item_point(item))
	if cell==old:
		refresh_review_ui()
		return true
	if terrain_rules.overlaps(self,item,cell,int(item.id)):
		reject_contact(item,layout.center(cell),'Terrain pieces cannot overlap.')
		return false
	var before := current_contact_errors()
	var previous := scene_state()
	terrain_rules.restore(layout,item,old)
	terrain_rules.place(layout,item,cell)
	item.point = [layout.center(cell).x,layout.center(cell).y]
	var reason := terrain_change_error(before)
	if not reason.is_empty():
		apply_scene(previous)
		apply_items()
		reject_contact(item,layout.center(cell),reason)
		return false
	record_history(previous)
	clear_contact_warning()
	rebuild_review()
	return true

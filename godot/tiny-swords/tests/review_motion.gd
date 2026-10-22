extends SceneTree

var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures+=1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func presentation(node) -> Dictionary:
	var state := {'position':node.position,'z':node.z_index}
	if node is Sprite2D:
		state.offset=node.offset
		state.scale=node.scale
		state.flip=node.flip_h
		state.image=node.texture.get_image().get_data()
	if node.has_meta('rock_face'): state.face=node.get_meta('rock_face')
	if node.has_meta('log_pile'):
		state.logs=[]
		for log_sprite in node.get_children(): state.logs.append(log_sprite.position)
	return state

func run() -> void:
	var game = load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled=false
	game.review_stock_enabled=false
	root.add_child(game)
	await process_frame
	var cases: Array = []
	for choice in game.catalog_choices():
		if choice.kind not in ['grass','stairs','water','bridge']: cases.append(choice)
	for scenario in [0,1,2]:
		var height := 0 if scenario==0 else 64
		for choice in cases:
			game.seed_scene()
			game.items=game.items.filter(func(item): return item.kind=='pawn')
			game.items[0].point=[game.ORIGIN_POINT.x-230,game.ORIGIN_POINT.y+150]
			for y in range(-2,3):
				for x in range(-2,3):
					var cell:=Vector2i(x,y)
					game.layout.cells[cell]=game.layout.kind_at_height(height) if height>0 else 'meadow'
					game.layout.elevations[cell]=height
			var origin: Vector2=game.ORIGIN_POINT+(Vector2(6,220) if scenario==2 else Vector2(6,8))
			var id: int=game.insert_item(choice.kind,int(choice.variant),origin)
			game.selected_id=id
			game.selected_item().stump=choice.get('stump',false)
			game.apply_items()
			var node=game.item_nodes[id]
			var actor_frame: int=node.frame if node is Sprite2D else game.pawn.sprite.frame
			var target: Vector2=game.ORIGIN_POINT+Vector2(9.25,10.5)
			check(game.move_selected(target,false),'Move '+choice.name+' at height '+str(height))
			check(game.item_nodes[id]==node,'Dragging preserves the native node for '+choice.name)
			if node is Sprite2D: check(node.frame==actor_frame,'Dragging preserves animation pose for '+choice.name)
			var incremental:=presentation(node)
			var moved_shadow := {}
			if choice.kind=='logs':
				for shadow in game.flora_nodes:
					if shadow.get_meta('log_shadow',Vector2i.ZERO)==game.slot_for(game.selected_item()):
						moved_shadow={'position':shadow.position,'z':shadow.z_index,'polygon':shadow.get_child(0).polygon,'centers':shadow.get_child(0).material.get_shader_parameter('log_centers'),'origin':shadow.get_child(0).material.get_shader_parameter('ground_origin')}
			if choice.kind=='chicken':
				check(is_equal_approx(node.get_node('GroundShadow').position.y,-float(height)/node.art_scale),'Chicken shadow follows the receiving floor')
			game.apply_items()
			var rebuilt:=presentation(game.item_nodes[id])
			var same_pose := true
			for key in incremental:
				if incremental[key] is Vector2: same_pose = same_pose and incremental[key].is_equal_approx(rebuilt[key])
				else: same_pose = same_pose and incremental[key]==rebuilt[key]
			check(same_pose,'Incremental pose matches full native rebuild for '+choice.name+' at height '+str(height))
			if choice.kind=='logs':
				var slot: Vector2i=game.slot_for(game.selected_item())
				check(game.layout.center(slot).is_equal_approx(target),'Moved log contact matches artwork')
				for shadow in game.flora_nodes:
					if shadow.get_meta('log_shadow',Vector2i.ZERO)==slot:
						var rebuilt_shadow := {'position':shadow.position,'z':shadow.z_index,'polygon':shadow.get_child(0).polygon,'centers':shadow.get_child(0).material.get_shader_parameter('log_centers'),'origin':shadow.get_child(0).material.get_shader_parameter('ground_origin')}
						var equivalent := true
						for key in moved_shadow:
							if key in ['polygon','centers']:
								for index in moved_shadow[key].size(): equivalent = equivalent and moved_shadow[key][index].is_equal_approx(rebuilt_shadow[key][index])
							else: equivalent = equivalent and moved_shadow[key]==rebuilt_shadow[key]
						check(equivalent,'Moved log shadow matches native floor clipping')
			await process_frame
	game.seed_scene()
	game.apply_items()
	game.selected_id=2
	var original: Vector2=game.item_point(game.selected_item())
	game.push_history()
	game.dragging=true
	for i in 100: game.pending_drag_point=original+Vector2(i*0.1,0)
	check(game.item_point(game.selected_item())==original,'Input bursts wait for a rendered frame')
	game.review_tick(1.0/60)
	check(game.item_point(game.selected_item()).is_equal_approx(original+Vector2(9.9,0)),'Input bursts apply the latest exact coordinate once')
	game.pending_drag_point=original+Vector2(10.1,0)
	var release:=InputEventMouseButton.new()
	release.button_index=MOUSE_BUTTON_LEFT
	release.pressed=false
	game.review_input(release)
	check(not game.dragging and game.item_point(game.selected_item()).is_equal_approx(original+Vector2(10.1,0)),'Release flushes the last pending coordinate')
	game.undo_review()
	check(game.item_point(game.selected_item()).is_equal_approx(original),'One Undo restores the whole gesture')
	game.dirty_seconds=-1
	game.queue_free()
	await process_frame
	print('Incremental review motion: ','PASS' if failures==0 else 'FAIL','; cases=',cases.size()*3)
	quit(0 if failures==0 else 1)

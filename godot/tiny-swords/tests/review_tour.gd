extends SceneTree

var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures+=1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func pose(game, id: int) -> Array:
	var node=game.item_nodes[id]
	if node==game.pawn: return [node.position,node.sprite.animation,node.sprite.frame,node.sprite.flip_h,node.sprite.position,node.z_index]
	return [node.position,node.texture,node.frame,node.flip_h,node.offset,node.z_index]

func run() -> void:
	var game=load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled=false
	game.review_stock_enabled=false
	root.add_child(game)
	await process_frame
	game.seed_scene()
	game.items.clear()
	game.next_id=1
	var origin: Vector2=game.ORIGIN_POINT
	var ids: Array=[]
	for entry in [['pawn',Vector2(-120,100)],['sheep',Vector2(-120,30)],['chicken',Vector2(-120,-40)]]:
		ids.append(game.insert_item(entry[0],1,origin+entry[1]))
	game.insert_item('tree',2,origin+Vector2(10,20))
	game.insert_item('land_rock',4,origin+Vector2(90,90))
	game.insert_item('bush',1,origin+Vector2(130,-50))
	game.insert_item('portal',1,origin+Vector2(40,-80))
	# Disconnected upper grass: approach from below instead of teleporting up.
	game.layout.cells[Vector2i(4,0)]='terrace'
	game.layout.elevations[Vector2i(4,0)]=128
	game.insert_item('flowers',1,game.layout.center(Vector2i(4,0)))
	game.selected_id=ids[0]
	game.apply_items()
	game.refresh_review_ui()
	var baseline: Dictionary=game.scene_state()
	for id in ids:
		game.apply_scene(baseline)
		game.apply_items()
		game.refresh_review_ui()
		var tour=game.movement_review
		tour.actor_picker.select(tour.actor_picker.get_item_index(id))
		var started := Time.get_ticks_msec()
		await tour.start()
		tour.running=false
		check(tour.duration>0 and tour.points.size()>10,'Actor has a complete route')
		check(tour.visits.size()==game.items.size()-1,'Every other active element is visited')
		var previous_id := -1
		for visit in tour.visits:
			check(int(visit.id)>previous_id,'Visit order follows scene IDs')
			previous_id=int(visit.id)
		var limited := false
		for visit in tour.visits:
			if visit.name.begins_with('Flowers'): limited=visit.limited
		check(limited,'Disconnected high ground gets a closest reachable approach')
		tour.visit_picker.item_selected.emit(4)
		check(is_equal_approx(tour.elapsed,tour.visits[3].arrival) and not tour.running,'Jump to an element pauses at its first close approach')
		check(tour.readout.text.contains(tour.visits[3].name),'Jump readout identifies the chosen encounter')
		var safe := true
		for index in range(1,tour.points.size()):
			var a: Vector2=tour.points[index-1]
			var b: Vector2=tour.points[index]
			for step in range(5):
				var point:=a.lerp(b,float(step)/4)
				if not game.contact_rules.error_for(game.layout,game.items,tour.actor,point,id).is_empty(): safe=false
		check(safe,'Entire route keeps feet on supported ground and out of contact areas')
		var at: float=tour.duration*0.37
		tour.seek(at)
		var first:=pose(game,id)
		tour.seek(tour.duration*0.8)
		tour.seek(at)
		check(first==pose(game,id),'Scrubbing back reproduces exact position, frame, facing and elevation')
		tour.tick(2)
		check(first==pose(game,id),'Paused route stays still')
		tour.speed=4
		tour.direction=1
		tour.running=true
		tour.tick(0.25)
		check(is_equal_approx(tour.elapsed,at+1),'Speed controller scales review time')
		tour.direction=-1
		tour.tick(0.25)
		check(first==pose(game,id),'Reverse playback returns to the same exact pose')
		game.toggle_annotation_mode()
		check(not tour.running and not tour.points.is_empty(),'Drawing a comment rectangle pauses and retains the route')
		game.stop_annotation_mode()
		tour.seek(0)
		check(game.item_nodes[id].position==game.item_point(tour.actor),'Rewind reaches exact starting point')
		for item in game.items:
			if int(item.id)==id: continue
			for original in baseline.items:
				if int(item.id)==int(original.id): check(item.point==original.point,'Other elements stay still')
		print('Movement review actor ',id,': ',tour.points.size(),' points, ',tour.visits.size(),' targets, ',Time.get_ticks_msec()-started,' ms')
		tour.stop(false)
		check(tour.points.is_empty() and not tour.running,'End route clears playback')
	# Rebuild during planning cancels the pending coroutine without moving a prop.
	game.movement_review.start.call_deferred()
	await process_frame
	game.movement_review.stop(false)
	await process_frame
	check(not game.movement_review.planning and game.movement_review.points.is_empty(),'Cancelled planning stays cancelled')
	if OS.get_environment('TINY_SWORDS_TOUR_STOCK')=='1':
		game.seed_scene()
		game.stock_rules.populate(game)
		game.apply_items()
		game.refresh_review_ui()
		var started:=Time.get_ticks_msec()
		await game.movement_review.start()
		game.movement_review.running=false
		check(game.movement_review.visits.size()==game.items.size()-1,'Full island visits every stocked element')
		print('Full stocked island: ',game.movement_review.points.size(),' points; ',game.movement_review.visits.size(),' targets; ',Time.get_ticks_msec()-started,' ms')
		game.movement_review.stop(false)
	game.queue_free()
	await process_frame
	print('Movement review: ','PASS' if failures==0 else 'FAIL','; failures=',failures)
	quit(0 if failures==0 else 1)

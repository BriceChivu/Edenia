extends RefCounted

# A reversible inspection, rather than live simulation: only the chosen actor
# moves. Native art, terrain projection and depth sorting still do the drawing.
const AnimalContact = preload('res://scripts/animal_contact.gd')
const STEP := 8.0
const WALK_SPEED := 55.0
var review
var actor: Dictionary = {}
var graph := AStar2D.new()
var grid := {}
var blockers: Array = []
var blocker_cells := {}
var free_cache := {}
var height_cache := {}
var reachable := PackedInt64Array()
var points := PackedVector2Array()
var times := PackedFloat64Array()
var visits: Array = []
var elapsed := 0.0
var duration := 0.0
var speed := 1.0
var direction := 1.0
var running := false
var planning := false
var generation := 0
var actor_picker: OptionButton
var start_button: Button
var pause_button: Button
var reverse_button: Button
var timeline: HSlider
var readout: Label
var visit_picker: OptionButton
var follow: CheckButton

func build_ui(parent: Node) -> void:
	actor_picker = OptionButton.new()
	actor_picker.fit_to_longest_item = false
	actor_picker.clip_text = true
	parent.add_child(actor_picker)
	actor_picker.item_selected.connect(func(_index): stop(false))
	start_button = review.button('Walk around each element',start,parent)
	var transport: HBoxContainer = review.row(parent)
	review.button('Start',func(): seek(0),transport)
	reverse_button = review.button('Rewind',func():
		if points.is_empty(): return
		direction = -1
		running = true
		refresh()
	,transport)
	pause_button = review.button('Pause',func():
		if points.is_empty(): return
		if running: running = false
		else:
			direction = 1
			if elapsed>=duration: seek(0)
			running = true
		refresh()
	,transport)
	var speed_row: HBoxContainer = review.row(parent)
	review.label('Speed',speed_row)
	var control := SpinBox.new()
	control.min_value = 0.25
	control.max_value = 8
	control.step = 0.25
	control.value = 1
	control.suffix = '×'
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control.value_changed.connect(func(value): speed=value)
	speed_row.add_child(control)
	timeline = HSlider.new()
	timeline.scrollable = false
	timeline.step = 0.0
	timeline.value_changed.connect(seek)
	parent.add_child(timeline)
	readout = review.label('',parent)
	readout.hide()
	readout.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	readout.custom_minimum_size.x = 240
	visit_picker=OptionButton.new()
	visit_picker.fit_to_longest_item=false
	visit_picker.clip_text=true
	visit_picker.add_item('Jump to an element…')
	visit_picker.item_selected.connect(func(index):
		if index>0 and index<=visits.size(): seek(visits[index-1].arrival)
	)
	parent.add_child(visit_picker)
	follow = CheckButton.new()
	follow.text = 'Follow moving element'
	follow.button_pressed = true
	parent.add_child(follow)
	review.button('End route · keep this position',func(): stop(false),parent)
	refresh()

func refresh_actors() -> void:
	if actor_picker==null: return
	var chosen := actor_picker.get_selected_id()
	actor_picker.clear()
	for item in review.items:
		if item.kind in review.contact_rules.ACTORS and review.contact_rules.active(item):
			actor_picker.add_item('%d · %s'%[int(item.id),review.item_name(item)],int(item.id))
	var index := actor_picker.get_item_index(chosen)
	if index<0: index=actor_picker.get_item_index(review.selected_id)
	if index>=0: actor_picker.select(index)
	start_button.disabled = actor_picker.item_count==0 or planning

func select_actor(id: int) -> void:
	if actor_picker==null or not points.is_empty() or planning: return
	var index := actor_picker.get_item_index(id)
	if index>=0: actor_picker.select(index)

func stop(_unused: bool = false) -> void:
	generation += 1
	planning = false
	running = false
	points.clear()
	times.clear()
	visits.clear()
	actor.clear()
	duration=0
	elapsed=0
	if is_instance_valid(readout):
		readout.text=''
		readout.hide()
		visit_picker.clear()
		visit_picker.add_item('Jump to an element…')
		refresh()
		refresh_actors()

func start() -> void:
	var id := actor_picker.get_selected_id()
	# Starting again reuses the original pose, so comparisons share one route.
	if not actor.is_empty() and int(actor.id)==id:
		running=false
		seek(0)
	stop(false)
	review.set_playing(false)
	review.stop_annotation_mode()
	review.dragging=false
	review.placing=false
	for item in review.items:
		if int(item.id)==id: actor=item.duplicate(true)
	if actor.is_empty(): return
	readout.show()
	review.selected_id=id
	if not review.contact_rules.error_for(review.layout,review.items,actor,review.item_point(actor),id).is_empty():
		readout.text='Move this actor onto clear, supported ground first.'
		return
	review.push_history()
	planning=true
	readout.text='Finding safe approaches…'
	refresh()
	var token := generation
	await build_graph(token)
	if token!=generation: return
	if reachable.is_empty():
		planning=false
		readout.text='No safe route from this position.'
		refresh()
		return
	points.append(review.item_point(actor))
	times.append(0)
	var current := int(reachable[0])
	append_point(graph.get_point_position(current),0)
	var targets: Array = review.items.filter(func(item): return int(item.id)!=id and review.contact_rules.active(item))
	targets.sort_custom(func(a,b): return int(a.id)<int(b.id))
	for target in targets:
		var begin := duration
		var arrival := -1.0
		var limited := false
		var bounds := target_bounds(target)
		var center := bounds.get_center()
		var feet := feet_size()
		# Clockwise: the far side, right, near side, left, then the far side.
		for side in [Vector2.UP,Vector2(1,-1),Vector2.RIGHT,Vector2(1,1),Vector2.DOWN,Vector2(-1,1),Vector2.LEFT,Vector2(-1,-1),Vector2.UP]:
			var desired: Vector2 = center+side*(bounds.size*0.5+feet+Vector2.ONE*2)
			var goal := closest_reachable(desired)
			var closest: Vector2=graph.get_point_position(goal)
			limited = limited or closest.distance_to(desired)>STEP*2
			for path_point in graph.get_point_path(current,goal): append_point(path_point,int(target.id))
			# Refine each approach below the graph spacing without cutting corners.
			var refined := closest
			for fraction in range(1,17):
				var candidate := closest.lerp(desired,float(fraction)/16)
				if not segment_free(refined,candidate): break
				refined=candidate
			append_point(refined,int(target.id))
			if arrival<0: arrival=duration+0.175
			append_point(refined,int(target.id),0.35)
			append_point(closest,int(target.id))
			current=goal
		visits.append({'id':int(target.id),'name':review.item_name(target),'start':begin,'arrival':arrival,'end':duration,'limited':limited})
		await review.get_tree().process_frame
		if token!=generation: return
	planning=false
	visit_picker.clear()
	visit_picker.add_item('Jump to an element…')
	for index in visits.size(): visit_picker.add_item('%d · #%d %s'%[index+1,visits[index].id,visits[index].name])
	running=duration>0
	direction=1
	elapsed=0
	if follow.button_pressed: review.zoom_control.value=maxf(review.zoom_control.value,1.6)
	review.refresh_review_ui()
	seek(0,false)
	refresh()

func feet_size() -> Vector2:
	return contact_extent(actor.kind)

func contact_extent(kind: String) -> Vector2:
	return AnimalContact.SHEEP if kind=='sheep' else (AnimalContact.CHICKEN if kind=='chicken' else Vector2(7,7))

func target_bounds(item: Dictionary) -> Rect2:
	if item.kind in review.contact_rules.ACTORS:
		var extent := contact_extent(item.kind)
		return Rect2(review.item_point(item)-extent,extent*2)
	var patch: PackedVector2Array=review.contact_rules.patch(item,review.item_point(item))
	if patch.is_empty():
		var extent := Vector2(20,10) if item.kind=='bush' else Vector2(12,8)
		if item.kind in review.terrain_rules.KINDS: extent=Vector2(32,32)
		if item.kind=='portal': extent=Vector2(24,12)
		return Rect2(review.item_point(item)-extent,extent*2)
	var result := Rect2(patch[0],Vector2.ZERO)
	for point in patch: result=result.expand(point)
	return result

func point_free(point: Vector2) -> bool:
	if free_cache.has(point): return free_cache[point]
	var result := supported_clear_point(point)
	free_cache[point]=result
	return result

func height_at(point: Vector2) -> float:
	if not height_cache.has(point): height_cache[point]=review.contact_rules.height(review.layout,point)
	return height_cache[point]

func supported_clear_point(point: Vector2) -> bool:
	if not review.contact_rules.support_error(review.layout,actor,point).is_empty(): return false
	var extent := feet_size()
	var bounds := Rect2(point-extent,extent*2)
	var height: float=height_at(point)
	var own: PackedVector2Array = review.contact_rules.rectangle(point,extent.x,extent.y)
	for obstacle in blocker_cells.get(review.layout.cell_at(point),[]):
		var candidate := own
		var candidate_bounds := bounds
		if actor.kind=='pawn' and obstacle.kind=='logs':
			candidate=review.contact_rules.rectangle(point,20,1)
			candidate_bounds=Rect2(point-Vector2(20,1),Vector2(40,2))
		if absf(height-obstacle.height)>0.01 or not candidate_bounds.intersects(obstacle.bounds): continue
		if review.contact_rules.overlap(candidate,obstacle.patch): return false
	return true

func segment_free(from: Vector2, to: Vector2) -> bool:
	var count := maxi(1,ceili(from.distance_to(to)/2))
	var previous := from
	for index in range(count+1):
		var point := from.lerp(to,float(index)/count)
		if not point_free(point): return false
		# A supported point on either side of a cliff does not imply a safe edge.
		if absf(height_at(point)-height_at(previous))>4.1: return false
		var a: Vector2i=review.layout.cell_at(previous)
		var b: Vector2i=review.layout.cell_at(point)
		if a!=b and review.layout.cells.has(a) and review.layout.cells.has(b) and not review.layout.can_cross(a,b): return false
		previous=point
	return true

func build_graph(token: int) -> void:
	graph.clear()
	grid.clear()
	blockers.clear()
	blocker_cells.clear()
	free_cache.clear()
	height_cache.clear()
	reachable.clear()
	for other in review.items:
		if int(other.id)==int(actor.id) or not review.contact_rules.active(other): continue
		if other.kind not in review.contact_rules.SOLIDS and other.kind not in review.contact_rules.ACTORS: continue
		var patch: PackedVector2Array=review.contact_rules.patch(other,review.item_point(other))
		if other.kind in review.contact_rules.ACTORS:
			var extent := contact_extent(other.kind)
			patch=review.contact_rules.rectangle(review.item_point(other),extent.x,extent.y)
		var obstacle := {'kind':other.kind,'patch':patch,'bounds':target_bounds(other),'height':review.contact_rules.height(review.layout,review.item_point(other))}
		blockers.append(obstacle)
		var bounds: Rect2=obstacle.bounds.grow(maxf(20,feet_size().x))
		var first: Vector2i=review.layout.cell_at(bounds.position)
		var last: Vector2i=review.layout.cell_at(bounds.end)
		for y in range(first.y,last.y+1):
			for x in range(first.x,last.x+1):
				var cell:=Vector2i(x,y)
				if not blocker_cells.has(cell): blocker_cells[cell]=[]
				blocker_cells[cell].append(obstacle)
	var start: Vector2=review.item_point(actor)
	# Offset the lattice to include the exact starting position.
	var count := 0
	for cell in review.layout.cells:
		var origin: Vector2=review.layout.ORIGIN+Vector2(cell)*64
		for y in range(8):
			for x in range(8):
				var key := Vector2i(((origin+Vector2(x,y)*STEP-start)/STEP).ceil())
				var point := start+Vector2(key)*STEP
				if grid.has(key) or not point_free(point): continue
				var id := graph.get_available_point_id()
				graph.add_point(id,point)
				grid[key]=id
		count+=1
		if count%4==0:
			readout.text='Finding supported ground · %d / %d tiles'%[count,review.layout.cells.size()]
			await review.get_tree().process_frame
			if token!=generation: return
	# Bridges cross gaps outside the grass-cell set.
	for bridge in review.layout.bridges:
		var center: Vector2=review.layout.center(bridge)
		for x in range(-4,13):
			var key := Vector2i(((center+Vector2(x*STEP,0)-start)/STEP).round())
			var point := start+Vector2(key)*STEP
			if not grid.has(key) and point_free(point):
				var id := graph.get_available_point_id()
				graph.add_point(id,point)
				grid[key]=id
	count=0
	for key in grid:
		for offset in [Vector2i.RIGHT,Vector2i.DOWN,Vector2i(1,1),Vector2i(-1,1)]:
			var next: Vector2i=key+offset
			if grid.has(next) and segment_free(graph.get_point_position(grid[key]),graph.get_point_position(grid[next])):
				graph.connect_points(grid[key],grid[next])
		count+=1
		if count%128==0:
			readout.text='Connecting safe paths · %d / %d points'%[count,grid.size()]
			await review.get_tree().process_frame
			if token!=generation: return
	if not grid.has(Vector2i.ZERO): return
	var seen := {int(grid[Vector2i.ZERO]):true}
	reachable.append(grid[Vector2i.ZERO])
	var cursor := 0
	while cursor<reachable.size():
		for neighbor in graph.get_point_connections(reachable[cursor]):
			if not seen.has(neighbor):
				seen[neighbor]=true
				reachable.append(neighbor)
		cursor+=1

func closest_reachable(point: Vector2) -> int:
	var best := int(reachable[0])
	var distance := INF
	for id in reachable:
		var candidate := point.distance_squared_to(graph.get_point_position(id))
		if candidate<distance:
			distance=candidate
			best=id
	return best

func append_point(point: Vector2, _target_id: int, wait: float = 0) -> void:
	var distance := points[-1].distance_to(point)
	if distance<0.01 and wait==0: return
	duration+=distance/WALK_SPEED+wait
	points.append(point)
	times.append(duration)

func tick(delta: float) -> void:
	if running:
		seek(clampf(elapsed+delta*speed*direction,0,duration),false)
		if elapsed<=0 or elapsed>=duration: running=false
		refresh()

func pause() -> void:
	if planning:
		stop(false)
		return
	running=false
	refresh()

func seek(value: float, pause: bool = true) -> void:
	if points.is_empty(): return
	if pause: running=false
	elapsed=clampf(value,0,duration)
	var index := clampi(times.bsearch(elapsed),1,points.size()-1) if points.size()>1 else 0
	var previous := maxi(0,index-1)
	var span := times[index]-times[previous]
	var weight := (elapsed-times[previous])/span if span>0 else 0.0
	var point := points[previous].lerp(points[index],weight)
	var item: Dictionary={}
	for candidate in review.items:
		if int(candidate.id)==int(actor.id): item=candidate
	if item.is_empty(): stop(false); return
	var old: Vector2=review.item_point(item)
	item.point=[point.x,point.y]
	review.motion_rules.move(review,item,old)
	var node=review.item_nodes.get(int(actor.id))
	if not is_instance_valid(node): stop(false); return
	var movement := points[index]-points[previous]
	var moving := movement.length()>0.01
	var facing := movement
	for earlier in range(index-1,0,-1):
		if absf(facing.x)>0.01: break
		facing=points[earlier]-points[earlier-1]
	var flip: bool=facing.x<0 if absf(facing.x)>0.01 else bool(actor.flip)
	if node==review.pawn:
		var pose := ('wood_' if int(item.variant)==2 else '')+('run' if moving else 'idle')
		node.sprite.animation=pose
		node.sprite.frame=int(elapsed*10)%node.sprite.sprite_frames.get_frame_count(pose)
		node.sprite.flip_h=flip
		node.sprite.pause()
	else:
		node.texture=node.run_texture if moving else node.idle_texture
		node.hframes=node.run_frames if moving else 6
		node.frame=int(elapsed*10)%node.hframes
		node.flip_h=flip if not node.faces_left else not flip
	item.flip=flip
	if follow.button_pressed:
		review.view_center=point-Vector2(0,review.ground_height(point))
		review.arrange_review()
	review.overlay.queue_redraw()
	refresh()

func refresh() -> void:
	if pause_button==null: return
	start_button.disabled=planning
	actor_picker.disabled=planning
	pause_button.disabled=points.is_empty() or planning
	reverse_button.disabled=points.is_empty() or planning
	pause_button.text='Pause' if running else 'Play'
	timeline.editable=not points.is_empty() and not planning
	timeline.max_value=maxf(0.01,duration)
	timeline.set_value_no_signal(elapsed)
	if points.is_empty(): return
	var visit := {}
	var number := 0
	for index in visits.size():
		if elapsed<visits[index].end:
			visit=visits[index]
			number=index+1
			break
	if visit.is_empty() and not visits.is_empty(): visit=visits[-1]; number=visits.size()
	readout.text='%s · %.1f / %.1f s\n%d / %d · #%d %s%s'%['Rewinding' if running and direction<0 else ('Moving' if running else 'Paused'),elapsed,duration,number,visits.size(),visit.get('id',0),visit.get('name',''), ' · closest reachable approach' if visit.get('limited',false) else '']

extends SceneTree

func _initialize() -> void:
	root.size = Vector2i(1280,720)
	run.call_deferred()

func run() -> void:
	var game = load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled = false
	root.add_child(game)
	await process_frame
	var kind: String = OS.get_cmdline_user_args()[0] if not OS.get_cmdline_user_args().is_empty() else 'bush'
	var moving: Dictionary = {}
	for item in game.items:
		if item.kind==kind: moving=item; break
	game.selected_id = int(moving.id)
	var start := Vector2.INF
	for offset in [Vector2(0,480),Vector2(200,480),Vector2(-200,480)]:
		var candidate: Vector2 = game.ORIGIN_POINT+offset
		if game.contact_rules.error_for(game.layout,game.items,moving,candidate,int(moving.id)).is_empty() and game.contact_rules.error_for(game.layout,game.items,moving,candidate+Vector2(20,0),int(moving.id)).is_empty():
			start=candidate
			break
	if not start.is_finite():
		push_error('No clear drag route in the populated review scene')
		quit(1)
		return
	var elapsed: Array[int] = []
	var frames: Array[int] = []
	# Exclude eight cold renderer/shader frames; measure sustained dragging.
	var warmup_max := 0
	for index in 48:
		var begin := Time.get_ticks_usec()
		var moved: bool = game.move_selected(start+Vector2(index%20,0),false)
		var cpu_usec := Time.get_ticks_usec()-begin
		if not moved:
			push_error('Drag route unexpectedly blocked')
			quit(1)
			return
		await process_frame
		var frame_usec := Time.get_ticks_usec()-begin
		if index<8:
			warmup_max=maxi(warmup_max,frame_usec)
		else:
			elapsed.append(cpu_usec)
			frames.append(frame_usec)
	elapsed.sort()
	frames.sort()
	var p95: float = elapsed[38]/1000.0
	print('Cold renderer warmup: max=',warmup_max/1000.0,' ms')
	print('Populated review drag: p95=',p95,' ms; max=',elapsed.back()/1000.0,' ms; objects=',game.items.size())
	print('Rendered drag frames: median=',frames[20]/1000.0,' ms; p95=',frames[38]/1000.0,' ms; max=',frames.back()/1000.0,' ms')
	var passed := p95<12.0 and frames[38]<35000
	if not passed: push_error('Object dragging exceeds the 12 ms CPU / 35 ms frame budget')
	game.dirty_seconds=-1
	game.queue_free()
	await process_frame
	quit(0 if passed else 1)

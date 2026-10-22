extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures+=1
		push_error(message)
func in_front(a,b) -> bool:
	return a.z_index>b.z_index if a.z_index!=b.z_index else a.get_index()>b.get_index()

func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	root.size=Vector2i(1280,720)
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string('res://tests/fixtures/precise-reviewed-scenes.json'))
	var game = load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled=false
	game.review_stock_enabled=false
	root.add_child(game)
	await process_frame
	for sample in cases:
		game.apply_scene(sample.scene)
		game.apply_items()
		game.get_node('World')._process(0)
		var id: int=sample.id
		var sheep = game.item_nodes[6]
		var tree = game.item_nodes[5]
		match id:
			1: check(sheep.get_index()>game.item_nodes[11].get_index(),'Comment 1: sheep draws in front of flowers')
			2: check(tree.get_index()>game.item_nodes[3].get_index(),'Comment 2: tree draws in front of bush')
			3,4:
				check(not sheep.feet_supported(sheep.position),'Comment %d: reject unsupported sheep feet'%id)
				game.selected_id=6
				check(not game.move_selected(sheep.position,false),'Comment %d: Arrange mode blocks this unsupported placement'%id)
				check(not sheep.movement_segment_allowed(sheep.position,sheep.position),'Comment %d: gameplay blocks the unsupported foot contact'%id)
			5,6,8:
				var actor = game.item_nodes[7] if id==8 else sheep
				var ramp = null
				for node in game.get_node('World').get_children():
					if node.has_method('display_layout') and node.piece!=null and game.layout.cells.get(node.piece)=='stairs': ramp=node
				check(ramp!=null and not in_front(actor,ramp),'Comment %d: animal behind staircase without full foot support'%id)
			7: check(sheep.get_index()>game.item_nodes[4].get_index(),'Comment 7: sheep draws in front of rock')
			9: check(game.item_nodes[40].get_index()<game.item_nodes[11].get_index(),'Comment 9: stump draws behind flowers')
			10:
				var chicken=game.item_nodes[7]
				check(not chicken.feet_supported(chicken.position),'Comment 10: run-pose feet cannot overhang the water edge')
				game.selected_id=7
				check(not game.move_selected(chicken.position,false),'Comment 10: Arrange blocks this water-edge placement')
				check(not chicken.movement_segment_allowed(chicken.position,chicken.position),'Comment 10: gameplay rejects this water-edge position')
			11:
				var ramp=null
				for node in game.get_node('World').get_children():
					if node.has_method('display_layout') and node.piece==Vector2i(3,1): ramp=node
				check(ramp!=null and not in_front(game.pawn,ramp),'Comment 11: pawn on lower ground north of a staircase stays behind it')
		game.repair_review_animal_contacts()
		game.clear_contact_warning()
		if id in [3,4]:
			check(sheep.feet_supported(sheep.position),'Comment %d: restored sheep has all four feet supported'%id)
		if id==5:
			check(is_zero_approx(sheep.z_index),'Comment 5: repaired landing-edge pose remains behind the stairs')
		if id==10:
			check(game.item_nodes[7].feet_supported(game.item_nodes[7].position),'Comment 10: restored chicken feet are fully on grass')
		var capture_dir := OS.get_environment('TINY_SWORDS_REVIEW_CAPTURE')
		if not capture_dir.is_empty() and DisplayServer.get_name()!='headless':
			var rectangle: Array=sample.scene.problem_rect
			var bounds:=Rect2(Vector2(rectangle[0],rectangle[1]),Vector2(rectangle[2],rectangle[3]))
			game.view_center=bounds.get_center()
			game.zoom_control.value=clampf(minf(780.0/(bounds.size.x+60),560.0/(bounds.size.y+60)),0.5,2.5)
			game.arrange_review()
			await process_frame
			await RenderingServer.frame_post_draw
			if id==10:
				var chicken: Sprite2D=game.item_nodes[7]
				var art: Image=chicken.texture.get_image().get_region(Rect2i(chicken.frame*128,0,128,128))
				var bottom := 0
				for y in range(90,128):
					for x in 128:
						var color := art.get_pixel(x,y)
						if color.a>0.99 and maxf(color.r,maxf(color.g,color.b))<0.36: bottom=maxi(bottom,y)
				chicken.hide()
				await process_frame
				await RenderingServer.frame_post_draw
				var ground: Image=root.get_texture().get_image()
				var pixel_scale: Vector2=Vector2(ground.get_size())/game.get_viewport_rect().size
				var dry := true
				for y in range(bottom-2,bottom+1):
					for x in 128:
						var color := art.get_pixel(x,y)
						if color.a<0.99 or maxf(color.r,maxf(color.g,color.b))>=0.36: continue
						var local:=Vector2(127-x if chicken.flip_h else x,y)-Vector2(64,64)+chicken.offset
						var pixel: Vector2i=Vector2i((chicken.get_global_transform_with_canvas()*local)*pixel_scale)
						var floor_color:=ground.get_pixelv(pixel)
						# Grass includes its dark green shore outline; water and foam
						# have nearly equal green/blue channels in this exact fixture.
						if floor_color.g-floor_color.b<0.04: dry=false
				check(dry,'Comment 10: actual rendered run-pose feet stand on green grass, not water or foam')
				chicken.show()
				await process_frame
				await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(capture_dir+'/fixed-%02d.png'%id)
		await process_frame
	game.dirty_seconds=-1
	game.queue_free()
	await process_frame
	print('Reviewed scenes: ','PASS' if failures==0 else 'FAIL','; cases=',cases.size(),'; failures=',failures)
	quit(0 if failures==0 else 1)

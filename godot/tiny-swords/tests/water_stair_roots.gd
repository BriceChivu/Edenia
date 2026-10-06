extends SceneTree
const View = preload("res://scripts/terrain_view.gd")
class FoamOnly extends "res://scripts/terrain_view.gd":
	func _draw():
		for cell in layout.cells:
			var p: Vector2 = layout.ORIGIN + Vector2(cell)*64
			var frame = absi(cell.x*7+cell.y*11)%16
			draw_texture_rect_region(foam,Rect2(p-Vector2(32,32),Vector2(128,128)),Rect2(frame*192+32,32,128,128))
func _initialize():
	run.call_deferred()
func run():
	root.size=Vector2i(256,192)
	root.content_scale_size=Vector2i.ZERO
	var l=load("res://scripts/terrain_layout.gd").new()
	l.cells={Vector2i.ZERO:"stairs",Vector2i.LEFT:"high_gold",Vector2i.RIGHT:"meadow"}
	l.elevations={Vector2i.LEFT:64}
	l.stair_directions={Vector2i.ZERO:Vector2i.LEFT}
	var parent=Node2D.new()
	parent.position=Vector2(-480,-96)
	root.add_child(parent)
	var base=FoamOnly.new()
	base.layout=l
	base.set_process(false)
	parent.add_child(base)
	await process_frame
	await RenderingServer.frame_post_draw
	var water=root.get_texture().get_image()
	base.free()
	base=View.new()
	base.layout=l
	parent.add_child(base)
	base.set_process(false)
	var shadows=View.new()
	shadows.layout=l
	shadows.shadow_height=64
	parent.add_child(shadows)
	var surface=View.new()
	surface.layout=l
	surface.piece=Vector2i.ZERO
	surface.position=l.ORIGIN
	parent.add_child(surface)
	await process_frame
	await RenderingServer.frame_post_draw
	var actual=root.get_texture().get_image()
	var art=load("res://assets/terrain/stair-ramp-water.png").get_image()
	var atlas=load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
	var count=0
	var failures=0
	for y in range(112,128):
		for x in range(16,48):
			if art.get_pixel(x,y).a==0 and atlas.get_pixel(192+x,256+y).a>0.99:
				count+=1
				var p=Vector2i(32+x,16+y)
				if actual.get_pixelv(p)!=water.get_pixelv(p):
					failures+=1
	var side_grass := 0
	for y in range(64,112):
		for x in range(48,64):
			if atlas.get_pixel(192+x,256+y).a == 0:
				var p := Vector2i(32+x,16+y)
				if actual.get_pixelv(p) != water.get_pixelv(p):
					side_grass += 1
	print("Grass preserved at ramp side: ", side_grass, " pixels")
	print("Placed shoreline ramp roots: ",failures," mismatches among ",count," transparent pixels")
	quit(0 if failures == 0 and count > 0 and side_grass > 0 else 1)

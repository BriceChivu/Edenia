extends Node2D
var review
func _draw() -> void:
	if review == null or review.playing: return
	var l = review.layout
	for item in review.items:
		if item.get('hidden',false) or (item.kind=='logs' and int(item.variant)==0): continue
		var point: Vector2 = review.item_point(item)
		var height: float = review.ground_height(point)
		var projected := point-Vector2(0,height)
		var chosen: bool = int(item.id) == review.selected_id
		if review.contacts.button_pressed:
			var patch := PackedVector2Array()
			var slot: Vector2i = review.slot_for(item)
			match item.kind:
				'land_rock': patch = l.rock_footprint(slot)
				'tree': patch = l.tree_footprint(point,l.TREE_VARIANTS[int(item.variant)-1])
				'logs': patch = l.log_footprint(slot)
				'house': patch = l.house_footprint(slot)
			if not patch.is_empty():
				for i in patch.size(): patch[i].y -= height
				draw_colored_polygon(patch,Color(1,0.2,0.1,0.15))
				patch.append(patch[0])
				draw_polyline(patch,Color(1,0.3,0.15,0.8),0.7)
		if chosen or review.markers.button_pressed:
			var color := Color('#fff3a2') if chosen else Color(0.85,1,1,0.7)
			draw_circle(projected,4.5 if chosen else 2.5,color,false,0.8)
			draw_line(projected-Vector2(7,0),projected+Vector2(7,0),color,0.7)
			draw_line(projected-Vector2(0,7),projected+Vector2(0,7),color,0.7)

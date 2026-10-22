extends RefCounted

# Stable ground-space foot envelopes, independent of idle/eating/run poses.
# Sheep need their rear and front pairs supported; chickens use two close feet.
const SHEEP := Vector2(17, 6)
const CHICKEN := Vector2(7, 3)

static func standing_height(layout, point: Vector2, half_size: Vector2) -> float:
	var height: float = layout.surface_height(point)
	if layout.terrain_feet_free(point,true,half_size): return height
	# Legacy/editor poses can straddle a cliff. Do not promote the whole animal
	# onto the upper floor from its center while some feet remain below it.
	for offset in [Vector2(-half_size.x,-half_size.y),Vector2(half_size.x,-half_size.y),Vector2(-half_size.x,half_size.y),half_size]:
		height=minf(height,layout.surface_height(point+offset))
	return height

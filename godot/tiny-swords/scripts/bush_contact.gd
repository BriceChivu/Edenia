extends RefCounted

# Authored ground-contact contours, calibrated against the 192 reviewed views.
# X is the animal's horizontal displacement from the bush; Y advances its
# contact depth from its origin. Interpolate between points so walking across
# the bush never jumps between the sampled left/center/right review positions.
# Keep these contours independent of animation frames, including grazing, so
# leaves and moving feet do not repeatedly reverse the draw order.
const SHEEP := [Vector2(-40, 0), Vector2(-18, 8), Vector2(0, 8), Vector2(18, 4), Vector2(40, 0)]
const CHICKEN_LARGE := [Vector2(-40, 0), Vector2(-18, 2), Vector2(0, 2), Vector2(18, 0), Vector2(40, 0)]
const CHICKEN_SMALL_FLIPPED := [Vector2(-40, 0), Vector2(0, 0), Vector2(18, 2), Vector2(40, 0)]

static func sample(profile: Array, x: float) -> float:
	for index in range(1, profile.size()):
		var first: Vector2 = profile[index - 1]
		var last: Vector2 = profile[index]
		if x >= first.x and x <= last.x:
			return lerpf(first.y, last.y, inverse_lerp(first.x, last.x, x))
	return 0.0

static func depth_offset(animal: Sprite2D, bush: Sprite2D, chicken: bool) -> float:
	var scale_ratio := bush.scale / 0.75
	var x := (animal.position.x - bush.position.x) / scale_ratio.x
	if not chicken:
		# Sheep's forward contact patch mirrors with its artwork.
		return sample(SHEEP, -x if animal.flip_h else x) * scale_ratio.y
	if bush.get_meta("bush_contact_variant", 1) == 1:
		return sample(CHICKEN_LARGE, x) * scale_ratio.y
	return sample(CHICKEN_SMALL_FLIPPED, x) * scale_ratio.y if animal.flip_h else 0.0

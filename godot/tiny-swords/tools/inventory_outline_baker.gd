extends RefCounted

# Offline asset preparation only. Gameplay loads the generated borders.
const Trees = preload("res://scripts/tree_art.gd")
const Art = preload("res://scripts/level_five_art.gd")
const COLOR := Color(1, 1, 1, 0.75)
const WIDTH := 2
static var textures := {}

static func texture_for(texture: Texture2D, region: Rect2i) -> Texture2D:
	var key := "%s:%s" % [texture.get_instance_id(), region]
	if textures.has(key):
		return textures[key]
	var source := texture.get_image().get_region(region)
	var size := Vector2i(source.get_size())
	var border := Image.create(size.x + WIDTH * 2, size.y + WIDTH * 2, false, Image.FORMAT_RGBA8)
	var neighbors := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN, Vector2i(-2, 0), Vector2i(2, 0), Vector2i(0, -2), Vector2i(0, 2), Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)]
	for y in range(-WIDTH, size.y + WIDTH):
		for x in range(-WIDTH, size.x + WIDTH):
			var pixel := Vector2i(x, y)
			if Rect2i(Vector2i.ZERO, size).has_point(pixel) and source.get_pixelv(pixel).a > 0.99:
				continue
			for delta in neighbors:
				var adjacent: Vector2i = pixel + delta
				if Rect2i(Vector2i.ZERO, size).has_point(adjacent) and source.get_pixelv(adjacent).a > 0.99:
					border.set_pixelv(pixel + Vector2i.ONE * WIDTH, Color.WHITE)
					break
	var result := ImageTexture.create_from_image(border)
	textures[key] = result
	return result

# Enumerate every animated tree pose and each unique house texture. The fourth
# house facing mirrors House2 through the existing drawing transform.
static func inputs() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var seen := {}
	for kind in Trees.TEXTURES:
		var size := Vector2i(Trees.frame_size(kind))
		for frame in 8:
			result.append({"texture": Trees.TEXTURES[kind], "region": Rect2i(Vector2i(frame * size.x, 0), size), "name": "%s-%s" % [kind, frame]})
	for facing in Art.HOUSE_TEXTURES.size():
		var texture: Texture2D = Art.HOUSE_TEXTURES[facing]
		if seen.has(texture.resource_path):
			continue
		seen[texture.resource_path] = true
		result.append({"texture": texture, "region": Rect2i(Vector2i.ZERO, Vector2i(texture.get_size())), "name": "house-%s" % facing})
	return result

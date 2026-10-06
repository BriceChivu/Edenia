extends RefCounted

# Borders are generated offline so opening inventory never reads sprite pixels.
const Assets = preload("res://scripts/inventory_outline_assets.gd")
const COLOR := Color(1, 1, 1, 0.75)
const WIDTH := Assets.WIDTH
static var textures := {}

static func texture_for(texture: Texture2D, region: Rect2i) -> Texture2D:
	var key := texture.resource_path + ":" + str(region)
	if not textures.has(key):
		var border: Texture2D = Assets.TEXTURES.get(key)
		if border == null:
			push_error("Missing inventory outline asset: " + key)
			return null
		textures[key] = border
	return textures[key]

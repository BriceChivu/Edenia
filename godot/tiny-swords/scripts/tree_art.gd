extends RefCounted

const Layout = preload("res://scripts/terrain_layout.gd")
const TEXTURE = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
const SCALE := 0.8
const FRAME_SIZE := Vector2(192, 256)
static var source: Image
static var shadow_pixels: Array[Vector2i] = []

static func texture_at(offset: Vector2) -> Texture2D:
	if source == null:
		source = TEXTURE.get_image()
		# This atlas paints the ground shadow with partial alpha; the tree
		# itself is opaque. Preserve every branch, trunk and root pixel.
		for y in source.get_height():
			for x in source.get_width():
				var alpha := source.get_pixel(x, y).a
				if alpha > 0.0 and alpha < 1.0:
					shadow_pixels.append(Vector2i(x, y))
	var clipped: Image
	var square := Rect2(Vector2(-32, -32), Vector2(64, 64))
	for pixel in shadow_pixels:
		var position := offset + (Vector2(pixel.x % int(FRAME_SIZE.x), pixel.y) - FRAME_SIZE / 2 + Layout.TREE_ART_OFFSET) * SCALE
		# Crop entire edge pixels so their visible area cannot cross the tile.
		if not square.encloses(Rect2(position, Vector2.ONE * SCALE)):
			if clipped == null:
				clipped = source.duplicate()
			clipped.set_pixelv(pixel, Color.TRANSPARENT)
	return ImageTexture.create_from_image(clipped) if clipped != null else TEXTURE

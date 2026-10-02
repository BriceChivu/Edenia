extends RefCounted

const Layout = preload("res://scripts/terrain_layout.gd")
const TEXTURE = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
const SCALE := 0.8
const FRAME_SIZE := Vector2(192, 256)
const SECOND_TEXTURE = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree3.png")
const TEXTURES := {
	"tree": TEXTURE,
	"tree2": SECOND_TEXTURE,
	"tree3": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree2.png"),
	"tree4": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree4.png"),
}
static var sources := {}
static var shadows := {}

static func art_offset(kind: String) -> Vector2:
	return Vector2(0, -64) if kind in ["tree2", "tree4"] else Layout.TREE_ART_OFFSET

static func frame_size(kind: String) -> Vector2:
	var texture: Texture2D = TEXTURES[kind]
	return Vector2(texture.get_width() / 8.0, texture.get_height())

static func stump_offset(kind: String) -> Vector2:
	return Vector2(0, -96) if kind in ["tree2", "tree4"] else Layout.TREE_ART_OFFSET

static func texture_at(offset: Vector2, kind := "tree", stump := false) -> Texture2D:
	var texture: Texture2D = STUMPS[kind] if stump else TEXTURES[kind]
	var key: String = kind + ("_stump" if stump else "")
	if not sources.has(key):
		var source: Image = texture.get_image()
		var shadow_pixels: Array[Vector2i] = []
		# This atlas paints the ground shadow with partial alpha; the tree
		# itself is opaque. Preserve every branch, trunk and root pixel.
		for y in source.get_height():
			for x in source.get_width():
				var alpha := source.get_pixel(x, y).a
				if alpha > 0.0 and alpha < 1.0:
					shadow_pixels.append(Vector2i(x, y))
		sources[key] = source
		shadows[key] = shadow_pixels
	var source: Image = sources[key]
	var shadow_pixels: Array[Vector2i] = shadows[key]
	var size := Vector2(texture.get_width(), texture.get_height()) if stump else frame_size(kind)
	var clipped: Image
	var square := Rect2(Vector2(-32, -32), Vector2(64, 64))
	for pixel in shadow_pixels:
		var position := offset + (Vector2(pixel.x % int(size.x), pixel.y) - size / 2 + (stump_offset(kind) if stump else art_offset(kind))) * SCALE
		# Crop entire edge pixels so their visible area cannot cross the tile.
		if not square.encloses(Rect2(position, Vector2.ONE * SCALE)):
			if clipped == null:
				clipped = source.duplicate()
			clipped.set_pixelv(pixel, Color.TRANSPARENT)
	return ImageTexture.create_from_image(clipped) if clipped != null else texture

const STUMPS := {
	"tree": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Stump 1.png"),
	"tree2": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Stump 3.png"),
	"tree3": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Stump 2.png"),
	"tree4": preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Stump 4.png"),
}

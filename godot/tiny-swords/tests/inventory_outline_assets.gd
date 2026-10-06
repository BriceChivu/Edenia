extends SceneTree

const Outline = preload("res://scripts/inventory_outline.gd")
const Assets = preload("res://scripts/inventory_outline_assets.gd")
const Baker = preload("res://tools/inventory_outline_baker.gd")
var failures := 0

func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)

func _initialize() -> void:
	check(Assets.WIDTH == Baker.WIDTH and Outline.WIDTH == Baker.WIDTH, "Regenerate outlines after changing border width")
	for source in Assets.INPUT_HASHES:
		check(FileAccess.get_sha256(source) == Assets.INPUT_HASHES[source], "Regenerate outlines after changing " + source)
	var inputs := Baker.inputs()
	check(Assets.TEXTURES.size() == inputs.size(), "Every current tree pose and unique house texture has a baked border")
	for entry in inputs:
		var texture: Texture2D = entry.texture
		var region: Rect2i = entry.region
		var border: Texture2D = Outline.texture_for(texture, region)
		check(border != null, "Missing border: " + entry.name)
		if border == null:
			continue
		# Exercise the real drawing call's lookup: it must return an imported
		# asset rather than create an ImageTexture on first inventory use.
		check(border.resource_path.begins_with("res://assets/inventory-outlines/"), "Runtime border must be precomputed: " + entry.name)
		var expected: Image = Baker.texture_for(texture, region).get_image()
		var actual: Image = border.get_image()
		actual.convert(expected.get_format())
		check(actual.get_size() == expected.get_size() and actual.get_data() == expected.get_data(), "Border pixels changed: " + entry.name)
	print("Inventory outline assets: %s borders, %s failures" % [inputs.size(), failures])
	quit(0 if failures == 0 else 1)

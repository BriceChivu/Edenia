extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _init() -> void:
	var layout := Layout.new()
	var first: Dictionary = layout.snapshot()
	layout.chickens = [Vector2(32, 32)]
	var placed: Dictionary = layout.snapshot()
	assert(first.sync_semantics.sha256 != placed.sync_semantics.sha256, "Animal ownership affects sync identity")
	layout.chickens[0] = Vector2(96, 32)
	assert(layout.snapshot().sync_semantics == placed.sync_semantics, "Ambient movement does not create gameplay divergence")
	layout.stock.chicken += 1
	assert(layout.snapshot().sync_semantics != placed.sync_semantics, "Inventory and animal positions are not interchangeable")
	var current: Dictionary = layout.snapshot()
	layout.stock.chicken -= 1
	layout.resources.wood += 1
	assert(layout.snapshot().sync_semantics != current.sync_semantics, "Resource changes remain meaningful")
	print("Tiny Swords sync semantics passed")
	quit()

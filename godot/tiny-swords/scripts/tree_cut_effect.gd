extends "res://scripts/dust_effect.gd"

## Transient completion visual; the saved tree becomes a stump immediately.
const FADE_SECONDS := 0.2
var tree: Sprite2D

func setup(source: Sprite2D, height: float) -> void:
	position = source.position
	z_index = source.z_index
	tree = Sprite2D.new()
	tree.texture = source.texture
	tree.hframes = source.hframes
	tree.frame = source.frame
	tree.offset = source.offset
	tree.scale = source.scale
	# Freeze the displayed reaction independently of the standing tree's clock.
	if source.material != null:
		tree.material = source.material.duplicate()
	add_child(tree)
	setup_dust(height)

func advance(delta: float) -> void:
	tree.modulate.a = maxf(0.0, 1.0 - (elapsed + delta) / FADE_SECONDS)
	super.advance(delta)

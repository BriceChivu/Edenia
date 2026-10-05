extends Control

# Level two uses the nodes' editable text. Level three shares their visual layout.
@export_group("Level three text")
@export var level_three_title := "LEVEL THREE!"
@export_multiline var level_three_message := "Congratulations! More room to create.\n\n6 new items: 3 ground tiles, 1 stair, 1 pine, 1 bridge.\nThe stair includes its upper landing.\nEverything you built stays in place."

func configure(level: int, bridges_enabled := false) -> void:
	# Every upgrade uses the same confirmation label.
	$BuildButton.text = "OK"
	$PineReward.visible = level in [3, 4, 7]
	$PineCount.visible = level in [3, 4, 7]
	if level == 7:
		$PineReward.texture = preload("res://assets/chicken.png")
		$PineReward.tooltip_text = "Chicken"
		$PineReward.accessibility_name = "1 chicken"
		$PineCount.text = "×1"
	if level >= 5:
		$Title.text = "LEVEL %s" % level
	if level >= 3:
		var message := get_node_or_null("Message2") as Label
		if message != null:
			message.text = level_three_message if bridges_enabled else level_three_message.replace("6 new items: 3 ground tiles, 1 stair, 1 pine, 1 bridge.", "5 new items: 3 ground tiles, 1 stair, 1 pine.")

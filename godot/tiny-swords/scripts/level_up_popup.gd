extends Control

# Level two uses the nodes' editable text. Level three shares their visual layout.
@export_group("Level three text")
@export var level_three_title := "LEVEL THREE!"
@export_multiline var level_three_message := "Congratulations! More room to create.\n\n5 new items: 3 ground tiles, 1 stair, 1 pine.\nThe stair includes its upper landing.\nEverything you built stays in place."
@export var level_three_button := "Keep building"

func configure(level: int) -> void:
	if level == 3:
		$Title.text = level_three_title
		$Message2.text = level_three_message
		$BuildButton.text = level_three_button

extends Control

var configured_level := 2

func _ready() -> void:
	GameCopy.changed.connect(localize)
	localize()

func localize() -> void:
	GameCopy.theme(self)
	$Title.text = GameCopy.text("level", {"level": configured_level})
	GameCopy.font($Title)
	$BuildButton.text = GameCopy.text("ok")
	$BuildButton.accessibility_name = $BuildButton.text
	GameCopy.font($BuildButton)
	for pair in [["GroundButton", "groundReward"], ["StairsButton", "stairsReward"], ["PineReward", "chickenReward" if configured_level in [2, 7] else "sheepReward" if configured_level == 8 else "treeReward"], ["AxeReward", "axeReward"], ["SheepReward", "sheepReward"], ["HouseReward", "houseReward"]]:
		var reward := get_node_or_null(pair[0]) as Control
		if reward != null:
			reward.accessibility_name = GameCopy.text(pair[1])
			reward.tooltip_text = reward.accessibility_name

func configure(level: int, _bridges_enabled := false) -> void:
	configured_level = level
	$PineReward.visible = level in [2, 3, 4, 6, 7, 8]
	$PineCount.visible = level in [2, 3, 4, 6, 7, 8]
	if level in [2, 7]:
		$PineReward.texture = preload("res://assets/chicken.png")
		$PineCount.text = "+1"
	if level == 8:
		var sheep_icon := AtlasTexture.new()
		sheep_icon.atlas = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Meat/Sheep/Sheep_Idle.png")
		sheep_icon.region = Rect2(36, 32, 56, 56)
		$PineReward.texture = sheep_icon
		$PineCount.text = "+1"
	if level == 2:
		# Three reward columns, matching the level-three popup spacing.
		$GroundButton.position.x = 96
		$GroundCount.position.x = 153
		$StairsButton.position.x = 194
		$StairsCount.position.x = 250
		$PineReward.position.x = 290
		$PineCount.position.x = 348
	localize()

func fit_text(fit: float) -> void:
	# Fit the paper artwork while keeping confirmation and CJK text readable.
	$Title.add_theme_font_size_override("font_size", maxi(30, ceili(24 / fit)))
	$BuildButton.add_theme_font_size_override("font_size", maxi(16, ceili(14 / fit)))

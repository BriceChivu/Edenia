extends Control

var configured_level := 2
var secondary_reward := "tree"

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
	for pair in [["GroundButton", "groundReward"], ["StairsButton", "stairsReward"], ["PineReward", secondary_reward + "Reward"], ["TreeReward", "treeReward"], ["AxeReward", "axeReward"], ["SheepReward", "sheepReward"], ["HouseReward", "houseReward"]]:
		var reward := get_node_or_null(pair[0]) as Control
		if reward != null:
			var key: String = pair[1]
			if pair[0] == "GroundButton" and configured_level == 19:
				key = "fourGroundReward"
			if pair[0] == "PineReward" and configured_level == 18:
				key = "twoTreesReward"
			reward.accessibility_name = GameCopy.text(key)
			reward.tooltip_text = reward.accessibility_name

func configure(level: int, _bridges_enabled := false) -> void:
	configured_level = level
	secondary_reward = "chicken" if level in [2, 7] else "sheep" if level == 8 else "tree"
	if level >= 6:
		configure_extended(level)
		localize()
		return
	$PineReward.visible = level in [2, 3, 4]
	$PineCount.visible = $PineReward.visible
	if level == 2:
		$PineReward.texture = preload("res://assets/ui/chicken_level_up.png")
		$PineCount.text = "+1"
	$StairsButton.visible = level in [2, 3]
	$StairsCount.visible = $StairsButton.visible
	if level == 2:
		$GroundButton.position.x = 96
		$GroundCount.position.x = 153
		$StairsButton.position.x = 194
		$StairsCount.position.x = 250
		$PineReward.position.x = 290
		$PineCount.position.x = 348
	localize()

func configure_extended(level: int) -> void:
	var rewards: Dictionary = preload("res://scripts/terrain_layout.gd").LEVEL_REWARDS[level]
	$GroundCount.text = "+%s" % rewards.meadow
	var has_stairs := rewards.has("stairs")
	$StairsButton.visible = has_stairs
	$StairsCount.visible = has_stairs
	$StairsCount.text = "+%s" % rewards.get("stairs", 0)
	secondary_reward = "chicken" if rewards.has("chicken") else "sheep" if rewards.has("sheep") else "tree"
	var secondary_count := int(rewards.get(secondary_reward, 0))
	$PineReward.visible = secondary_count > 0
	$PineCount.visible = secondary_count > 0
	$PineCount.text = "+%s" % secondary_count
	if secondary_reward == "chicken":
		$PineReward.texture = preload("res://assets/ui/chicken_level_up.png")
	elif secondary_reward == "sheep":
		var sheep_icon := AtlasTexture.new()
		sheep_icon.atlas = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Meat/Sheep/Sheep_Idle.png")
		sheep_icon.region = Rect2(36, 32, 56, 56)
		$PineReward.texture = sheep_icon
	else:
		$PineReward.texture = preload("res://assets/ui/level_up_reward_pine.png")
	var extra_tree := secondary_reward != "tree" and rewards.has("tree")
	$TreeReward.visible = extra_tree
	$TreeCount.visible = extra_tree
	$TreeCount.text = "+%s" % rewards.get("tree", 0)
	var columns := 1 + int(has_stairs) + int(secondary_count > 0) + int(extra_tree)
	var start := 96 if columns == 3 else 145 if columns == 2 else 188
	$GroundButton.position.x = start
	$GroundCount.position.x = start + 57
	$StairsButton.position.x = start + 98
	$StairsCount.position.x = start + 154
	$PineReward.position.x = start + (194 if has_stairs else 98)
	$PineCount.position.x = $PineReward.position.x + 56
	$TreeReward.position.x = start + 194
	$TreeCount.position.x = $TreeReward.position.x + 58

func fit_text(fit: float) -> void:
	# Fit the paper artwork while keeping confirmation and CJK text readable.
	$Title.add_theme_font_size_override("font_size", maxi(30, ceili(24 / fit)))
	$BuildButton.add_theme_font_size_override("font_size", maxi(16, ceili(14 / fit)))

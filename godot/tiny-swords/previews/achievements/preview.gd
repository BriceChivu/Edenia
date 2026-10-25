extends "res://previews/chicken_run_sandbox.gd"

@export_enum("en", "zh-Hant", "zh-Hans", "es", "fr") var preview_locale := "en"

func _ready() -> void:
	achievements_enabled = true
	var language := str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('locale') || 'en'")) if OS.has_feature("web") else preview_locale
	GameCopy.set_locale(language)
	super._ready()
	if ui.achievements != null: ui.achievements.set_open(true)

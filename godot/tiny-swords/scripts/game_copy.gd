extends Node

# Locale is presentation state. It never enters the island save or reward logic.
signal changed
const LOCALES := ["en", "zh-Hant", "zh-Hans", "es", "fr"]
var locale := "en"
var catalogs := {}
var fonts := {}
var button_fonts := {}
var default_font: Font

func _ready() -> void:
	for language in LOCALES:
		catalogs[language] = JSON.parse_string(FileAccess.get_file_as_string("res://i18n/%s.json" % language))
	fonts["zh-Hant"] = preload("res://fonts/EdeniaNotoTC.otf")
	fonts["zh-Hans"] = preload("res://fonts/EdeniaNotoSC.otf")
	for language in fonts:
		var button_font := FontVariation.new()
		button_font.base_font = fonts[language]
		# Noto's Chinese glyphs sit low in the button artwork. Lift them by
		# two pixels at 16px, including the normal pressed-state displacement.
		button_font.baseline_offset = -0.125
		button_fonts[language] = button_font
	default_font = ThemeDB.fallback_font

func set_locale(value: String) -> void:
	var next := value if value in LOCALES else "en"
	if next == locale:
		return
	locale = next
	# Engine tooltips use the default theme font rather than a button override.
	ThemeDB.fallback_font = fonts.get(locale, default_font)
	changed.emit()

func text(key: String, params := {}) -> String:
	var result: String = catalogs[locale].get(key, catalogs.en.get(key, key))
	for param in params:
		result = result.replace("{%s}" % param, str(params[param]))
	return result

func font(control: Control) -> void:
	if control is Button:
		control.add_theme_stylebox_override("focus", focus_style())
	if fonts.has(locale):
		control.add_theme_font_override("font", button_fonts[locale] if control is Button else fonts[locale])
	else:
		control.remove_theme_font_override("font")

func theme(control: Control) -> void:
	if control.theme == null:
		return
	if not control.has_meta("latin_ui_font"):
		control.theme = control.theme.duplicate()
		control.set_meta("latin_ui_font", control.theme.default_font)
	control.theme.default_font = fonts.get(locale, control.get_meta("latin_ui_font"))
	control.theme.set_stylebox("focus", "Button", focus_style())

func focus_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Color("142028")
	style.set_border_width_all(2)
	return style

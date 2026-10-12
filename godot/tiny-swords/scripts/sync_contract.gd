extends RefCounted
# Godot owns this declaration; Edenia consumes the checked manifest as transport
# metadata. A profile cannot expand it to hide meaningful game edits.
const DECLARATION := {"version": 1, "ambient_arrays": ["chickens", "sheep"]}

static func identity(snapshot: Dictionary) -> Dictionary:
	var gameplay := snapshot.duplicate(true)
	gameplay.erase("sync_semantics")
	for field in DECLARATION.ambient_arrays:
		gameplay[field] = snapshot[field].size()
	var result := DECLARATION.duplicate(true)
	result.sha256 = JSON.stringify(gameplay, "", true).sha256_text()
	return result

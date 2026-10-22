extends RefCounted

# Exact identities from the implemented scene reviews. New feedback with
# the same wording or a reused ID must stay in the active list.
const COMPLETED := [
	{
		"id": 1,
		"comment": "sheep should be in front",
		"created_at": "2026-10-21T14:00:25"
	},
	{
		"id": 2,
		"comment": "tree should be in front",
		"created_at": "2026-10-21T14:01:24"
	},
	{
		"id": 3,
		"comment": "sheep shouldn't be able to be there. All 4 legs should be on the grass",
		"created_at": "2026-10-21T14:03:04"
	},
	{
		"id": 4,
		"comment": "sheep shouldn't be able to be there. All 4 legs should be on grass",
		"created_at": "2026-10-21T14:03:37"
	},
	{
		"id": 5,
		"comment": "sheep should be behind the staircase",
		"created_at": "2026-10-21T14:04:58"
	},
	{
		"id": 6,
		"comment": "sheep should be behind the staircase",
		"created_at": "2026-10-21T14:05:24"
	},
	{
		"id": 7,
		"comment": "sheep should be in front of the rock",
		"created_at": "2026-10-21T14:06:08"
	},
	{
		"id": 8,
		"comment": "chicken should be behind the staircase because for it to be on top, it needs its 2 feet on the staircase",
		"created_at": "2026-10-21T14:07:53"
	},
	{
		"id": 9,
		"comment": "the tree trunk should be behind the bush/flowers",
		"created_at": "2026-10-22T11:38:38"
	},
	{
		"id": 10,
		"comment": "the chicken can't be in water.",
		"created_at": "2026-10-22T13:42:12"
	}
]

static func matches(note: Dictionary, identity: Dictionary) -> bool:
	return int(note.get('id',-1))==int(identity.id) and note.get('created_at','')==identity.created_at and note.get('comment','')==identity.comment

static func partition(notes: Array, archived: Array) -> Dictionary:
	var result := {'pending':[], 'resolved':archived.duplicate()}
	for note in notes:
		var completed := false
		for identity in COMPLETED:
			if matches(note,identity): completed=true; break
		if completed:
			if not result.resolved.any(func(existing): return matches(existing,note)): result.resolved.append(note)
		else: result.pending.append(note)
	return result

static func next_id(notes: Array, archived: Array) -> int:
	var result := 1
	for note in notes+archived: result=maxi(result,int(note.id)+1)
	return result

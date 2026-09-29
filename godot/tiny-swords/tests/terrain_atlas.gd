extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")
var failures := 0
func check(ok: bool, label: String) -> void:
 if not ok:
  failures += 1
  push_error(label)
func _initialize() -> void:
 var view = View.new()
 view.layout = Layout.new()
 if not view.has_method("ground_region"):
  push_error("Renderer must select the guide's complete 64px ground pieces, not repeat 32px fragments")
  view.free()
  quit(1)
  return
 # Guide columns: left edge, center, right edge, isolated strip.
 # Rows: top edge, center, bottom edge, isolated strip. All 16 authored pieces.
 var pairs := [[false,true],[true,true],[true,false],[false,false]]
 for kind in ["meadow", "high_gold"]:
  for y in range(4):
   for x in range(4):
    view.layout.cells = {Vector2i.ZERO: kind}
    for pair in [[Vector2i.LEFT,pairs[x][0]],[Vector2i.RIGHT,pairs[x][1]],[Vector2i.UP,pairs[y][0]],[Vector2i.DOWN,pairs[y][1]]]:
     if pair[1]: view.layout.cells[pair[0]] = kind
    var expected := Rect2(x * 64 + (320 if kind == "high_gold" else 0), y * 64, 64, 64)
    check(view.call("ground_region", Vector2i.ZERO, kind) == expected, "Guide piece (%s,%s) for %s" % [x,y,kind])
 view.layout.cells = {Vector2i.ZERO:"meadow",Vector2i.RIGHT:"high_gold"}
 check(view.call("ground_region",Vector2i.ZERO,"meadow") == Rect2(192,192,64,64), "Different elevations do not merge grass edges")
 view.layout.cells = {Vector2i.ZERO:"stairs",Vector2i.RIGHT:"high_gold"}
 view.layout.stair_directions = {Vector2i.ZERO:Vector2i.RIGHT}
 check(view.stair_joins(Vector2i.RIGHT,Vector2i.LEFT), "Ramp joins its upper landing")
 check(view.cliff_region(Vector2i.RIGHT) == Rect2(448,320,64,64), "Stair landing uses complete connected water cliff")
 view.layout.cells[Vector2i(1,1)] = "meadow"
 check(view.cliff_region(Vector2i.RIGHT) == Rect2(448,256,64,64), "Cliff uses the land-facing piece over lower ground")
 var top: Vector2 = view.layout.ORIGIN + Vector2(64,-64)
 var shadow: Rect2 = view.shadow_rect(Vector2i.RIGHT)
 check(shadow.size == Vector2(128,128) and shadow.get_center() == top + Vector2(32,96), "Guide shadow is 128px and one tile below the elevated top center")
 view.layout.cells[Vector2i(2,0)] = "high_gold"
 check(shadow.intersection(view.shadow_rect(Vector2i(2,0))).size.x == 64, "Neighbor shadows overlap by one tile")
 view.free()
 print("Terrain atlas checks: ", "PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)

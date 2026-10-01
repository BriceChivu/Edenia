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
 check(view.call("ground_region",Vector2i.ZERO,"meadow") == Rect2(192,192,64,64), "Base grass ends beside a water cliff")
 # Real grass on the opposite side must still join; only the cliff side closes.
 for direction in [Vector2i.LEFT,Vector2i.RIGHT]:
  view.layout.cells = {Vector2i.ZERO:"meadow",direction:"high_gold",-direction:"meadow"}
  var column := 0 if direction == Vector2i.LEFT else 128
  check(view.ground_region(Vector2i.ZERO,"meadow") == Rect2(column,192,64,64), "Water cliff closes the touching end in both orientations")
  check(view.cliff_grass_sides(direction,64) == [false,false], "Water cliff keeps its water-facing side artwork")
  check(view.ground_backing_regions(direction,0).is_empty(), "No grass extends under the water cliff side")
  view.layout.cells[direction+Vector2i.DOWN] = "meadow"
  check(view.ground_region(Vector2i.ZERO,"meadow") == Rect2(64,192,64,64), "Grass-facing cliff retains its receiving grass join")
 # Two grass rows beside a plateau: rear edge joins, exposed base ends.
 for side in [Vector2i.LEFT,Vector2i.RIGHT]:
  view.layout.cells = {Vector2i.ZERO:"high_gold",Vector2i.DOWN:"high_gold",side:"meadow",side+Vector2i.DOWN:"meadow",side*2:"meadow",side*2+Vector2i.DOWN:"meadow"}
  check(view.ground_region(side,"meadow") == Rect2(64,0,64,64), "Rear water-level grass uses a middle side beside covered cliff")
  var end_column := 128 if side == Vector2i.LEFT else 0
  check(view.ground_region(side+Vector2i.DOWN,"meadow") == Rect2(end_column,128,64,64), "Only grass directly beside the exposed cliff base keeps an end")
 view.layout.cells = {Vector2i.ZERO:"stairs",Vector2i.RIGHT:"high_gold"}
 view.layout.stair_directions = {Vector2i.ZERO:Vector2i.RIGHT}
 check(view.stair_joins(Vector2i.RIGHT,Vector2i.LEFT), "Ramp joins its upper landing")
 check(view.cliff_region(Vector2i.RIGHT) == Rect2(448,320,64,64), "Stair landing uses complete connected water cliff")
 view.layout.cells[Vector2i(1,1)] = "meadow"
 check(view.cliff_region(Vector2i.RIGHT) == Rect2(448,256,64,64), "Cliff uses the land-facing piece over lower ground")
 # Pixel comparison with the author's guide identifies these exact pieces.
 view.layout.cells = {Vector2i.ZERO:"stairs",Vector2i.RIGHT:"high_gold",Vector2i(1,-1):"high_gold",Vector2i(2,0):"high_gold",Vector2i(1,1):"meadow"}
 view.layout.stair_directions = {Vector2i.ZERO:Vector2i.RIGHT}
 check(view.ground_region(Vector2i.RIGHT,"high_gold") == Rect2(384,128,64,64), "Guide example 2: bottom-center grass, not center grass")
 check(view.cliff_region(Vector2i.RIGHT) == Rect2(384,256,64,64), "Guide example 2: land-facing center cliff")
 # Reproduce both illustrated stair joins, mirrored as well as original.
 for direction in [Vector2i.RIGHT,Vector2i.LEFT]:
  var landing: Vector2i = direction
  view.layout.cells = {Vector2i.ZERO:"stairs",landing:"high_gold",landing+Vector2i.UP:"high_gold"}
  view.layout.stair_directions = {Vector2i.ZERO:direction}
  var column := 448 if direction == Vector2i.RIGHT else 320
  check(view.ground_region(landing,"high_gold") == Rect2(column,128,64,64), "Cliff-side ramp retains the leafy bottom edge shown in guide example 2")
  view.layout.cells[landing+Vector2i.DOWN] = "high_gold"
  check(view.ground_region(landing,"high_gold") == Rect2(column,64,64,64), "Walkable-side ramp uses the same continuous connector")
  view.layout.cells.erase(landing+Vector2i.UP)
  check(view.ground_region(landing,"high_gold") == Rect2(column,0,64,64), "Short landing preserves only the outside top rim")
 view.layout.cells = {Vector2i.RIGHT:"high_gold"}
 view.layout.stair_directions.clear()
 var top: Vector2 = view.layout.ORIGIN + Vector2(64,-64)
 var shadow: Rect2 = view.shadow_rect(Vector2i.RIGHT)
 check(shadow.size == Vector2(128,128) and shadow.get_center() == top + Vector2(32,96), "Guide shadow is 128px and one tile below the elevated top center")
 view.layout.cells[Vector2i(2,0)] = "high_gold"
 check(shadow.intersection(view.shadow_rect(Vector2i(2,0))).size.x == 64, "Neighbor shadows overlap by one tile")
 view.layout.cells = {Vector2i.ZERO:"high_gold",Vector2i.DOWN:"meadow"}
 check(view.ground_region(Vector2i.DOWN,"meadow") == Rect2(192,128,64,64), "Lower grass has no false top shoreline against a cliff")
 check(view.ground_region(Vector2i.ZERO,"high_gold") == Rect2(512,192,64,64), "Upper grass still ends at its own cliff")
 # Select each tier's foot from its receiving grass, support, or water.
 view.layout.cells = {Vector2i.ZERO:"high_gold"}
 view.layout.elevations = {Vector2i.ZERO:192}
 check(view.cliff_region(Vector2i.ZERO,64).position.y == 320, "Lowest cliff over water uses the water foot")
 for height in [128,192]:
  check(view.cliff_region(Vector2i.ZERO,height).position.y == 256, "Stacked cliff above solid support has no water foot")
 view.layout.cells[Vector2i.DOWN] = "high_meadow"
 view.layout.elevations[Vector2i.DOWN] = 128
 check(view.cliff_region(Vector2i.ZERO,192).position.y == 256, "Cliff over elevated grass uses the grass foot")
 view.layout.cells[Vector2i.DOWN] = "stairs"
 check(view.cliff_region(Vector2i.ZERO,192).position.y == 256, "Cliff over a raised ramp base uses the solid foot")
 view.layout.cells.erase(Vector2i.DOWN)
 check(view.cliff_region(Vector2i.ZERO,64).position.y == 320, "Removing receiving ground restores the water foot")
 # Water cliffs retain water-facing sides beside closed base grass.
 view.layout.elevations.clear()
 for side in [Vector2i.LEFT,Vector2i.RIGHT]:
  view.layout.cells = {Vector2i.ZERO:"high_gold",side:"meadow"}
  check(view.cliff_region(Vector2i.ZERO,64).position.y == 320, "Mixed corner retains water foot")
  check(view.cliff_grass_sides(Vector2i.ZERO,64) == [false,false], "Water cliff sides stay water-facing beside base grass")
  check(view.cliff_grass_sides(Vector2i.ZERO,128) == [false,false], "Lower grass does not reach an upper cliff tier")
 view.free()
 print("Terrain atlas checks: ", "PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)

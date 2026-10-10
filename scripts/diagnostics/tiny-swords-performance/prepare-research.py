"""Generate native-density diagnostic probes; never modifies canonical gameplay."""
import pathlib, subprocess, sys, re
subprocess.run([sys.executable,'scripts/diagnostics/tiny-swords-performance/prepare.py'],check=True)
base=pathlib.Path('.cache/tiny-swords-perf/project/scripts')
p=base/'perf.gd';s=p.read_text().replace('var previous_ratio := 2.0','var previous_ratio := 0.0').replace('flags.get("pixel_ratio",2.0)','flags.get("pixel_ratio",0.0)')
s=s.replace('var elapsed := 0.0','var elapsed := 0.0\nvar frame_intervals: Array[float] = []\nvar last_frame_usec := 0')
s=s.replace(' elapsed += delta',' var now := Time.get_ticks_usec()\n if last_frame_usec > 0: frame_intervals.append(float(now-last_frame_usec)/1000.0)\n last_frame_usec = now\n elapsed += delta',1)
s=s.replace(' var data = {',' frame_intervals.sort()\n var pacing = {"count":frame_intervals.size(),"p95":frame_intervals[int((frame_intervals.size()-1)*0.95)] if not frame_intervals.is_empty() else 0,"max":frame_intervals.back() if not frame_intervals.is_empty() else 0}\n frame_intervals.clear()\n var data = {"static_clouds":static_cloud_active,"game_pacing":pacing,',1)
p.write_text(s)
# The canonical rare cloud now has its own inventory visibility state. Keep
# the legacy diagnostic base-class probe from colliding with that member.
p=base/'rare_cloud.gd';s=p.read_text().replace('var inventory_hidden := false:', 'var perf_rare_inventory_hidden := false:').replace('inventory_hidden = value','perf_rare_inventory_hidden = value').replace('not inventory_hidden','not perf_rare_inventory_hidden');p.write_text(s)
p=base/'level_two_preview.gd';s=p.read_text().replace('$PassingCloud.inventory_hidden', '$PassingCloud.perf_rare_inventory_hidden');p.write_text(s)
# Controlled work-removal probes establish attribution, not production safety.
for filename,fn,flag in [('cloud.gd','_process','cloud_motion_stop'),('rare_cloud.gd','_process','cloud_motion_stop'),('tree_visual.gd','_process','trees_stop'),('terrain_depth.gd','_process','depth_stop')]:
 p=base/filename;s=p.read_text();pattern=r'(func '+fn+r'\([^\n]*\) -> void:\n)';s,n=re.subn(pattern,lambda m:m[1]+'\tif Perf.flags.get("'+flag+'",false): return\n',s,count=1);assert n,(filename,fn);p.write_text(s)
p=base/'tree_visual.gd';s=p.read_text().replace('var bend_angle := 0.0','var bend_angle := 0.0\nvar perf_previous_bend := INF');s=s.replace('\tmaterial.set_shader_parameter("bend_angle", bend_angle)','\tif not Perf.flags.get("tree_setter_cache",false) or perf_previous_bend != bend_angle:\n\t\tmaterial.set_shader_parameter("bend_angle", bend_angle)\n\tperf_previous_bend = bend_angle');p.write_text(s)
p=base/'pawn.gd';s=p.read_text().replace('\t\tif tile_step_allowed(destination):','\t\tif (Perf.flags.get("pawn_idle_skip",false) and position == destination) or tile_step_allowed(destination):');p.write_text(s)
# Extend inclusive timers to the remaining event loops and allocations.
for filename,fn in [('terrain_depth.gd','_process'),('tree_visual.gd','update_pose'),('cloud_visual.gd','visual_inputs'),('pawn.gd','tile_step_allowed'),('log_pile.gd','_process')]:
 p=base/filename
 if not p.exists(): continue
 s=p.read_text();m=re.search(r'func '+fn+r'\(([^\n]*)\)( -> [^:\n]+)?:\n',s)
 if not m: continue
 args=[a.split(':')[0].split('=')[0].strip() for a in m[1].split(', ') if a]
 ret=m[2] or '';returns=ret!=' -> void';call='_research_'+fn+'('+', '.join(args)+')'
 wrapper=f'func {fn}({m[1]}){ret}:\n\tvar research_start := Time.get_ticks_usec()\n\t'+('var research_result = ' if returns else '')+call+f'\n\tPerf.record("{filename}:{fn}",Time.get_ticks_usec()-research_start)\n'+('\treturn research_result\n' if returns else '')+'\nfunc _research_'+fn+'('+m[1]+')'+ret+':\n'
 s=s[:m.start()]+wrapper+s[m.end():];p.write_text(s)
print('Prepared native-density probes in',base.parent)

p=base/'perf.gd';s=p.read_text().replace('var frame_intervals:', 'var static_cloud_layer: Node2D\nvar static_cloud_active := false\nvar frame_intervals:')
s=s.replace(' var data = {', ' apply_static_clouds(world)\n var data = {',1)
s += """
func apply_static_clouds(world: Node) -> void:
 var enabled := bool(flags.get("static_original_clouds",false)) or bool(flags.get("static_clouds_hide_inventory",false))
 if static_cloud_layer != null: static_cloud_layer.visible = enabled and not (world.editing and flags.get("static_clouds_hide_inventory",false))
 if enabled == static_cloud_active: return
 static_cloud_active = enabled
 var clouds: Array = world.get_node("Clouds").get_children() + [world.get_node("PassingCloud")]
 for cloud in clouds:
  cloud.set_process(not enabled)
  if enabled:
   cloud.hide()
   if RenderingServer.frame_pre_draw.is_connected(cloud.update_depth_mask_frame):
    RenderingServer.frame_pre_draw.disconnect(cloud.update_depth_mask_frame)
   cloud.depth_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
  else:
   cloud.show()
   if cloud == world.get_node("PassingCloud"): cloud.visible = cloud.crossing
   cloud.depth_inputs.clear()
   if not RenderingServer.frame_pre_draw.is_connected(cloud.update_depth_mask_frame):
    RenderingServer.frame_pre_draw.connect(cloud.update_depth_mask_frame)
 if static_cloud_layer == null:
  static_cloud_layer = Node2D.new()
  static_cloud_layer.name = "StaticOriginalClouds"
  static_cloud_layer.z_index = -19
  world.add_child(static_cloud_layer)
  world.move_child(static_cloud_layer,1)
  var size := world.get_viewport().get_visible_rect().size
  for i in 4:
   var sprite := Sprite2D.new()
   sprite.texture = preload("res://scripts/cloud_visual.gd").ORIGINAL_VARIANTS[[0,2,5,7][i]]
   sprite.scale = Vector2.ONE * 0.65
   sprite.position = world.get_viewport().canvas_transform.affine_inverse() * Vector2(70.0 if i % 2 == 0 else size.x-70.0,75.0 if i < 2 else size.y-90.0)
   static_cloud_layer.add_child(sprite)
 static_cloud_layer.visible = enabled and not (world.editing and flags.get("static_clouds_hide_inventory",false))
"""
p.write_text(s)

# Preserve cloud visuals while skipping unchanged copied subtrees during a mask
# update caused by another actor. The original all-copy path remains the control.
p=base/'cloud_visual.gd';s=p.read_text()
s=s.replace('\t\tvar copy: Node2D = depth_occluders[item]\n\t\tsync_visual(item, copy)', '\t\tvar copy: Node2D = depth_occluders[item]\n\t\tvar perf_token: Array = [item.global_transform, visual_inputs(item)]\n\t\tif Perf.flags.get("mask_copy_cache",false) and copy.get_meta("perf_copy_token",[]) == perf_token:\n\t\t\tcontinue\n\t\tcopy.set_meta("perf_copy_token",perf_token.duplicate(true))\n\t\tsync_visual(item, copy)')
p.write_text(s)
# Exact-input, bounded tree-texture reuse: attribution for inventory rebuilds.
# Keep the original pixel clipping path as the disabled control.
p=base/'tree_art.gd';s=p.read_text()
signature='static func texture_at(offset: Vector2, kind := "tree", stump := false, ground: Dictionary = {Vector2i.ZERO: true}) -> Texture2D:\n'
assert signature in s
if 'MAX_CACHED_TEXTURE_BYTES' in s:
 # Current production cache is on by default. Explicit false is the original
 # clipping control; never put a second prototype cache around production.
 s=s.replace(signature,signature+''' var perf = Engine.get_main_loop().root.get_node("Perf")
 var started := Time.get_ticks_usec()
 var result: Texture2D = _canonical_texture_at(offset,kind,stump,ground) if perf.flags.get("tree_texture_cache",true) else _research_texture_at(offset,kind,stump,ground)
 perf.record("tree_art.gd:texture_at",Time.get_ticks_usec()-started)
 return result

static func _research_texture_at(offset: Vector2, kind := "tree", stump := false, ground: Dictionary = {Vector2i.ZERO: true}) -> Texture2D:
 return _create_texture(offset,kind,stump,ground)

static func _canonical_texture_at(offset: Vector2, kind := "tree", stump := false, ground: Dictionary = {Vector2i.ZERO: true}) -> Texture2D:
''')
else:
 s=s.replace('static var sources := {}','static var perf_texture_cache := {}\nstatic var sources := {}')
 signature='static func texture_at(offset: Vector2, kind := "tree", stump := false, ground: Dictionary = {Vector2i.ZERO: true}) -> Texture2D:\n'
 assert signature in s
 s=s.replace(signature,signature+''' var perf = Engine.get_main_loop().root.get_node("Perf")
 var started := Time.get_ticks_usec()
 var tiles := ground.keys()
 tiles.sort()
 var token: Array = [offset,kind,stump,tiles]
 var cached := bool(perf.flags.get("tree_texture_cache",false))
 var result: Texture2D
 if cached and perf_texture_cache.has(token):
  result = perf_texture_cache[token]
 else:
  result = _research_texture_at(offset,kind,stump,ground)
  if cached:
   if perf_texture_cache.size() >= 16: perf_texture_cache.erase(perf_texture_cache.keys()[0])
   perf_texture_cache[token] = result
 perf.record("tree_art.gd:texture_at",Time.get_ticks_usec()-started)
 return result

static func _research_texture_at(offset: Vector2, kind := "tree", stump := false, ground: Dictionary = {Vector2i.ZERO: true}) -> Texture2D:
''')
s=re.sub(r'(?m)^( +)',lambda m:'\t'*len(m[1]),s)
p.write_text(s)
# Optional metadata probe generated from original PNGs by the offline baker.
metadata=pathlib.Path('.cache/tiny-swords-perf/cloud-metadata.json')
if metadata.exists():
 import json
 values=json.loads(metadata.read_text())
 if all('body_width' in x for x in values):
  p=base/'cloud_visual.gd';s=p.read_text().replace('extends Sprite2D','extends Sprite2D\nconst PERF_CLOUD_METADATA = '+json.dumps(values),1)
  s=s.replace('\tvar pixels: Image = ORIGINAL_VARIANTS[variant_index].get_image()', '\tif Perf.flags.get("cloud_metadata_cached",false):\n\t\tvar data = PERF_CLOUD_METADATA[variant_index]\n\t\tbaked_shadow_offset = Vector2(data.offset[0],data.offset[1])\n\t\tshadow_center = Vector2(data.center[0],data.center[1])\n\t\tset_altitude(altitude)\n\t\treturn\n\tvar pixels: Image = ORIGINAL_VARIANTS[variant_index].get_image()')
  s=s.replace('VARIANTS[next].get_image().get_used_rect().size.x < 400', '(PERF_CLOUD_METADATA[next].body_width if Perf.flags.get("cloud_metadata_cached",false) else VARIANTS[next].get_image().get_used_rect().size.x) < 400')
  s=s.replace('var painted_width := float(texture.get_image().get_used_rect().size.x)', 'var painted_width := float(PERF_CLOUD_METADATA[variant_index].body_width if Perf.flags.get("cloud_metadata_cached",false) else texture.get_image().get_used_rect().size.x)')
  p.write_text(s)
  p=base/'perf.gd';s=p.read_text().replace('  if command.type == "walk":','''  if command.type == "recycle":
   var clouds: Array = world.get_node("Clouds").get_children()
   for i in mini(clouds.size(),int(command.get("count",1))):
    var cloud = clouds[i]
    cloud.set_variant((cloud.variant_index+1)%8)
   JavaScriptBridge.eval("window.__cloudRecycleDone=%s" % command.id)
  if command.type == "walk":''');p.write_text(s)
# Native geometry parity and existing rendered cloud-depth regression checks.
tests=base.parent/'tests'
(tests/'research_tree_texture_parity.gd').write_text('''extends SceneTree
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.get_node("Perf").flags = {"tree_texture_cache":true}
 var art = load("res://scripts/tree_art.gd")
 var failures := 0
 var checked := 0
 var shared := {Vector2i.ZERO:true,Vector2i.RIGHT:true,Vector2i.DOWN:true,Vector2i(1,1):true}
 for kind in art.TEXTURES:
  for stump in [false,true]:
   for offset in [Vector2.ZERO,Vector2(-20,28),Vector2(20,28)]:
    for ground in [{Vector2i.ZERO:true},shared,{Vector2i.ZERO:true,Vector2i.LEFT:true}]:
     var expected: Texture2D = art._research_texture_at(offset,kind,stump,ground)
     var actual: Texture2D = art.texture_at(offset,kind,stump,ground)
     var again: Texture2D = art.texture_at(offset,kind,stump,ground)
     if expected.get_image().get_data() != actual.get_image().get_data() or actual != again or art.perf_texture_cache.size() > 16:
      failures += 1
      push_error("Tree texture cache changed pixels, missed exact reuse or exceeded its bound")
     checked += 1
 print("Tree texture exact parity: ","PASS" if failures==0 else "FAIL"," (",checked," cases)")
 quit(0 if failures==0 else 1)
''')
if 'MAX_CACHED_TEXTURE_BYTES' in (base/'tree_art.gd').read_text():
 p=tests/'research_tree_texture_parity.gd'
 p.write_text(p.read_text().replace('art.perf_texture_cache','art._texture_cache'))
source=(pathlib.Path.cwd()/'godot/tiny-swords/tests/tree_shadow_clipping.gd').read_text()
# CLI SceneTree scripts compile before autoload names become available. Load
# instrumented Layout lazily, once Perf has been registered.
source=re.sub(r'^const (Layout|Source) = preload\([^\n]+\)\n','',source,flags=re.M)
source=source.replace('preload("res://scripts/tree_art.gd")','load("res://scripts/tree_art.gd")')
# Current inventory previews show the replacement tree variant. The older test
# expected the planted variant; compare ghost pixels with an uncached clipping
# result for the actual replacement while keeping planted-shadow checks intact.
expected='load("res://scripts/tree_art.gd")._research_texture_at(level.layout.tree_offset(cell),level.terrain.tree_preview_variant(),false,load("res://scripts/tree_art.gd").shadow_ground(level.layout,cell)).get_image().get_data()'
if 'func placement_preview(' not in source:
 source=source.replace('ghost.get_data() != rendered.get_data()', 'ghost.get_data() != '+expected)
 source=source.replace('level.terrain.clipped_tree_preview_texture().get_image().get_data() != connected.get_data()', 'level.terrain.clipped_tree_preview_texture().get_image().get_data() != '+expected)
 source=source.replace('level.terrain.clipped_tree_preview_texture().get_image().get_data() != isolated.get_data()', 'level.terrain.clipped_tree_preview_texture().get_image().get_data() != '+expected)
(tests/'research_tree_shadow_clipping.gd').write_text(source.replace('func run() -> void:\n','func run() -> void:\n\troot.get_node("Perf").flags = {"tree_texture_cache":true}\n\tvar Layout = load("res://scripts/terrain_layout.gd")\n\tvar Source: Texture2D = load("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")\n',1))
source=(pathlib.Path.cwd()/'godot/tiny-swords/tests/cloud_depth.gd').read_text()
(tests/'research_cloud_depth.gd').write_text(source.replace('func run() -> void:\n','func run() -> void:\n\troot.get_node("Perf").flags = {"mask_copy_cache":true}\n',1))
(tests/'research_cloud_metadata.gd').write_text('''extends SceneTree
var failures := 0
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 var level = load("res://scenes/level_two_preview.tscn").instantiate()
 level.preview_save_enabled = false
 root.add_child(level)
 await process_frame
 level.process_mode = Node.PROCESS_MODE_DISABLED
 var cloud = level.get_node("Clouds/WestCloud")
 var perf = root.get_node("Perf")
 for variant in 8:
  for altitude in [0.0,0.3,1.0]:
   for mirrored in [false,true]:
    perf.flags = {}
    cloud.set_variant(variant)
    cloud.set_mirrored(mirrored)
    cloud.set_altitude(altitude)
    var before = [cloud.baked_shadow_offset,cloud.shadow_center,cloud.altitude,cloud.scale,cloud.shadow_sprite.position,cloud.shadow_sprite.scale,cloud.shadow_ground_position()]
    perf.flags = {"cloud_metadata_cached":true}
    cloud.set_variant(variant)
    cloud.set_mirrored(mirrored)
    cloud.set_altitude(altitude)
    var after = [cloud.baked_shadow_offset,cloud.shadow_center,cloud.altitude,cloud.scale,cloud.shadow_sprite.position,cloud.shadow_sprite.scale,cloud.shadow_ground_position()]
    if before != after:
     failures += 1
     push_error("Cached cloud metadata changed original geometry: %s / %s / %s" % [variant,altitude,mirrored])
 print("Cloud metadata exact parity: ","PASS" if failures==0 else "FAIL", " (48 variant/altitude/mirror cases)")
 quit(0 if failures==0 else 1)
''')

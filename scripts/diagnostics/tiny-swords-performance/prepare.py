import pathlib,shutil,re
root=pathlib.Path.cwd(); target=root/'.cache/tiny-swords-perf/project'
shutil.copytree(root/'godot/tiny-swords',target,ignore=shutil.ignore_patterns('.godot'),dirs_exist_ok=True)
shutil.copy(root/'scripts/tiny-swords-xp-bridge.gd',target/'scripts/xp_bridge.gd')
(target/'scenes/xp_preview.tscn').write_text('[gd_scene load_steps=3 format=3]\n\n[ext_resource type="PackedScene" path="res://scenes/level_two_preview.tscn" id="Base"]\n[ext_resource type="Script" path="res://scripts/xp_bridge.gd" id="XP"]\n\n[node name="StudyIsland" instance=ExtResource("Base")]\nscript = ExtResource("XP")\n')
config=(target/'project.godot').read_text().replace('res://scenes/level_two_preview.tscn','res://scenes/xp_preview.tscn')
config+='\n[autoload]\nPerf="*res://scripts/perf.gd"\n'
(target/'project.godot').write_text(config)
(target/'scripts/perf.gd').write_text('''extends Node
var totals := {}
var flags := {}
var elapsed := 0.0
func record(key: String, microseconds: int) -> void:
 if not totals.has(key): totals[key] = {"us":0,"calls":0,"max_us":0}
 totals[key].us += microseconds
 totals[key].calls += 1
 totals[key].max_us = maxi(totals[key].max_us,microseconds)
func _process(delta: float) -> void:
 elapsed += delta
 if elapsed < 1.0 or not OS.has_feature("web"): return
 var duration := elapsed
 elapsed = 0.0
 var incoming = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.__perfFlags || {})"))
 if incoming is Dictionary: flags = incoming
 Engine.max_fps = int(flags.get("cap",0))
 var world = get_tree().current_scene
 var data = {"seconds":duration,"timings":totals.duplicate(true),"fps":Engine.get_frames_per_second(),"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"objects":Performance.get_monitor(Performance.OBJECT_COUNT),"resources":Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),"orphans":Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"render_objects":Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),"process_s":Performance.get_monitor(Performance.TIME_PROCESS),"physics_s":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),"static_bytes":Performance.get_monitor(Performance.MEMORY_STATIC),"video_bytes":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED),"tiles":world.layout.cells.size(),"trees":world.layout.trees.size(),"sheep":world.layout.sheep.size(),"chickens":world.layout.chickens.size()}
 JavaScriptBridge.eval("window.__godotPerf=%s;window.__godotSamples=window.__godotSamples||[];window.__godotSamples.push(window.__godotPerf);if(window.__godotSamples.length>600)window.__godotSamples.shift()" % JSON.stringify(data))
 totals.clear()
''')
# Inclusive wall timings; overhead comparison is performed against untouched export.
files={'terrain_view.gd':['\tif Perf.flags.get("terrain_stop",false): return\n',''], 'environment_sprite.gd':['\tif Perf.flags.get("sprites_stop",false): return\n'], 'level_two_preview.gd':[''], 'sheep_visual.gd':['\tif Perf.flags.get("animals_stop",false): return\n'], 'pawn.gd':[''], 'house_construction.gd':['']}
for name,guards in files.items():
 p=target/'scripts'/name;s=p.read_text()
 for i,fn in enumerate(['_process','_draw']):
  pattern=r'func '+fn+r'\(([^\n]*)\) -> void:\n'
  m=re.search(pattern,s)
  if not m:continue
  arg=m.group(1).split(':')[0] if m.group(1) else ''
  guard=guards[i] if i<len(guards) else ''
  wrapper=f'func {fn}({m.group(1)}) -> void:\n{guard}\tvar perf_start := Time.get_ticks_usec()\n\t_perf{fn}({arg})\n\tPerf.record("{name}:{fn}",Time.get_ticks_usec()-perf_start)\n\nfunc _perf{fn}({m.group(1)}) -> void:\n'
  s=s[:m.start()]+wrapper+s[m.end():]
 p.write_text(s)
p=target/'scripts/xp_bridge.gd';s=p.read_text();s=s.replace('world_drag_threshold = 6.0','if not Perf.flags.get("layout_stop",false):\n\t\tworld_drag_threshold = 6.0');s=s.replace('\tsuper._process(delta)','\tvar perf_start := Time.get_ticks_usec()\n\tsuper._process(delta)\n\tPerf.record("bridge:super",Time.get_ticks_usec()-perf_start)\n\tif Perf.flags.get("bridge_stop",false): return\n\tperf_start = Time.get_ticks_usec()');s=s.replace('\tstudy_poll_elapsed += delta','\tPerf.record("bridge:css_read",Time.get_ticks_usec()-perf_start)\n\tstudy_poll_elapsed += delta');p.write_text(s)

from pathlib import Path
import re
base=Path('.cache/tiny-swords-perf/project/scripts')
p=base/'terrain_view.gd';s=p.read_text().replace('var changes:', 'var perf_accum := 0.0\nvar changes:');s=s.replace('\tif Perf.flags.get("terrain_stop",false): return', '\tif Perf.flags.get("terrain_stop",false): return\n\tif Perf.flags.get("terrain_hz",0) > 0:\n\t\tperf_accum += delta\n\t\tif perf_accum < 1.0 / float(Perf.flags.terrain_hz):\n\t\t\telapsed += delta\n\t\t\treturn\n\t\tperf_accum = 0.0');p.write_text(s)
for name,functions in {'level_two_preview.gd':['update_inventory_preview','inventory_changes','build_inventory_changes','update_cursor','land_route','clear_segment','rebuild_decorations'], 'house_construction.gd':['placement_plan'], 'terrain_layout.gd':['snapshot','path']}.items():
 p=base/name;s=p.read_text()
 for fn in functions:
  m=re.search(r'func '+fn+r'\(([^\n]*)\)( -> [^:\n]+)?:\n',s)
  if not m:continue
  args=[]
  for a in m.group(1).split(', '): args.append(a.split(':')[0].split('=')[0].strip())
  rettype=m.group(2) or '';returns=rettype!=' -> void'
  call='_perf_'+fn+'('+', '.join(args)+')'
  guard='\tif Perf.flags.get("preview_stop",false): return\n\tif Perf.flags.get("inventory_uncached",false):\n\t\tinventory_preview_inputs.clear()\n\t\tinventory_change_inputs.clear()\n' if fn=='update_inventory_preview' else ''
  wrapper=f'func {fn}({m.group(1)}){rettype}:\n{guard}\tvar perf_start := Time.get_ticks_usec()\n\t'+('var perf_result = ' if returns else '')+call+f'\n\tPerf.record("{name}:{fn}",Time.get_ticks_usec()-perf_start)\n'+('\treturn perf_result\n' if returns else '')+'\nfunc _perf_'+fn+'('+m.group(1)+')'+rettype+':\n'
  s=s[:m.start()]+wrapper+s[m.end():]
 p.write_text(s)
p=base/'perf.gd';s=p.read_text();s=s.replace(' var data = {',' var command = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.__perfCommand || null)"))\n if command is Dictionary:\n  JavaScriptBridge.eval("window.__perfCommand=null")\n  if command.type == "walk": world.walk_on_land(Vector2i(int(command.x),int(command.y)),world.layout.center(Vector2i(int(command.x),int(command.y))))\n  if command.type == "build":\n   world.layout.house_bundle = 6\n   world.layout.resources.wood = maxi(6,world.layout.resources.wood)\n   world.construction.open_placement()\n   world.construction.build(Vector2i(int(command.x),int(command.y)),Vector2.ZERO)\n  if command.type == "edit": world.toggle_editing()\n var data = {');s=s.replace('"tiles":world.layout.cells.size()', '"outline_cache":Outline.textures.size(),"cutting":world.harvesting.target,"construction":world.construction.phase,"editing":world.editing,"pawn":[world.pawn.position.x,world.pawn.position.y],"tiles":world.layout.cells.size()');s=s.replace('"cutting":world.harvesting.target,','');p.write_text(s)

from pathlib import Path
p=Path('.cache/tiny-swords-perf/project/scripts/cloud_visual.gd');s=p.read_text().replace('var variant_index := 0','var perf_mask_accum := 0\nvar variant_index := 0')
s=s.replace('func update_depth_mask() -> void:\n','''func update_depth_mask() -> void:
 if Perf.flags.get("mask_stop",false):
  depth_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
  material.set_shader_parameter("use_depth_mask",false)
  return
 if Perf.flags.get("mask_hz",0)>0:
  var now := Time.get_ticks_msec()
  if now - perf_mask_accum < 1000.0/float(Perf.flags.mask_hz): return
  perf_mask_accum = now
 var perf_start := Time.get_ticks_usec()
 _perf_update_depth_mask()
 Perf.record("cloud_visual.gd:mask",Time.get_ticks_usec()-perf_start)
func _perf_update_depth_mask() -> void:
''')
p.write_text(s)
# Include masks in telemetry as a count and total pixel area.
p=Path('.cache/tiny-swords-perf/project/scripts/perf.gd');s=p.read_text().replace(' var data = {',' var masks = []\n for c in get_tree().get_nodes_in_group("perf_clouds"):\n  masks.append({"width":c.depth_viewport.size.x,"height":c.depth_viewport.size.y,"occluders":c.depth_occluders.size(),"mode":c.depth_viewport.render_target_update_mode})\n var data = {"masks":masks,');p.write_text(s)
p=Path('.cache/tiny-swords-perf/project/scripts/cloud_visual.gd');s=p.read_text().replace('func _ready() -> void:\n','func _ready() -> void:\n\tadd_to_group("perf_clouds")\n');p.write_text(s)

# Normalize injected indentation to the existing tab-indented cloud script.
p=target/'scripts/cloud_visual.gd'
lines=[]
for line in p.read_text().splitlines():
    leading=len(line)-len(line.lstrip(' '))
    lines.append('\t'*leading+line[leading:] if leading else line)
p.write_text('\n'.join(lines)+'\n')
p=target/'scripts/perf.gd'
s=p.read_text().replace('extends Node','extends Node\nconst Outline = preload("res://scripts/inventory_outline.gd")')
s=s.replace('  if command.type == "edit": world.toggle_editing()', '  if command.type == "edit": world.toggle_editing()\n  if command.type == "cut": world.harvesting.start(Vector2i(int(command.x),int(command.y)))\n  if command.type == "cycle":\n   world.selected = "tree"\n   world.editing = true\n   world.ui.collapsed = false\n   world.apply_edit(Vector2i(int(command.x),int(command.y)))')
p.write_text(s)

# Diagnostic-only cached/removed shadow probes. Cache lacks production
# invalidation and must never be exported into the ordinary game build.
from pathlib import Path
import re
p=Path('.cache/tiny-swords-perf/project/scripts/terrain_view.gd');s=p.read_text().replace('var changes:', 'var perf_shadow_commands: Array = []\nvar changes:')
s=s.replace('func draw_shadows(height: float) -> void:\n', '''func draw_shadows(height: float) -> void:
	if Perf.flags.get("shadow_stop",false): return
	if Perf.flags.get("shadow_cache",false) and not perf_shadow_commands.is_empty():
		for command in perf_shadow_commands:
			draw_texture(command.texture,command.position)
		return
	perf_shadow_commands.clear()
	var perf_start := Time.get_ticks_usec()
	_perf_draw_shadows(height)
	Perf.record("terrain_view.gd:draw_shadows",Time.get_ticks_usec()-perf_start)
func _perf_draw_shadows(height: float) -> void:
''')
s=s.replace('\t\tshadow_textures.append(texture)\n', '\t\tshadow_textures.append(texture)\n\t\tif Perf.flags.get("shadow_cache",false): perf_shadow_commands.append({"texture":texture,"position":destination.position})\n')
for fn in ['shadow_receivers','add_shadow_receiver']:
 m=re.search(r'func '+fn+r'\(([^\n]*)\)( -> [^:\n]+)?:\n',s);args=[a.split(':')[0].strip() for a in m.group(1).split(', ')];returns=m.group(2)!=' -> void';ret=m.group(2) or '';call='_perf_'+fn+'('+', '.join(args)+')';wrapper=f'func {fn}({m.group(1)}){ret}:\n\tvar perf_start := Time.get_ticks_usec()\n\t'+('var perf_result = ' if returns else '')+call+f'\n\tPerf.record("terrain_view.gd:{fn}",Time.get_ticks_usec()-perf_start)\n'+('\treturn perf_result\n' if returns else '')+'\nfunc _perf_'+fn+'('+m.group(1)+')'+ret+':\n';s=s[:m.start()]+wrapper+s[m.end():]
p.write_text(s)

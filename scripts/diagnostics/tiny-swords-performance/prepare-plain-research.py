"""Plain export crossover: removes aggregate timing instrumentation overhead."""
import pathlib,shutil
root=pathlib.Path.cwd();target=root/'.cache/tiny-swords-perf/plain-project'
shutil.copytree(root/'.cache/tiny-swords-xp/project',target,dirs_exist_ok=True)
config=(target/'project.godot').read_text().replace('[autoload]','[autoload]\nCloudResearch="*res://scripts/cloud_research.gd"',1)
(target/'project.godot').write_text(config)
(target/'scripts/cloud_research.gd').write_text('''extends Node
const Originals = preload("res://scripts/cloud_visual.gd")
var elapsed := 0.0
var metric_elapsed := 0.0
var static_layer: Node2D
var mode := "animated"
func _process(delta: float) -> void:
 metric_elapsed += delta
 if metric_elapsed >= 1.0 and OS.has_feature("web"):
  var data = {"seconds":metric_elapsed,"fps":Engine.get_frames_per_second(),"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"process_s":Performance.get_monitor(Performance.TIME_PROCESS),"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT)}
  JavaScriptBridge.eval("window.__godotPerf=%s;window.__godotSamples=window.__godotSamples||[];window.__godotSamples.push(window.__godotPerf);if(window.__godotSamples.length>600)window.__godotSamples.shift()" % JSON.stringify(data))
  metric_elapsed = 0.0
 elapsed += delta
 if elapsed < 0.2 or not OS.has_feature("web"): return
 elapsed = 0.0
 var next = JavaScriptBridge.eval("window.__cloudResearchMode || 'animated'")
 if next == mode: return
 mode = next
 var world = get_tree().current_scene
 var enabled := mode == "static"
 for cloud in world.get_node("Clouds").get_children() + [world.get_node("PassingCloud")]:
  cloud.set_process(not enabled)
  if enabled:
   cloud.hide()
   if RenderingServer.frame_pre_draw.is_connected(cloud.update_depth_mask_frame):
    RenderingServer.frame_pre_draw.disconnect(cloud.update_depth_mask_frame)
   cloud.depth_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
  else:
   cloud.show()
   if cloud == world.get_node("PassingCloud"): cloud.visible = cloud.crossing and not cloud.inventory_hidden
   cloud.depth_inputs.clear()
   if not RenderingServer.frame_pre_draw.is_connected(cloud.update_depth_mask_frame):
    RenderingServer.frame_pre_draw.connect(cloud.update_depth_mask_frame)
 if static_layer == null:
  static_layer = Node2D.new()
  static_layer.name = "StaticOriginalClouds"
  static_layer.z_index = -19
  world.add_child(static_layer)
  var size := world.get_viewport().get_visible_rect().size
  for i in 4:
   var sprite := Sprite2D.new()
   sprite.texture = Originals.ORIGINAL_VARIANTS[[0,2,5,7][i]]
   sprite.scale = Vector2.ONE * 0.65
   sprite.position = world.get_viewport().canvas_transform.affine_inverse() * Vector2(70.0 if i%2==0 else size.x-70.0,75.0 if i<2 else size.y-90.0)
   static_layer.add_child(sprite)
 static_layer.visible = enabled
 JavaScriptBridge.eval("window.__cloudResearchApplied='%s'" % mode)
''')
print('Prepared plain crossover export at',target)

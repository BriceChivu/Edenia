# Animal staircase perspective

The pawn-specific ramp anchor made stationary sheep and chickens change visibility when the pawn moved. The baseline rendered regression had 32 failures in 256 overlapping cases.

TerrainDepth now orders each actor relative to each nearby ramp's sloped grass edge, retaining ordinary Y order as a tie-breaker and the existing floor Z levels. It leaves navigation coordinates and sprite artwork intact. The ordering runs after actor movement and caches unchanged scene inputs. Solid cliffs retain their near-edge anchor.

The rendered regression passes all 264 overlapping cases, including opposing actors on one ramp, both stair directions, and receiving heights zero and 64. The pawn's 24 edge cases and tree-cutting approach regressions also pass.

Run with the native renderer:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path godot/tiny-swords --script res://tests/animal_terrain_depth.gd --quit-after 4000
```

`before/` and `after/` contain matching raw Godot viewport screenshots. The three comparison images crop the same region from those screenshots, magnify pixels twice with nearest-neighbor sampling, and add labels. Only screenshot framing changes; game pixels are preserved.

The pawn comparison also replays the original sloped-edge and tree-cutting failures using source from before the pawn fixes. The real tree approach rendered 773 erroneous pixels over upper grass before the cliff fix, and zero after it.

The integrated preview rebuild completed successfully. Chrome loaded game export `a093c9ee2b7f2497c4757d674e61e8da56387a12772cd30bde4e15045f4329e0`. A manual cut of the golden tree beside the landing completed, with the lower-floor pawn covered by the landing. `browser-after.png` preserves the full native Chrome screenshot and `browser-tree-cutting-detail.png` crops the staircase/tree area.

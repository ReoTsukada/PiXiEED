# PiXiEEDraw2 Mode Authority Contract

This contract is permanent for Draw, Audio, and Game.

## Ownership

- Draw is the only writer of Draw raster, palette, layers, frames, FPS, and Draw history.
- Audio is the only writer of Audio assets, tracks, clips, notes, tempo, mixer, and Audio history.
- Game is the only writer of Game scenes, rules, runtime settings, and Game history.
- Switching modes never transfers write authority.

## Cross-mode behavior

Cross-mode access is read-only and limited to references, preview, playback,
monitoring, export composition, and elapsed-time synchronization.

- Draw may play an Audio reference but cannot change its speed, pitch, tempo,
  tracks, mixer, or source Project.
- Audio may monitor Draw artwork but cannot change Draw FPS, frame duration,
  pixels, layers, or source Project.
- Game may reference Draw and Audio assets but cannot edit either source.
- Cross-mode synchronization exchanges stable identities, revisions, and
  elapsed wall-clock time. It never copies one mode's authoring clock into
  another mode.

## History and persistence

- A read-only cross-mode preview creates no Journal entry and no Undo step.
- Editing a reference belongs to the referencing mode's history only.
- Editing source content belongs to the source mode's history only.
- PiXYNC applies operations to the owning subdocument only.
- Export may read all three subdocuments but cannot mutate any of them.

Any feature that requires a cross-mode write must be redesigned as a reference
or rejected; it must not add an exception to this contract.

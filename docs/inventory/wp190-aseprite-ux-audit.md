# WP-190 Aseprite UX Audit

Aseprite remains the minimum Pixel Art editing reference, not a code/UI/branding/format copy.
Status is based on actual Draw2 contracts and isolated controls, not file existence alone.

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Pencil | IMPLEMENTED | Stroke Core and Pen; pointer E2E remains untested |
| Eraser | IMPLEMENTED | Raster erase path and Tool boundary |
| Fill | IMPLEMENTED | Bounded Fill path |
| Line | PARTIAL | Interpolation exists; dedicated Tool UI is not final |
| Shapes | PLANNED | No dedicated Shape Tool yet |
| Selection | IMPLEMENTED | Selection/transform contract |
| Move | IMPLEMENTED | Move Preview/Commit |
| Transform | IMPLEMENTED | Preview/Cancel/Commit |
| Palette | IMPLEMENTED | Indexed palette |
| Layers | IMPLEMENTED | Layer tracks and visibility/lock direction |
| Frames | IMPLEMENTED | Frame commands |
| Cels | IMPLEMENTED | Layer×Frame×Cel model |
| Timeline | IMPLEMENTED | Bounded virtualized Timeline |
| Onion Skin | IMPLEMENTED | Non-destructive overlay |
| Playback | PARTIAL | Runtime Preview exists; full Editor playback UX is not final |
| Copy/Cut/Paste | IMPLEMENTED | Clipboard/transform contract |
| Undo/Redo | IMPLEMENTED | Atomic history boundary |
| Zoom/Pan | IMPLEMENTED | Viewport projection; device E2E untested |
| Shortcuts | PARTIAL | Versioned core set; final set not frozen |
| Temporary Tool Switching | PARTIAL | Shortcut boundary; hold gesture not final |
| Animation Tags | IMPLEMENTED | WP-170 Core |
| Slices | IMPLEMENTED | WP-170 Core; full visual authoring partial |
| Grid/Guides | IMPLEMENTED | Overlay boundary |
| Tile workflow | IMPLEMENTED | WP-170 Tile contract |

The audit does not promote Aseprite-level daily-production parity to PASS. Physical Mobile,
Stylus, Screen Reader, full pointer flow, and final polish remain separate gates.

# Draw selection operation table

| Input | Start behavior | Release / result |
| --- | --- | --- |
| Mouse drag, no modifier | Replace with rectangle, lasso, or same-color mask | Commit the new membership mask |
| Shift + mouse drag | Add pixels to the current mask | Union, including transparent cells |
| Ctrl / ⌘ + mouse drag | Remove dragged pixels from the current mask | Subtract membership; an empty mask clears selection |
| Alt + mouse drag | Preserve existing transform-body move behavior | Move the selected content; Alt at the pivot keeps the established pivot behavior |
| Touch / virtual drag | Start an additive selection anywhere in selection mode | Add rectangle/lasso cells; the body does not start a move |
| Touch / virtual drag on a dedicated handle | Operate that handle | Move, resize, rotate, pivot, or flip as before |
| Touch / virtual tap outside the current mask | Wait for the movement threshold before classifying it as a tap | Commit a pending transform and clear selection; same-color mode follows this rule too |
| Touch / virtual drag beyond the tap threshold | Keep the drag as a selection gesture | No outside-tap clear occurs |
| Pointer cancel / pinch transition during a pending tap | Discard the tap and its clear intent | No selection change |
| Mouse tap outside the current mask | Clear only in selection mode when the release remains within the board | Commit a pending transform and clear selection |
| Pointer cancel / capture loss | Restore the gesture's starting selection or transform | No partial selection is applied |
| Confirm / deselect toolbar | Commit a pending transform, then clear selection | Existing animation history records the content mutation once |
| Escape | Keep the existing rollback/cancel command behavior | Does not commit or delete document pixels |

Lasso membership is rasterized at pixel centers after implicitly closing the polygon. It is clipped to the canvas, independent of pixel opacity, and represented by the same full-canvas `Uint8Array` mask used by color selection, drawing limits, clipboard, and transforms.

The selection toolbar always exposes its 44px `確定・選択解除` action, including when there is no mask or all selected pixels are transparent. A dedicated move handle is placed inside the board edge so a full-canvas selection remains movable on touch screens; touch dragging the body remains an additive selection gesture.

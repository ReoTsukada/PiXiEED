# GAME-310 Input Actions Contract

Status: isolated reference implementation.

`ActionMap` maps keyboard, touch, gamepad, and custom device bindings to the same semantic `ActionId`. Enabled contexts are ordered by descending priority; a winning action returns `consumed: true` and can be represented as GAME-300 `BehaviorTrigger { type: "ACTION", actionId }`.

Control metadata uses normalized position/size inside the safe-area rectangle, explicit anchor/handedness, visible feedback, accessible name, and focus order. Duplicate bindings, equal-priority ambiguity, unsafe/out-of-bounds or invisible controls, and caller owner/project mismatch are invalid. `resolveInput` is fail-closed and returns no action for an invalid map or caller.

The core is pure TypeScript with no DOM, network, filesystem, production route, runtime, Registry, Queue, State, or Context dependency. Physical devices, browser behavior, and production integration are UNTESTED.

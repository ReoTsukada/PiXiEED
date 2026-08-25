# WP-090 Manual Test Matrix

This matrix is a gate record for the isolated Core Shell. It must not be reported as complete when
the environment cannot perform the listed manual operation.

| Area | Target | Status in this environment | Evidence / next gate |
| --- | --- | --- | --- |
| VoiceOver | macOS and iPhone | NOT RUN | Requires accessible-device/manual screen-reader session |
| TalkBack | Android | NOT RUN | Requires Android device or emulator with TalkBack |
| NVDA | Windows | NOT RUN | Requires Windows accessibility session |
| Keyboard | Skip Link, landmarks, Tab, Shift+Tab, Escape | AUTOMATED PASS | `test-core-shell-browser-wp090.mjs` |
| Focus | Route heading, nested overlay fallback, trap/restore | AUTOMATED PASS | Browser and interaction contract tests |
| Menu/Tabs | Arrow, Home, End, Enter/Space | AUTOMATED PASS | Browser test and pure contract fixture |
| Touch | 44px target, mobile nav, Sheet, safe area | AUTOMATED PASS | 390×844 and 540×900 fixtures |
| Stylus | Pointer ownership and cancellation | CONTRACT PASS | Pointer fixture; real stylus NOT RUN |
| Text Scaling | 100% and 200% | AUTOMATED PASS | Four viewport browser fixture |
| Reduced Motion | CSS transition/animation suppression | AUTOMATED PASS | `prefers-reduced-motion: reduce` fixture |
| High Contrast | Forced-colors boundary | CONTRACT/CSS PASS | Real OS high-contrast mode NOT RUN |
| Light/Dark | Four viewport visual baselines | REGISTERED | 64 deterministic PNG baselines |
| System Theme | Browser media preference | AUTOMATED IN WP-080 | Canonical pixel color invariant preserved |
| Offline | State label and recovery route | AUTOMATED PASS | Async state fixture |
| Permission Denied | No data/chunk disclosure | AUTOMATED PASS | 403 server contract and denied preview |
| Session Expired | Preserve local/unsynced work | CONTRACT PASS | Async recovery contract; real session NOT RUN |
| Error | Persistent summary and field association | CONTRACT PASS | Error summary contract; real form NOT RUN |
| Mobile lifecycle | Background/foreground, orientation, keyboard | NOT RUN | Assign to device validation gate before WP-100 |

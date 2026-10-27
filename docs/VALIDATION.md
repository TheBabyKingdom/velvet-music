# Validation for the supplied build

Automated checks on 27 October 2026 passed for audio-setting validation, Audio Lab control routing, provider-link validation, recommendation filters, native import previews, duplicate detection, playlist formats, atomic saving and recovery. A separate backend exercise imported the three real WAV demo files and verified state after reopening the saved library.

The full Electron desktop and OfflineAudioContext tests are included but did not run successfully in this execution environment: the hidden desktop test process exits before JavaScript starts (Windows status 0x80000003). No hardware listening or final visual inspection is claimed for this build. Run `pnpm run test:desktop` on a normal Windows desktop to execute those checks. The application contains real Web Audio processing; a passing settings/control test is not a substitute for those outstanding sound checks.

The release is unsigned. Extract the full Windows ZIP into one folder and open Velvet.exe. Keep the runtime files beside it.

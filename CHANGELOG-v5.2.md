# ChitraGuess India v5.2 – Requested feature updates

## Included
- Increased server-side drawing stroke history limit from 5,000 to 15,000 segments, allowing longer undo/redo sequences while keeping a bounded memory limit.
- Correct-guess chat events now trigger a short three-note celebratory sound (when browser audio is available) and a visible toast.
- Added animated correct-guess feedback and leaderboard row entrance animations.
- Retained the existing responsive game-over modal and ranked final leaderboard in the v5.1 source.

## Not included yet
- Group voice chat, host-forced microphone mute, and muted-by-default controls are not implemented in this package. A secure multi-user voice system needs WebRTC signaling plus a TURN relay for reliable connectivity across mobile networks/NATs. It also needs explicit browser microphone permission and host authorization. This should be implemented as a separately tested feature, not represented as complete by a UI-only change.

## Validation
- Source edits applied. Full npm/TypeScript production build was not verified in this environment because dependency installation timed out.

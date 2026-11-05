# ChitraGuess India v2 – Mobile & Gameplay Update

## Changes

- Added native Share Room action and Copy Code fallback. Shared links prefill the room code for the recipient.
- Intercepts browser Back while a room is active and asks the player to use the in-game Leave Room action.
- Added Socket.IO connection-state recovery (up to 2 minutes) and a 90-second server-side disconnect grace period.
- Retains/replays up to 5,000 drawing stroke segments when a recovered player reconnects.
- Mobile portrait: fixed bottom guess bar, internally scrolling chat messages, and more compact board layout.
- Mobile landscape: drawing canvas and chat are shown side-by-side.
- Increased drawing/guess time from 80 to 120 seconds.
- Delays hints and reveals at most two letters (never all letters); hides hints from the drawer.
- Expanded recognizable Bollywood/Marathi movie and song word lists.
- Added Indian States & Cities category with state/city pairs across states and union territories.
- Fixed the saved round answer when the drawer chooses one of the alternate word options.

## Verification

TypeScript transpilation/syntax checks passed for the modified TypeScript files. A full dependency install and application build were not completed in the packaging environment; run `npm.cmd install` and `npm.cmd run build` on the Windows development machine before deployment.

## v3 requested improvements
- Added an always-visible, fixed end-of-game results dialog with final leaderboard and Exit / Play Again actions. Only the room host can restart; other players see a waiting message.
- Newest chat messages are displayed at the top so mobile players see updates without scrolling down.
- Added the Everyday Objects category with familiar home, street, weather, furniture, transport and daily-use words.
- Added Hindi/Marathi answer aliases for common Everyday Objects and Devanagari-to-Latin normalization for typed guesses.
- Correct guesses continue to award points to each player once per round; the drawer also earns the drawing bonus for each successful guess.


## v4 gameplay and language update
- Final-game result dialog now announces the top scorer and exposes Play Again (host) and Exit immediately after the last round. Result dialog is sized for mobile viewports with visible sticky actions.
- Accepted correct guesses award points to each player once per round; the drawer receives a teamwork bonus for each correct guess.
- Portrait mobile layout puts live chat above the drawing board so the latest messages are visible without scrolling to the bottom of the page. Messages remain newest-first and auto-anchor to the top.
- Added/confirmed the Everyday Objects category with common household items, rooms, street and nature words.
- Expanded Hindi/Marathi Devanagari aliases across popular Hindi and Marathi films, songs, cities, festivals, culture and cricket.

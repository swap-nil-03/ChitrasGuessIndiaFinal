# ChitraGuess India v5 – Gameplay update

- Mobile waiting-room host controls now show the Start Game button before the board, with round selection beside it.
- Added host-selectable 1–10 rounds; default is 4. The selected round count is sent to the server and reused with Play Again.
- Added server-authoritative Undo and Redo for drawing; all players see the same canvas state.
- Everyday Objects is the first category and the only category selected by default. At least one category must remain selected.
- Improved word variety by avoiding recently used answers in the same category (up to 30 recent answers).
- Kept Unicode/Devanagari answer normalization and Hindi/Marathi aliases for guess matching.
- Added a clear selected-word display for the drawer after choosing a word.
- If the socket is disconnected, server actions show: “Server is connecting. Please wait 10–15 seconds and try again.”
- Chat and drawing state are cleared when a new game/restart begins.

## Deployment
Commit and push the updated `client/` and `server/` folders to the existing `main` branch. Render will redeploy from GitHub. No new paid Render services are required.

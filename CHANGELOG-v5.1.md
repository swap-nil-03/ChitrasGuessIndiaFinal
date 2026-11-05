# ChitraGuess India v5.1 – Browser Update Fix

- Removed the legacy service worker that cached the app shell and could serve stale frontend files after deployment.
- On page load, unregisters previously installed service workers and clears their Cache Storage entries.
- The app now loads frontend assets from the current deployment rather than an old offline cache.
- Existing players may need one final refresh after this release to remove the old cached app; future deployments should load the latest version normally.

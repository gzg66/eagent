# Changelog

## Unreleased

- Kept file-read results out of the Web chat UI and made read rows non-expandable while preserving paths and errors.
- Restored persistent session lists and on-demand history after service restarts without automatically selecting a session.
- Added cursor-based SSE replay, a Stop/Stopping control for active turns, persistent session renaming, and exact workspace deletion.
- Removed Tasks polling and presentation from the right inspector while retaining Trace events.

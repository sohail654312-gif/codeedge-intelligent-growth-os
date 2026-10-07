# Codeedge Intelligent Growth OS (CIGO)

Canonical repository for the Codeedge Intelligent Growth OS.

CIGO is the intelligence, business-memory, decision-support, planning and controlled-orchestration layer above the protected Codeedge MVP and Codeedge Business OS.

Existing Codeedge repositories are read-only references unless separately and explicitly authorized.

## Synthetic intelligence preview

The child preview branch adds a Codeedge-branded, read-only interface in `apps/preview`, separate from the reusable engine. Run `npm run preview:build` and `npm run preview:serve`, then open `http://127.0.0.1:4173`. It publishes synthetic fixtures only and has no live backend or action authority. See [preview architecture and acceptance](docs/preview/CODEEDGE-PREVIEW-UI.md).

# BidVolt local ONLYOFFICE

This development-only stack runs one shared ONLYOFFICE Document Server and a
small integration bridge. It uses the repository's ignored `.local-artifacts`
Office files to exercise opening, editing, explicit save choices, callbacks and
version history without changing the remote backend.

The Compose file pins the locally verified ONLYOFFICE Docs 9.4.0-129 image
digest so a later upstream `latest` release cannot silently break the test flow.

## Start

Docker Desktop must be running. From this directory:

```powershell
./fonts/prepare-fonts.ps1
Copy-Item .env.example .env
docker compose up -d
docker compose ps
docker exec bidvolt-onlyoffice bash /usr/share/fonts/truetype/bidvolt/refresh-fonts.sh
```

The configured Chinese fonts are licensed open-source substitutes, not Microsoft
font originals. See [font setup and licensing](fonts/README.md). Install and verify
the pinned font assets before enabling the working-copy substitution mapping.

Open <http://localhost:8081/demo>, choose a real local result file, and select
**打开编辑**. ONLYOFFICE itself is available at
<http://localhost:8080> and the bridge health endpoint is
<http://localhost:8081/health>.

Stop the containers without deleting saved test versions:

```powershell
docker compose down
```

To remove all local ONLYOFFICE data and saved test versions as well, explicitly
run `docker compose down --volumes`.

## Frontend integration contract

1. Load `${documentServerUrl}/web-apps/apps/api/documents/api.js` once.
2. `GET http://localhost:8081/api/files` lists the allowlisted local DOCX/XLSX files.
   Each item includes `latestVersion` (`0` means the read-only mounted source is
   still current).
3. Project and enterprise source documents that come from the backend can be
   registered for a local Office session with
   `POST /api/imported-files?sourceKey=...&name=...`; send the original Office
   bytes as the request body. The bridge accepts DOC/DOCX, XLS/XLSX and PPT/PPTX
   up to 100 MB and stores them only in its local Docker data volume.
4. `POST http://localhost:8081/api/editor-sessions` with
   `{ "fileId": "...", "mode": "edit", "version": 0, "displayName": "...", "user": { "id": "...", "name": "..." } }`.
   Omit `version` to open the latest version; `0` selects the original version.
5. Construct `new DocsAPI.DocEditor(elementId, response.editorConfig)`.
6. Poll `GET http://localhost:8081/api/editor-sessions/{sessionId}` only when the
   surrounding BidVolt UI needs to display save state.
7. `GET http://localhost:8081/api/files/{fileId}/versions` returns versions
   newest-first including original version `0`, size, save time, actual
   `fileType`, `isCurrent`, and download URL. `GET /api/files` and the import
   response also include the short `versions` list. Imported files persist
   `sourceKey` so the frontend can associate their history after a reload.

The returned `editorConfig` is JWT-signed. The document URL and callback URL use
the Compose-internal bridge address so Document Server can reach them. Browser
code does not receive storage credentials. The bridge only accepts callback
downloads from the allowlisted internal Document Server origin, rejects redirects,
and limits streamed downloads to 100 MB. A successful ONLYOFFICE status 2 or 6
callback saves a session draft in the `editor_versions` volume, **not a formal
version**. Mounted source files are never overwritten. Session metadata and
drafts survive bridge restarts; an interrupted explicit save is reported for
confirmation rather than automatically retried.

### Editable working copies and save decisions

Each session has its own key and a snapshot of the selected version. An edit
session removes Word's `documentProtection` element only in its private DOCX
working copy. Every unmodified ZIP entry (including media and relationships)
keeps its original compressed bytes. Viewer sessions keep the source bytes.
Legacy DOC/XLS/PPT edit sessions use the local Document Server conversion API to
create a DOCX/XLSX/PPTX working copy first. A converted DOCX has protection removed
before the editor opens; conversion errors are explicit and the source remains
untouched. New versions expose their actual OOXML `fileType`.

`GET /api/editor-sessions/{id}` includes:

- `baseVersion`: the version the working content is based on;
- `draftRevision`: increases when callback bytes change;
- `decisionRevision`: increases on each native editor Save callback, even when
  the text matches a previously dismissed save dialog;
- `needsDecision`: only a native Save (`forcesavetype: 1`) requests the chooser;
  timer/close callbacks do not interrupt the user with a dialog;
- `pendingSave`: `null` or `{ requestId, strategy, startedAt }`;
- `savedVersion`, `savedRevision`, `lastSaveRequestId`, `savedAt`: the latest
  explicit-save result; use `savedRevision` to detect another overwrite of the
  same version, not only a change in `savedVersion`;
- `saveError`: `null` or `{ code, message, requestId? }`. Associate asynchronous
  errors with the active request ID so an older poll cannot unlock a newer save;
- `editablePreparation`: reports `protectionRemoved`, optional conversion
  details and the list of explicit font substitutions applied to the copy.

After the user chooses a strategy, send `POST /api/editor-sessions/{id}/save`:

```json
{ "strategy": "new-version", "requestId": "a-new-UUID-for-this-save" }
```

`strategy` is `new-version` or `overwrite`. Keep the same `requestId` when
retrying an uncertain request. Reusing one ID with a different strategy is
rejected. The bridge requests a fresh snapshot through the official force-save
command and commits only its correlated callback. A `202` response is pending;
poll until the matching request completes or fails. A `200` can mean the save
completed immediately. When Docs reports no new edits, an explicit new-version
choice still saves the prepared current working copy, including protection/font
changes; it does not silently return the protected source as the new version.

New-version saves allocate the next version under a per-file lock. Overwrite
checks the selected version's opening/content hash again at commit time and
returns a conflict instead of replacing another session's newer content.
Conflicted drafts remain available to save as a new version. A successful save
updates the session baseline so it can be edited and saved again.

Every overwrite first creates a recoverable binary backup and metadata. Version
`0` overwrites are a logical overlay in the data volume, not writes into the
read-only source mount. The version-history response supplies `originalUrl` for
the unchanged source plus `recoveryBackups` with downloadable overwritten bytes.
There is no automatic deletion of prior versions or recovery copies.

### Optional explicit font substitutions

The default font mapping is empty. After installing licensed replacement fonts
in Document Server, configure `BIDVOLT_OFFICE_FONT_SUBSTITUTIONS_JSON` as a JSON
object, for example `{"宋体":"Source Han Serif CN"}`. Invalid or chained maps
are rejected on startup. The private DOCX working copy updates only explicit
Word and DrawingML font attributes, not body text, images or relationship data.
The session reports `{ from, to, count }` for each substitution so the frontend
can disclose it. This is an approximate font replacement, not a claim that a
different family is the original font. The original document remains intact.

Run the isolated store, conversion-client, ZIP preservation and selection tests:

```powershell
node --test bridge/document-store.test.mjs bridge/document-server-client.test.mjs bridge/docx-editable-copy.test.mjs bridge/font-substitutions.test.mjs bridge/selection-bridge.test.mjs
```

### Read-only selection quotes (Community Docs)

The editor session request optionally accepts:

```json
{
  "selectionBridge": {
    "channel": "aae2e532-b2ba-4881-b83f-14c5873a5e55",
    "hostOrigin": "http://127.0.0.1:4173"
  }
}
```

Generate a new UUID channel for each mounted editor. Only canonical HTTP(S)
origins on `localhost`, `127.0.0.1` or `[::1]` are accepted by this local bridge.
The response includes `{ "selectionBridge": { "channel": "...", "origin":
"http://localhost:8081" } }` and adds the background selection plugin to the
JWT-signed editor config before signing. `origin` is the plugin origin, not the
frontend origin. Existing clients that omit this parameter do not load a plugin.

The plugin uses the local Document Server's `/sdkjs-plugins/v1/plugins.js` and
the official read-only `GetSelectedText` Plugins API, not the separately
licensed `createConnector` Automation API. It works in Word, spreadsheet and
presentation sessions, including viewer sessions. The entry points are:

- `/plugins/bidvolt-selection/config.json?channel=...&hostOrigin=...`
- `/plugins/bidvolt-selection/index.html?channel=...&hostOrigin=...`
- `/plugins/bidvolt-selection/selection.js`

The variation's entry URL is relative because Docs 9.4 prefixes the config
directory itself. Its final `sdkSuffix` parameter absorbs Docs' unconditional
language query suffix, preserving the origin/channel. A bare `config.json`
request returns only stable metadata/GUID for the plugin SDK's own bootstrap;
session parameters are still required on `index.html`.

On initialization the plugin sends `{ type: "bidvolt-office-selection-ready",
channel }` to `window.top` with the exact `hostOrigin`. The frontend validates
the returned plugin origin and channel and retains `event.source` for requests.
On a user quote action, send that source `{ type:
"bidvolt-office-selection-request", channel, requestId }` with the response's
plugin origin as `targetOrigin`. The plugin accepts messages only from the top
window with the exact frontend origin and channel. It responds with `{ type:
"bidvolt-office-selection-result", channel, requestId, text, error? }`.
`requestId` is 1–128 ASCII letters, digits, underscores or hyphens. SDK failures,
timeouts and overlapping requests have explicit errors; an empty selection
returns empty text rather than silently quoting the entire file.

Selected text stays in browser memory, is read only after the explicit quote
request, and is never saved by the bridge or sent to an Agent automatically.
This plugin never writes to the document. After updating from the single-file
mount, recreate only the bridge so the plugin module/static files are mounted:

```powershell
docker compose up -d --no-deps --force-recreate editor-bridge
node --test bridge/selection-bridge.test.mjs
```

References: [editor plugin configuration](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/plugins/)
and [GetSelectedText](https://api.onlyoffice.com/docs/plugins/interacting-with-editors/document-api/Methods/GetSelectedText/).

## Production boundary

This bridge intentionally has permissive browser CORS and local-volume sessions so
the local workflow is easy to test. Production must move session creation and
callback handling into the authenticated BidVolt backend and revalidate tenant,
project, file, user, permission, and expected version on every request. Use a
random external secret, HTTPS, expiring file URLs, durable session/event records,
callback idempotency, file type/size checks, malware scanning, and shared object
storage. Do not expose this bridge directly to the internet.

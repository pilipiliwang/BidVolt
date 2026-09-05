"""Read-only source audit; creates isolated edit sessions but never saves versions."""
import hashlib
import io
import json
import struct
import urllib.request
import zipfile

BRIDGE = "http://localhost:8081"


def request(path, body=None):
    raw = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(BRIDGE + path, data=raw, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def data(path, body=None):
    return json.loads(request(path, body))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def zip_entries(value):
    with zipfile.ZipFile(io.BytesIO(value)) as archive:
        entries = {}
        for item in archive.infolist():
            name_length, extra_length = struct.unpack_from("<HH", value, item.header_offset + 26)
            end = item.header_offset + 30 + name_length + extra_length + item.compress_size
            entries[item.filename] = {
                "plain": digest(archive.read(item)),
                "raw": digest(value[item.header_offset:end]),
            }
        protection = "documentProtection" in archive.read("word/settings.xml").decode("utf-8") if "word/settings.xml" in entries else False
    return entries, protection


def main():
    items = data("/api/files")["items"]
    project = [item for item in items if item["relative"].startswith("project-207/") and item["name"].endswith(".docx")]
    legacy = next(item for item in items if item["name"].endswith(".doc") and "合同条款" in item["name"])
    results = []
    for item in project + [legacy]:
        file_id = item["id"]
        before = request(f"/files/{file_id}/original")
        history_before = data(f"/api/files/{file_id}/versions")
        session = data("/api/editor-sessions", {"fileId": file_id, "mode": "edit", "version": 0, "displayName": item["name"]})
        working = request(f"/files/{file_id}/sessions/{session['sessionId']}")
        after = request(f"/files/{file_id}/original")
        history_after = data(f"/api/files/{file_id}/versions")
        original_unchanged = digest(before) == digest(after)
        versions_unchanged = history_before["versions"] == history_after["versions"]
        working_entries, working_protection = zip_entries(working)
        result = {"file": item["name"], "id": file_id, "legacy": item is legacy,
                  "sourceUnchanged": original_unchanged, "versionsUnchanged": versions_unchanged,
                  "fileType": session["editorConfig"]["document"]["fileType"], "protectedWorkingCopy": working_protection,
                  "preparation": session["editablePreparation"]}
        if item is not legacy:
            original_entries, source_protection = zip_entries(before)
            media = [name for name in original_entries if "/media/" in name]
            relationship = [name for name in original_entries if name.endswith(".rels") or name == "[Content_Types].xml"]
            result.update({"protectedSource": source_protection, "entryCountUnchanged": set(original_entries) == set(working_entries),
                           "mediaCount": len(media), "mediaBytesUnchanged": all(original_entries[name] == working_entries.get(name) for name in media),
                           "relationshipsUnchanged": all(original_entries[name] == working_entries.get(name) for name in relationship)})
        assert original_unchanged and versions_unchanged and not working_protection, result
        if item is not legacy:
            assert result["entryCountUnchanged"] and result["mediaBytesUnchanged"] and result["relationshipsUnchanged"], result
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    print(json.dumps({"docxCount": len(project), "legacyCount": 1, "totalMedia": sum(item.get("mediaCount", 0) for item in results),
                      "allChecksPassed": True}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

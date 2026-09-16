"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { FiPlus, FiTrash2, FiVideo, FiMic, FiFile, FiType, FiX, FiSquare } from "react-icons/fi";
import { C, Panel, Field, TextArea, Segmented, primaryBtn, ghostBtn, fmtDateLong } from "./ui";
import { dbGetAll, dbGet, dbPut, dbDelete, uid, todayStr, compressImage } from "@/lib/storage";
import type { Memory, Attachment, MemoryType } from "@/types/life";

const MAX_RAW_BYTES = 8 * 1024 * 1024; // 8MB safety cap for non-photo attachments (data-URL storage)

function groupByDate(items: Memory[]): [string, Memory[]][] {
  const map: Record<string, Memory[]> = {};
  items.forEach((m) => {
    (map[m.date] = map[m.date] || []).push(m);
  });
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

export default function Memories() {
  const [items, setItems] = useState<Memory[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment | null>>({});
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Memory | null>(null);

  const reload = useCallback(async () => {
    const rows = await dbGetAll("memories");
    setItems(rows);
    const atts: Record<string, Attachment | null> = {};
    for (const m of rows) {
      if (m.attachmentId && !atts[m.attachmentId]) atts[m.attachmentId] = await dbGet("attachments", m.attachmentId);
    }
    setAttachments(atts);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const grouped = groupByDate(items);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Memories</div>
        <button onClick={() => setAdding((s) => !s)} style={{ ...primaryBtn, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <FiPlus /> Add
        </button>
      </div>

      {adding && (
        <Panel>
          <MemoryForm onDone={() => { setAdding(false); reload(); }} />
        </Panel>
      )}

      {grouped.length === 0 && !adding && (
        <Panel>
          <div style={{ fontSize: 13, color: C.inkFaint }}>No memories yet.</div>
        </Panel>
      )}

      {grouped.map(([date, mems]) => (
        <Panel key={date} title={fmtDateLong(date)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
            {mems.map((m) => {
              const att = m.attachmentId ? attachments[m.attachmentId] : null;
              return (
                <div key={m.id} onClick={() => setViewing(m)} style={{ cursor: "pointer", background: C.panelRaised, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {m.type === "photo" && att ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={att.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : m.type === "video" ? (
                    <FiVideo size={22} color={C.inkDim} />
                  ) : m.type === "voice" ? (
                    <FiMic size={22} color={C.inkDim} />
                  ) : m.type === "file" ? (
                    <FiFile size={22} color={C.inkDim} />
                  ) : (
                    <FiType size={22} color={C.inkDim} />
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ))}

      {viewing && (
        <MemoryViewer
          memory={viewing}
          attachment={viewing.attachmentId ? attachments[viewing.attachmentId] : null}
          onClose={() => setViewing(null)}
          onDeleted={() => { setViewing(null); reload(); }}
        />
      )}
    </div>
  );
}

function MemoryViewer({
  memory,
  attachment,
  onClose,
  onDeleted,
}: {
  memory: Memory;
  attachment: Attachment | null | undefined;
  onClose: () => void;
  onDeleted: () => void;
}) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.inkFaint }}>{fmtDateLong(memory.date)}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.inkDim, cursor: "pointer" }}>
            <FiX />
          </button>
        </div>
        {memory.type === "photo" && attachment && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.dataUrl} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />
        )}
        {memory.type === "video" && attachment && <video src={attachment.dataUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />}
        {memory.type === "voice" && attachment && <audio src={attachment.dataUrl} controls style={{ width: "100%", marginBottom: 10 }} />}
        {memory.type === "file" && attachment && (
          <a href={attachment.dataUrl} download={attachment.filename} style={{ color: C.accent, fontSize: 13 }}>
            Download {attachment.filename}
          </a>
        )}
        {memory.text && <div style={{ fontSize: 14, color: C.ink, marginBottom: 10 }}>{memory.text}</div>}
        <button
          onClick={async () => {
            await dbDelete("memories", memory.id);
            if (memory.attachmentId) await dbDelete("attachments", memory.attachmentId);
            onDeleted();
          }}
          style={{ background: "none", border: "none", color: C.bad, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
        >
          <FiTrash2 size={13} /> Delete memory
        </button>
      </div>
    </div>
  );
}

function MemoryForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<MemoryType>("photo");
  const [date, setDate] = useState(todayStr());
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        setRecordedBlob(new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      setError("Microphone unavailable: " + (e instanceof Error ? e.message : "permission denied"));
    }
  }
  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      let attachmentId: string | null = null;
      if (kind === "photo" && file) {
        const dataUrl = await compressImage(file);
        attachmentId = uid();
        await dbPut("attachments", { id: attachmentId, mime: "image/jpeg", dataUrl, filename: file.name });
      } else if (kind === "voice" && recordedBlob) {
        if (recordedBlob.size > MAX_RAW_BYTES) throw new Error("Recording too large to store (try a shorter clip).");
        const dataUrl = await blobToDataUrl(recordedBlob);
        attachmentId = uid();
        await dbPut("attachments", { id: attachmentId, mime: recordedBlob.type, dataUrl, filename: `voice-${Date.now()}.webm` });
      } else if ((kind === "video" || kind === "file") && file) {
        if (file.size > MAX_RAW_BYTES) throw new Error("File too large to store on-device this way (max ~8MB in this version).");
        const dataUrl = await blobToDataUrl(file);
        attachmentId = uid();
        await dbPut("attachments", { id: attachmentId, mime: file.type, dataUrl, filename: file.name });
      }
      await dbPut("memories", { id: uid(), date, type: kind, text: text.trim(), attachmentId, createdAt: Date.now() });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this memory.");
    } finally {
      setBusy(false);
    }
  }

  const canSave = kind === "text" ? text.trim().length > 0 : kind === "voice" ? !!recordedBlob : !!file;

  return (
    <div>
      <Field label="Type">
        <Segmented
          value={kind}
          onChange={(v) => { setKind(v as MemoryType); setFile(null); setRecordedBlob(null); setError(""); }}
          options={[
            { value: "photo", label: "Photo" },
            { value: "video", label: "Video" },
            { value: "voice", label: "Voice" },
            { value: "file", label: "File" },
            { value: "text", label: "Text" },
          ]}
        />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: C.bgAlt, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: "8px 10px", fontSize: 13 }} />
      </Field>

      {kind === "photo" && (
        <Field label="Choose photo">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: C.inkDim, fontSize: 13 }} />
        </Field>
      )}
      {kind === "video" && (
        <Field label="Choose video" hint="Stored on-device; large videos may exceed the size limit in this version.">
          <input type="file" accept="video/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: C.inkDim, fontSize: 13 }} />
        </Field>
      )}
      {kind === "file" && (
        <Field label="Choose file">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: C.inkDim, fontSize: 13 }} />
        </Field>
      )}
      {kind === "voice" && (
        <Field label="Voice note" hint="Uses the microphone — Android will ask for permission the first time.">
          {!recording && !recordedBlob && (
            <button onClick={startRecording} style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
              <FiMic /> Start recording
            </button>
          )}
          {recording && (
            <button onClick={stopRecording} style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6 }}>
              <FiSquare /> Stop
            </button>
          )}
          {recordedBlob && !recording && (
            <div>
              <audio src={URL.createObjectURL(recordedBlob)} controls style={{ width: "100%", marginBottom: 6 }} />
              <button onClick={() => setRecordedBlob(null)} style={ghostBtn}>
                Re-record
              </button>
            </div>
          )}
        </Field>
      )}

      <Field label={kind === "text" ? "Memory" : "Note (optional)"}>
        <TextArea value={text} onChange={setText} rows={3} placeholder="What made this worth remembering?" />
      </Field>

      {error && <div style={{ fontSize: 12, color: C.bad, marginBottom: 8 }}>{error}</div>}

      <button disabled={!canSave || busy} onClick={save} style={{ ...primaryBtn, width: "100%", opacity: !canSave || busy ? 0.5 : 1 }}>
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Gravação de chamada iniciada na Pré-ligação e consumida na Pós-ligação.
// O blob fica em memória (não é persistido) e é entregue à aba de Pós-ligação
// através de eventos de janela.

export const RECORDER_EVENT = "bhm:call-recorder-updated";
export const PENDING_AUDIO_EVENT = "bhm:call-audio-ready";
export const GO_POS_EVENT = "bhm:go-pos-ligacao";
/** Disparado quando o VAD descarta uma gravação sem fala (ligação não atendida). */
export const RECORDER_DISCARDED_EVENT = "bhm:call-recorder-discarded";

export type PendingAudio = {
  /** Identificador da tentativa — permite descartar/transcrever uma específica. */
  id: string;
  blob: Blob;
  filename: string;
  duracaoSeg: number;
  empresa?: string | null;
  /** Horário em que a gravação foi encerrada (ISO). */
  gravadoEm: string;
};

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let pendingList: PendingAudio[] = [];

// ---- VAD (detecção automática de voz) ----
let audioCtx: AudioContext | null = null;
let vadRaf: number | null = null;
let vadTimeout: number | null = null;
let speechDetected = false;

function teardownVad() {
  if (vadRaf !== null) cancelAnimationFrame(vadRaf);
  vadRaf = null;
  if (vadTimeout !== null) window.clearTimeout(vadTimeout);
  vadTimeout = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
}

/** Detecção de voz apenas informativa — NUNCA descarta a gravação. */
function setupVad(media: MediaStream) {
  speechDetected = false;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtx = ctx;
    const source = ctx.createMediaStreamSource(media);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let acima = 0;
    const loop = () => {
      if (!audioCtx || speechDetected) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // ~ -45 dBFS: fala real passa; ruído de linha/silêncio não.
      acima = rms > 0.012 ? acima + 1 : 0;
      if (acima >= 5) {
        speechDetected = true;
        if (vadTimeout !== null) window.clearTimeout(vadTimeout);
        vadTimeout = null;
        return;
      }
      vadRaf = requestAnimationFrame(loop);
    };
    vadRaf = requestAnimationFrame(loop);
  } catch {
    // Sem VAD disponível: a gravação segue normalmente.
    speechDetected = true;
  }
}

/** Informativo: indica se houve fala detectada na última gravação. */
export function wasSpeechDetected() {
  return speechDetected;
}


const AUDIO_DB_NAME = "bhm-call-recordings";
const AUDIO_STORE_NAME = "pending-audios";

function openAudioDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function persistPendingAudios(): Promise<void> {
  const db = await openAudioDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    store.clear();
    pendingList.forEach((audio) => store.put(audio));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  db.close();
}

async function restorePendingAudios(): Promise<void> {
  const db = await openAudioDb();
  if (!db) return;
  const restored = await new Promise<PendingAudio[]>((resolve) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readonly");
    const request = transaction.objectStore(AUDIO_STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => resolve([]);
  });
  db.close();
  if (!restored.length) return;
  const currentIds = new Set(pendingList.map((audio) => audio.id));
  pendingList = [...restored.filter((audio) => !currentIds.has(audio.id)), ...pendingList].sort(
    (a, b) => +new Date(a.gravadoEm) - +new Date(b.gravadoEm),
  );
  emit(PENDING_AUDIO_EVENT);
}

function emit(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

export function isRecording() {
  return recorder !== null && recorder.state === "recording";
}

export function recordingStartedAt() {
  return startedAt;
}

/** Última tentativa gravada (compatibilidade com o fluxo antigo). */
export function getPendingAudio(): PendingAudio | null {
  return pendingList.length ? pendingList[pendingList.length - 1] : null;
}

/** Todas as tentativas de gravação ainda não processadas, em ordem cronológica. */
export function listPendingAudios(): PendingAudio[] {
  return pendingList;
}

/** Remove uma tentativa específica (ou todas, se nenhum id for informado). */
export function clearPendingAudio(id?: string) {
  pendingList = id ? pendingList.filter((a) => a.id !== id) : [];
  void persistPendingAudios();
  emit(PENDING_AUDIO_EVENT);
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export async function startCallRecording(_opts?: { vadTimeoutMs?: number }): Promise<void> {
  if (isRecording()) return;
  const media = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream = media;
  const mime = pickMime();
  const rec = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media);
  chunks = [];
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  rec.start();
  recorder = rec;
  startedAt = Date.now();
  setupVad(media);
  emit(RECORDER_EVENT);
}

/** Encerra a gravação e guarda o áudio como "pendente" para a Pós-ligação. */
export function stopCallRecording(empresa?: string | null): Promise<PendingAudio | null> {
  const rec = recorder;
  if (!rec) return Promise.resolve(null);
  // A gravação é SEMPRE preservada — descarte apenas manual pelo usuário.
  const duracaoSeg = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  teardownVad();
  return new Promise((resolve) => {
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      chunks = [];
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recorder = null;
      startedAt = 0;
      const ext = type.includes("mp4") ? "m4a" : type.includes("wav") ? "wav" : "webm";
      const item: PendingAudio = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        blob,
        filename: `chamada-${Date.now()}.${ext}`,
        duracaoSeg,
        empresa: empresa ?? null,
        gravadoEm: new Date().toISOString(),
      };
      // Fila: cada tentativa fica preservada até ser transcrita/descartada.
      pendingList = [...pendingList, item];
      void persistPendingAudios();
      emit(RECORDER_EVENT);
      emit(PENDING_AUDIO_EVENT);
      resolve(item);
    };
    if (rec.state !== "inactive") rec.stop();
    else rec.onstop?.(new Event("stop"));
  });
}

export function cancelCallRecording() {
  const rec = recorder;
  if (rec) {
    rec.onstop = null;
    if (rec.state !== "inactive") rec.stop();
  }
  teardownVad();
  speechDetected = false;
  chunks = [];
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  recorder = null;
  startedAt = 0;
  emit(RECORDER_EVENT);
}


export function formatSecs(seg: number) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

if (typeof window !== "undefined") void restorePendingAudios();

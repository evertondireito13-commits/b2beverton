import { Link } from "@tanstack/react-router";
import { useHotkey } from "@/hooks/use-hotkey";

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithAI, extractContactNameWithAI, lookupCnpj, sendRdStationNote, fetchRdStationDeal, transcribeAudio, searchCompanyByName, enrichPhones, searchRdDeals, searchRdStationDeals, interpretarStatusConversa, analisarConversaEstruturada, analisarConversaAvancada, type AnaliseConversa, type AnaliseAvancada } from "@/lib/prospeccao.functions";
import { logCall } from "@/lib/call-logs.functions";
import { cancelPendingFollowUpsForCompany, createFollowUp, extractFollowUpFromCall, listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import { upsertLead as upsertLeadCentral, isLeadIsolated, findLead, addLeadFollowUp, updateLead as updateLeadCentral } from "@/lib/leads-store";
import {
  getActivePromptText,
  loadLibrary,
  createPrompt,
  updatePrompt,
  deletePrompt,
  setActivePrompt,
  PROMPT_LIBRARY_EVENT,
  syncLibraryFromCloud,
  type PromptItem,
  type PromptTipo,
  type PromptLibrary,
} from "@/lib/prompts-store";

import {
  buildRegistroFromHistorico,
  saveHistorico,
  updateHistoricoStatus,
  updateHistoricoEmpresa,
  updateHistoricoContatoCargo,
  loadRascunho,
  updateRascunho,
  clearRascunho,
  extractTelefones,
  extractEmailsPessoas,
  textoIndicaNegativaComercial,
  getConsultor,
  loginConsultor,
  logoutConsultor,
  listHistoricos,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import {
  addActivity,
  renameActivitiesByEmpresa,
  updateActivityContatoCargo,
  getActiveLead,
  getTodayActivities,
  setActiveLead,
  todaySaoPauloISO,
  ACTIVE_LEAD_EVENT,
  type ActiveLeadLike,
  type BhmActivityLog as _BhmActivityLog,
} from "@/lib/daily-activities";


// Re-exposta no escopo global do arquivo, conforme especificação.
export type BhmActivityLog = _BhmActivityLog;

import {
  ConsultarHistoricoCard,
  emitHistoricoUpdated,
} from "@/components/historico-panel";
import {
  GO_POS_EVENT,
  PENDING_AUDIO_EVENT,
  clearPendingAudio,
  formatSecs,
  getPendingAudio,
  listPendingAudios,
} from "@/lib/call-recorder";

import { CommandPalette } from "@/components/command-palette";
import { NotificationsCenter } from "@/components/notifications-center";
import { CallTimerWidget } from "@/components/call-timer";

import { EditableCompanyName } from "@/components/editable-company-name";
import { LOAD_PRE_LIGACAO_EVENT, PREPARACAO_REALIZADA_EVENT, ACTIVE_PREPARATION_ID_KEY, PENDING_PRE_LIGACAO_KEY, markPreparacaoRealizadaByCompany } from "@/components/preparacao-noturna";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Copy,
  Download,
  Search,
  Sparkles,
  Settings2,
  RotateCcw,
  Loader2,
  Send,
  Upload,
  Mic,
  Square,
  Check,
  Trash2,
  Link2,
  History as HistoryIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DinamicaLigacaoCard } from "./dinamica-ligacao-card";
import { saveAnaliseAvancada } from "@/lib/analise-avancada";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { CallRecorderButton } from "@/components/call-recorder-button";
import { CopyButton, loadSessaoAtiva, updateSessaoAtiva, rdDealIdKey, clearSessaoAtiva, activeConsultorKey } from "@/routes/index";
import { PromptLibraryPanel, inferirSegmentoPorCnae, montarLeadFallback, preencherTagsDoScript, contemAlucinacaoDeExtracao, compileScriptLocally, parseLeadFromDados, type ActiveLeadData } from "@/components/prospeccao/shared";

export function PosLigacao({
  promptText,
}: {
  promptText: string;
}) {
  const rascunhoPos = loadRascunho().pos ?? {};
  const [analise, setAnalise] = useState<AnaliseConversa | null>(null);
  const [analiseAvancada, setAnaliseAvancada] = useState<AnaliseAvancada | null>(null);
  const [descricao, setDescricao] = useState(rascunhoPos.descricao ?? "");
  const [historico, setHistorico] = useState(rascunhoPos.historico ?? "");
  const [historicoOpen, setHistoricoOpen] = useState(rascunhoPos.historicoOpen ?? true);
  const [lastRegId, setLastRegId] = useState<string | null>(rascunhoPos.lastRegId ?? null);
  const [lastRegName, setLastRegName] = useState<string>(rascunhoPos.lastRegName ?? "");
  const [lastRegCnpj, setLastRegCnpj] = useState<string | null>(rascunhoPos.lastRegCnpj ?? null);
  const [lastRegContato, setLastRegContato] = useState<string>(rascunhoPos.lastRegContato ?? "");
  const [lastRegCargo, setLastRegCargo] = useState<string>(rascunhoPos.lastRegCargo ?? "");
  const [loading, setLoading] = useState(false);
  const [dealId, setDealId] = useState<string>(
    rascunhoPos.dealId ??
      (typeof window !== "undefined" ? (window.localStorage.getItem(rdDealIdKey()) ?? "") : ""),
  );

  useEffect(() => {
    updateRascunho({
      pos: {
        descricao,
        historico,
        dealId,
        historicoOpen,
        lastRegId,
        lastRegName,
        lastRegCnpj,
        lastRegContato,
        lastRegCargo,
      },
    });
  }, [descricao, historico, dealId, historicoOpen, lastRegId, lastRegName, lastRegCnpj, lastRegContato, lastRegCargo]);

  function limparRascunhoPos() {
    setDescricao("");
    setHistorico("");
    setDealId("");
    setLastRegId(null);
    setLastRegName("");
    setLastRegCnpj(null);
    setLastRegContato("");
    setLastRegCargo("");
    updateRascunho({
      pos: {
        descricao: "",
        historico: "",
        dealId: "",
        lastRegId: null,
        lastRegName: "",
        lastRegCnpj: null,
        lastRegContato: "",
        lastRegCargo: "",
      },
    });
  }


  const [sending, setSending] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const meetingAtRef = useRef<string | null>(null);
  const meetingEmailRef = useRef<string | null>(null);
  const descricaoTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Follow-up de origem (card clicado na aba Follow-up) — recebe baixa ao salvar. */
  const originFollowUpIdRef = useRef<string | null>(null);


  // Handoff vindo do Follow-up (botão "Iniciar Ligação / Pós-Ligação"):
  // lê o contexto salvo em sessionStorage, faz scroll suave até a caixa de
  // descrição e coloca o cursor pronto para transcrever/colar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let pending: { empresa?: string; cnpj?: string; contato?: string; followUpId?: string } | null = null;
    try {
      const raw = window.sessionStorage.getItem("bhm.pending-pos-context");
      if (raw) pending = JSON.parse(raw);
      window.sessionStorage.removeItem("bhm.pending-pos-context");
    } catch { /* noop */ }
    if (!pending?.empresa) return;
    originFollowUpIdRef.current = pending.followUpId ?? null;
    const nome = pending.empresa;

    // Garante que o activeLead reflete a empresa vinda do follow-up
    setActiveLead({
      cnpj: pending.cnpj || undefined,
      razaoSocial: nome,
      nomeFantasia: nome,
    });
    const timer = window.setTimeout(() => {
      const el = descricaoTextareaRef.current;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
    }, 120);
    toast.info(`Pós-ligação preparado para ${nome}${pending.contato ? ` · ${pending.contato}` : ""}`);
    return () => window.clearTimeout(timer);
  }, []);

  // --- Estado ESTRUTURADO do resultado ---
  // A partir desta versão, contato/cargo/decisor são EXTRAÍDOS PELA IA a
  // partir da transcrição no momento do "Gerar histórico". Não existem mais
  // inputs manuais no formulário — a fonte de verdade é o classificador.
  const [activeLead, setActiveLeadState] = useState<ActiveLeadLike | null>(
    () => getActiveLead(),
  );

  function limparTudo() {
    limparRascunhoPos();
    meetingAtRef.current = null;
    meetingEmailRef.current = null;
    originFollowUpIdRef.current = null;
    clearRascunho();
    setActiveLead(null);
    setActiveLeadState(null);
    toast.success("Tudo limpo. Pronto para uma nova ligação.");
  }

  // Chave anti-duplicação por lead — enquanto o operador não trocar de CNPJ,
  // qualquer clique em checkbox/enviar reaproveita a mesma linha.
  const dedupeKey = useMemo(() => {
    if (!activeLead) return "";
    const base = activeLead.cnpj || activeLead.razaoSocial || "sem-lead";
    return `lead:${base.replace(/\s+/g, "_").toLowerCase()}`;
  }, [activeLead]);

  // Dirty State Guard: se o operador já começou a transcrever/anotar,
  // pedimos confirmação antes de trocar o lead ativo — caso contrário
  // aceitamos silenciosamente o novo lead vindo do painel superior.
  const descricaoRef = useRef(descricao);
  descricaoRef.current = descricao;
  useEffect(() => {
    const refresh = () => {
      const incoming = getActiveLead();
      const current = activeLead;
      const sameLead =
        (incoming?.cnpj ?? "") === (current?.cnpj ?? "") &&
        (incoming?.razaoSocial ?? "") === (current?.razaoSocial ?? "");
      const dirty = (descricaoRef.current ?? "").trim().length > 0;
      if (!sameLead && dirty && current) {
        const nome =
          incoming?.razaoSocial || incoming?.nomeFantasia || incoming?.cnpj || "novo lead";
        const ok = window.confirm(
          `Você possui uma transcrição em andamento para "${
            current.razaoSocial || current.nomeFantasia || current.cnpj
          }".\n\nDeseja alternar para "${nome}" e descartar as notas atuais?`,
        );
        if (!ok) {
          setActiveLead(current);
          toast.warning("Troca de lead cancelada — transcrição preservada.");
          return;
        }
        setDescricao("");
        setHistorico("");
        toast.info("Notas descartadas. Lead alternado para o novo card.");
      }
      setActiveLeadState(incoming);
    };
    window.addEventListener(ACTIVE_LEAD_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_LEAD_EVENT, refresh);
  }, [activeLead]);




  // Áudio capturado na Pré-ligação, aguardando transcrição aqui.
  const [pendingAudios, setPendingAudios] = useState<ReturnType<typeof listPendingAudios>>([]);
  const [transcritos, setTranscritos] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setPendingAudios([...listPendingAudios()]);
    sync();
    window.addEventListener(PENDING_AUDIO_EVENT, sync);
    return () => window.removeEventListener(PENDING_AUDIO_EVENT, sync);
  }, []);

  // URLs de blob estáveis (player + download) — recriadas só quando a lista muda.
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (typeof URL === "undefined") return;
    const urls: Record<string, string> = {};
    pendingAudios.forEach((a) => {
      urls[a.id] = URL.createObjectURL(a.blob);
    });
    setAudioUrls(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [pendingAudios]);


  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runGenerate = useServerFn(generateWithAI);
  const runSendRd = useServerFn(sendRdStationNote);
  const runFetchRd = useServerFn(fetchRdStationDeal);
  const runTranscribe = useServerFn(transcribeAudio);
  const runInterpretarStatus = useServerFn(interpretarStatusConversa);
  const runAnalise = useServerFn(analisarConversaEstruturada);
  const runAnaliseAvancada = useServerFn(analisarConversaAvancada);
  const runSearchDeals = useServerFn(searchRdDeals);



  async function transcribeBlob(blob: Blob, filename: string): Promise<boolean> {
    if (blob.size < 1024) {
      toast.error("Áudio muito curto ou vazio — grave/envie novamente");
      return false;
    }
    if (blob.size > 20 * 1024 * 1024) {
      toast.error("Áudio maior que 20MB — divida em partes menores antes de enviar");
      return false;
    }
    // Validação de duração (>= 1s) via Web Audio API — evita chamar a Server Function à toa
    try {
      const AC =
        (typeof window !== "undefined" &&
          ((window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) ||
        null;
      if (AC) {
        const ctx = new AC();
        try {
          const buf = await blob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf.slice(0));
          if (decoded.duration < 1) {
            toast.error("Áudio menor que 1 segundo — grave/envie novamente");
            return false;
          }
        } catch {
          /* Formato pode não ser decodificável no browser (ex.: opus). Segue para o servidor. */
        } finally {
          await ctx.close().catch(() => {});
        }
      }
    } catch {
      /* Sem Web Audio API — segue direto para o servidor */
    }

    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const { text } = await runTranscribe({ data: fd });
      setDescricao((prev) => (prev ? prev + "\n\n" + text : text));
      toast.success("Áudio transcrito — revise o texto antes de clicar em 'Gerar histórico'");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao transcrever");
      return false;
    } finally {
      setTranscribing(false);
    }
  }

  const autoTranscribedIdsRef = useRef(new Set<string>());
  useEffect(() => {
    if (transcribing) return;
    const next = pendingAudios.find((audio) => !autoTranscribedIdsRef.current.has(audio.id));
    if (!next) return;
    autoTranscribedIdsRef.current.add(next.id);
    void transcribeBlob(next.blob, next.filename).then((ok) => {
      // O áudio NUNCA é removido automaticamente: fica visível com player e
      // download até o usuário descartar manualmente.
      if (ok) setTranscritos((prev) => (prev.includes(next.id) ? prev : [...prev, next.id]));
    });
  }, [pendingAudios, transcribing]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|webm|ogg|mp4|flac|aac)$/i.test(file.name)) {
      toast.error("Envie um arquivo de áudio (mp3, wav, m4a, webm, ogg…)");
      return;
    }
    await transcribeBlob(file, file.name);
  }

  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const ext = type.includes("mp4") ? "mp4" : type.includes("wav") ? "wav" : "webm";
        await transcribeBlob(blob, `gravacao.${ext}`);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordingSecs(0);
      timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
    } catch (err) {
      toast.error(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permissão de microfone negada"
          : "Não foi possível acessar o microfone",
      );
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function cleanDealId(raw: string) {
    return raw.match(/[a-f0-9]{24}/i)?.[0] ?? raw.trim();
  }

  async function handleFetchRd() {
    const cleanId = cleanDealId(dealId);
    if (!cleanId) {
      toast.error("Informe o ID ou link do negócio no RD.");
      return;
    }
    setFetching(true);
    try {
      const r = await runFetchRd({ data: { dealId: cleanId } });
      if ("notFound" in r && r.notFound) {
        toast.error(`Negócio ${cleanId} não encontrado no RD Station. Confira o ID/link.`);
        return;
      }
      setDealId(cleanId);
      if ("semConteudo" in r && r.semConteudo) {
        toast.warning("Este negócio não possui notas nem atividades no RD Station.");
        return;
      }
      if (!r.texto) {
        toast.warning("Nenhum texto retornado pelo RD Station.");
        return;
      }
      setDescricao(r.texto);
      toast.success("Dados carregados do RD Station CRM!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar no RD");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dealId) window.localStorage.setItem(rdDealIdKey(), dealId);
    else window.localStorage.removeItem(rdDealIdKey());
    // Vínculo permanente: grava o negócio do RD no cadastro da empresa (lead),
    // para que ele volte preenchido nos próximos dias e na Central de Reuniões.
    if (dealId && activeLead) {
      const nome = activeLead.razaoSocial || activeLead.nomeFantasia || "";
      const lead = findLead(nome, activeLead.cnpj ?? null);
      if (lead && lead.rd_deal_id !== dealId) updateLeadCentral(lead.id, { rd_deal_id: dealId });
    }
  }, [dealId, activeLead]);

  // Pré-preenche o ID do negócio quando a empresa ativa já tem vínculo salvo.
  useEffect(() => {
    if (!activeLead || dealId) return;
    const nome = activeLead.razaoSocial || activeLead.nomeFantasia || "";
    const lead = findLead(nome, activeLead.cnpj ?? null);
    if (lead?.rd_deal_id) setDealId(lead.rd_deal_id);
  }, [activeLead, dealId]);

  // Fallback: se a Pré-ligação não conseguiu vincular, tenta localizar o negócio
  // no RD automaticamente (por CNPJ e depois por nome) — sem busca manual.
  const autoLinkTried = useRef<string>("");
  useEffect(() => {
    if (!activeLead || dealId) return;
    const nome = activeLead.razaoSocial || activeLead.nomeFantasia || "";
    const chave = `${activeLead.cnpj ?? ""}|${nome}`;
    if (!nome && !activeLead.cnpj) return;
    if (autoLinkTried.current === chave) return;
    autoLinkTried.current = chave;
    let cancelado = false;
    (async () => {
      const termos = [activeLead.cnpj ?? "", nome].filter((t) => t && t.trim());
      for (const termo of termos) {
        try {
          const r = await runSearchDeals({ data: { query: termo } });
          const deals = r.deals ?? [];
          // Só vincula sozinho quando o ID vem no formato aceito pelo envio.
          const valido = deals.length === 1 ? deals[0].id.match(/^[a-f0-9]{24}$/i)?.[0] : null;
          if (valido && !cancelado) {
            setDealId(valido);
            toast.success(`Negócio do RD vinculado automaticamente: ${deals[0].name}`);
            return;
          }
        } catch {
          /* silencioso: mantém a busca manual como alternativa */
        }

      }
    })();
    return () => {
      cancelado = true;
    };
  }, [activeLead, dealId, runSearchDeals]);


  const runExtractFollowUp = useServerFn(extractFollowUpFromCall);
  const runCreateFollowUp = useServerFn(createFollowUp);
  const runCancelPendingFollowUps = useServerFn(cancelPendingFollowUpsForCompany);

  async function autoCreateFollowUp(opts: {
    transcricao: string;
    historico: string;
    /** Identidade canônica já gravada em `bhm_historico_empresas` — evita
     *  follow-up "órfão" com nome divergente do histórico. */
    canonicalEmpresa?: string | null;
    canonicalCnpj?: string | null;
    canonicalResumo?: string | null;
  }) {
    try {
      const empresa = opts.canonicalEmpresa?.trim() || extractCompanyFromHistorico(opts.historico);
      const cnpj = opts.canonicalCnpj?.trim() || extractCnpjFromHistorico(opts.historico);
      const contato = extractContatoFromHistorico(opts.historico);

      // Guarda-chuva client-side: se o texto tem sinais claros de recusa, não
      // criamos follow-up automático (mesmo que a IA gere um por engano).
      const looksRefused = textoIndicaNegativaComercial(`${opts.transcricao}\n${opts.historico}`);
      if (looksRefused) {
        const cancelled = await runCancelPendingFollowUps({
          data: {
            companyName: empresa ?? undefined,
            cnpj: cnpj ?? undefined,
            contactPerson: contato ?? undefined,
            reason: "Cancelado automaticamente: histórico pós-ligação registrou negativa/sem interesse.",
            consultor: activeConsultorKey(),
          },
        }).catch(() => ({ cancelled: 0 }));
        toast.warning(
          `Empresa sem interesse — nenhum follow-up será criado.${cancelled.cancelled ? ` ${cancelled.cancelled} alerta(s) antigo(s) cancelado(s).` : ""}`,
          { duration: 10000 },
        );
        emitHistoricoUpdated();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bhm:followups-updated"));
        return;
      }

      const ex = await runExtractFollowUp({
        data: {
          transcricao: opts.transcricao,
          historico: opts.historico,
          empresaFallback: empresa ?? undefined,
          cnpjFallback: cnpj ?? undefined,
        },
      });
      if (ex.refused) {
        const cancelled = await runCancelPendingFollowUps({
          data: {
            companyName: ex.companyName ?? empresa ?? undefined,
            cnpj: ex.cnpj ?? cnpj ?? undefined,
            contactPerson: ex.contactPerson ?? contato ?? undefined,
            reason: "Cancelado automaticamente: histórico pós-ligação registrou negativa/sem interesse.",
            consultor: activeConsultorKey(),
          },
        }).catch(() => ({ cancelled: 0 }));
        toast.warning(
          `Empresa sem interesse — nenhum follow-up será criado. ${ex.reason ?? "Não insistir."}${cancelled.cancelled ? ` ${cancelled.cancelled} alerta(s) antigo(s) cancelado(s).` : ""}`,
          { duration: 10000 },
        );
        emitHistoricoUpdated();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bhm:followups-updated"));
        return;
      }
      if (!ex.hasFollowUp || !ex.companyName || !ex.scheduledAt || !ex.actionType) {
        toast.info("Nenhum follow-up identificado nesta ligação");
        return;
      }
      // guarda a data e o e-mail da reunião para gravar no relatório junto com o logCall
      meetingAtRef.current = ex.actionType === "meeting" ? ex.scheduledAt : null;
      meetingEmailRef.current = ex.actionType === "meeting" ? ex.contactEmail ?? null : null;
      // Identidade canônica vence a extração da IA: o follow-up precisa apontar
      // exatamente para a mesma empresa/CNPJ gravados no histórico.
      const canonName = opts.canonicalEmpresa?.trim() || ex.companyName;
      const canonCnpj = opts.canonicalCnpj?.trim() || ex.cnpj || undefined;
      const canonNotes =
        (ex.notes ?? "").trim() ||
        (opts.canonicalResumo ?? "").trim() ||
        "Follow-up registrado a partir do histórico pós-ligação.";
      await runCreateFollowUp({
        data: {
          companyName: canonName,
          cnpj: canonCnpj,
          contactPerson: ex.contactPerson ?? undefined,
          actionType: ex.actionType,
          scheduledAt: ex.scheduledAt,
          notes: canonNotes,
          consultor: activeConsultorKey(),
          originFollowUpId: originFollowUpIdRef.current ?? undefined,
        },
      });
      // Empresas que já estão na Central de Reuniões não pertencem à fila
      // fria: o retorno também é gravado dentro do próprio lead, para que
      // todo o histórico da negociação fique concentrado na Central.
      const leadCentral = findLead(canonName, canonCnpj ?? null);
      if (leadCentral) {
        const canalMap: Record<string, "ligacao" | "whatsapp" | "email" | "reuniao"> = {
          call: "ligacao",
          whatsapp: "whatsapp",
          email: "email",
          meeting: "reuniao",
          other: "ligacao",
        };
        addLeadFollowUp(leadCentral.id, {
          scheduled_at: ex.scheduledAt,
          canal: canalMap[ex.actionType] ?? "ligacao",
          assunto: canonNotes.slice(0, 180),
          notas: ex.notes ?? undefined,
          sincronizarCompromisso: ex.actionType === "meeting",
        });
        toast.info(
          `${canonName} está na Central de Reuniões — follow-up registrado lá, na aba Follow-up do lead.`,
          { duration: 9000 },
        );
      }
      // A pendência antiga recebeu baixa no servidor — avisa listas/contadores.
      originFollowUpIdRef.current = null;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bhm:followups-updated"));
      }


      const when = new Date(ex.scheduledAt).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
      const acaoLabel: Record<string, string> = {
        call: "ligação",
        email: "e-mail",
        whatsapp: "WhatsApp",
        meeting: "reunião",
        other: "ação",
      };
      toast.success(
        `Follow-up agendado: ${acaoLabel[ex.actionType]} · ${canonName} · ${when}`,
        { duration: 8000 },
      );
      if (ex.actionType === "meeting") {
        toast.info(
          "Reunião pré-preenchida no relatório. Abra o Google Calendar pelo botão para revisar e enviar o convite.",
          { duration: 10000 },
        );
      }

    } catch (err) {
      // não bloqueia o fluxo principal
      console.warn("Falha ao criar follow-up automático", err);
    }
  }

  async function handleGenerate() {
    if (!descricao.trim()) {
      toast.error("Escreva o que aconteceu na ligação");
      return;
    }
    setLoading(true);
    setHistorico("");
    setAnalise(null);
    setAnaliseAvancada(null);
    meetingAtRef.current = null;
    meetingEmailRef.current = null;


    try {
      const hoje = new Date();
      const dataStr = hoje.toLocaleDateString("pt-BR");
      const diaSemana = hoje.toLocaleDateString("pt-BR", { weekday: "long" });

      // Contexto da empresa ativa (vinda da Pré-ligação). Se o operador não
      // mencionar explicitamente o nome/CNPJ no relato, a IA deve assumir estes
      // dados para preencher os campos estruturados do histórico.
      const empresaAtivaNome =
        activeLead?.razaoSocial || activeLead?.nomeFantasia || "";
      const contextoEmpresa = activeLead
        ? [
            "",
            "CONTEXTO DA EMPRESA ATIVA (da Pré-ligação):",
            `- Nome: ${empresaAtivaNome || "[não informado]"}`,
            activeLead.cnpj ? `- CNPJ: ${activeLead.cnpj}` : "",
            activeLead.cnaePrincipal ? `- CNAE: ${activeLead.cnaePrincipal}` : "",
            activeLead.cidade || activeLead.uf
              ? `- Localização: ${[activeLead.cidade, activeLead.uf].filter(Boolean).join("/")}`
              : "",
            "",
            `INSTRUÇÃO: Se o operador não mencionar explicitamente o nome de uma empresa no relato abaixo, assuma e preencha os campos estruturados usando os dados desta empresa ativa (EMPRESA: ${empresaAtivaNome || activeLead.cnpj || "empresa ativa"}).`,
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      const userContent = `Data da ligação: ${dataStr} (${diaSemana})${contextoEmpresa}\n\nTranscrição / descrição:\n${descricao}`;

      // Dispara em paralelo: a geração do histórico (prompt SAGRADO do usuário,
      // intocado) e o analisador silencioso do desfecho (prompt fixo do dev),
      // que também extrai contato/cargo/tipo de contato — eliminando a
      // necessidade de o operador preencher esses campos manualmente.
      // Análise estruturada (JSON padronizado) — complementa o histórico com
      // resumo executivo, nível de interesse, objeções e próximo passo.
      const analisePromise = runAnalise({ data: { descricao } }).catch(() => null);
      // Análise de dinâmica (aditiva/opcional): roda em paralelo e nunca bloqueia.
      const avancadaPromise = runAnaliseAvancada({ data: { descricao } }).catch(() => null);
      void avancadaPromise.then((a) => { if (a) setAnaliseAvancada(a); });

      const interpretacaoPromise = runInterpretarStatus({ data: { descricao } }).catch(() => ({
        status: "follow_up" as const,
        contatoNome: null,
        contatoCargo: null,
        tipoContato: "portaria" as const,
      }));

      const { text } = await runGenerate({
        data: { systemPrompt: promptText, userContent },
      });
      setHistorico(text);
      setHistoricoOpen(true);

      // Aguardamos a interpretação para registrar histórico e atividade JÁ com
      // contato/cargo/tipo extraídos, sem campos manuais no formulário.
      const interpretacao = await interpretacaoPromise;
      const analiseIa = await analisePromise;
      if (analiseIa) setAnalise(analiseIa);

      // Salva no banco local de históricos por empresa (para consulta futura, relatório e alertas)
      // Extração 100% independente da aba Pré-ligação: tudo é lido do texto gerado.
      try {
        let reg = buildRegistroFromHistorico({ historico: text, descricao, consultor: getConsultor() });
        if (!reg) {
          // Fallback: garante o registro mesmo se o rótulo EMPRESA vier fora do padrão
          const nomeFallback =
            extractCompanyFromHistorico(text) ?? "Empresa não identificada";
          const now = new Date();
          reg = {
            id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
            dataIso: now.toISOString(),
            dataFormatada: now.toLocaleDateString("pt-BR"),
            empresaNome: nomeFallback,
            cnpj: extractCnpjFromHistorico(text),
            contato: interpretacao.contatoNome,
            cargo: interpretacao.contatoCargo,
            resultado: null,
            interesse: null,
            objecao: null,
            proximaAcao: null,
            proximaAcaoData: null,
            textoHistoricoCompleto: text,
            descricaoOriginal: descricao,
            consultor: getConsultor(),
          };
        }
        // Aplica o status classificado. Mapeia para o vocabulário canônico da
        // Agenda de Retornos:
        //   'arquivado' -> some da agenda instantaneamente
        //   'reuniao'   -> 'concluido' (sai da agenda de retornos pendentes)
        //   'follow_up' -> 'pendente'  (permanece na agenda)
        // Enriquecimento determinístico com a análise estruturada da IA.
        if (analiseIa) {
          reg.interesse = reg.interesse ?? analiseIa.nivel_interesse;
          reg.objecao = reg.objecao ?? (analiseIa.objecoes_encontradas.join("; ") || null);
          reg.proximaAcao = reg.proximaAcao ?? (analiseIa.proximo_passo_sugerido || null);
          reg.resultado = reg.resultado ?? (analiseIa.resumo_executivo || null);
        }

        const s = interpretacao.status;
        const histStatus = s === "arquivado" ? "arquivado" : s === "reuniao" ? "concluido" : "pendente";

        saveHistorico(reg);
        // Persistência opcional da análise de dinâmica (tabela separada).
        const regIdParaAnalise = reg.id;
        void avancadaPromise.then((a) => {
          if (a) void saveAnaliseAvancada(regIdParaAnalise, a);
        });
        setLastRegId(reg.id);
        setLastRegName(reg.empresaNome ?? "");
        setLastRegCnpj(reg.cnpj ?? null);
        setLastRegContato(interpretacao.contatoNome ?? reg.contato ?? "");
        setLastRegCargo(interpretacao.contatoCargo ?? reg.cargo ?? "");
        emitHistoricoUpdated();
        try { updateHistoricoStatus(histStatus, reg.id); } catch { /* noop */ }

        // Se este pós-ligação veio de uma empresa da Preparação Noturna,
        // marca aquele card como "realizada" (verde) e limpa o rastreamento.
        // Independente da origem, também dá baixa por CNPJ/nome — assim uma
        // ligação iniciada pelo Follow-up conclui o card da Preparação.
        try {
          const prepId = window.sessionStorage.getItem(ACTIVE_PREPARATION_ID_KEY);
          if (prepId) window.sessionStorage.removeItem(ACTIVE_PREPARATION_ID_KEY);
          // Classifica o desfecho: sem interesse (vermelho) x em andamento (verde)
          const semInteresse =
            s === "arquivado" || textoIndicaNegativaComercial(`${descricao}\n${text}`);
          if (prepId) {
            window.dispatchEvent(
              new CustomEvent(PREPARACAO_REALIZADA_EVENT, {
                detail: {
                  preparationId: prepId,
                  outcome: semInteresse ? "sem_interesse" : "realizada",
                },
              }),
            );
          }
          markPreparacaoRealizadaByCompany(
            reg.cnpj ?? null,
            reg.empresaNome ?? null,
            semInteresse ? "sem_interesse" : "realizada",
          );
        } catch { /* noop */ }

        // Fonte única do Centro de Estratégia: registra também na chave
        // bhm-daily-activities::<consultor>, já com próxima ação/data/status.
        try {
          addActivity(
            activeLead ?? {
              cnpj: reg.cnpj ?? undefined,
              razaoSocial: reg.empresaNome,
              nomeFantasia: reg.empresaNome,
            },
            interpretacao.tipoContato === "decisor" ? "Falou com decisor" : "Falou com portaria",
            interpretacao.tipoContato === "decisor",
            {
              contato: interpretacao.contatoNome ?? reg.contato ?? "",
              cargo: interpretacao.contatoCargo ?? reg.cargo ?? "",
              historico: text,
              proximaAcao: reg.proximaAcao ?? undefined,
              proximaAcaoData: reg.proximaAcaoData ?? undefined,
              status: histStatus,
              dedupeKey: dedupeKey || undefined,
            },
          );
        } catch {
          /* não bloqueia fluxo principal */
        }

        // 1º dispara a extração do follow-up (preenche meetingAtRef/EmailRef quando for reunião)
        await autoCreateFollowUp({
          transcricao: descricao,
          historico: text,
          canonicalEmpresa: reg.empresaNome,
          canonicalCnpj: reg.cnpj ?? null,
          canonicalResumo: reg.proximaAcao ?? reg.resultado ?? null,
        });

        // 2º registra a ligação no relatório de metas — é AQUI que a ligação vira
        // "confirmada". Só entra no relatório porque um histórico foi gerado.
        const meetingScheduledNow = !!meetingAtRef.current || detectMeetingScheduled(text);
        try {
          await runLogCall({
            data: {
              companyName: reg.empresaNome,
              cnpj: reg.cnpj ?? undefined,
              meetingScheduled: meetingScheduledNow,
              meetingAt: meetingAtRef.current ?? undefined,
              meetingEmail: meetingEmailRef.current ?? undefined,
              notes: reg.resultado ?? undefined,
              consultor: activeConsultorKey(),
            },
          });
        } catch {
          /* não bloqueia geração */
        }
        // Regra de transição: reunião agendada => vira Lead na Central e sai do Follow-up Frio
        if (meetingScheduledNow) {
          try {
            upsertLeadCentral({
              empresa: reg.empresaNome,
              cnpj: reg.cnpj ?? "",
              contato: reg.contato ?? "",
              cargo: reg.cargo ?? "",
              status: "reuniao_agendada",
              em_followup_frio: false,
              data_reuniao: meetingAtRef.current ?? new Date().toISOString(),
              ultima_observacao: reg.resultado ?? "",
            });
            // ISOLAMENTO: some de TODAS as filas frias de follow-up.
            runCancelPendingFollowUps({
              data: {
                companyName: reg.empresaNome,
                cnpj: reg.cnpj ?? undefined,
                consultor: activeConsultorKey(),
              },
            })
              .then((res) => {
                if (typeof window !== "undefined")
                  window.dispatchEvent(new CustomEvent("bhm:followups-updated"));
                const n = (res as { cancelled?: number } | undefined)?.cancelled ?? 0;
                toast.info(
                  `Empresa movida pra Central de Reuniões — ${n} follow-up(s) cancelado(s), o acompanhamento agora fica lá, não no Follow-up.`,
                );
              })
              .catch((e) => {
                toast.error(
                  `Falha ao cancelar follow-ups pendentes: ${e instanceof Error ? e.message : String(e)}`,
                );
              });
          } catch (e) {
            toast.error(
              `Falha ao mover empresa para a Central de Reuniões: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

        } else if (s === "arquivado" || textoIndicaNegativaComercial(`${descricao}\n${text}`)) {
          // Regra de transição inversa: recusa explícita => lead ativo na Central vira "perdido".
          try {
            const leadAtivo = findLead(reg.empresaNome, reg.cnpj ?? null);
            if (leadAtivo && leadAtivo.status !== "perdido") {
              upsertLeadCentral({
                empresa: reg.empresaNome,
                cnpj: reg.cnpj ?? "",
                status: "perdido",
                em_followup_frio: false,
                ultima_observacao: reg.resultado ?? "Recusa explícita registrada na pós-ligação.",
              });
              toast.info("Recusa detectada — lead marcado como perdido na Central de Reuniões.");
            }
          } catch {
            /* não bloqueia geração */
          }
        }

      } catch {
        /* não bloqueia */
      }

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setLoading(false);
    }
  }

  async function copyHistorico() {
    await navigator.clipboard.writeText(historico);
    toast.success("Anotação completa copiada — cole no CRM");
  }

  // Ctrl/⌘ + Enter: salva (gera o histórico) e, se já salvo, avança para a próxima empresa.
  useHotkey({ key: "Enter", ctrl: true, allowInField: true }, () => {
    if (loading) return;
    if (!historico.trim()) void handleGenerate();
    else limparRascunhoPos();
  });


  async function copyTelefones() {
    const t = extractTelefones(historico);
    if (!t.trim()) {
      toast.warning("Nenhum telefone/ramal encontrado no histórico");
      return;
    }
    await navigator.clipboard.writeText(t);
    toast.success("Telefones e ramais copiados");
  }

  async function copyEmailsPessoas() {
    const t = extractEmailsPessoas(historico);
    if (!t.trim()) {
      toast.warning("Nenhum e-mail ou pessoa para procurar encontrado");
      return;
    }
    await navigator.clipboard.writeText(t);
    toast.success("E-mails e pessoas copiados");
  }

  const runLogCall = useServerFn(logCall);

  async function handleSendRd() {
    if (!historico.trim()) {
      toast.error("Gere o histórico primeiro");
      return;
    }
    const cleanId = cleanDealId(dealId);
    if (!cleanId) {
      toast.error("Informe o ID ou link do negócio no RD.");
      return;
    }
    setSending(true);
    try {
      await runSendRd({ data: { dealId: cleanId, text: historico } });
      setDealId(cleanId);
      // Atividade já foi registrada em handleGenerate; aqui só anexa no RD.
      toast.success("Histórico anexado com sucesso ao negócio no RD Station CRM!");
      // Obs.: a ligação já foi registrada no relatório quando o histórico foi gerado
      // (handleGenerate → runLogCall). Aqui apenas anexamos no RD.


    } catch (err) {
      toast.error(
        `${err instanceof Error ? err.message : "Falha ao enviar ao RD"} — ID enviado: ${cleanId}`,
      );
    } finally {

      setSending(false);
    }
  }

  return (
    <Card className="relative overflow-hidden border-border bg-card p-0 shadow-sm">
      <CardHeader className="flex flex-col items-start gap-2 space-y-0 rounded-none border-b border-navy-deep bg-navy-deep px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
        <CardTitle className="font-display text-base tracking-wide text-white sm:text-lg">
          Pós-ligação · Histórico para o RD
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3" />
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <PromptLibraryPanel tipo="historico" />




        {pendingAudios.length > 0 && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary">
              🎧 {pendingAudios.length > 1
                ? `${pendingAudios.length} gravações prontas`
                : "Áudio da chamada pronto"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              A transcrição começa automaticamente. O áudio continua disponível
              aqui (ouvir e baixar) até você descartar manualmente.
            </p>
            {pendingAudios.map((a, i) => {
              const jaTranscrito = transcritos.includes(a.id);
              return (
              <div key={a.id} className="rounded-md border border-primary/20 bg-background/60 p-2">
                <p className="text-[11px] font-medium">
                  {pendingAudios.length > 1 ? `Tentativa ${i + 1} — ` : ""}
                  {new Date(a.gravadoEm).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ({formatSecs(a.duracaoSeg)})
                  {a.empresa ? ` — ${a.empresa}` : ""}
                </p>
                <audio controls className="mt-2 w-full" src={audioUrls[a.id]} />
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {jaTranscrito ? (
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                      ✓ Transcrito
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={transcribing}
                      onClick={async () => {
                        const ok = await transcribeBlob(a.blob, a.filename);
                        if (ok) setTranscritos((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
                      }}
                    >
                      {transcribing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Transcrever com IA
                    </Button>
                  )}
                  {audioUrls[a.id] ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={audioUrls[a.id]} download={a.filename}>
                        Baixar áudio
                      </a>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => clearPendingAudio(a.id)}>
                    Descartar áudio
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}


        {/* Contexto do lead ativo. Os campos "Falou com decisor / portaria",
            "Nome do contato" e "Cargo" foram REMOVIDOS: a IA extrai isso
            automaticamente do texto livre quando você clica "Gerar histórico"
            e alimenta o Diário e a Taxa de Decisor sozinha. */}
        <div className="rounded-md border border-navy-deep/30 bg-navy-deep/[0.03] p-3 text-[11px] text-muted-foreground">
          {activeLead ? (
            <>
              Lead ativo:{" "}
              <strong className="text-navy-deep">
                {activeLead.razaoSocial || activeLead.nomeFantasia || activeLead.cnpj}
              </strong>
              . Ao gerar o histórico, a IA identifica contato, cargo e se você
              falou com decisor ou portaria e atualiza o Diário automaticamente.
            </>
          ) : (
            "Nenhum lead ativo. Busque um CNPJ na Pré-ligação para que esta ligação entre no Diário."
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="deal-id" className="text-xs">
            Negócio no RD Station CRM (ID ou link)
          </Label>
          <Input
            id="deal-id"
            placeholder="ID ou link do negócio (crm.rdstation.com/deals/…)"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Preencha aqui para usar o botão “Puxar do RD” abaixo. O envio da anotação
            continua no rodapé desta tela.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="descricao" className="text-xs">
              Descrição da ligação
            </Label>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleFetchRd}
                disabled={fetching || !dealId.trim()}
                className="h-6 px-2 text-xs"
                title="Buscar notas e atividades desse negócio no RD Station"
              >
                {fetching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Search className="mr-1 h-3 w-3" />}
                Puxar do RD
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={transcribing || recording}
                className="h-6 px-2 text-xs"
                title="Carregar arquivo de áudio para transcrever"
              >
                {transcribing && !recording ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3 w-3" />
                )}
                Carregar áudio
              </Button>
              {recording ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={stopRecording}
                  className="h-6 px-2 text-xs"
                  title="Parar gravação e transcrever"
                >
                  <Square className="mr-1 h-3 w-3" />
                  Parar ({Math.floor(recordingSecs / 60)}:{String(recordingSecs % 60).padStart(2, "0")})
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={startRecording}
                  disabled={transcribing}
                  className="h-6 px-2 text-xs"
                  title="Gravar áudio pelo microfone e transcrever"
                >
                  <Mic className="mr-1 h-3 w-3" />
                  Gravar
                </Button>
              )}
            </div>
          </div>
          <Textarea
            id="descricao"
            ref={descricaoTextareaRef}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={10}
            placeholder="A gravação do Nosso App será transcrita aqui automaticamente. Você também pode colar uma descrição ou carregar outro áudio."
            className="mt-1 text-sm"
          />
          {transcribing && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Transcrevendo áudio…
            </p>
          )}
        </div>

        <Button onClick={handleGenerate} disabled={loading} size="lg" className="h-12 w-full text-base font-semibold">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Gerar histórico
            </>
          )}
        </Button>


        {historico && (

          <Collapsible
            open={historicoOpen}
            onOpenChange={setHistoricoOpen}
            className="rounded-md border bg-muted/30"
          >
            <div className="flex items-center justify-between gap-2 p-3">
              <CollapsibleTrigger asChild>
                <button className="flex flex-1 items-center gap-2 text-left text-xs font-medium hover:underline">
                  <span>{historicoOpen ? "▼" : "▶"}</span>
                  <span>Histórico gerado</span>
                  <span className="text-muted-foreground">
                    ({historicoOpen ? "clique para recolher" : "clique para expandir"})
                  </span>
                </button>
              </CollapsibleTrigger>
            </div>
            {lastRegId && (
              <div className="flex flex-wrap items-center gap-2 border-t bg-white/40 px-3 py-2 text-xs">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Empresa:
                </span>
                <span className="font-semibold text-navy-deep">
                  <EditableCompanyName
                    value={lastRegName}
                    onSave={(nome) => {
                      updateHistoricoEmpresa(lastRegId, nome);
                      renameActivitiesByEmpresa(
                        { cnpj: lastRegCnpj, empresaAntiga: lastRegName },
                        nome,
                      );
                      setLastRegName(nome);
                      toast.success("Nome da empresa atualizado.");
                    }}
                    emptyLabel="✏️ Digitar nome da empresa"
                  />
                </span>
                <span className="flex items-center gap-1 border-l border-border/60 pl-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Contato:
                  </span>
                  <span className="text-navy-deep">
                    <EditableCompanyName
                      value={lastRegContato}
                      onSave={(novo) => {
                        updateHistoricoContatoCargo(lastRegId, { contato: novo });
                        updateActivityContatoCargo({ contato: novo });
                        setLastRegContato(novo);
                        emitHistoricoUpdated();
                        toast.success("Nome do contato atualizado.");
                      }}
                      emptyLabel="✏️ Adicionar nome do contato"
                      placeholder="Nome do contato"
                      title="Clique para editar o nome do contato"
                    />
                  </span>
                </span>
                <span className="flex items-center gap-1 border-l border-border/60 pl-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Cargo:
                  </span>
                  <span className="text-navy-deep">
                    <EditableCompanyName
                      value={lastRegCargo}
                      onSave={(novo) => {
                        updateHistoricoContatoCargo(lastRegId, { cargo: novo });
                        updateActivityContatoCargo({ cargo: novo });
                        setLastRegCargo(novo);
                        emitHistoricoUpdated();
                        toast.success("Cargo atualizado.");
                      }}
                      emptyLabel="✏️ Adicionar cargo"
                      placeholder="Cargo"
                      title="Clique para editar o cargo"
                    />
                  </span>
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={copyHistorico} title="Copiar anotação completa para o CRM">
                    <Copy className="mr-1 h-3 w-3" />
                    Anotação
                  </Button>
                  <Button size="sm" variant="ghost" onClick={copyTelefones} title="Copiar apenas telefones e ramais">
                    Telefones
                  </Button>
                  <Button size="sm" variant="ghost" onClick={copyEmailsPessoas} title="Copiar apenas e-mails e pessoas para procurar">
                    E-mails
                  </Button>
                </span>
              </div>
            )}
            <CollapsibleContent className="border-t px-3 pb-3 pt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {historico}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setHistoricoOpen(false)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:underline"
                >
                  <span>▲</span>
                  <span>Recolher histórico</span>
                </button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <DinamicaLigacaoCard analise={analiseAvancada} />


        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor="deal-id" className="text-xs">
            Enviar ao RD Station CRM
          </Label>
          <div className="flex gap-2">
            <Button
              onClick={handleSendRd}
              disabled={sending}
              size="lg"
              className="h-11 px-6 text-base font-semibold"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar ao RD
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Cria uma nota no negócio via API do RD CRM. O ID fica salvo neste navegador.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// PosDecisionBar removido: a IA (extractFollowUpFromCall) já decide
// automaticamente entre criar follow-up (+2 dias úteis por padrão) ou
// promover o lead para a Central de Reuniões — zero cliques manuais.



function extractCompanyFromHistorico(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*(?:\*\*|__)?\s*EMPRESA\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*([^\n]+)/i);
  if (!m) return null;
  const name = m[1].replace(/\*\*|__/g, "").trim().replace(/[.\s]+$/, "");
  return name.length > 1 ? name.slice(0, 250) : null;
}

function extractContatoFromHistorico(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*(?:\*\*|__)?\s*CONTATO\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*([^\n]+)/i);
  if (!m) return null;
  const name = m[1].replace(/\*\*|__/g, "").trim().replace(/[.\s]+$/, "");
  return name.length > 1 ? name.slice(0, 200) : null;
}

function detectMeetingScheduled(text: string): boolean {
  return /reuni[aã]o\s+(agendada|marcada|confirmada)/i.test(text);
}

function extractCnpjFromHistorico(text: string): string | null {
  const m = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  return m ? m[0] : null;
}


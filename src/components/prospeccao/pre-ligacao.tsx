import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithAI, extractContactNameWithAI, lookupCnpj, transcribeAudio, searchCompanyByName, enrichPhones, interpretarStatusConversa } from "@/lib/prospeccao.functions";
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
  getPromptsByTema,
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
  getSessionConsultor,
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
  isRecording,
  startCallRecording,
} from "@/lib/call-recorder";
import { getRunningTimer, startTimer } from "@/lib/productivity-store";

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
  Users,
  Mail,
  Clock,
  HelpCircle,
  ThumbsDown,
  PhoneCall,
  CircleDollarSign,
  CheckCircle2,
  LogOut,
  MessageCircle,
  ArrowRight,
  X,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { HistoricoEmpresaSheet } from "@/components/prospeccao/historico-empresa-sheet";

import { useHotkey } from "@/hooks/use-hotkey";

import { CopyButton, loadSessaoAtiva, updateSessaoAtiva, clearSessaoAtiva, activeConsultorKey } from "@/routes/index";
import {
  PromptLibraryPanel,
  inferirSegmentoPorCnae,
  montarLeadFallback,
  preencherTagsDoScript,
  contemAlucinacaoDeExtracao,
  compileScriptLocally,
  parseLeadFromDados,
  parsePitchIntoCards,
  encontrarObjecaoEmOutrosPitchesDoTema,
  atualizarSecaoDoPitch,
  type ActiveLeadData,
} from "@/components/prospeccao/shared";
import { extractFinalScriptOnly } from "@/lib/script-output";

/** Payload de handoff da Preparação Noturna para a Pré-ligação. */
type PreHandoffPayload = {
  nome?: string;
  textoBruto?: string;
  preparationId?: string;
  razaoSocial?: string;
  cnpj?: string;
  contato?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
};

// ---- Caches em memória compartilhados entre montagens do componente ----
type LookupResult = Awaited<ReturnType<typeof lookupCnpj>>;
type Telefones = Awaited<ReturnType<typeof enrichPhones>>;
const lookupCache = new Map<string, LookupResult>();
const phonesCache = new Map<string, Telefones>();
const aiCache = new Map<string, string>();
const contactNameCache = new Map<string, string>();

type EmailDestinatario = { id: string; nome: string; funcao: string; contato: string };

type ObjecaoCard = {
  id: string;
  label: string;
  icon: LucideIcon;
  resposta: string;
  kind: "abertura" | "objecao" | "terminal";
  extra?: { gatilho: string; texto: string };
  routing?: { label: string; targetId: string }[];
  /** "pitch" = veio do PRÓPRIO pitch ativo (editável aqui);
   * "pitch-tema" = emprestado de outro pitch do mesmo tema/aba (editar abre
   * o pitch de origem, não edita aqui);
   * "sistema" = modelo genérico de reserva (não editável aqui). */
  origem?: "pitch" | "pitch-tema" | "sistema";
  origemPitchId?: string;
  origemPitchNome?: string;
};

function getExemploObjecao(segmento: string): string {
  if (segmento.includes("Metalurgia")) {
    return "Num caso parecido, encontramos oportunidade em eletrodos de solda e discos de corte que já tinham sido classificados como uso e consumo padrão.";
  }
  if (segmento.includes("Móveis") || segmento.includes("Madeira")) {
    return "Num caso parecido, encontramos oportunidade em lixas industriais e colas estruturais que ninguém tinha reavaliado.";
  }
  if (segmento.includes("Alimentos") || segmento.includes("Refrigeração")) {
    return "Num caso parecido, encontramos oportunidade em amônia de refrigeração e fluidos hidráulicos que passaram batido na primeira revisão.";
  }
  if (segmento.includes("Plástic")) {
    return "Num caso parecido, encontramos oportunidade em resinas termoplásticas e moldes de injeção que já estavam classificados como consumo padrão.";
  }
  return "Num caso parecido, encontramos oportunidade em peças de reposição e óleos industriais que já estavam classificados como consumo padrão.";
}

function montarAberturaGenerica(
  nomeAtivo: string,
  segmentoInfo: ReturnType<typeof inferirSegmentoPorCnae>,
  cidadeEstadoAtiva: string,
): ObjecaoCard {
  return {
    id: "abertura",
    label: "Abertura principal",
    icon: MessageCircle,
    kind: "abertura",
    resposta: `${nomeAtivo ? `Oi, ${nomeAtivo}, tudo bem?` : "Oi, tudo bem?"} Aqui é o Everton, da BHM Advogados.\n[pausa de 1 segundo — deixe a pessoa responder algo, mesmo que seja só "oi"]\nVou ser bem direto: eu estou falando com algumas indústrias de ${segmentoInfo.segmento || "vocês"} aí em ${cidadeEstadoAtiva} sobre a forma como certos materiais usados na produção — como ${segmentoInfo.insumos || "certos insumos"} — acabam sendo tratados na parte fiscal.\nQueria te mostrar isso rapidinho, em uns 10 minutos, online e sem custo, pra ver se faz sentido também pra vocês. Consegue amanhã de manhã ou à tarde?\n[depois de perguntar, PARE de falar. Espere a resposta. Não emende com mais explicação — quem emenda perde o fechamento]`,
  };
}

function montarObjecoesGenericas(
  nomeParaObjecoes: string,
  segmentoInfo: ReturnType<typeof inferirSegmentoPorCnae>,
): ObjecaoCard[] {
  return [
    {
      id: "contador",
      label: "Já tem contador/fiscal",
      icon: Users,
      kind: "objecao",
      resposta: `Faz todo sentido, ${nomeParaObjecoes} — na real, quase 100% das empresas que a gente atende já têm uma equipe fiscal ou contábil muito competente.\nE olha, mesmo assim, em cerca de 90% dessas empresas a gente encontrou alguma oportunidade que tinha passado batido — não porque alguém errou, mas porque o sistema classifica pelo cadastro, e a gente olha também como o material é usado de fato na produção.\n${getExemploObjecao(segmentoInfo.segmento ?? "")}\nPor isso vale os 10 minutos, mesmo já tendo revisão feita — é só pra comparar. Consegue amanhã de manhã ou à tarde?`,
    },
    {
      id: "email",
      label: "Manda por e-mail",
      icon: Mail,
      kind: "objecao",
      resposta: `Consigo sim te mandar um resumo, ${nomeParaObjecoes}, mas sem uma conversa rápida eu não sei ainda o que é relevante pro caso de vocês — ia te mandar algo genérico.\nOs 10 minutos servem exatamente pra eu entender o que faz sentido olhar aí e já te falar se vale a pena ou não. Prefere amanhã de manhã ou à tarde?`,
    },
    {
      id: "sem-tempo",
      label: "Sem tempo agora",
      icon: Clock,
      kind: "objecao",
      resposta: `Sem problema, ${nomeParaObjecoes}, nem precisa ser agora.\nSó me diz um horário melhor pra você essa semana — pode ser 10 minutos no fim do dia ou de manhã antes das reuniões começarem?`,
    },
    {
      id: "nao-decide",
      label: "Não decide sozinho",
      icon: HelpCircle,
      kind: "objecao",
      resposta: `Entendo, ${nomeParaObjecoes}, e nem precisa decidir nada agora — os 10 minutos são justamente pra levantar se existe algo concreto pra levar pra decisão.\nAssim você já chega pro diretor com um número, não com uma ideia solta. Faz sentido eu te mostrar isso primeiro pra você decidir se vale levar adiante? Amanhã de manhã ou à tarde?`,
      extra: {
        gatilho: "Insistiu que só o diretor decide",
        texto: "Sem problema, posso já agendar com você e o diretor junto, o que for melhor pra vocês.",
      },
    },
    {
      id: "sem-interesse",
      label: "Não tem interesse",
      icon: ThumbsDown,
      kind: "objecao",
      resposta: `Tudo bem, ${nomeParaObjecoes}, entendo.\nSó uma coisa rápida antes de desligar: normalmente esse "não interesse" é porque já revisaram isso a fundo, ou é mais porque agora não é prioridade?`,
      routing: [
        { label: "Foi tempo/prioridade →", targetId: "sem-tempo" },
        { label: "Já revisamos →", targetId: "contador" },
      ],
    },
    {
      id: "liga-depois",
      label: "Pede pra ligar depois",
      icon: PhoneCall,
      kind: "objecao",
      resposta: `Sem problema, ${nomeParaObjecoes}! Só pra eu não te pegar numa hora ruim de novo: qual o melhor dia e horário pra te ligar essa semana? Consigo amanhã de manhã ou à tarde, qual fica melhor?`,
    },
    {
      id: "quanto-custa",
      label: "Pergunta quanto custa",
      icon: CircleDollarSign,
      kind: "objecao",
      resposta: `Boa pergunta, ${nomeParaObjecoes} — e é exatamente isso que fica mais claro nos 10 minutos, porque o valor depende do que a gente encontra na operação de vocês; não tem uma tabela fixa porque cada caso é diferente.\nNesses 10 minutos eu já consigo te dar uma direção bem concreta sobre isso. Consegue amanhã de manhã ou à tarde?`,
    },
  ];
}

const CATEGORIAS_CANONICAS: { id: string; label: string; icon: LucideIcon; keywords: RegExp }[] = [
  { id: "contador", label: "Já tem contador/fiscal", icon: Users, keywords: /contador|fiscal|jur[ií]dico|consultoria|revis(ei|ão|amos)/i },
  { id: "email", label: "Manda por e-mail", icon: Mail, keywords: /e-?mail|whatsapp/i },
  { id: "sem-tempo", label: "Sem tempo agora", icon: Clock, keywords: /sem\s+tempo|corrid[oa]|agora\s+n[ãa]o/i },
  { id: "nao-decide", label: "Não decide sozinho", icon: HelpCircle, keywords: /n[ãa]o\s+decid|diretor|s[óo]cio/i },
  { id: "sem-interesse", label: "Não tem interesse", icon: ThumbsDown, keywords: /interesse|n[ãa]o,?\s+obrigad[oa]/i },
  { id: "liga-depois", label: "Pede pra ligar depois", icon: PhoneCall, keywords: /ligar\s+depois|melhor\s+hor[áa]rio|liga(r)?\s+outra\s+hora/i },
  { id: "quanto-custa", label: "Pergunta quanto custa", icon: CircleDollarSign, keywords: /custa|valor|pre[çc]o|quanto\s+fica/i },
];

export function PreLigacao({
  promptText,
}: {
  promptText: string;
}) {
  const rascunho = loadRascunho();
  const pre0 = rascunho.pre ?? {};
  const sess0 = loadSessaoAtiva();
  const [cnpj, setCnpj] = useState(sess0.cnpj ?? pre0.cnpj ?? "");
  const [dados, setDados] = useState(sess0.dados ?? pre0.dados ?? "");
  const [script, setScript] = useState(sess0.script ?? pre0.script ?? "");
  const [scriptOpen, setScriptOpen] = useState(true);
  const [empresaResumo, setEmpresaResumo] = useState<string | null>(sess0.empresaResumo ?? pre0.empresaResumo ?? null);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [nomeBusca, setNomeBusca] = useState(pre0.nomeBusca ?? "");
  const [reuniaoNome, setReuniaoNome] = useState((pre0 as Record<string, string>).reuniaoNome ?? "");
  const [reuniaoFuncao, setReuniaoFuncao] = useState((pre0 as Record<string, string>).reuniaoFuncao ?? "");
  const [reuniaoEmail, setReuniaoEmail] = useState((pre0 as Record<string, string>).reuniaoEmail ?? "");
  const [reuniaoData, setReuniaoData] = useState((pre0 as Record<string, string>).reuniaoData ?? "");
  const [reuniaoHora, setReuniaoHora] = useState((pre0 as Record<string, string>).reuniaoHora ?? "");
  const [emailMaterial, setEmailMaterial] = useState((pre0 as Record<string, string>).emailMaterial ?? "");
  const [emailDestinatarios, setEmailDestinatarios] = useState<EmailDestinatario[]>(
    (pre0 as unknown as { emailDestinatarios?: EmailDestinatario[] }).emailDestinatarios?.length
      ? (pre0 as unknown as { emailDestinatarios: EmailDestinatario[] }).emailDestinatarios
      : [{ id: "d1", nome: "", funcao: "", contato: "" }],
  );
  const destinatarioIdRef = useRef(2);
  function novoDestinatarioId() {
    return `d${destinatarioIdRef.current++}`;
  }
  function addDestinatarioEmail() {
    setEmailDestinatarios((prev) => [...prev, { id: novoDestinatarioId(), nome: "", funcao: "", contato: "" }]);
  }
  function removeDestinatarioEmail(id: string) {
    setEmailDestinatarios((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));
  }
  function updateDestinatarioEmail(id: string, campo: "nome" | "funcao" | "contato", valor: string) {
    setEmailDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)));
  }
  const [modoEsteira, setModoEsteira] = useState<boolean>(true);
  const [prepOpen, setPrepOpen] = useState<boolean>(true);
  const [currentLeadState, setCurrentLeadState] = useState<ActiveLeadData | null>(null);
  const [nomeAtivo, setNomeAtivo] = useState<string>("");
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [extrasRevelados, setExtrasRevelados] = useState<Set<string>>(new Set());
  const [historicoObjecoes, setHistoricoObjecoes] = useState<string[]>([]);
  const [contingenciaAtiva, setContingenciaAtiva] = useState<boolean>(false);
  const [conferirDadosOpen, setConferirDadosOpen] = useState<boolean>(true);
  const dadosSectionRef = useRef<HTMLDivElement | null>(null);
  const scriptSectionRef = useRef<HTMLDivElement | null>(null);
  const fluxoSectionRef = useRef<HTMLDivElement | null>(null);
  function scrollToScript() {
    setTimeout(() => {
      scriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  function scrollToFluxo() {
    setTimeout(() => {
      fluxoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  const dadosDirtyRef = useRef<boolean>(false);

  // ---- Biblioteca de prompts: pitch ATIVO + seus "irmãos" de tema (pra
  // resolver objeções que faltam no pitch ativo, passo 2 do fluxo de 3
  // passos: pitch ativo → pitch irmão do mesmo tema → sistema). ----
  const [libState, setLibState] = useState<PromptLibrary>(() =>
    typeof window === "undefined"
      ? { items: [], temas: [], activeTemaId: null, activeAbordagemId: null, activeHistoricoId: null }
      : loadLibrary(),
  );
  useEffect(() => {
    const h = () => setLibState(loadLibrary());
    window.addEventListener(PROMPT_LIBRARY_EVENT, h);
    setLibState(loadLibrary());
    return () => window.removeEventListener(PROMPT_LIBRARY_EVENT, h);
  }, []);
  const activePromptItem = useMemo(
    () => libState.items.find((p) => p.id === libState.activeAbordagemId) ?? null,
    [libState],
  );
  const pitchesIrmaosDoTema = useMemo(() => {
    if (!activePromptItem?.temaId) return [] as PromptItem[];
    return getPromptsByTema(activePromptItem.temaId).filter((p) => p.id !== activePromptItem.id);
  }, [activePromptItem, libState]);

  // ---- Edição de card (card é espelho do pitch — editar aqui grava lá) ----
  const [editandoCardId, setEditandoCardId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");

  useEffect(() => {
    function onLoad(ev: Event) {
      const detail = (ev as CustomEvent<PreHandoffPayload>).detail ?? {};
      limparRascunhoPre();
      clearRascunho();
      setCurrentLeadState(null);
      setContingenciaAtiva(false);
      dadosDirtyRef.current = false;
      setNomeAtivo("");
      setActiveStep(null);
      setExtrasRevelados(new Set());
      setHistoricoObjecoes([]);
      setPrepOpen(true);

      if (detail.preparationId) {
        try { window.sessionStorage.setItem(ACTIVE_PREPARATION_ID_KEY, detail.preparationId); } catch { /* noop */ }
      }
      const nome = (detail.nome ?? "").trim();
      const texto = (detail.textoBruto ?? "").trim();
      const razaoSocial = (detail.razaoSocial ?? "").trim();
      const contato = (detail.contato ?? "").trim();
      const cargo = (detail.cargo ?? "").trim();
      const telefone = (detail.telefone ?? "").trim();
      const email = (detail.email ?? "").trim();
      const cnpjDigits = (detail.cnpj ?? "").replace(/\D/g, "");
      if (texto && !dadosDirtyRef.current) {
        setDados(texto);
        dadosDirtyRef.current = true;
      }
      else if (texto && dadosDirtyRef.current) {
        toast.info("Mantendo suas edições no campo 'Dados da empresa'.");
      }
      if (texto) setConferirDadosOpen(false);
      const nomePrincipal = razaoSocial || nome;
      if (cnpjDigits) setCnpj(cnpjDigits);
      if (nomePrincipal) {
        const lead: ActiveLeadData = {
          cnpj: cnpjDigits,
          razaoSocial: nomePrincipal,
          nomeFantasia: nome || nomePrincipal,
          cnaePrincipal: "",
          cidade: "",
          uf: "",
          endereco: "",
          ...(contato ? { contatoNome: cargo ? `${contato} (${cargo})` : contato } : {}),
        };
        setActiveLead(lead);
        setCurrentLeadState(lead);
        setActiveStep("abertura");
        setHistoricoObjecoes(["abertura"]);
        const extras = [telefone, email].filter(Boolean).join(" · ");
        setEmpresaResumo(extras ? `${nomePrincipal} · ${extras}` : nomePrincipal);
      } else if (texto) {
        const parsed = parseLeadFromDados(texto, "");
        if (parsed) {
          setCurrentLeadState(parsed);
          setActiveLead(parsed);
          setEmpresaResumo(parsed.razaoSocial);
        }
      }
      toast.success(nomePrincipal ? `Lead carregado: ${nomePrincipal}` : "Lead carregado no Pré-ligação");
      if (cnpjDigits.length === 14) {
        setTimeout(() => { void handleLookup(cnpjDigits); }, 80);
      }
      setTimeout(() => {
        dadosSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
    window.addEventListener(LOAD_PRE_LIGACAO_EVENT, onLoad as EventListener);
    try {
      const raw = window.sessionStorage.getItem(PENDING_PRE_LIGACAO_KEY);
      if (raw) {
        window.sessionStorage.removeItem(PENDING_PRE_LIGACAO_KEY);
        const detail = JSON.parse(raw) as PreHandoffPayload;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(LOAD_PRE_LIGACAO_EVENT, { detail }));
        }, 50);
      }
    } catch { /* noop */ }
    return () => window.removeEventListener(LOAD_PRE_LIGACAO_EVENT, onLoad as EventListener);
  }, []);

  useEffect(() => {
    updateRascunho({
      pre: {
        cnpj,
        dados,
        script,
        empresaResumo,
        nomeBusca,
        reuniaoNome,
        reuniaoFuncao,
        reuniaoEmail,
        reuniaoData,
        reuniaoHora,
        emailMaterial,
        emailDestinatarios,
      } as Record<string, unknown>,
    });
    updateSessaoAtiva({ cnpj, dados, script, empresaResumo });
  }, [cnpj, dados, script, empresaResumo, nomeBusca, reuniaoNome, reuniaoFuncao, reuniaoEmail, reuniaoData, reuniaoHora, emailMaterial, emailDestinatarios]);

  function limparRascunhoPre() {
    setCnpj("");
    setDados("");
    dadosDirtyRef.current = false;
    setScript("");
    setEmpresaResumo(null);
    setNomeBusca("");
    setResultados([]);
    setTelefones(null);
    setReuniaoNome("");
    setReuniaoFuncao("");
    setReuniaoEmail("");
    setReuniaoData("");
    setReuniaoHora("");
    setEmailMaterial("");
    setEmailDestinatarios([{ id: "d1", nome: "", funcao: "", contato: "" }]);
    setConferirDadosOpen(true);
    updateRascunho({
      pre: {
        cnpj: "",
        dados: "",
        script: "",
        empresaResumo: null,
        nomeBusca: "",
        reuniaoNome: "",
        reuniaoFuncao: "",
        reuniaoEmail: "",
        reuniaoData: "",
        reuniaoHora: "",
        emailMaterial: "",
        emailDestinatarios: [],
      } as Record<string, unknown>,
    });
    updateSessaoAtiva({ cnpj: "", dados: "", script: "", empresaResumo: null, telefones: null });
  }

  function limparTudo() {
    limparRascunhoPre();
    setCurrentLeadState(null);
    clearRascunho();
    setActiveLead(null);
    setNomeAtivo("");
    setActiveStep(null);
    setExtrasRevelados(new Set());
    setHistoricoObjecoes([]);
    setPrepOpen(true);
    toast.success("Tudo limpo. Pronto para uma nova prospecção.");
  }

  const [loadingBusca, setLoadingBusca] = useState(false);
  type Match = Awaited<ReturnType<typeof searchCompanyByName>>["itens"][number];
  const [resultados, setResultados] = useState<Match[]>([]);

  const [telefones, setTelefones] = useState<Telefones | null>((sess0.telefones as Telefones | null) ?? null);
  const [loadingFones, setLoadingFones] = useState(false);

  const runLookup = useServerFn(lookupCnpj);
  const runGenerate = useServerFn(generateWithAI);
  const runExtractContactName = useServerFn(extractContactNameWithAI);
  const runSearchNome = useServerFn(searchCompanyByName);
  const runEnrichPhones = useServerFn(enrichPhones);

  async function extrairNomeContatoComIA(textoBruto: string): Promise<string> {
    const chave = textoBruto.trim();
    const cached = contactNameCache.get(chave);
    if (cached) return cached;
    const { nome } = await runExtractContactName({ data: { textoBruto } });
    const resultado = nome?.trim() || "tudo bem?";
    contactNameCache.set(chave, resultado);
    return resultado;
  }

  function normalizarNomeEmpresa(v: string) {
    return v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|industria|do|da|de|e)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function handleLookup(preset?: string) {
    const raw = (preset !== undefined ? preset : cnpj ?? "").toString();
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 0) {
      toast.error("Cole ou digite o CNPJ no campo antes de buscar");
      return;
    }
    if (digits.length !== 14) {
      toast.error(`CNPJ deve ter 14 dígitos (você informou ${digits.length})`);
      return;
    }
    setCnpj(digits);
    setLoadingCnpj(true);
    setTelefones(null);
    try {
      let r = lookupCache.get(digits);
      if (!r) {
        r = await runLookup({ data: { cnpj: digits } });
        lookupCache.set(digits, r);
      }
      const socios = r.socios
        .map((s) =>
          `- ${s.nome} (${s.qualificacao})` +
          (s.dataEntrada ? ` · desde ${s.dataEntrada}` : "") +
          (s.faixaEtaria ? ` · ${s.faixaEtaria}` : ""),
        )
        .join("\n");
      const cnaesSec = r.cnaesSecundarios.length
        ? r.cnaesSecundarios.map((c) => `  · ${c}`).join("\n")
        : "";
      const bloco = [
        `CNPJ: ${r.cnpj}${r.matrizFilial ? " (" + r.matrizFilial + ")" : ""}`,
        `Razão social: ${r.razaoSocial}`,
        r.nomeFantasia && `Nome fantasia: ${r.nomeFantasia}`,
        r.situacao &&
          `Situação cadastral: ${r.situacao}${r.dataSituacao ? " (" + r.dataSituacao + ")" : ""}`,
        r.dataAbertura && `Data de abertura: ${r.dataAbertura}`,
        r.naturezaJuridica && `Natureza jurídica: ${r.naturezaJuridica}`,
        r.porte &&
          `Porte: ${r.porte}` +
            (r.simples ? ` · Simples${r.dataSimples ? " desde " + r.dataSimples : ""}` : "") +
            (r.mei ? ` · MEI${r.dataMei ? " desde " + r.dataMei : ""}` : ""),
        r.capitalSocial && `Capital social: ${r.capitalSocial}`,
        r.cnaePrincipal && `Atividade principal (CNAE): ${r.cnaePrincipal}`,
        cnaesSec && `Atividades secundárias:\n${cnaesSec}`,
        r.endereco && `Endereço: ${r.endereco}`,
        (r.telefone1 || r.telefone2) &&
          `Telefone: ${[r.telefone1, r.telefone2].filter(Boolean).join(" / ")}`,
        r.email && `E-mail: ${r.email}`,
        r.enteFederativo && `Ente federativo: ${r.enteFederativo}`,
        socios && `Quadro societário:\n${socios}`,
      ]
        .filter(Boolean)
        .join("\n");
      if (!dadosDirtyRef.current) {
        setDados(bloco);
        setConferirDadosOpen(true);
      } else {
        toast.info("Mantendo suas edições no campo 'Dados da empresa' (busca automática não sobrescreveu).");
      }
      setScript("");
      setEmpresaResumo(
        `${r.razaoSocial || "Empresa"}${r.nomeFantasia ? " · " + r.nomeFantasia : ""}${r.porte ? " · " + r.porte : ""}`,
      );
      setResultados([]);

      const cidade = (r.endereco ?? "").split("·").find((e) => e.includes("/"))?.trim()?.split("/")[0]?.trim() ?? "";
      const uf = (r.endereco ?? "").split("·").find((e) => e.includes("/"))?.trim()?.split("/")[1]?.trim() ?? "";
      const leadAtual = {
        cnpj: digits,
        razaoSocial: r.razaoSocial,
        nomeFantasia: r.nomeFantasia || r.razaoSocial,
        cnaePrincipal: r.cnaePrincipal,
        cidade,
        uf,
        endereco: r.endereco,
      };
      setCurrentLeadState(leadAtual);
      setActiveLead(leadAtual);

      setContingenciaAtiva(false);
      toast.success("Dados carregados. Ajuste o prompt se quiser e depois processe o script.");

      const cachedPhones = phonesCache.get(digits);
      if (cachedPhones) setTelefones(cachedPhones);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      const instavel = /\b(429|403|500|502|503|504)\b/.test(msg)
        || /rate.?limit|too many|timeout|network|fetch|failed to fetch|econnreset|enotfound/i.test(msg);
      if (instavel) {
        setContingenciaAtiva(true);
        setConferirDadosOpen(true);
        toast.warning(
          "Bases públicas instáveis. O Modo Manual de Contingência foi ativado automaticamente.",
          { description: "Cole os dados da empresa direto no campo abaixo e siga com a ligação." },
        );
        setTimeout(() => {
          const ta = document.getElementById("dados") as HTMLTextAreaElement | null;
          ta?.focus();
        }, 50);
      } else {
        setEmpresaResumo(null);
        toast.error(msg || "Falha ao buscar CNPJ");
      }
    } finally {
      setLoadingCnpj(false);
    }
  }

  async function handleEnrichPhones() {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("Busque um CNPJ válido antes de enriquecer telefones");
      return;
    }
    const cached = phonesCache.get(digits);
    if (cached) {
      setTelefones(cached);
      toast.info("Telefones carregados do cache (sem gastar créditos)");
      return;
    }
    setLoadingFones(true);
    try {
      const res = await runEnrichPhones({ data: { cnpj: digits } });
      phonesCache.set(digits, res);
      setTelefones(res);
      updateSessaoAtiva({ telefones: res });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar telefones");
    } finally {
      setLoadingFones(false);
    }
  }

  async function handleBuscaNome() {
    const termo = nomeBusca.trim();
    if (termo.length < 3) {
      toast.error("Digite ao menos 3 caracteres do nome / razão social");
      return;
    }
    const digits = termo.replace(/\D/g, "");
    if (digits.length === 14) {
      setCnpj(digits);
      await handleLookup(digits);
      return;
    }
    setLoadingBusca(true);
    setResultados([]);
    try {
      const r = await runSearchNome({ data: { nome: termo } });
      if (r.itens.length === 0) {
        toast.warning("Nenhuma empresa encontrada com esse nome");
        return;
      }
      if (r.itens.length === 1) {
        const unico = r.itens[0];
        setCnpj(unico.cnpj);
        await handleLookup(unico.cnpj);
        return;
      }
      setResultados(r.itens);
      toast.success(`${r.itens.length} resultado(s) — clique numa empresa para carregar todos os dados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na busca por nome");
    } finally {
      setLoadingBusca(false);
    }
  }

  async function handleGenerate() {
    if (!dados.trim()) {
      toast.error("Cole ou busque os dados da empresa primeiro");
      return;
    }
    if (!promptText.trim()) {
      toast.error(
        "Nenhum prompt de abordagem ativo. Abra 'Biblioteca de prompts' e selecione ou crie um.",
      );
      return;
    }
    setLoadingGen(true);
    setScript("");
    try {
      const parsedLead = parseLeadFromDados(dados, cnpj);
      const leadBase = parsedLead ?? currentLeadState ?? montarLeadFallback(dados, cnpj, empresaResumo);
      const nomeContatoIA = await extrairNomeContatoComIA(dados.trim());
      setNomeAtivo(nomeContatoIA);
      const lead = { ...leadBase, contatoNome: nomeContatoIA };
      setCurrentLeadState(lead);
      setActiveLead(lead);
      setActiveStep((prev) => prev ?? "abertura");
      setHistoricoObjecoes((prev) => (prev.length ? prev : ["abertura"]));
      const hydratedPromptText = preencherTagsDoScript(promptText, lead, dados.trim(), nomeContatoIA);
      const diaSemana = new Date().toLocaleDateString("pt-BR", { weekday: "long" });
      const valoresValidados = inferirSegmentoPorCnae(`${lead.cnaePrincipal ?? ""}\n${dados.trim()}`);
      const nomeValidado = nomeContatoIA;
      const cidadeValidada = lead.cidade?.trim() || "aí na região";
      const cidadeEstadoValidada = lead.cidade && lead.uf ? `${lead.cidade}/${lead.uf}` : cidadeValidada;

      const systemInstruction = `Você é um extrator de dados CIRÚRGICO da BHM Advogados. Sua única função é ler os dados do lead e preencher o template. É ESTRITAMENTE PROIBIDO INVENTAR informações ou alucinar.

PRIORIDADE ABSOLUTA: se o bloco [VALORES VALIDADOS PELO SISTEMA] existir, use esses valores como fonte final para {NOME}, {SEGMENTO}, {INSUMOS}, {CIDADE} e {CIDADE_ESTADO}. Não reinterpretar esses campos.

REGRAS DE EXTRAÇÃO E PREENCHIMENTO:

1. {NOME} — TRAVA ANTI-ALUCINAÇÃO:
   - Deve ser ÚNICA E EXCLUSIVAMENTE um NOME HUMANO PRÓPRIO (ex: Rafaela, Aline, Walter, Ezio, Mateus, Felipe).
   - 🛑 EXPRESSAMENTE PROIBIDO usar títulos de layout, seções, verbos ou substantivos comuns como: "Inscrições", "Sócios", "Atividades", "Fabricação", "Comércio", "Estruturas", "Metálicas", "Administrador", "Administradores", "Empresa", "Contatos", "Quadro", "Societário", "Fiscal", "Financeiro", "Estaduais", "SUFRAMA", "CNAE", "LTDA", "SA", "ME", "EPP", "HOLDING".
   - 🛑 PROIBIDO usar Razão Social, nome fantasia ou qualquer nome corporativo (FLORENSE, BARBIERI, BHM etc.).
   - HIERARQUIA RÍGIDA:
     1º) Nome humano próprio de pessoa em cargo Financeiro / Fiscal / Contábil / Controladoria / Administrativo (ex: "Rafaela Bueno - Assistente Financeiro" → "Rafaela").
     2º) Nome humano próprio de Administrador / Sócio pessoa física (ignorar sócios PJ).
     3º) Se NÃO existir NENHUM humano identificável, use literalmente: "tudo bem?".
   - Sempre use apenas o PRIMEIRO NOME com inicial maiúscula.

2. {SEGMENTO} e {INSUMOS} — TRAVA ANTI-ALUCINAÇÃO DE SETOR:
   - Leia OBRIGATORIAMENTE a seção de CNAE / Atividades Econômicas / Atividade Principal.
   - 🛑 JAMAIS invente setor. Se a atividade principal for de metal/aço/ferro/estruturas metálicas, NUNCA use Têxtil, Alimentos, Madeira etc.
   - Mapeamento OBRIGATÓRIO por CNAE/descrição:
     * CNAE 25xx ou descrição contendo "metálic", "metalurgia", "aço", "ferro", "estruturas metálicas", "usinagem", "solda", "caldeiraria" → {SEGMENTO} = "Metalurgia e Metalmecânica" | {INSUMOS} = "eletrodos de solda, discos de corte abrasivos e rebolos de desbaste"
     * CNAE 31xx ou descrição contendo "móveis", "madeira", "marcenaria", "MDF" → {SEGMENTO} = "Móveis e Artefatos de Madeira" | {INSUMOS} = "lixas industriais, brocas de vídea e colas estruturais"
     * CNAE 10xx/11xx ou descrição contendo "alimento", "laticínio", "frigorífic", "bebida" → {SEGMENTO} = "Alimentos e Refrigeração" | {INSUMOS} = "fluidos hidráulicos protetivos, amônia para refrigeração e esteiras de lavagem"
     * CNAE 22xx ou descrição contendo "plástic", "polímer", "borracha" → {SEGMENTO} = "Plásticos e Transformação" | {INSUMOS} = "resinas termoplásticas, moldes de injeção e aditivos de processo"
   - Se o CNAE não se encaixar nas categorias acima, use um segmento GENÉRICO derivado literalmente da descrição do CNAE principal (ex: "Comércio atacadista"). NUNCA invente insumos que não pertençam ao setor real.

3. {CIDADE} e {CIDADE_ESTADO}: Extraia o Município e a UF do endereço (ex: "Almirante Tamandaré" e "Almirante Tamandaré/PR"). Se ausente, use "aí na região".

É TERMINANTEMENTE PROIBIDO manter chaves { } ou colchetes [ ] na resposta final. Retorne APENAS o diálogo do script totalmente preenchido.`;

      const userContent = `[DADOS DO LEAD]:
${dados.trim()}

[VALORES VALIDADOS PELO SISTEMA — USE SEM REINTERPRETAR]:
{NOME}: ${nomeValidado}
{SEGMENTO}: ${valoresValidados.segmento}
{INSUMOS}: ${valoresValidados.insumos}
{CIDADE}: ${cidadeValidada}
{CIDADE_ESTADO}: ${cidadeEstadoValidada}

[DIA DA SEMANA ATUAL]:
${diaSemana}

[TEMPLATE DO SCRIPT PARA VOCÊ PREENCHER E RETORNAR]:
${hydratedPromptText}

COMANDO DE EXECUÇÃO: Com base EXCLUSIVAMENTE nos [DADOS DO LEAD] acima, gere o script de Cold Call substituindo TODAS as tags {NOME}, {SEGMENTO}, {CIDADE}, {CIDADE_ESTADO} e {INSUMOS} pelos dados reais extraídos. É proibido retornar chaves { } no texto.`;

      const cacheKey = `${systemInstruction}\u0000${userContent}`;
      const cached = aiCache.get(cacheKey);
      if (cached) {
        setScript(extractFinalScriptOnly(preencherTagsDoScript(cached, lead, dados.trim(), nomeContatoIA)));
        setScriptOpen(false);
        setPrepOpen(false);
        scrollToFluxo();
        void autoIniciarGravacao();
        toast.info("Script recuperado do cache (sem gastar créditos de IA)");
        return;
      }

      const { text } = await runGenerate({
        data: { systemPrompt: systemInstruction, userContent, modo: "script" as const },
      });
      const enforcedText = extractFinalScriptOnly(
        preencherTagsDoScript(text, lead, dados.trim(), nomeContatoIA),
      );
      const finalText = contemAlucinacaoDeExtracao(enforcedText, lead, dados.trim(), nomeContatoIA)
        ? compileScriptLocally(promptText, lead, dados.trim(), nomeContatoIA)
        : enforcedText;
      aiCache.set(cacheKey, finalText);

      setScript(finalText);
      setScriptOpen(false);
      setPrepOpen(false);
      scrollToFluxo();
      void autoIniciarGravacao();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setLoadingGen(false);
    }
  }

  async function autoIniciarGravacao() {
    if (isRecording()) return;
    const nome =
      currentLeadState?.razaoSocial ||
      currentLeadState?.nomeFantasia ||
      empresaResumo?.split("·")[0]?.trim() ||
      "";
    try {
      await startCallRecording({ vadTimeoutMs: 45_000 });
      if (!getRunningTimer()) startTimer(nome || "Empresa", currentLeadState?.cnpj ?? cnpj ?? null);
    } catch {
      /* microfone indisponível: segue com a transcrição manual como fonte */
    }
  }

  async function handleProcessScript() {
    if (modoEsteira) {
      let lead = parseLeadFromDados(dados, cnpj) ?? currentLeadState;
      if (!lead && dados.trim()) {
        lead = montarLeadFallback(dados, cnpj, empresaResumo);
        setCurrentLeadState(lead);
        setActiveLead(lead);
      }
      if (lead) {
        setCurrentLeadState(lead);
        setActiveLead(lead);
      }
      if (!lead) {
        toast.error("Cole os dados da empresa no campo abaixo antes de compilar.");
        return;
      }

      setLoadingGen(true);
      try {
        const nomeContatoIA = await extrairNomeContatoComIA(dados.trim());
        setNomeAtivo(nomeContatoIA);
        const leadComContato = { ...lead, contatoNome: nomeContatoIA };
        setCurrentLeadState(leadComContato);
        setActiveLead(leadComContato);
        setActiveStep((prev) => prev ?? "abertura");
        setHistoricoObjecoes((prev) => (prev.length ? prev : ["abertura"]));
        const compiled = compileScriptLocally(promptText, leadComContato, dados.trim(), nomeContatoIA);
        setScript(compiled);
        setPrepOpen(false);
        void autoIniciarGravacao();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao extrair contato");
        return;
      } finally {
        setLoadingGen(false);
      }
      setScriptOpen(false);
      scrollToFluxo();
      toast.success(
        currentLeadState
          ? "Script compilado com contato extraído por IA."
          : "Script compilado a partir dos dados manuais com contato extraído por IA.",
      );
      return;
    }
    void handleGenerate();
  }

  async function copyScript() {
    if (!script.trim()) {
      toast.error("Nenhum script gerado ainda");
      return;
    }
    await navigator.clipboard.writeText(script);
    toast.success("Script copiado");
  }

  useHotkey({ key: "s", alt: true, allowInField: true }, () => {
    void copyScript();
  });

  function downloadScript() {
    const nome = (empresaResumo?.split("·")[0] ?? "script").trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_") || "script";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Download iniciado");
  }

  const lookupRef = useRef(handleLookup);
  lookupRef.current = handleLookup;
  useEffect(() => {
    const onLead = () => {
      const lead = getActiveLead();
      const digits = (lead?.cnpj ?? "").replace(/\D/g, "");
      if (digits.length !== 14) return;
      if (digits === (cnpj || "").replace(/\D/g, "")) return;
      if (dadosDirtyRef.current) return;
      setCnpj(digits);
      setTimeout(() => {
        void lookupRef.current(digits);
      }, 0);
    };
    window.addEventListener(ACTIVE_LEAD_EVENT, onLead);
    return () => window.removeEventListener(ACTIVE_LEAD_EVENT, onLead);
  }, [cnpj]);

  const nomeParaObjecoes = nomeAtivo || "tudo bem?";
  const segmentoInfo = useMemo(
    () => inferirSegmentoPorCnae(`${currentLeadState?.cnaePrincipal ?? ""}\n${dados}`),
    [currentLeadState, dados],
  );
  const cidadeEstadoAtiva = useMemo(() => {
    const cidade = currentLeadState?.cidade?.trim() || "";
    const uf = currentLeadState?.uf?.trim() || "";
    if (cidade && uf) return `${cidade}/${uf}`;
    return cidade || "aí na região";
  }, [currentLeadState]);

  // ---- Cards do fluxo, derivados do PITCH ATIVO ----
  // Para cada categoria de objeção, resolve em 3 passos: (1) pitch ativo,
  // (2) outro pitch do MESMO tema/aba, (3) modelo genérico do sistema (com
  // aviso). Nunca inventa: o que é do sistema é sempre identificado.
  const parsedPitch = useMemo(() => parsePitchIntoCards(promptText), [promptText]);

  const cardsCalculados = useMemo(() => {
    const leadParaTags = currentLeadState ?? montarLeadFallback(dados, cnpj, empresaResumo);
    const nomeParaTags = nomeAtivo || "tudo bem?";
    const hidratar = (t: string) => preencherTagsDoScript(t, leadParaTags, dados, nomeParaTags);
    const hidratarExtra = (e?: { gatilho: string; texto: string }) =>
      e ? { gatilho: e.gatilho, texto: hidratar(e.texto) } : undefined;

    // Abertura: não é "emprestada" de outro pitch do tema — só pitch próprio
    // ou fallback do sistema (cada pitch tem a sua abertura).
    const aberturaFinal: ObjecaoCard = parsedPitch.abertura
      ? {
          id: "abertura",
          label: "Abertura principal",
          icon: MessageCircle,
          kind: "abertura",
          resposta: hidratar(parsedPitch.abertura.resposta),
          extra: hidratarExtra(parsedPitch.abertura.extra),
          origem: "pitch",
        }
      : { ...montarAberturaGenerica(nomeAtivo, segmentoInfo, cidadeEstadoAtiva), origem: "sistema" };

    const genericasMap = new Map(
      montarObjecoesGenericas(nomeParaObjecoes, segmentoInfo).map((c) => [c.id, c]),
    );
    const objecoesFinal: ObjecaoCard[] = [];
    const usados = new Set<number>();

    for (const cat of CATEGORIAS_CANONICAS) {
      // Passo 1: pitch ativo
      const idx = parsedPitch.objecoes.findIndex(
        (p, i) => !usados.has(i) && cat.keywords.test(`${p.label} ${p.resposta}`),
      );
      if (idx >= 0) {
        usados.add(idx);
        const p = parsedPitch.objecoes[idx];
        objecoesFinal.push({
          id: cat.id,
          label: p.label || cat.label,
          icon: cat.icon,
          kind: "objecao",
          resposta: hidratar(p.resposta),
          extra: hidratarExtra(p.extra),
          origem: "pitch",
        });
        continue;
      }

      // Passo 2: outro pitch do mesmo tema
      const emprestada = encontrarObjecaoEmOutrosPitchesDoTema(pitchesIrmaosDoTema, cat.keywords);
      if (emprestada) {
        objecoesFinal.push({
          id: cat.id,
          label: emprestada.card.label || cat.label,
          icon: cat.icon,
          kind: "objecao",
          resposta: hidratar(emprestada.card.resposta),
          extra: hidratarExtra(emprestada.card.extra),
          origem: "pitch-tema",
          origemPitchId: emprestada.pitchOrigemId,
          origemPitchNome: emprestada.pitchOrigemNome,
        });
        continue;
      }

      // Passo 3: fallback genérico do sistema (por categoria)
      const generico = genericasMap.get(cat.id);
      objecoesFinal.push({
        id: cat.id,
        label: generico?.label ?? cat.label,
        icon: cat.icon,
        kind: "objecao",
        resposta: generico ? hidratar(generico.resposta) : "",
        extra: generico?.extra ? hidratarExtra(generico.extra) : undefined,
        origem: "sistema",
      });
    }

    // Objeções do pitch ativo que não bateram com nenhuma categoria comum
    // viram cards extras — conteúdo real do usuário, fora do padrão.
    parsedPitch.objecoes.forEach((p, i) => {
      if (usados.has(i)) return;
      objecoesFinal.push({
        id: p.id,
        label: p.label,
        icon: HelpCircle,
        kind: "objecao",
        resposta: hidratar(p.resposta),
        extra: hidratarExtra(p.extra),
        origem: "pitch",
      });
    });

    return { aberturaFinal, objecoesFinal };
  }, [
    parsedPitch,
    currentLeadState,
    dados,
    cnpj,
    empresaResumo,
    nomeAtivo,
    nomeParaObjecoes,
    segmentoInfo,
    cidadeEstadoAtiva,
    pitchesIrmaosDoTema,
  ]);

  const abertura = cardsCalculados.aberturaFinal;
  const objecoes = cardsCalculados.objecoesFinal;

  function irParaStep(id: string) {
    setActiveStep(id);
    setEditandoCardId(null);
    setHistoricoObjecoes((prev) => {
      const idx = prev.indexOf(id);
      if (idx !== -1) return prev.slice(0, idx + 1);
      return [...prev, id];
    });
    setScriptOpen(false);
    setTimeout(() => {
      document.getElementById(`objecao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  useEffect(() => {
    if (activeStep !== "fechamento" || reuniaoNome) return;
    const contato = currentLeadState?.contatoNome?.trim();
    if (!contato) return;
    const match = contato.match(/^(.*?)\s*\((.*)\)\s*$/);
    if (match) {
      setReuniaoNome(match[1].trim());
      if (!reuniaoFuncao) setReuniaoFuncao(match[2].trim());
    } else {
      setReuniaoNome(contato);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  useEffect(() => {
    if (activeStep !== "email") return;
    const jaTemNome = emailDestinatarios.some((d) => d.nome.trim());
    if (jaTemNome) return;
    const contato = currentLeadState?.contatoNome?.trim();
    if (!contato) return;
    const match = contato.match(/^(.*?)\s*\((.*)\)\s*$/);
    setEmailDestinatarios((prev) => {
      const primeiro = prev[0] ?? { id: "d1", nome: "", funcao: "", contato: "" };
      const atualizado = match
        ? { ...primeiro, nome: match[1].trim(), funcao: primeiro.funcao || match[2].trim() }
        : { ...primeiro, nome: contato };
      return [atualizado, ...prev.slice(1)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  async function copyResumoEmail() {
    const empresa = currentLeadState?.razaoSocial ?? empresaResumo ?? "Empresa";
    const linhasDestinatarios = emailDestinatarios
      .filter((d) => d.nome.trim() || d.contato.trim())
      .map((d) => {
        const partes = [
          d.nome.trim(),
          d.funcao.trim() && `(${d.funcao.trim()})`,
          d.contato.trim() && `— ${d.contato.trim()}`,
        ].filter(Boolean).join(" ");
        return `- ${partes}`;
      });
    const linhas = [
      `Empresa: ${empresa}`,
      emailMaterial.trim() && `Enviar: ${emailMaterial.trim()}`,
      linhasDestinatarios.length ? `Destinatários:\n${linhasDestinatarios.join("\n")}` : "",
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(linhas);
    toast.success("Resumo do envio copiado");
  }

  async function copyResumoReuniao() {
    const empresa = currentLeadState?.razaoSocial ?? empresaResumo ?? "Empresa";
    const linhas = [
      `Empresa: ${empresa}`,
      reuniaoNome && `Contato: ${reuniaoNome}`,
      reuniaoFuncao && `Função: ${reuniaoFuncao}`,
      reuniaoEmail && `E-mail: ${reuniaoEmail}`,
      (reuniaoData || reuniaoHora)
        ? `Reunião: ${reuniaoData || "(data a definir)"}${reuniaoHora ? ` às ${reuniaoHora}` : ""}`
        : "",
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(linhas);
    toast.success("Resumo da reunião copiado");
  }

  function fecharStep() {
    setActiveStep(null);
    setEditandoCardId(null);
  }

  function toggleExtra(id: string) {
    setExtrasRevelados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyObjecaoResposta(texto: string) {
    const limpo = texto
      .split("\n")
      .filter((linha) => !/^\s*\[.*\]\s*$/.test(linha))
      .join("\n")
      .trim();
    await navigator.clipboard.writeText(limpo);
    toast.success("Resposta copiada");
  }

  // ---- Edição de card (card é espelho do pitch ativo) ----
  function textoBrutoParaEdicao(card: ObjecaoCard): string {
    if (card.kind === "abertura") return parsedPitch.abertura?.resposta ?? "";
    const achado = parsedPitch.objecoes.find((o) => o.label === card.label);
    return achado?.resposta ?? "";
  }

  function iniciarEdicaoCard(card: ObjecaoCard) {
    setTextoEdicao(textoBrutoParaEdicao(card));
    setEditandoCardId(card.id);
  }

  function cancelarEdicaoCard() {
    setEditandoCardId(null);
    setTextoEdicao("");
  }

  function salvarEdicaoCard(card: ObjecaoCard) {
    if (!activePromptItem) {
      toast.error("Não identifiquei o pitch ativo — nada foi salvo. Recarregue a página e tente de novo.");
      return;
    }
    if (!textoEdicao.trim()) {
      toast.error("O texto não pode ficar vazio.");
      return;
    }
    const alvo = card.kind === "abertura" ? ({ tipo: "abertura" } as const) : ({ tipo: "objecao", label: card.label } as const);
    const { textoAtualizado, encontrou } = atualizarSecaoDoPitch(activePromptItem.conteudo, alvo, textoEdicao.trim());
    if (!encontrou) {
      toast.error("Não encontrei essa seção dentro do pitch pra atualizar. Nada foi alterado — me avisa que eu olho.");
      return;
    }
    updatePrompt(activePromptItem.id, { conteudo: textoAtualizado });
    toast.success("Card atualizado — já gravado no pitch.");
    setEditandoCardId(null);
    setTextoEdicao("");
  }

  function irEditarPitchDeOrigem(card: ObjecaoCard) {
    if (!card.origemPitchId) return;
    setActivePrompt("abordagem", card.origemPitchId);
    toast.info(`"${card.origemPitchNome}" agora é o pitch ativo. Abra "Biblioteca de prompts" acima pra editar essa objeção.`);
  }

  const terminais: ObjecaoCard[] = [
    {
      id: "fechamento",
      label: "Fechou! Confirmar horário",
      icon: CheckCircle2,
      kind: "terminal",
      resposta: `Perfeito, ${nomeParaObjecoes}! Então fico de te chamar amanhã pra essa conversa de 10 minutinhos, combinado? Te mando um lembrete antes. Muito obrigado pelo seu tempo!`,
    },
    {
      id: "encerrar",
      label: "Não quis, encerrar com respeito",
      icon: LogOut,
      kind: "terminal",
      resposta: `Tudo bem, ${nomeParaObjecoes}, entendo completamente. Fico à disposição se mudar de ideia. Muito obrigado pelo seu tempo, tenha um ótimo dia!`,
    },
  ];

  const todosOsCardsObjecao = [abertura, ...objecoes, ...terminais];
  function labelDoCardObjecao(id: string) {
    return todosOsCardsObjecao.find((c) => c.id === id)?.label ?? id;
  }
  function cardById(id: string) {
    return todosOsCardsObjecao.find((c) => c.id === id) ?? null;
  }
  const cardAtivo = activeStep ? cardById(activeStep) : null;

  return (

    <Card className="relative overflow-hidden border-border bg-card p-0 shadow-sm">
      <CardHeader className="flex flex-col gap-2 space-y-0 rounded-none border-b border-navy-deep bg-navy-deep px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <CardTitle className="font-display text-base tracking-wide text-white sm:text-lg">
          Pré-ligação · Script de abordagem
        </CardTitle>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-white/50 hover:bg-white/10 hover:text-white/90"
                title="Limpar tudo"
                aria-label="Limpar tudo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar tudo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso vai apagar o CNPJ, os dados da empresa, o script gerado e o lead ativo desta tela para começar uma nova prospecção do zero. Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={limparTudo}>Limpar tudo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">

        <PromptLibraryPanel tipo="abordagem" />

        <Collapsible open={prepOpen} onOpenChange={setPrepOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <span>{prepOpen ? "▼" : "▶"}</span>
                <span>
                  {prepOpen
                    ? "Preparação da ligação (empresa, dados, script)"
                    : `Preparação concluída${empresaResumo ? ` — ${empresaResumo.split("·")[0]?.trim()}` : ""}`}
                </span>
              </span>
              {!prepOpen && <span className="text-[11px] font-normal underline">Editar</span>}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">

        <div className="relative space-y-3 pl-6">
          <div className="absolute bottom-1 left-[9px] top-1 w-px bg-border" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <span className="relative z-10 -ml-6 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
              1
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Buscar empresa
            </span>
          </div>

        {!cnpj.trim() && !dados.trim() && !nomeBusca.trim() && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Cole um CNPJ ou o nome da empresa logo abaixo para começar.
          </p>
        )}

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="busca-empresa"
              value={nomeBusca}
              onChange={(e) => setNomeBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuscaNome()}
              placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"
              className="h-11 pl-9 pr-20 text-sm"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {nomeBusca && !loadingBusca && !loadingCnpj && (
                <button
                  type="button"
                  onClick={() => setNomeBusca("")}
                  aria-label="Limpar busca"
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 px-2.5"
                onClick={handleBuscaNome}
                disabled={loadingBusca || loadingCnpj}
                aria-label="Buscar"
              >
                {loadingBusca || loadingCnpj ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            CNPJ completo busca direto na BrasilAPI · nome, fantasia ou sócio busca via CNPJá.
          </p>

          {resultados.length > 0 && (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
              {resultados.map((m) => (
                <li key={m.cnpj}>
                  <button
                    type="button"
                    onClick={() => {
                      setCnpj(m.cnpj);
                      handleLookup(m.cnpj);
                    }}
                    className="w-full cursor-pointer rounded border border-transparent p-2 text-left text-xs transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="font-medium">
                      {m.razaoSocial}
                      {m.nomeFantasia && (
                        <span className="text-muted-foreground"> · {m.nomeFantasia}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.cnpjFormatado}
                      {m.tipo && ` · ${m.tipo}`}
                      {m.situacao && ` · ${m.situacao}`}
                      {m.cidadeUf && ` · ${m.cidadeUf}`}
                    </div>
                    {m.atividade && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {m.atividade}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {empresaResumo && (
            <p className="rounded border border-gold/30 bg-gold/10 px-2 py-1 text-xs text-gold-soft">
              {empresaResumo} — dados adicionados abaixo
            </p>
          )}

          {(currentLeadState?.razaoSocial || empresaResumo) && (
            <div className="flex flex-wrap items-center gap-2">
              <HistoricoEmpresaSheet
                empresa={currentLeadState?.razaoSocial ?? empresaResumo ?? null}
                cnpj={currentLeadState?.cnpj ?? cnpj ?? null}
              />
              {empresaResumo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleEnrichPhones}
                  disabled={loadingFones}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  title="Consulta CNPJ.biz + site oficial via Firecrawl (consome créditos)"
                >
                  {loadingFones ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-3 w-3" />
                  )}
                  Buscar mais telefones
                </Button>
              )}
            </div>
          )}

          {(loadingFones || telefones) && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  Telefones da empresa
                  {loadingFones && <Loader2 className="h-3 w-3 animate-spin" />}
                  {telefones && telefones.telefones.length > 0 && (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium">
                      {telefones.telefones.length}
                    </span>
                  )}
                </div>
                {telefones && telefones.telefones.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const txt = telefones.telefones
                        .map((t) => (t.setor ? `${t.numero} — ${t.setor}` : t.numero))
                        .join("\n");
                      await navigator.clipboard.writeText(txt);
                      toast.success("Todos os telefones copiados");
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar todos
                  </Button>
                )}
              </div>

              {telefones && telefones.siteOficial && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Site identificado:{" "}
                  <a
                    href={telefones.siteOficial}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {telefones.siteOficial.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              )}

              {telefones && telefones.telefones.length === 0 && !loadingFones && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum telefone encontrado nas fontes consultadas.
                </p>
              )}

              {telefones && telefones.telefones.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {telefones.telefones.map((t, i) => (
                    <li
                      key={t.numero + i}
                      className="flex items-center justify-between gap-2 rounded bg-background px-2 py-1.5 text-xs"
                    >
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className="font-mono font-medium">{t.numero}</span>
                        {t.setor && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {t.setor}
                          </span>
                        )}
                        <span className="truncate text-[10px] text-muted-foreground">
                          {t.fontes.join(" · ")}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={async () => {
                          await navigator.clipboard.writeText(t.numero);
                          toast.success(`Copiado: ${t.numero}`);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {telefones && telefones.fontesFalhas.length > 0 && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Fontes sem retorno:{" "}
                  {telefones.fontesFalhas.map((f) => `${f.fonte} (${f.motivo})`).join(" · ")}
                </p>
              )}
            </div>
          )}

        </div>

        <Collapsible
          open={conferirDadosOpen}
          onOpenChange={setConferirDadosOpen}
          className="border-t border-border/60 pt-3"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="relative z-10 -ml-6 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
                  2
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {conferirDadosOpen
                    ? "Conferir dados"
                    : `Dados confirmados${empresaResumo ? ` — ${empresaResumo.split("·")[0]?.trim()}` : ""}`}
                </span>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground underline">
                {conferirDadosOpen ? "recolher" : "revisar"}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-3">

        <div ref={dadosSectionRef}>

          {contingenciaAtiva && (
            <div className="mb-2 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
              <span className="mt-0.5 shrink-0 text-base leading-none">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  Modo Manual de Contingência ativo
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                  As bases públicas (BrasilAPI/CNPJá) estão instáveis. A busca automática foi desativada — cole os dados da empresa manualmente no campo abaixo.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="dados" className="text-xs">
              Dados da empresa
            </Label>
          </div>
          <Textarea
            id="dados"
            value={dados}
            onChange={(e) => {
              dadosDirtyRef.current = true;
              setDados(e.target.value);
            }}
            rows={9}
            placeholder={
              contingenciaAtiva
                ? "APIs públicas fora do ar. Cole aqui os dados coletados manualmente (Razão social, CNPJ, CNAE, Endereço...) e clique em Compilar Script."
                : "Cole aqui CNPJ, razão social, sócios, atividade, contato do fiscal, etc. Ou use a busca acima."
            }
            className={`mt-1 text-sm ${contingenciaAtiva ? "border-amber-400 focus-visible:ring-amber-400/40" : ""}`}
          />
        </div>

          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <span className="relative z-10 -ml-6 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
            3
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Gerar script
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              Modo Esteira <span className="text-primary">(Contato por IA)</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {modoEsteira
                ? "Compila o script a partir do prompt + dados do lead e delega o nome do contato à IA."
                : "Usa o Lovable AI Gateway para gerar o script (consome créditos)."}
            </span>
          </div>
          <Switch
            checked={modoEsteira}
            onCheckedChange={setModoEsteira}
            aria-label="Alternar Modo Esteira"
          />
        </div>

        <Button
          onClick={handleProcessScript}
          disabled={loadingGen}
          size="lg"
          className="h-12 w-full text-base font-semibold"
        >
          {loadingGen ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Gerando...
            </>
          ) : modoEsteira ? (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Compilar script
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Gerar script com IA
            </>
          )}
        </Button>

        </div>

          </CollapsibleContent>
        </Collapsible>

        {script && (
          <div ref={scriptSectionRef}>
          <Collapsible
            open={scriptOpen}
            onOpenChange={setScriptOpen}
            className="rounded-md border bg-muted/30"
          >
            <div className="flex items-center justify-between gap-2 p-3">
              <CollapsibleTrigger asChild>
                <button className="flex flex-1 items-center gap-2 text-left text-xs font-medium hover:underline">
                  <span>{scriptOpen ? "▼" : "▶"}</span>
                  <span>Ver texto completo do script</span>
                  <span className="text-muted-foreground">
                    ({scriptOpen ? "clique para recolher" : "clique para expandir"})
                  </span>
                </button>
              </CollapsibleTrigger>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" onClick={downloadScript}>
                  <Download className="mr-1 h-3 w-3" />
                  Baixar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyScript}
                  title="Atalho: Alt+S"
                  className="gap-1"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar
                  <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-semibold leading-none text-muted-foreground">
                    Alt+S
                  </kbd>
                </Button>
                <CallRecorderButton
                  empresa={currentLeadState?.razaoSocial ?? empresaResumo ?? null}
                  cnpj={currentLeadState?.cnpj ?? null}
                />

              </div>
            </div>
            <CollapsibleContent className="border-t px-3 pb-3 pt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {script}
              </pre>
              <div className="mt-3 flex items-center justify-center border-t pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setScriptOpen(false);
                    document.getElementById("dados")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:underline"
                >
                  <span>▲</span>
                  <span>Recolher script</span>
                </button>
              </div>
            </CollapsibleContent>
          </Collapsible>
          </div>
        )}

        {(currentLeadState || dados.trim()) && (
          <div className="border-t border-border/60 pt-3" ref={fluxoSectionRef}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
                  4
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fluxo da ligação
                </span>
              </div>
              {script.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setScriptOpen(true);
                    scrollToScript();
                  }}
                  className="text-[11px] font-normal text-muted-foreground underline hover:text-foreground"
                >
                  Ver texto completo do script
                </button>
              )}
            </div>

            {!activeStep && (
              <Button
                size="sm"
                variant="secondary"
                className="mb-3 h-8 gap-1.5 text-xs"
                onClick={() => irParaStep("abertura")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Iniciar pela Abertura
              </Button>
            )}

            {historicoObjecoes.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1">
                {historicoObjecoes.map((id, idx) => {
                  const c = cardById(id);
                  if (!c) return null;
                  const Icon = c.icon;
                  const isCurrent = id === activeStep;
                  return (
                    <div key={`${id}-${idx}`} className="flex items-center gap-1">
                      {idx > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                      <button
                        type="button"
                        onClick={() => irParaStep(id)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-all ${
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {c.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {abertura.origem === "sistema" && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="mt-0.5 shrink-0">⚠️</span>
                <span>
                  A abertura abaixo é o modelo genérico do sistema — seu pitch ativo não tem uma seção "1. ABERTURA PRINCIPAL".
                </span>
              </div>
            )}

            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Ir direto para
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[abertura, ...objecoes].map((obj) => {
                const Icon = obj.icon;
                const isCurrent = obj.id === activeStep;
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onClick={() => (isCurrent ? fecharStep() : irParaStep(obj.id))}
                    className={`relative flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2.5 text-center text-[11px] font-medium transition-all ${
                      isCurrent
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : obj.origem === "sistema"
                          ? "border-amber-300 bg-amber-50/60 text-muted-foreground hover:border-amber-400 hover:text-foreground dark:border-amber-900 dark:bg-amber-950/20"
                          : obj.origem === "pitch-tema"
                            ? "border-sky-300 bg-sky-50/60 text-muted-foreground hover:border-sky-400 hover:text-foreground dark:border-sky-900 dark:bg-sky-950/20"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {obj.label}
                    {obj.origem === "sistema" && (
                      <span className="rounded-full bg-amber-200/80 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                        Sistema
                      </span>
                    )}
                    {obj.origem === "pitch-tema" && (
                      <span
                        className="rounded-full bg-sky-200/80 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/60 dark:text-sky-300"
                        title={`Veio de outro pitch do tema: ${obj.origemPitchNome}`}
                      >
                        Outro pitch
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {cardAtivo && (
              <div
                id={`objecao-${cardAtivo.id}`}
                className={`mt-3 rounded-md border p-3 ${
                  cardAtivo.kind === "terminal"
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                    : cardAtivo.kind === "abertura"
                      ? "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30"
                      : "border-primary/30 bg-primary/5"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold ${
                        cardAtivo.kind === "terminal"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : cardAtivo.kind === "abertura"
                            ? "text-sky-700 dark:text-sky-300"
                            : "text-primary"
                      }`}
                    >
                      {cardAtivo.label}
                    </span>
                    {cardAtivo.origem === "sistema" && (
                      <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        Gerado pelo sistema
                      </span>
                    )}
                    {cardAtivo.origem === "pitch-tema" && (
                      <span className="rounded bg-sky-200/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                        Veio de: {cardAtivo.origemPitchNome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {editandoCardId !== cardAtivo.id && cardAtivo.kind !== "terminal" && (
                      <>
                        {cardAtivo.origem === "pitch" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => iniciarEdicaoCard(cardAtivo)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Editar
                          </Button>
                        )}
                        {cardAtivo.origem === "pitch-tema" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => irEditarPitchDeOrigem(cardAtivo)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Editar no pitch de origem
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => copyObjecaoResposta(cardAtivo.resposta)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={fecharStep}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>

                {editandoCardId === cardAtivo.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={textoEdicao}
                      onChange={(e) => setTextoEdicao(e.target.value)}
                      rows={6}
                      className="text-sm"
                      placeholder='Escreva a fala aqui, sem aspas " " dentro do texto.'
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Evite usar aspas dentro do texto — elas marcam o começo/fim da fala no formato do pitch. Se digitar, viram aspas simples (') automaticamente.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={cancelarEdicaoCard}>
                        Cancelar
                      </Button>
                      <Button size="sm" className="h-7 text-[11px]" onClick={() => salvarEdicaoCard(cardAtivo)}>
                        <Check className="mr-1 h-3 w-3" />
                        Salvar no pitch
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {cardAtivo.resposta.split("\n").map((linha, i) =>
                      /^\s*\[.*\]\s*$/.test(linha) ? (
                        <p key={i} className="my-1 text-xs italic text-muted-foreground">
                          {linha.replace(/^\s*\[|\]\s*$/g, "")}
                        </p>
                      ) : (
                        <p key={i}>{linha}</p>
                      ),
                    )}
                  </div>
                )}

                {cardAtivo.extra && editandoCardId !== cardAtivo.id && (
                  <div className="mt-2">
                    {!extrasRevelados.has(cardAtivo.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => toggleExtra(cardAtivo.id)}
                      >
                        {cardAtivo.extra.gatilho}
                      </Button>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs leading-relaxed">
                        {cardAtivo.extra.texto}
                      </p>
                    )}
                  </div>
                )}

                {cardAtivo.routing && editandoCardId !== cardAtivo.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cardAtivo.routing.map((r) => (
                      <Button
                        key={r.targetId}
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => irParaStep(r.targetId)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                )}

                {cardAtivo.id === "fechamento" && (
                  <div className="mt-3 border-t border-emerald-300/60 pt-3 dark:border-emerald-900/60">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Dados para agendar a reunião
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="reuniao-nome" className="text-[11px]">
                          Nome do contato
                        </Label>
                        <Input
                          id="reuniao-nome"
                          value={reuniaoNome}
                          onChange={(e) => setReuniaoNome(e.target.value)}
                          placeholder="Ex: Everton Pereira"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="reuniao-funcao" className="text-[11px]">
                          Função / Cargo
                        </Label>
                        <Input
                          id="reuniao-funcao"
                          value={reuniaoFuncao}
                          onChange={(e) => setReuniaoFuncao(e.target.value)}
                          placeholder="Ex: Sócio-Administrador"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="reuniao-email" className="text-[11px]">
                          E-mail
                        </Label>
                        <Input
                          id="reuniao-email"
                          type="email"
                          value={reuniaoEmail}
                          onChange={(e) => setReuniaoEmail(e.target.value)}
                          placeholder="nome@empresa.com.br"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="reuniao-data" className="text-[11px]">
                            Data da reunião
                          </Label>
                          <Input
                            id="reuniao-data"
                            type="date"
                            value={reuniaoData}
                            onChange={(e) => setReuniaoData(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="reuniao-hora" className="text-[11px]">
                            Horário
                          </Label>
                          <Input
                            id="reuniao-hora"
                            type="time"
                            value={reuniaoHora}
                            onChange={(e) => setReuniaoHora(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2 h-7 text-[11px]"
                      onClick={copyResumoReuniao}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copiar resumo da reunião
                    </Button>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Fica salvo automaticamente aqui (sobrevive a troca de aba/reload). Use o resumo pra
                      registrar no Pós-ligação ou na Central de Reuniões.
                    </p>
                  </div>
                )}

                {cardAtivo.id === "email" && editandoCardId !== cardAtivo.id && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Dados de quem vai receber (e-mail ou WhatsApp)
                    </p>

                    <div className="mb-2">
                      <Label htmlFor="email-material" className="text-[11px]">
                        O que vai enviar
                      </Label>
                      <Input
                        id="email-material"
                        value={emailMaterial}
                        onChange={(e) => setEmailMaterial(e.target.value)}
                        placeholder="Ex: apresentação institucional, resumo por escrito do que conversamos"
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      {emailDestinatarios.map((d, idx) => (
                        <div
                          key={d.id}
                          className="grid grid-cols-1 gap-2 rounded-md border border-border/50 p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                        >
                          <div>
                            <Label htmlFor={`email-nome-${d.id}`} className="text-[11px]">
                              {idx === 0 ? "Nome" : `Nome (contato ${idx + 1})`}
                            </Label>
                            <Input
                              id={`email-nome-${d.id}`}
                              value={d.nome}
                              onChange={(e) => updateDestinatarioEmail(d.id, "nome", e.target.value)}
                              placeholder="Ex: Rafaela"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`email-funcao-${d.id}`} className="text-[11px]">
                              Função/Cargo
                            </Label>
                            <Input
                              id={`email-funcao-${d.id}`}
                              value={d.funcao}
                              onChange={(e) => updateDestinatarioEmail(d.id, "funcao", e.target.value)}
                              placeholder="Ex: Financeiro"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`email-contato-${d.id}`} className="text-[11px]">
                              E-mail ou WhatsApp
                            </Label>
                            <Input
                              id={`email-contato-${d.id}`}
                              value={d.contato}
                              onChange={(e) => updateDestinatarioEmail(d.id, "contato", e.target.value)}
                              placeholder="nome@empresa.com.br ou (11) 99999-9999"
                              className="h-8 text-sm"
                            />
                          </div>
                          {emailDestinatarios.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 justify-self-end px-2 text-muted-foreground hover:text-destructive sm:justify-self-center"
                              onClick={() => removeDestinatarioEmail(d.id)}
                              aria-label="Remover este contato"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-[11px]"
                      onClick={addDestinatarioEmail}
                    >
                      + Adicionar outro contato
                    </Button>

                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[11px]"
                        onClick={copyResumoEmail}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar resumo do envio
                      </Button>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Fica salvo automaticamente aqui (sobrevive a troca de aba/reload). Use o resumo pra
                      registrar no Pós-ligação — isso não conta como reunião fechada.
                    </p>
                  </div>
                )}

                {cardAtivo.kind !== "terminal" && editandoCardId !== cardAtivo.id && (
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[11px]"
                        onClick={() => irParaStep("fechamento")}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Aceitou, fechar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => irParaStep("encerrar")}
                      >
                        <LogOut className="mr-1 h-3 w-3" />
                        Não quis, encerrar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
import { PromptLibraryPanel, inferirSegmentoPorCnae, montarLeadFallback, preencherTagsDoScript, contemAlucinacaoDeExtracao, compileScriptLocally, parseLeadFromDados, type ActiveLeadData } from "@/components/prospeccao/shared";
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
// Ficam no escopo do módulo (não em useRef) de propósito: o PreLigacao é
// desmontado toda vez que o operador troca de aba (Pós-ligação, Histórico
// etc.), e um useRef local perderia o cache nesse momento — fazendo o app
// rebuscar dados e regastar créditos de IA/API à toa ao simplesmente voltar
// pra aba Pré-ligação. Guardando aqui, o cache sobrevive à navegação entre
// abas e só é perdido em um reload completo da página.
type LookupResult = Awaited<ReturnType<typeof lookupCnpj>>;
type Telefones = Awaited<ReturnType<typeof enrichPhones>>;
const lookupCache = new Map<string, LookupResult>();
const phonesCache = new Map<string, Telefones>();
const aiCache = new Map<string, string>();
// Cache da extração de nome do contato por IA, por texto de dados colado —
// evita gastar um crédito de IA de novo para o MESMO texto (ex: reprocessar
// o script sem alterar os dados da empresa).
const contactNameCache = new Map<string, string>();

/** Um card do fluxo de "Contornar objeções" na Pré-ligação. */
type ObjecaoCard = {
  id: string;
  label: string;
  icon: LucideIcon;
  resposta: string;
  /** Nota extra que só aparece se o operador clicar num gatilho (ex: "insistiu"). */
  extra?: { gatilho: string; texto: string };
  /** Botões de desvio para outro card, quando a resposta da pessoa aponta pra outra objeção. */
  routing?: { label: string; targetId: string }[];
};

/** Exemplo de oportunidade encontrada, adaptado ao segmento do lead — usado na
 * resposta da objeção "já tenho contador/fiscal". */
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
  const [searchMode, setSearchMode] = useState<"cnpj" | "nome">("cnpj");
  const [nomeBusca, setNomeBusca] = useState(pre0.nomeBusca ?? "");
  const [modoEsteira, setModoEsteira] = useState<boolean>(true);
  const [currentLeadState, setCurrentLeadState] = useState<ActiveLeadData | null>(null);
  // ---- Estado do fluxo de cards de "Contornar objeções" (Pré-ligação) ----
  // Nome do contato ativo, usado pra personalizar {NOME} nas respostas dos
  // cards — atualizado toda vez que a IA extrai o nome ao gerar/compilar o script.
  const [nomeAtivo, setNomeAtivo] = useState<string>("");
  // Quais cards (objeções ou terminais) estão abertos agora — pode ter mais de um.
  const [objecoesAbertas, setObjecoesAbertas] = useState<Set<string>>(new Set());
  // Quais notas "extra" (ex: "insistiu que só o diretor decide") já foram reveladas.
  const [extrasRevelados, setExtrasRevelados] = useState<Set<string>>(new Set());
  // Trilha de cliques desta ligação, na ordem — mostra o caminho da conversa.
  const [historicoObjecoes, setHistoricoObjecoes] = useState<string[]>([]);
  // Ativado quando BrasilAPI/CNPJá falham (429/403/500 ou rede). Libera o preenchimento manual
  // sem bloquear o operador durante a ligação (Graceful Degradation).
  const [contingenciaAtiva, setContingenciaAtiva] = useState<boolean>(false);
  const dadosSectionRef = useRef<HTMLDivElement | null>(null);
  // Referência do bloco de script gerado — usada para rolar a tela até ele
  // assim que a compilação/geração termina (o operador pode estar com a tela
  // rolada pra baixo, na Textarea "Dados da empresa", e não perceber o script
  // pronto aparecendo).
  const scriptSectionRef = useRef<HTMLDivElement | null>(null);
  function scrollToScript() {
    setTimeout(() => {
      scriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  // "Dirty" flag: vira true assim que o operador edita manualmente a Textarea
  // "Dados da empresa". Enquanto true, buscas automáticas (BrasilAPI,
  // Preparação Noturna, ACTIVE_LEAD_EVENT) NÃO podem sobrescrever o campo.
  const dadosDirtyRef = useRef<boolean>(false);

  // Escuta o evento disparado pela Preparação Noturna (sidebar) para carregar
  // uma empresa direto na mesa de ação: preenche o textarea, define contexto
  // ativo e rola até a seção "Dados da empresa".
  useEffect(() => {
    function onLoad(ev: Event) {
      const detail = (ev as CustomEvent<PreHandoffPayload>).detail ?? {};

      // NOVA EMPRESA vinda do Preparação Noturna: limpa TUDO da empresa
      // anterior (CNPJ, dados colados, script compilado, resultados de
      // busca, telefones, lead ativo, modo contingência) antes de aplicar os
      // dados da nova empresa — evita ficar "dado em cima de dado" na tela.
      // Também zera o "dirty flag": sem isso, se o operador tivesse editado
      // manualmente os dados da empresa anterior, a proteção anti-sobrescrita
      // impediria os dados da nova empresa de aparecerem.
      limparRascunhoPre();
      clearRascunho(); // garante que o rascunho da Pós-ligação também é limpo,
                        // mesmo que aquela aba não esteja montada agora
      setCurrentLeadState(null);
      setContingenciaAtiva(false);
      dadosDirtyRef.current = false;
      setNomeAtivo("");
      setObjecoesAbertas(new Set());
      setExtrasRevelados(new Set());
      setHistoricoObjecoes([]);

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
      // Texto vindo da Preparação Noturna é dado bruto informado pelo operador.
      // Ele deve ser preservado contra lookup automático durante a compilação.
      if (texto && !dadosDirtyRef.current) {
        setDados(texto);
        dadosDirtyRef.current = true;
      }
      else if (texto && dadosDirtyRef.current) {
        toast.info("Mantendo suas edições no campo 'Dados da empresa'.");
      }
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
        const extras = [telefone, email].filter(Boolean).join(" · ");
        setEmpresaResumo(extras ? `${nomePrincipal} · ${extras}` : nomePrincipal);
      } else if (texto) {
        // Sem nome extraído — tenta parse do texto bruto para liberar compilação
        const parsed = parseLeadFromDados(texto, "");
        if (parsed) {
          setCurrentLeadState(parsed);
          setActiveLead(parsed);
          setEmpresaResumo(parsed.razaoSocial);
        }
      }
      toast.success(nomePrincipal ? `Lead carregado: ${nomePrincipal}` : "Lead carregado no Pré-ligação");
      // Com CNPJ estruturado vindo da Preparação Noturna, já busca os dados
      // oficiais automaticamente (mesmo fluxo do botão manual).
      if (cnpjDigits.length === 14) {
        setTimeout(() => { void handleLookup(cnpjDigits); }, 80);
      }
      setTimeout(() => {
        dadosSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
    window.addEventListener(LOAD_PRE_LIGACAO_EVENT, onLoad as EventListener);
    // Handoff da rota /preparacao — consome payload pendente após navegação
    try {
      const raw = window.sessionStorage.getItem(PENDING_PRE_LIGACAO_KEY);
      if (raw) {
        window.sessionStorage.removeItem(PENDING_PRE_LIGACAO_KEY);
        const detail = JSON.parse(raw) as PreHandoffPayload;
        // pequeno atraso para garantir que outros efeitos de mount rodem antes
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(LOAD_PRE_LIGACAO_EVENT, { detail }));
        }, 50);
      }
    } catch { /* noop */ }
    return () => window.removeEventListener(LOAD_PRE_LIGACAO_EVENT, onLoad as EventListener);
  }, []);




  // Autosave: rascunho unificado + sessão ativa v2
  useEffect(() => {
    updateRascunho({ pre: { cnpj, dados, script, empresaResumo, nomeBusca } });
    updateSessaoAtiva({ cnpj, dados, script, empresaResumo });
  }, [cnpj, dados, script, empresaResumo, nomeBusca]);

  function limparRascunhoPre() {
    setCnpj("");
    setDados("");
    dadosDirtyRef.current = false;
    setScript("");
    setEmpresaResumo(null);
    setNomeBusca("");
    setResultados([]);
    setTelefones(null);
    updateRascunho({ pre: { cnpj: "", dados: "", script: "", empresaResumo: null, nomeBusca: "" } });
    updateSessaoAtiva({ cnpj: "", dados: "", script: "", empresaResumo: null, telefones: null });
  }

  function limparTudo() {
    limparRascunhoPre();
    setCurrentLeadState(null);
    clearRascunho();
    setActiveLead(null);
    setNomeAtivo("");
    setObjecoesAbertas(new Set());
    setExtrasRevelados(new Set());
    setHistoricoObjecoes([]);
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


  // Normaliza nomes de empresa para comparação (sem acentos, sem sufixos societários).
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
    // Aceita qualquer formato: 12.345.678/0001-90, 12345678000190, com espaços, etc.
    // Usa sempre o estado React (nunca lê o DOM diretamente) — o campo "cnpj"
    // já reflete o valor digitado/colado via onChange antes de qualquer chamada.
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
    // Sincroniza o campo com o valor limpo
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
      } else {
        toast.info("Mantendo suas edições no campo 'Dados da empresa' (busca automática não sobrescreveu).");
      }
      setScript("");
      setEmpresaResumo(
        `${r.razaoSocial || "Empresa"}${r.nomeFantasia ? " · " + r.nomeFantasia : ""}${r.porte ? " · " + r.porte : ""}`,
      );
      setResultados([]);

      // Alimenta o estado do lead ativo para o Modo Esteira (compilação local sem IA)
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
      // Espelha o lead ativo em sessionStorage para que a aba Pós-ligação
      // consiga usar os dados estruturados no registro de atividades.
      setActiveLead(leadAtual);

      setContingenciaAtiva(false);
      toast.success("Dados carregados. Ajuste o prompt se quiser e depois processe o script.");


      // Se já enriquecemos telefones para este CNPJ nesta sessão, restaura do cache.
      const cachedPhones = phonesCache.get(digits);
      if (cachedPhones) setTelefones(cachedPhones);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      // Detecta falhas típicas das bases públicas (rate limit, bloqueio ou queda)
      // ou erros de rede/timeout — nesses casos entra em Modo Manual de Contingência
      // em vez de limpar os campos já preenchidos pelo operador.
      const instavel = /\b(429|403|500|502|503|504)\b/.test(msg)
        || /rate.?limit|too many|timeout|network|fetch|failed to fetch|econnreset|enotfound/i.test(msg);
      if (instavel) {
        setContingenciaAtiva(true);
        toast.warning(
          "Bases públicas instáveis. O Modo Manual de Contingência foi ativado automaticamente.",
          { description: "Cole os dados da empresa direto no campo abaixo e siga com a ligação." },
        );
        // Foca a Textarea para acelerar o preenchimento manual
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
    // Se o usuário colou um CNPJ aqui, faz o lookup direto
    const digits = termo.replace(/\D/g, "");
    if (digits.length === 14) {
      setSearchMode("cnpj");
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
      // Se só veio 1 resultado, já carrega os dados completos automaticamente
      if (r.itens.length === 1) {
        const unico = r.itens[0];
        setSearchMode("cnpj");
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
      const hydratedPromptText = preencherTagsDoScript(promptText, lead, dados.trim(), nomeContatoIA);
      const diaSemana = new Date().toLocaleDateString("pt-BR", { weekday: "long" });
      const valoresValidados = inferirSegmentoPorCnae(`${lead.cnaePrincipal ?? ""}\n${dados.trim()}`);
      const nomeValidado = nomeContatoIA;
      const cidadeValidada = lead.cidade?.trim() || "aí na região";
      const cidadeEstadoValidada = lead.cidade && lead.uf ? `${lead.cidade}/${lead.uf}` : cidadeValidada;

      // 1. systemInstruction: papel + regras rígidas de extração/substituição
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


      // 2. userContent: dados do lead + template a ser preenchido
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
        setScriptOpen(true);
        scrollToScript();
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
      setScriptOpen(true);
      scrollToScript();
      void autoIniciarGravacao();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setLoadingGen(false);
    }
  }

  // Gravação 100% automática: começa junto com o script compilado. O VAD
  // descarta sozinho a tentativa se nenhuma fala for detectada em 45s
  // (discagem sem atendimento) — sem nenhum clique do operador.
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
      // Fallback do Modo Manual de Contingência: se a API pública falhou (ou
      // ainda não rodou) e o operador colou os dados brutos direto na Textarea,
      // extrai o lead do próprio texto para continuar a compilação local.
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
        const compiled = compileScriptLocally(promptText, leadComContato, dados.trim(), nomeContatoIA);
        setScript(compiled);
        void autoIniciarGravacao();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao extrair contato");
        return;
      } finally {
        setLoadingGen(false);
      }
      setScriptOpen(true);
      scrollToScript();
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

  // Alt+S: copia o script de abordagem sem sair do fluxo de discagem.
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

  // Barramento reativo: quando um card de follow-up (ou qualquer painel) dispara
  // um novo lead ativo via setActiveLead(...), injetamos o CNPJ e rodamos o
  // lookup automaticamente — dossiê + script em custo zero.
  const lookupRef = useRef(handleLookup);
  lookupRef.current = handleLookup;
  useEffect(() => {
    const onLead = () => {
      const lead = getActiveLead();
      const digits = (lead?.cnpj ?? "").replace(/\D/g, "");
      if (digits.length !== 14) return;
      // Só refaz se for um CNPJ diferente do atual (evita loop de auto-refresh)
      if (digits === (cnpj || "").replace(/\D/g, "")) return;
      // Se o operador já editou manualmente o campo "Dados da empresa",
      // NÃO dispara um novo lookup que sobrescreveria as edições.
      if (dadosDirtyRef.current) return;
      setSearchMode("cnpj");
      setCnpj(digits);
      // Aguarda o próximo tick para que o input reflita o valor antes do lookup
      setTimeout(() => {
        void lookupRef.current(digits);
      }, 0);
    };
    window.addEventListener(ACTIVE_LEAD_EVENT, onLead);
    return () => window.removeEventListener(ACTIVE_LEAD_EVENT, onLead);
  }, [cnpj]);

  // ---- Fluxo de cards de "Contornar objeções" ----
  const nomeParaObjecoes = nomeAtivo || "tudo bem?";
  const segmentoInfo = useMemo(
    () => inferirSegmentoPorCnae(`${currentLeadState?.cnaePrincipal ?? ""}\n${dados}`),
    [currentLeadState, dados],
  );

  function abrirObjecao(id: string) {
    setObjecoesAbertas((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setHistoricoObjecoes((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]));
  }

  function fecharObjecao(id: string) {
    setObjecoesAbertas((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function irParaObjecao(id: string) {
    abrirObjecao(id);
    setTimeout(() => {
      document.getElementById(`objecao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
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
    await navigator.clipboard.writeText(texto);
    toast.success("Resposta copiada");
  }

  const objecoes: ObjecaoCard[] = [
    {
      id: "contador",
      label: "Já tem contador/fiscal",
      icon: Users,
      resposta: `Faz todo sentido, ${nomeParaObjecoes} — na real, quase 100% das empresas que a gente atende já têm uma equipe fiscal ou contábil muito competente.\nE olha, mesmo assim, em cerca de 90% dessas empresas a gente encontrou alguma oportunidade que tinha passado batido — não porque alguém errou, mas porque o sistema classifica pelo cadastro, e a gente olha também como o material é usado de fato na produção.\n${getExemploObjecao(segmentoInfo.segmento ?? "")}\nPor isso vale os 10 minutos, mesmo já tendo revisão feita — é só pra comparar. Consegue amanhã de manhã ou à tarde?`,
    },
    {
      id: "email",
      label: "Manda por e-mail",
      icon: Mail,
      resposta: `Consigo sim te mandar um resumo, ${nomeParaObjecoes}, mas sem uma conversa rápida eu não sei ainda o que é relevante pro caso de vocês — ia te mandar algo genérico.\nOs 10 minutos servem exatamente pra eu entender o que faz sentido olhar aí e já te falar se vale a pena ou não. Prefere amanhã de manhã ou à tarde?`,
    },
    {
      id: "sem-tempo",
      label: "Sem tempo agora",
      icon: Clock,
      resposta: `Sem problema, ${nomeParaObjecoes}, nem precisa ser agora.\nSó me diz um horário melhor pra você essa semana — pode ser 10 minutos no fim do dia ou de manhã antes das reuniões começarem?`,
    },
    {
      id: "nao-decide",
      label: "Não decide sozinho",
      icon: HelpCircle,
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
      resposta: `Sem problema, ${nomeParaObjecoes}! Só pra eu não te pegar numa hora ruim de novo: qual o melhor dia e horário pra te ligar essa semana? Consigo amanhã de manhã ou à tarde, qual fica melhor?`,
    },
    {
      id: "quanto-custa",
      label: "Pergunta quanto custa",
      icon: CircleDollarSign,
      resposta: `Boa pergunta, ${nomeParaObjecoes} — e é exatamente isso que fica mais claro nos 10 minutos, porque o valor depende do que a gente encontra na operação de vocês; não tem uma tabela fixa porque cada caso é diferente.\nNesses 10 minutos eu já consigo te dar uma direção bem concreta sobre isso. Consegue amanhã de manhã ou à tarde?`,
    },
  ];

  const terminais: ObjecaoCard[] = [
    {
      id: "fechamento",
      label: "Fechou! Confirmar horário",
      icon: CheckCircle2,
      resposta: `Perfeito, ${nomeParaObjecoes}! Então fico de te chamar amanhã pra essa conversa de 10 minutinhos, combinado? Te mando um lembrete antes. Muito obrigado pelo seu tempo!`,
    },
    {
      id: "encerrar",
      label: "Não quis, encerrar com respeito",
      icon: LogOut,
      resposta: `Tudo bem, ${nomeParaObjecoes}, entendo completamente. Fico à disposição se mudar de ideia. Muito obrigado pelo seu tempo, tenha um ótimo dia!`,
    },
  ];

  const todosOsCardsObjecao = [...objecoes, ...terminais];
  function labelDoCardObjecao(id: string) {
    return todosOsCardsObjecao.find((c) => c.id === id)?.label ?? id;
  }

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
                size="sm"
                className="text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Limpar tudo
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


        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
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
          <div className="inline-flex w-full rounded-lg border border-input bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setSearchMode("cnpj")}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-all ${searchMode === "cnpj" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            >
              CNPJ
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("nome")}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-all ${searchMode === "nome" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            >
              Razão social
            </button>
          </div>

          {searchMode === "cnpj" ? (
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <Label htmlFor="cnpj" className="text-xs">
                  Buscar por CNPJ (BrasilAPI)
                </Label>
              </div>

              <div className="mt-1 flex gap-2">
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00 ou só números"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value.replace(/[^\d./-]/g, ""))}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    const cleaned = pasted.replace(/[^\d]/g, "");
                    if (cleaned.length >= 8) {
                      e.preventDefault();
                      setCnpj(cleaned);
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                />
                <Button
                  onClick={() => handleLookup()}
                  disabled={loadingCnpj}
                  variant="secondary"
                  aria-label="Buscar CNPJ"
                >
                  {loadingCnpj ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="nome-busca" className="text-xs">
                Buscar por nome fantasia ou razão social
              </Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="nome-busca"
                  placeholder="Ex.: Padaria do João, Construtora ABC…"
                  value={nomeBusca}
                  onChange={(e) => setNomeBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscaNome()}
                />
                <Button
                  onClick={handleBuscaNome}
                  disabled={loadingBusca}
                  variant="secondary"
                  aria-label="Buscar por nome"
                >
                  {loadingBusca ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Busca via CNPJá. Clique em um resultado para carregar os dados completos.
              </p>

              {resultados.length > 0 && (
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
                  {resultados.map((m) => (
                    <li key={m.cnpj}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchMode("cnpj");
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
            </div>
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


        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
            2
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conferir dados
          </span>
        </div>

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


        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
            3
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Gerar script
          </span>
          {script.trim() && (
            <Badge
              variant="outline"
              className="ml-auto gap-1 border-emerald-300 bg-emerald-50 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Check className="h-3 w-3" />
              Script pronto
            </Badge>
          )}
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
                  <span>Script gerado</span>
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
          <div className="border-t border-border/60 pt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-deep/10 text-[11px] font-bold text-navy-deep">
                4
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contornar objeções
              </span>
            </div>

            {historicoObjecoes.length > 0 && (
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                Caminho desta ligação: {historicoObjecoes.map((id) => labelDoCardObjecao(id)).join(" → ")}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {objecoes.map((obj) => {
                const Icon = obj.icon;
                const aberto = objecoesAbertas.has(obj.id);
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onClick={() => (aberto ? fecharObjecao(obj.id) : abrirObjecao(obj.id))}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition-all ${
                      aberto
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {obj.label}
                  </button>
                );
              })}
            </div>

            {objecoes
              .filter((obj) => objecoesAbertas.has(obj.id))
              .map((obj) => (
                <div
                  id={`objecao-${obj.id}`}
                  key={obj.id}
                  className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary">{obj.label}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => copyObjecaoResposta(obj.resposta)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => fecharObjecao(obj.id)}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{obj.resposta}</p>

                  {obj.extra && (
                    <div className="mt-2">
                      {!extrasRevelados.has(obj.id) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => toggleExtra(obj.id)}
                        >
                          {obj.extra.gatilho}
                        </Button>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs leading-relaxed">
                          {obj.extra.texto}
                        </p>
                      )}
                    </div>
                  )}

                  {obj.routing && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {obj.routing.map((r) => (
                        <Button
                          key={r.targetId}
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => irParaObjecao(r.targetId)}
                        >
                          {r.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      onClick={() => irParaObjecao("fechamento")}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Aceitou, fechar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => irParaObjecao("encerrar")}
                    >
                      <LogOut className="mr-1 h-3 w-3" />
                      Não quis, encerrar
                    </Button>
                  </div>
                </div>
              ))}

            {terminais
              .filter((t) => objecoesAbertas.has(t.id))
              .map((t) => (
                <div
                  id={`objecao-${t.id}`}
                  key={t.id}
                  className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {t.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => copyObjecaoResposta(t.resposta)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => fecharObjecao(t.id)}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.resposta}</p>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

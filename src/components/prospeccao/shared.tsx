import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { extractFinalScriptOnly } from "@/lib/script-output";
import { generateWithAI, extractContactNameWithAI, lookupCnpj, transcribeAudio, searchCompanyByName, enrichPhones, interpretarStatusConversa } from "@/lib/prospeccao.functions";
import { logCall } from "@/lib/call-logs.functions";
import { cancelPendingFollowUpsForCompany, createFollowUp, extractFollowUpFromCall, listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import { upsertLead as upsertLeadCentral, isLeadIsolated, findLead, addLeadFollowUp } from "@/lib/leads-store";
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
  createTema,
  renomearTema,
  excluirTema,
  setActiveTema,
  type PromptItem,
  type PromptTipo,
  type PromptLibrary,
  type Tema,
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
  GO_POS_EVENT,
  PENDING_AUDIO_EVENT,
  clearPendingAudio,
  formatSecs,
  getPendingAudio,
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
  Plus,
  Pencil,
  X as XIcon,
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
import { CopyButton, loadSessaoAtiva, updateSessaoAtiva } from "@/routes/index";


/**
 * Biblioteca de Prompts (por operador), organizada em ABAS POR TEMA/TESE
 * (ex: "ICMS Intermediário", "Exclusão do ICMS da base do PIS/COFINS").
 * Cada aba guarda N prompts de "abordagem" (pitches) daquele tema. Prompts de
 * "histórico" não têm tema — continuam numa lista única, sem abas.
 *
 * O prompt marcado como ATIVO (dentre TODOS os temas) é o que a IA usa (via
 * getActivePromptText no fluxo de geração) — trocar de aba só muda o que
 * você está VENDO/EDITANDO, não troca sozinho qual pitch está ativo.
 *
 * Regra fundamental: o conteúdo é armazenado e enviado LITERALMENTE — nenhuma
 * substituição, molde ou fallback silencioso é aplicado.
 */
export function PromptLibraryPanel({ tipo }: { tipo: PromptTipo }) {
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState<PromptLibrary>(() =>
    typeof window === "undefined"
      ? { items: [], temas: [], activeTemaId: null, activeAbordagemId: null, activeHistoricoId: null }
      : loadLibrary(),
  );
  const [editing, setEditing] = useState<PromptItem | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoConteudo, setNovoConteudo] = useState("");
  const [criandoTema, setCriandoTema] = useState(false);
  const [novoTemaNome, setNovoTemaNome] = useState("");
  const [renomeandoTemaId, setRenomeandoTemaId] = useState<string | null>(null);
  const [renomeTemaNome, setRenomeTemaNome] = useState("");

  useEffect(() => {
    const h = () => setLib(loadLibrary());
    const sync = () => {
      void syncLibraryFromCloud().then(setLib);
    };
    window.addEventListener(PROMPT_LIBRARY_EVENT, h);
    window.addEventListener("bhm:session-changed", sync);
    // Rehidrata no primeiro ciclo do cliente (evita mismatch SSR) e busca o
    // que está salvo no banco (persistência definitiva por consultor).
    setLib(loadLibrary());
    sync();
    return () => {
      window.removeEventListener(PROMPT_LIBRARY_EVENT, h);
      window.removeEventListener("bhm:session-changed", sync);
    };
  }, []);

  const usaTemas = tipo === "abordagem";
  const activeTemaId = usaTemas ? lib.activeTemaId : null;
  const temaAtivo = usaTemas ? lib.temas.find((t) => t.id === activeTemaId) ?? null : null;

  // Lista de itens visível: para "abordagem", filtra pela aba ativa; para
  // "historico", continua sem filtro (não tem aba).
  const items = lib.items.filter((p) => {
    if (p.tipo !== tipo) return false;
    if (!usaTemas) return true;
    return p.temaId === activeTemaId;
  });
  const activeId = tipo === "abordagem" ? lib.activeAbordagemId : lib.activeHistoricoId;
  const ativo = lib.items.find((p) => p.id === activeId && p.tipo === tipo) ?? null;
  const ativoEstaNaAbaAtual = !ativo || ativo.temaId === activeTemaId;
  const rotulo = tipo === "abordagem" ? "Prompt de abordagem" : "Prompt de histórico";

  function resetForm() {
    setEditing(null);
    setNovoNome("");
    setNovoConteudo("");
  }

  function beginNovo() {
    resetForm();
    setEditing({ id: "", nome: "", conteudo: "", tipo, temaId: usaTemas ? activeTemaId : null });
    setNovoNome("");
    setNovoConteudo("");
  }

  function beginEditar(p: PromptItem) {
    setEditing(p);
    setNovoNome(p.nome);
    setNovoConteudo(p.conteudo);
  }

  function salvarForm() {
    if (!editing) return;
    if (!novoNome.trim()) {
      toast.error("Dê um nome ao prompt (ex.: Abordagem direta, Variação mais curta).");
      return;
    }
    if (!novoConteudo.trim()) {
      toast.error("O conteúdo do prompt não pode ficar vazio.");
      return;
    }
    if (editing.id) {
      updatePrompt(editing.id, { nome: novoNome, conteudo: novoConteudo });
      toast.success("Prompt atualizado");
    } else {
      const criado = createPrompt(tipo, novoNome, novoConteudo, usaTemas ? activeTemaId : null);
      setActivePrompt(tipo, criado.id);
      toast.success("Prompt criado e marcado como ativo");
    }
    resetForm();
  }

  function excluir(p: PromptItem) {
    if (!confirm(`Excluir "${p.nome}"? Essa ação não pode ser desfeita.`)) return;
    deletePrompt(p.id);
    if (editing?.id === p.id) resetForm();
    toast.success("Prompt excluído");
  }

  function ativar(p: PromptItem) {
    setActivePrompt(tipo, p.id);
    toast.success(`"${p.nome}" agora é o ${rotulo.toLowerCase()} ativo`);
  }

  function trocarAba(temaId: string) {
    setActiveTema(temaId);
    setLib(loadLibrary());
    resetForm();
  }

  function confirmarNovoTema() {
    if (!novoTemaNome.trim()) {
      toast.error("Dê um nome pro tema (ex.: Exclusão do ICMS da base do PIS/COFINS).");
      return;
    }
    const tema = createTema(novoTemaNome);
    setLib(loadLibrary());
    setActiveTema(tema.id);
    setLib(loadLibrary());
    setNovoTemaNome("");
    setCriandoTema(false);
    toast.success(`Aba "${tema.nome}" criada`);
  }

  function confirmarRenomeTema(temaId: string) {
    if (!renomeTemaNome.trim()) {
      setRenomeandoTemaId(null);
      return;
    }
    renomearTema(temaId, renomeTemaNome);
    setLib(loadLibrary());
    setRenomeandoTemaId(null);
    toast.success("Aba renomeada");
  }

  function apagarTema(tema: Tema) {
    const pitchesNoTema = getPromptsByTema(tema.id);
    if (pitchesNoTema.length > 0) {
      toast.error(
        `A aba "${tema.nome}" ainda tem ${pitchesNoTema.length} pitch(es). Mova ou apague os pitches antes de excluir a aba.`,
      );
      return;
    }
    if (!confirm(`Excluir a aba "${tema.nome}"? Essa ação não pode ser desfeita.`)) return;
    const ok = excluirTema(tema.id);
    if (ok) {
      setLib(loadLibrary());
      toast.success("Aba excluída");
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50"
          title={`${rotulo} ativo: ${ativo?.nome ?? "nenhum"}`}
        >
          <span className="flex min-w-0 items-center gap-1">
            <Settings2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {tipo === "abordagem" ? "Script ativo" : "Histórico ativo"}
              {ativo ? "" : ": nenhum"}
            </span>
          </span>
          <span className="shrink-0 underline-offset-2 hover:underline">
            {open ? "Recolher" : "Gerenciar"}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3 space-y-3">

        {usaTemas && (
          <div className="space-y-2 border-b border-border/60 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {lib.temas.map((t) => {
                const isTabAtiva = t.id === activeTemaId;
                if (renomeandoTemaId === t.id) {
                  return (
                    <div key={t.id} className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={renomeTemaNome}
                        onChange={(e) => setRenomeTemaNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmarRenomeTema(t.id);
                          if (e.key === "Escape") setRenomeandoTemaId(null);
                        }}
                        className="h-7 w-40 text-xs"
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => confirmarRenomeTema(t.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setRenomeandoTemaId(null)}>
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }
                return (
                  <div key={t.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => trocarAba(t.id)}
                      className={`rounded-t-md border-b-2 px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isTabAtiva
                          ? "border-navy-deep bg-navy-deep/10 text-navy-deep"
                          : "border-transparent text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {t.nome}
                    </button>
                    {isTabAtiva && (
                      <span className="ml-0.5 hidden items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          title="Renomear aba"
                          onClick={() => {
                            setRenomeandoTemaId(t.id);
                            setRenomeTemaNome(t.nome);
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Excluir aba"
                          onClick={() => apagarTema(t)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}

              {criandoTema ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    placeholder="Nome do novo tema"
                    value={novoTemaNome}
                    onChange={(e) => setNovoTemaNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmarNovoTema();
                      if (e.key === "Escape") setCriandoTema(false);
                    }}
                    className="h-7 w-48 text-xs"
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={confirmarNovoTema}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setCriandoTema(false)}>
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCriandoTema(true)}
                  className="flex items-center gap-1 rounded-t-md border-b-2 border-transparent px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/60"
                >
                  <Plus className="h-3 w-3" />
                  Nova aba
                </button>
              )}
            </div>

            {!ativoEstaNaAbaAtual && ativo && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                O prompt ativo agora ("{ativo.nome}") está em outra aba. Trocar de aba só muda o que você
                está vendo — não troca sozinho qual pitch é usado na ligação.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Ativo agora: <b>{ativo?.nome ?? "nenhum"}</b>.
            {usaTemas
              ? " Cada aba é um tema/tese; salve quantos pitches quiser dentro de cada uma."
              : " Salve variações e alterne com um clique."}
            {" "}O texto vai LITERAL para a IA.
          </p>
          <Button size="sm" variant="secondary" onClick={beginNovo}>
            + Novo prompt
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            {usaTemas && temaAtivo
              ? <>Nenhum prompt salvo na aba <b>{temaAtivo.nome}</b> ainda. Clique em <b>+ Novo prompt</b> para criar o primeiro.</>
              : <>Nenhum prompt salvo. Clique em <b>+ Novo prompt</b> para criar o primeiro.</>}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((p) => {
              const isActive = p.id === activeId;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs ${
                    isActive ? "border-navy-deep bg-navy-deep/5" : "border-border"
                  }`}
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`prompt-active-${tipo}`}
                      checked={isActive}
                      onChange={() => ativar(p)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate font-medium">{p.nome}</span>
                    {isActive && (
                      <span className="rounded bg-navy-deep px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white">
                        Ativo
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => beginEditar(p)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                      onClick={() => excluir(p)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {editing && (
          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {editing.id ? "Editar prompt" : "Novo prompt"}
                {usaTemas && temaAtivo && !editing.id ? ` — aba "${temaAtivo.nome}"` : ""}
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
            <Input
              placeholder="Nome do prompt (ex.: Abordagem direta)"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              className="h-8 text-xs"
            />
            <Textarea
              placeholder="Cole aqui o conteúdo do prompt. Ele será enviado LITERAL para a IA."
              value={novoConteudo}
              onChange={(e) => setNovoConteudo(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={salvarForm}>
                {editing.id ? "Salvar alterações" : "Criar prompt"}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}


// ============ Modo Esteira (Zero Crédito) — inteligência local determinística ============
export type ActiveLeadData = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnaePrincipal?: string;
  cidade?: string;
  uf?: string;
  endereco?: string;
  contatoNome?: string;
};

type SegmentoInfo = {
  segmento: string;
  insumos: string;
  benchmark: string;
  // Frase curta usada na tag {EXEMPLO_SEGMENTO} do script (seção de objeção
  // "já tenho contador/fiscal"). Cada segmento tem a sua, batendo com o
  // exemplo real de oportunidade encontrada naquele tipo de indústria.
  exemploSegmento: string;
};

function extrairDivisaoCnae(textoBruto?: string): string {
  const linhas = (textoBruto ?? "")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  for (const linha of linhas) {
    const codigoNoInicio = linha.match(/^(\d{4})(?:[-.\/]\d|\d{3}\s*-)/);
    if (codigoNoInicio) return codigoNoInicio[1].slice(0, 2);
  }

  const contextoCnae = (textoBruto ?? "").match(
    /(?:atividade\s*principal(?:\s*\(cnae\))?|cnae\s*principal|cnae)[^\n\d]{0,80}(\d{2})[\d.\/-]{2,}/i,
  );
  return contextoCnae?.[1] ?? "";
}

// Mapeia divisão CNAE (2 primeiros dígitos) -> insumos/benchmarks setoriais
export function inferirSegmentoPorCnae(cnaeString?: string): SegmentoInfo {
  const divisaoCnae = extrairDivisaoCnae(cnaeString);
  const texto = (cnaeString ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const mencionaMetal =
    /\b(metalurg|metalmecan|metalicas?|metais|aco|ferro|siderurg|usinagem|solda|caldeiraria|serralheria)\b/.test(texto) ||
    /estruturas?\s+metalicas?/.test(texto);
  if (["24", "25", "28", "29", "30"].includes(divisaoCnae) || mencionaMetal) {
    return {
      segmento: "Metalurgia e Metalmecânica",
      insumos: "eletrodos de solda, discos de corte abrasivos e rebolos de desbaste",
      benchmark: "Caldeiraria, Usinagem e Estruturas Metálicas",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em eletrodos de solda e discos de corte que já tinham sido classificados como uso e consumo padrão.",
    };
  }

  // Móveis, madeira e artefatos (Divisão CNAE 31 / descrições textuais)
  if (divisaoCnae === "31" || /\b(moveis|mobiliario|madeira|marcenaria|mdf)\b/.test(texto)) {
    return {
      segmento: "Móveis e Artefatos de Madeira",
      insumos: "lixas industriais, brocas de vídea e colas estruturais",
      benchmark: "Fabricação de Móveis e Artefatos de Madeira",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em lixas industriais e colas estruturais que ninguém tinha reavaliado.",
    };
  }

  // Plásticos, Polímeros e Artefatos Injetados (Grupo 22)
  if (divisaoCnae === "22" || /\b(plasticos?|polimeros?|resinas?|borracha)\b/.test(texto)) {
    return {
      segmento: "Plásticos e Transformação",
      insumos:
        "resinas termoplásticas, pigmentos industriais, matrizes de injeção e componentes de desgaste de moldes",
      benchmark: "Indústria de Injeção e Artefatos Plásticos",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em resinas termoplásticas e componentes de moldes que já estavam classificados como consumo padrão.",
    };
  }
  // Alimentos e Bebidas (Grupos 10, 11 e 12)
  if (["10", "11", "12"].includes(divisaoCnae) || /\b(alimentos?|laticinios?|bebidas?|frigorific|abatedouro)\b/.test(texto)) {
    return {
      segmento: "Alimentos e Bebidas",
      insumos:
        "fluidos hidráulicos protetivos, amônia para refrigeração de processo e esteiras de lavagem",
      benchmark: "Frigoríficos e Abatedouros",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em amônia de refrigeração e fluidos hidráulicos que passaram batido na primeira revisão.",
    };
  }
  // Têxtil e Confecção (Grupos 13 e 14)
  if (["13", "14"].includes(divisaoCnae) || /\b(textil|tecelagem|confeccao|fiacao)\b/.test(texto)) {
    return {
      segmento: "Têxtil",
      insumos: "agulhas de tecelagem, corantes industriais e óleos de tear",
      benchmark: "Fiação e Tecelagem",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em corantes industriais e óleos de tear que ninguém tinha reavaliado.",
    };
  }
  // Celulose e Papel (Grupo 17)
  if (divisaoCnae === "17") {
    return {
      segmento: "Celulose e Papel",
      insumos: "facas do picador de madeira, telas formadoras e feltros de prensa",
      benchmark: "Fabricação de Papel e Papelão Ondulado",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em telas formadoras e feltros de prensa que já estavam classificados como uso e consumo padrão.",
    };
  }
  // Transporte e Logística (Divisões CNAE 49 a 53: transporte terrestre,
  // aquaviário, aéreo, armazenagem e correio) — adicionado a pedido do
  // Everton, que prospecta transportadoras com frequência.
  if (
    ["49", "50", "51", "52", "53"].includes(divisaoCnae) ||
    /\b(transportador[ae]|transporte\s+de\s+cargas?|logistic[ao]|frete|frota|caminh(?:ao|oes)|carreta|armazenagem)\b/.test(texto)
  ) {
    return {
      segmento: "Transporte e Logística",
      insumos: "peças de reposição para frota, pneus e lubrificantes automotivos",
      benchmark: "Transporte Rodoviário de Cargas",
      exemploSegmento:
        "Num caso parecido, encontramos oportunidade em pneus e lubrificantes de frota que ninguém tinha reavaliado.",
    };
  }

  // Fallback Industrial Amplo
  return {
    segmento: "Industrial",
    insumos: "partes, peças de reposição e componentes de desgaste operacional",
    benchmark: "indústria similar da mesma região",
    exemploSegmento:
      "Num caso parecido, encontramos oportunidade em peças de reposição e óleos industriais que já estavam classificados como consumo padrão.",
  };
}

function limparNomePessoa(raw?: string): string | undefined {
  const texto = (raw ?? "")
    .replace(/\b(CPF|RG|ADMINISTRADOR|S[ÓO]CIO[-\s]*ADMINISTRADOR|S[ÓO]CIO|TITULAR|DIRETOR)\b/gi, " ")
    .replace(/[()\[\]{}:;·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return undefined;
  if (/\b(CNPJ|LTDA|EIRELI|EPP|ME\b|S\.?A\.?|SOCIEDADE|PARTICIPA[CÇ][ÕO]ES|HOLDING|ADMINISTRADORA|GRUPO)\b/i.test(texto)) {
    return undefined;
  }
  if (/\b(INSCRI[CÇ][ÕO]ES?|ESTADUAIS?|ATIVIDADES?|ECON[ÔO]MICAS?|REGIME|TRIBUT[ÁA]RIO|SUFRAMA|CNAE|RECEITA|FEDERAL|SIMPLES|NACIONAL|EMPRESAS?|NEG[ÓO]CIOS?|DETALHES|LISTA|CARGO|SETOR|SITE|LINKEDIN|FABRICA[CÇ][AÃ]O|COM[EÉ]RCIO|ESTRUTURAS?|MET[AÁ]LICAS?|METAL[ÚU]RGIC[AO]S?|IND[ÚU]STRIA|DESCRI[CÇ][AÃ]O|PRINCIPAL|SECUND[AÁ]RIA|MUNIC[ÍI]PIO|CIDADE|ENDERE[CÇ]O|SITUA[CÇ][AÃ]O|PORTE|CAPITAL|ABERTURA|GRUPO)\b/i.test(texto)) {
    return undefined;
  }
  const partes = texto
    .split(/\s+/)
    .filter((p) => /^[A-Za-zÀ-ú'.-]{2,}$/.test(p));
  const primeiro = partes[0];
  if (!primeiro) return undefined;
  if (/^(inscri[cç][õo]es?|estaduais?|atividades?|economicas?|regime|tributario|suframa|cnae|administrador(?:es)?|socio(?:s)?|socios|analista|assistente|cargo|setor|site|lista|detalhes|empresas?|negocios?|fabrica[cç][aã]o|com[eé]rcio|estruturas?|met[aá]licas?|metal[uú]rgic[ao]s?|ind[uú]stria|descri[cç][aã]o|principal|secund[aá]ria|munic[ií]pio|cidade|endere[cç]o|situa[cç][aã]o|porte|capital|abertura|grupo)$/i.test(primeiro)) {
    return undefined;
  }
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

function contemConteudoNaoHumano(linha?: string): boolean {
  const clean = (linha ?? "").trim();
  if (!clean) return true;
  return /\b(CNPJ|CPF|LTDA|EIRELI|EPP|S\.?A\.?|HOLDING|PARTICIPA[CÇ][ÕO]ES|GRUPO|IND[ÚU]STRIA|COM[EÉ]RCIO|EMPRESAS?|NEG[ÓO]CIOS?|DETALHES|LISTA|LINKEDIN|SETOR|LOCALIZA[CÇ][AÃ]O|EMPREGO|CARGO|SITE|BRASIL|ATIVA|PRESENTE|REMOVER|DADOS|RECEITA|FEDERAL|SIMPLES|NACIONAL|CNAE|SUFRAMA|INSCRI[CÇ][ÕO]ES?|ESTADUAIS?|ATIVIDADES?|ECON[ÔO]MICAS?|REGIME|TRIBUT[ÁA]RIO|S[ÓO]CIOS?|ADMINISTRADORES?|FABRICA[CÇ][AÃ]O|ESTRUTURAS?|MET[AÁ]LICAS?|METAL[ÚU]RGIC[AO]S?|METALURGIA|AÇO|ACO|FERRO|USINAGEM|SOLDA|CALDEIRARIA|DESCRI[CÇ][AÃ]O|PRINCIPAL|SECUND[AÁ]RIA|MUNIC[ÍI]PIO|CIDADE|ENDERE[CÇ]O|SITUA[CÇ][AÃ]O|PORTE|CAPITAL|ABERTURA)\b/i.test(clean);
}

function tokensParecemNomeHumano(linha: string): boolean {
  const tokens = linha.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.every((token, index) => {
    const limpo = token.replace(/[.'-]/g, "");
    if (/^(de|da|do|das|dos|e)$/i.test(limpo)) return true;
    if (index > 0 && /^[a-zà-ú][a-zà-ú'.-]{1,}$/.test(token)) return true;
    return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú'.-]{1,}$/.test(token) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}$/.test(limpo);
  });
}

function linhaTemCargoPrioritario(linhas: string[], index: number): boolean {
  const linha = linhas[index]?.trim() ?? "";
  const proxima = linhas[index + 1]?.trim() ?? "";
  const contexto = `${linha} ${/^(cargo|setor|fun[cç][aã]o|departamento)\s*:?$/i.test(linha) ? proxima : ""}`.trim();
  if (!CONTATO_PRIORITARIO_REGEX.test(contexto)) return false;
  if (/\b(REGIME\s+TRIBUT[ÁA]RIO|LUCRO\s+REAL|PRESUMIDO|SIMPLES\s+NACIONAL|ATIVIDADES?\s+ECON[ÔO]MICAS?|INSCRI[CÇ][ÕO]ES?\s+ESTADUAIS?|SUFRAMA|CNAE|RECEITA\s+FEDERAL)\b/i.test(contexto)) return false;
  return /\b(CARGO|SETOR|FUN[CÇ][AÃ]O|DEPARTAMENTO|AUX\.?|AUXILIAR|ASSISTENTE|ANALISTA|COORDENADOR|GERENTE|DIRETOR|CONTROLLER|CONTADOR|FISCAL|FINANCEIR[OA]|FINACEIR[OA]|CONT[AÁ]BIL|CONTROLADORIA|TESOURARI[AO])\b/i.test(contexto);
}

function existeCargoPrioritarioNaJanela(linhas: string[], startIndex: number): boolean {
  for (let i = startIndex + 1; i < Math.min(linhas.length, startIndex + 70); i += 1) {
    const linha = linhas[i]?.trim() ?? "";
    if (/^(atividades?\s+econ[ôo]micas?|inscri[cç][õo]es?\s+estaduais?|suframa|cnae)\s*:?$/i.test(linha)) return false;
    if (i > startIndex + 1 && pareceNomePessoaLinha(linha, linhaAnteriorUtil(linhas, i))) return false;
    if (linhaTemCargoPrioritario(linhas, i)) return true;
  }
  return false;
}

function linhaAnteriorUtil(linhas: string[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const linha = linhas[i]?.trim();
    if (linha) return linha;
  }
  return undefined;
}

function pareceNomePessoaLinha(linha?: string, linhaAnterior?: string): boolean {
  const clean = (linha ?? "").trim();
  if (!clean || clean.length > 80) return false;
  if (linhaAnterior && /^(empresa|raz[aã]o social|nome fantasia)\s*:?$/i.test(linhaAnterior.trim())) return false;
  if (linhaAnterior && /^(cargo|setor|fun[cç][aã]o|departamento)\s*:?$/i.test(linhaAnterior.trim())) return false;
  if (linhaAnterior && /\b(rodovia|rua|avenida|av\.?|estrada|travessa|alameda|bairro|lote|quadra|km|br-|rs-)\b/i.test(linhaAnterior.trim())) return false;
  if (/@|https?:|www\.|\d|:|,/.test(clean)) return false;
  if (contemConteudoNaoHumano(clean)) return false;
  const tokens = clean.split(/\s+/).filter((p) => /^[A-Za-zÀ-ú'.-]{2,}$/.test(p));
  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.length === clean.split(/\s+/).length && tokensParecemNomeHumano(clean);
}

function normalizarTextoParaExtracaoDeContatos(texto?: string): string {
  return (texto ?? "")
    .replace(
      /(Receita\s+Federal|Simples\s+Nacional|Telefone\s+da\s+sede\s*:?)\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+){1,5})/g,
      "$1\n$2",
    )
    .replace(
      /(\d{6,})([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+){1,5})/g,
      "$1\n$2",
    );
}

// HIERARQUIA RÍGIDA DE PRIORIDADE ao escolher {NOME}:
// 1º) Contatos fiscal / financeiro / contábil / controladoria (coração do funil BHM)
// 2º) Pessoa física do Quadro de Sócios/Administradores (QSA)
// 3º) undefined → o template resolve como "tudo bem?"
// NUNCA usar razão social (LTDA, SA, HOLDING).
const CONTATO_PRIORITARIO_REGEX = /(fiscal|financeir[oa]|finaceir[oa]|cont[aá]bil|contabilidade|contador[a]?|controladori[ao]|controller|tesourari[ao]|tribut[aá]ri[ao]|aux\.?\s*(financeir[oa]|finaceir[oa]|fiscal|cont[aá]bil)|auxiliar\s+(financeir[oa]|finaceir[oa]|fiscal|cont[aá]bil)|assistente\s+(admin|administrativ|financeir|finaceir|fiscal|cont[aá]bil)|analista\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri)|coord(enador)?\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri)|gerent[ea]\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri|administrativ)|diretor(a)?\s+(fiscal|financeir|finaceir|cont[aá]bil|administrativ))/i;

function extrairContatoPrioritario(texto?: string): string | undefined {
  const linhas = normalizarTextoParaExtracaoDeContatos(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Caso mais confiável em listas coladas: o bloco do contato começa com o nome
  // e depois aparecem E-mail/Emprego/Empresa/Cargo. A análise fica dentro desse
  // bloco para não capturar bairro/endereço (ex.: "Alpes do Vale") como pessoa.
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!pareceNomePessoaLinha(linha, linhaAnteriorUtil(linhas, i))) continue;
    let fimBloco = Math.min(linhas.length, i + 90);
    for (let j = i + 1; j < Math.min(linhas.length, i + 90); j += 1) {
      if (pareceNomePessoaLinha(linhas[j], linhaAnteriorUtil(linhas, j))) {
        fimBloco = j;
        break;
      }
    }
    const bloco = linhas.slice(i, fimBloco);
    if (bloco.some((_, idx) => linhaTemCargoPrioritario(bloco, idx))) {
      const nome = limparNomePessoa(linha);
      if (nome) return nome;
    }
  }

  // Caso mais confiável: nome humano e cargo prioritário na mesma linha.
  // Ex.: "Rafaela Bueno (Assistente administrativo financeiro)".
  // Isso evita capturar uma linha de atividade/CNAE como "Fabricação de estruturas metálicas"
  // só porque existe um cargo financeiro nas linhas seguintes.
  for (const linha of linhas) {
    if (!linhaTemCargoPrioritario([linha], 0)) continue;
    if (contemConteudoNaoHumano(linha)) continue;
    const candidato = linha
      .replace(/^[-–—•\d.)\s]+/, "")
      .replace(/^(contato|nome)\s*[:\-]\s*/i, "")
      .split(/\s*[·\-–—|/]\s*|,\s*|\s+\(/)[0]
      .trim();
    if (!tokensParecemNomeHumano(candidato)) continue;
    const nome = limparNomePessoa(candidato);
    if (nome) return nome;
  }

  // Caso comum em listas coladas do LinkedIn: o nome vem em uma linha,
  // e o cargo prioritário aparece várias linhas depois como "Cargo:\nAnalista financeiro".
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!pareceNomePessoaLinha(linha, linhaAnteriorUtil(linhas, i))) continue;
    if (existeCargoPrioritarioNaJanela(linhas, i)) {
      const nome = limparNomePessoa(linha);
      if (nome) return nome;
    }
  }

  for (const linha of linhas) {
    if (!linhaTemCargoPrioritario([linha], 0)) continue;
    if (contemConteudoNaoHumano(linha)) continue;
    const semPrefixo = linha
      .replace(/^[-–—•\d.)\s]+/, "")
      .replace(/^(contato|nome)\s*[:\-]\s*/i, "");
    const antesDescritor = semPrefixo.split(/\s*[·\-–—|/]\s*|,\s*|\s+\(/)[0];
    if (!tokensParecemNomeHumano(antesDescritor || semPrefixo)) continue;
    const nome = limparNomePessoa(antesDescritor || semPrefixo);
    if (nome) return nome;
  }
  return undefined;
}

function extrairAdministradorPessoaFisica(texto?: string): string | undefined {
  // 1) Sempre tenta primeiro contatos fiscal/financeiro/contábil colados pelo operador.
  const prioritario = extrairContatoPrioritario(texto);
  if (prioritario) return prioritario;

  const linhas = normalizarTextoParaExtracaoDeContatos(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let dentroBlocoSocios = false;
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (/^(s[óo]cios?\s+e\s+administradores?|quadro\s+societ[aá]rio|qsa)\s*:?$/i.test(linha)) {
      dentroBlocoSocios = true;
      continue;
    }
    if (/^(atividades?\s+econ[ôo]micas?|inscri[cç][õo]es?\s+estaduais?|suframa|cnae|regime\s+tribut[aá]rio)\s*:?$/i.test(linha)) {
      dentroBlocoSocios = false;
      continue;
    }
    const linhaComPapelSocietario = /(administrador|s[óo]cio[-\s]*administrador|s[óo]cio|qsa|quadro\s+societ)/i.test(linha);
    const proximaComPapelSocietario = /(administrador|s[óo]cio[-\s]*administrador|s[óo]cio)/i.test(linhas[i + 1] ?? "");
    const linhaNomeSolto = dentroBlocoSocios && pareceNomePessoaLinha(linha, linhaAnteriorUtil(linhas, i)) && proximaComPapelSocietario;
    if (!linhaComPapelSocietario && !linhaNomeSolto) continue;
    if (/^(quadro\s+societ[aá]rio|qsa|s[óo]cios?|administradores?)\s*:?$/i.test(linha)) continue;
    if (/^qualifica[cç][aã]o\s+(do\s+)?s[óo]cio\s*:/i.test(linha)) continue;
    if (/\b(CNPJ|LTDA|EIRELI|EPP|S\.?A\.?|HOLDING|PARTICIPA[CÇ][ÕO]ES|PESSOA\s+JUR[ÍI]DICA)\b/i.test(linha)) continue;
    const semPrefixo = linha
      .replace(/^[-–—•\d.)\s]+/, "")
      .replace(/^(nome\s+do\s+s[óo]cio|s[óo]cio|administrador|nome)\s*[:\-]\s*/i, "");
    const antesQualificacao = semPrefixo.split(/\s+[·-]\s+|\s*\(|,\s*(?:administrador|s[óo]cio)/i)[0];
    const nome = limparNomePessoa(antesQualificacao || semPrefixo);
    if (nome) return nome;
  }

  return undefined;
}

function extrairCidadeUf(texto?: string): { cidade: string; uf: string } {
  const fonte = texto ?? "";
  for (const linha of fonte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const mLinha = linha.match(/^([A-Za-zÀ-ú\s.'-]{2,})\s+([A-Z]{2})\s+\d{5}-?\d{3}\b/);
    if (mLinha) return { cidade: mLinha[1].trim(), uf: mLinha[2] };
  }
  const mCidadeLabel = fonte.match(/(?:munic[íi]pio|cidade)\s*:?\s*([A-Za-zÀ-ú\s.'-]{2,})\s*\/\s*([A-Z]{2})\b/i);
  const mCidadeUf = mCidadeLabel ?? fonte.match(/([A-Za-zÀ-ú\s.'-]{2,})\s*\/\s*([A-Z]{2})\b/);
  if (!mCidadeUf) return { cidade: "", uf: "" };
  return {
    cidade: mCidadeUf[1]
      .split(/[·,-]/)
      .pop()!
      .replace(/\b(munic[íi]pio|cidade)\b\s*:?/gi, "")
      .trim(),
    uf: mCidadeUf[2],
  };
}

function extrairCnaeLinha(texto?: string): string | undefined {
  const fonte = texto ?? "";
  const linhas = fonte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < linhas.length; i += 1) {
    const codigo = linhas[i].match(/^(\d{4}[\d.\/-]*)\s*(?:principal|secund[aá]ria)?\s*$/i) ??
      linhas[i].match(/^(\d{4}[\d.\/-]*)\s+(?:principal|secund[aá]ria)\b/i);
    if (codigo) {
      const descricao = linhas.slice(i + 1, i + 4).find((linha) => /^[A-Za-zÀ-ú]/.test(linha) && !/^(principal|secund[aá]ria|tipo|descri[cç][aã]o)$/i.test(linha));
      return [codigo[1], descricao].filter(Boolean).join(" - ");
    }
  }
  return (
    fonte.match(/(?:atividade\s*principal(?:\s*\(cnae\))?|cnae\s*principal)\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
    fonte.match(/\b(?:CNAE\s*)?(\d{2}[.\d\/-]*\s*-\s*[^\n]+)/i)?.[1]?.trim() ||
    undefined
  );
}

function extrairRazaoSocialBruta(texto?: string): string | undefined {
  const linhas = (texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const linha of linhas) {
    if (/\b(LTDA|EIRELI|EPP|S\.?A\.?|SOCIEDADE|IND[ÚU]STRIA|COM[EÉ]RCIO)\b/i.test(linha) && !/^group\s+/i.test(linha)) {
      return linha.replace(/\s+/g, " ").slice(0, 120);
    }
  }
  return undefined;
}

export function montarLeadFallback(dadosBrutos: string, cnpjInput: string, empresaResumo?: string | null): ActiveLeadData {
  const cidadeUf = extrairCidadeUf(dadosBrutos);
  const cnpjDoTexto = dadosBrutos.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0]?.replace(/\D/g, "") ?? "";
  const fallbackNome =
    (empresaResumo ?? "").split("·")[0].trim() ||
    dadosBrutos.trim().split(/\r?\n/)[0]?.slice(0, 80).trim() ||
    "Empresa";
  return {
    cnpj: (cnpjInput ?? "").replace(/\D/g, "") || cnpjDoTexto,
    razaoSocial: fallbackNome,
    nomeFantasia: fallbackNome,
    cnaePrincipal: extrairCnaeLinha(dadosBrutos) ?? dadosBrutos,
    cidade: cidadeUf.cidade,
    uf: cidadeUf.uf,
    endereco: "",
    contatoNome: undefined,
  };
}

export function preencherTagsDoScript(texto: string, lead: ActiveLeadData, dadosBrutos = "", nomeContatoOverride?: string): string {
  const mapping = inferirSegmentoPorCnae(`${lead.cnaePrincipal ?? ""}\n${dadosBrutos}`);
  const nomeContato = nomeContatoOverride ?? lead.contatoNome ?? "tudo bem?";
  const cidade = lead.cidade?.trim() || "aí na região";
  const cidadeEstado = lead.cidade && lead.uf ? `${lead.cidade}/${lead.uf}` : cidade;
  const nomeEmpresa = lead.nomeFantasia || lead.razaoSocial || "Empresa";

  const preenchido = texto
    .replace(/\{\s*NOME\s*\}/gi, nomeContato)
    .replace(/\{\s*CIDADE_ESTADO\s*\}/gi, cidadeEstado)
    .replace(/\{\s*CIDADE\s*\}/gi, cidade)
    .replace(/\{\s*SEGMENTO\s*\}/gi, mapping.segmento)
    .replace(/\{\s*INSUMOS\s*\}/gi, mapping.insumos)
    // {EXEMPLO_SEGMENTO}: usada na seção de objeção "já tenho contador/fiscal".
    // Antes desta correção, o Modo Esteira não conhecia essa tag e a deixava
    // sem substituir. Agora resolve pra frase certa do segmento identificado.
    .replace(/\{\s*EXEMPLO_SEGMENTO\s*\}/gi, mapping.exemploSegmento)
    .replace(/\{\s*EMPRESA\s*\}/gi, nomeEmpresa)
    .replace(/\[\s*NOME\s*\]/gi, nomeContato)
    .replace(/\[\s*CIDADE_ESTADO\s*\]/gi, cidadeEstado)
    .replace(/\[\s*CIDADE\s*\]/gi, cidade)
    .replace(/\[\s*SEGMENTO\s*\]/gi, mapping.segmento)
    .replace(/\[\s*INSUMOS\s*\]/gi, mapping.insumos)
    .replace(/\[\s*EXEMPLO_SEGMENTO\s*\]/gi, mapping.exemploSegmento)
    .replace(/\[\s*EMPRESA\s*\]/gi, nomeEmpresa);

  if (nomeContato.toLowerCase() === "tudo bem?") return preenchido;
  return preenchido
    .replace(
    /\b(Grupo|Empresa|Fabrica[cç][aã]o|Com[eé]rcio|Inscri[cç][õo]es?|Atividades?|CNAE|S[óo]cios?|Administradores?)\s*,/gi,
    `${nomeContato},`,
    )
    .replace(
      /(^|[\n"])([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú'.-]{2,})\s*,(?=\s*(?:tudo bem|estou|90%|eu entendo|sem custo|vou|hoje|a gente|e se|quero|compartilho))/g,
      (_match, prefix, vocativo) => (vocativo === nomeContato ? `${prefix}${vocativo},` : `${prefix}${nomeContato},`),
    );
}

export function contemAlucinacaoDeExtracao(texto: string, lead: ActiveLeadData, dadosBrutos = "", nomeContatoOverride?: string): boolean {
  const mapping = inferirSegmentoPorCnae(`${lead.cnaePrincipal ?? ""}\n${dadosBrutos}`);
  const nomeContato = nomeContatoOverride ?? lead.contatoNome ?? "tudo bem?";
  const nomeEhNeutro = nomeContato.toLowerCase() === "tudo bem?";
  const tituloUsadoComoVocativo = /\b(Grupo|Empresa|Inscri[cç][õo]es?|Estaduais?|Atividades?|Econ[ôo]micas?|SUFRAMA|CNAE|Regime|Receita|Federal|S[óo]cios?|Administradores?|Fabrica[cç][aã]o|Com[eé]rcio)\b\s*,?\s*tudo bem\??/i.test(texto);
  if (!nomeEhNeutro && tituloUsadoComoVocativo) return true;

  if (mapping.segmento === "Metalurgia e Metalmecânica") {
    return /\b(t[êe]xtil|tecelagem|agulhas?\s+de\s+tecelagem|corantes?\s+industriais?|[óo]leos?\s+de\s+tear)\b/i.test(texto);
  }

  return false;
}

// Isola o roteiro útil (descarta árvore de instruções) e substitui os tokens com base no lead ativo
export function compileScriptLocally(template: string, lead: ActiveLeadData, dadosBrutos = "", nomeContatoOverride?: string): string {
  let scriptSection = extractFinalScriptOnly(template);
  const markers = ["### OUTPUT ESPERADO", "OUTPUT ESPERADO", "📞 MODELO", "MODELO: COLD CALL", "TEMPLATE DO SCRIPT", "ROTEIRO DE LIGAÇÃO"];
  const upper = scriptSection.toUpperCase();
  for (const marker of markers) {
    const index = upper.indexOf(marker);
    if (index !== -1) {
      scriptSection = scriptSection.slice(index);
      const nextLineIndex = scriptSection.indexOf("\n");
      if (nextLineIndex !== -1) {
        scriptSection = scriptSection.slice(nextLineIndex + 1);
      }
      break;
    }
  }
  const primeiroTurno = scriptSection.search(/\b(EVERTON|HELUANE|CONSULTOR[A]?)\s*:/i);
  if (primeiroTurno > 0) {
    scriptSection = scriptSection.slice(primeiroTurno);
  }

  const mapping = inferirSegmentoPorCnae(`${lead.cnaePrincipal ?? ""}\n${dadosBrutos}`);
  const diaSemana = new Date().toLocaleDateString("pt-BR", { weekday: "long" }).toLowerCase();

  let gatilhoTempo = "na próxima semana";
  let d1 = "Terça-feira";
  let d2 = "Quarta-feira";
  let d3 = "Quinta-feira";
  if (diaSemana.includes("segunda") || diaSemana.includes("terça")) {
    gatilhoTempo = "essa semana ainda";
    d1 = "Quarta-feira";
    d2 = "Quinta-feira";
    d3 = "Sexta-feira";
  }

  const localizacao =
    lead.cidade && lead.uf ? `${lead.cidade}/${lead.uf}` : "aí na região";
  const nomeEmpresa = lead.nomeFantasia || lead.razaoSocial || "Empresa";

  const hydrated = scriptSection
    .replace(/indústrias de Indústria/gi, `indústrias de ${mapping.segmento}`)
    .replace(/DURIN INDUSTRIA DE PLASTICOS LTDA/g, nomeEmpresa)
    .replace(/ARAQUARI\/SC/g, localizacao)
    .replace(/\[Nome do Lead\]/gi, nomeEmpresa)
    .replace(/\[Raz[aã]o Social\]/gi, lead.razaoSocial)
    .replace(/\[Nome Fantasia\]/gi, lead.nomeFantasia ?? lead.razaoSocial)
    .replace(/\[CNPJ\]/gi, lead.cnpj)
    .replace(/\[Segmento\/Mat[eé]ria-prima\]/gi, `${mapping.segmento} (${mapping.insumos})`)
    .replace(/\[Segmento\]/gi, mapping.segmento)
    .replace(/\[Mat[eé]ria-prima\]/gi, mapping.insumos)
    .replace(/\[Exemplos de Insumos Intermediários\]/gi, mapping.insumos)
    .replace(/\[Insumos\]/gi, mapping.insumos)
    .replace(/\[Segmento de Benchmark\]/gi, mapping.benchmark)
    .replace(/\[Benchmark\]/gi, mapping.benchmark)
    .replace(/\[Cidade\/Estado\]/gi, localizacao)
    .replace(/\[Cidade\]/gi, lead.cidade ?? "a fábrica")
    .replace(/\[UF\]/gi, lead.uf ?? "")
    .replace(/\[essa semana \/ na próxima semana\]/gi, gatilhoTempo)
    .replace(/\[essa semana ainda \/ na próxima semana\]/gi, gatilhoTempo)
    .replace(/\[Dia 1\]/gi, d1)
    .replace(/\[Dia 2\]/gi, d2)
    .replace(/\[Dia 3\]/gi, d3)
    .trim();

  return extractFinalScriptOnly(
    preencherTagsDoScript(hydrated, lead, dadosBrutos, nomeContatoOverride),
  );
}

// Extrai campos do bloco de "Dados da empresa" digitados/colados manualmente
// durante o Modo Manual de Contingência (quando BrasilAPI/CNPJá estão fora).
// Reconhece o mesmo formato "Chave: valor" que geramos automaticamente,
// além de variações comuns coladas pelo operador.
export function parseLeadFromDados(texto: string, cnpjInput?: string): ActiveLeadData | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const pick = (re: RegExp): string | undefined => {
    const m = t.match(re);
    return m?.[1]?.trim() || undefined;
  };
  const razao = pick(/raz[aã]o\s*social\s*:\s*([^\n]+)/i) ?? extrairRazaoSocialBruta(t);
  const fantasia = pick(/nome\s*fantasia\s*:\s*([^\n]+)/i);
  const cnaeLinha = extrairCnaeLinha(t);
  const endereco = pick(/endere[çc]o\s*:\s*([^\n]+)/i);
  const cnpjTxt = pick(/cnpj\s*:\s*([^\n]+)/i);
  const cnpjFallback = t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? "";
  const cnpjDigits = ([cnpjInput, cnpjTxt, cnpjFallback].find((v) => (v ?? "").trim()) ?? "").replace(/\D/g, "");
  const { cidade, uf } = extrairCidadeUf(endereco ?? t);
  if (!razao && !fantasia && !cnpjDigits) return null;
  return {
    cnpj: cnpjDigits || "",
    razaoSocial: razao ?? fantasia ?? "Empresa",
    nomeFantasia: fantasia ?? razao ?? "Empresa",
    cnaePrincipal: cnaeLinha ?? "",
    cidade,
    uf,
    endereco: endereco ?? "",
    contatoNome: undefined,
  };
}

// =============================================================================
// PARSER DE PITCH → CARDS DO FLUXO DA LIGAÇÃO
// -----------------------------------------------------------------------------
// Lê o CONTEÚDO LITERAL do prompt ativo (o "pitch" que o usuário escreveu na
// Biblioteca de Prompts) e extrai dele a Abertura e as Objeções, no formato:
//
//   1. ABERTURA PRINCIPAL
//   "texto falado..."
//   [NOTA: instrução pro operador]
//
//   2. OBJEÇÃO — "gatilho da pessoa do outro lado"
//   "texto falado..."
//
// REGRA DE OURO (igual à da Biblioteca de Prompts): nunca inventamos conteúdo
// de objeção. Se a seção não existe no pitch, ela simplesmente não é gerada
// aqui — quem decide o que fazer na ausência dela é o componente que usa este
// parser (pre-ligacao.tsx), que trava o card correspondente, empresta de
// outro pitch do mesmo tema, ou cai no fallback genérico do sistema (nessa
// ordem), em vez de inventar uma resposta.
// =============================================================================

export type ParsedPitchCard = {
  id: string;
  label: string;
  resposta: string;
  extra?: { gatilho: string; texto: string };
};

export type ParsedPitch = {
  abertura: ParsedPitchCard | null;
  objecoes: ParsedPitchCard[];
  /** true quando NENHUMA seção "N. OBJEÇÃO — ..." foi encontrada no texto. */
  isFallback: boolean;
};

const HEADING_NUMERADO_RE = /^\s*(\d+)[.)]\s*(.+?)\s*$/;
const NOTAS_EXECUCAO_RE = /^\s*notas?\s+de\s+execu[cç][aã]o\b/i;

function removerAcentos(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarParaComparar(v: string): string {
  return removerAcentos(v).toLowerCase().trim().replace(/\s+/g, " ");
}

function slugificarLabel(v: string): string {
  const base = removerAcentos(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base.slice(0, 40) || "objecao";
}

/** Primeiro bloco entre aspas (retas " ou curvas " "), podendo ter várias linhas. */
function extrairPrimeiroBlocoEntreAspas(texto: string): string | null {
  const m = texto.match(/["“]([\s\S]*?)["”]/);
  return m ? m[1].trim() : null;
}

/**
 * Lê o corpo de UMA seção (abertura ou objeção) e devolve a fala principal +,
 * se existir, uma "nota extra" clicável (igual ao botão "insistiu que só o
 * diretor decide" que já existe no fluxo). Uma "[NOTA: ...]" sem resposta
 * entre aspas embutida vira apenas uma linha de direção de cena dentro da
 * própria fala (mesmo tratamento que "[pausa de 1 segundo...]" já recebe).
 */
function interpretarCorpoDaSecao(corpoTexto: string): { resposta: string; extra?: { gatilho: string; texto: string } } {
  const respostaBase = extrairPrimeiroBlocoEntreAspas(corpoTexto) ?? corpoTexto.trim();
  const notaMatch = corpoTexto.match(/\[NOTA:\s*([\s\S]*?)\]/i);
  if (!notaMatch) return { resposta: respostaBase };

  const conteudoNota = notaMatch[1].trim();
  const respostaEmbutida = extrairPrimeiroBlocoEntreAspas(conteudoNota);
  if (respostaEmbutida) {
    const gatilhoBruto = conteudoNota.split(/:\s*["“]/)[0]?.split(",")[0]?.trim() || conteudoNota;
    const gatilho = gatilhoBruto.charAt(0).toUpperCase() + gatilhoBruto.slice(1);
    return { resposta: respostaBase, extra: { gatilho, texto: respostaEmbutida } };
  }
  // Nota simples (só instrução, sem resposta embutida) — preserva como linha
  // de direção de cena dentro da própria fala.
  return { resposta: `${respostaBase}\n[${conteudoNota}]` };
}

/**
 * Extrai Abertura + Objeções do texto literal de um prompt de abordagem.
 * Não faz NENHUMA suposição sobre conteúdo — só reconhece a estrutura de
 * seções numeradas ("1. ABERTURA PRINCIPAL", "2. OBJEÇÃO — "..."", etc.).
 * Qualquer coisa fora desse formato é ignorada (não vira card, mas também
 * não quebra o parser). Uma seção "NOTAS DE EXECUÇÃO" encerra a leitura —
 * tudo depois dela é instrução, não fala.
 */
export function parsePitchIntoCards(pitchText: string): ParsedPitch {
  const linhas = (pitchText ?? "").split(/\r?\n/);
  type Secao = { titulo: string; corpo: string[] };
  const secoes: Secao[] = [];
  let atual: Secao | null = null;

  for (const linha of linhas) {
    if (NOTAS_EXECUCAO_RE.test(linha)) {
      atual = null;
      break;
    }
    const heading = linha.match(HEADING_NUMERADO_RE);
    if (heading) {
      atual = { titulo: heading[2], corpo: [] };
      secoes.push(atual);
      continue;
    }
    if (atual) atual.corpo.push(linha);
  }

  let abertura: ParsedPitchCard | null = null;
  const objecoes: ParsedPitchCard[] = [];

  for (const secao of secoes) {
    const corpoTexto = secao.corpo.join("\n").trim();
    if (!corpoTexto) continue;
    const tituloNorm = removerAcentos(secao.titulo).toUpperCase();
    const { resposta, extra } = interpretarCorpoDaSecao(corpoTexto);

    if (tituloNorm.startsWith("ABERTURA")) {
      abertura = { id: "abertura", label: "Abertura principal", resposta, extra };
      continue;
    }

    if (tituloNorm.startsWith("OBJECAO")) {
      const labelMatch = secao.titulo.match(/[-—:]\s*["“](.+?)["”]/);
      const labelBruto = (labelMatch?.[1] ?? secao.titulo.replace(/^OBJE[CÇ][ÃA]O\s*[-—:]?\s*/i, "")).trim();
      const label = labelBruto.length > 70 ? `${labelBruto.slice(0, 67)}…` : labelBruto;
      objecoes.push({ id: slugificarLabel(label || `objecao-${objecoes.length + 1}`), label, resposta, extra });
    }
  }

  return { abertura, objecoes, isFallback: objecoes.length === 0 };
}

// =============================================================================
// PASSO 2 DA RESOLUÇÃO DE OBJEÇÃO: EMPRÉSTIMO ENTRE PITCHES DO MESMO TEMA
// -----------------------------------------------------------------------------
// Quando o pitch ATIVO não tem uma categoria de objeção, procura essa mesma
// categoria em OUTROS pitches do MESMO tema/aba (nunca de tema diferente).
// Devolve também de qual pitch veio, para a tela avisar "veio de outro pitch"
// e, se o operador tentar editar, redirecionar pro pitch de origem em vez de
// gravar no lugar errado.
// =============================================================================

export type ObjecaoEmprestada = {
  pitchOrigemId: string;
  pitchOrigemNome: string;
  card: ParsedPitchCard;
};

/**
 * Procura, entre os pitches informados (normalmente: todos os pitches de
 * "abordagem" do mesmo tema, exceto o ativo), o primeiro que tenha uma
 * objeção cujo label bata com `keywords`. Não olha pitches de outro tema —
 * quem monta a lista de `outrosPitchesDoMesmoTema` já garante isso.
 */
export function encontrarObjecaoEmOutrosPitchesDoTema(
  outrosPitchesDoMesmoTema: PromptItem[],
  keywords: RegExp,
): ObjecaoEmprestada | null {
  for (const pitch of outrosPitchesDoMesmoTema) {
    const parsed = parsePitchIntoCards(pitch.conteudo);
    const achado = parsed.objecoes.find((o) => keywords.test(`${o.label} ${o.resposta}`));
    if (achado) {
      return { pitchOrigemId: pitch.id, pitchOrigemNome: pitch.nome, card: achado };
    }
  }
  return null;
}

// =============================================================================
// EDIÇÃO DE CARD → GRAVA DE VOLTA NO PITCH (serializador, inverso do parser)
// -----------------------------------------------------------------------------
// O card é um ESPELHO do pitch: editar o texto no card precisa atualizar a
// seção correspondente dentro do texto bruto do pitch, preservando tudo mais
// (numeração, outras seções, [NOTA: ...]) intacto. Só funciona em cards cuja
// origem é o PRÓPRIO pitch ativo — cards emprestados de outro pitch do tema
// ou gerados pelo sistema (fallback) não têm uma seção "sua" pra editar aqui.
//
// LIMITAÇÃO CONHECIDA (avisar o operador na UI): o novo texto não deve conter
// aspas retas/curvas (" " "), porque são o delimitador da fala no formato do
// pitch — aspas dentro do texto editado são convertidas em aspas simples (')
// pra não quebrar a seção.
// =============================================================================

export function atualizarSecaoDoPitch(
  pitchTextoOriginal: string,
  alvo: { tipo: "abertura" } | { tipo: "objecao"; label: string },
  novoTexto: string,
): { textoAtualizado: string; encontrou: boolean } {
  const linhas = (pitchTextoOriginal ?? "").split(/\r?\n/);
  type SecaoRange = { titulo: string; inicio: number; fim: number };
  const secoes: SecaoRange[] = [];
  let tituloAtual: string | null = null;
  let inicioAtual = -1;

  function fecharSecaoAtual(fim: number) {
    if (tituloAtual !== null && inicioAtual >= 0) {
      secoes.push({ titulo: tituloAtual, inicio: inicioAtual, fim });
    }
  }

  let parou = false;
  for (let i = 0; i < linhas.length && !parou; i += 1) {
    const linha = linhas[i];
    if (NOTAS_EXECUCAO_RE.test(linha)) {
      fecharSecaoAtual(i);
      tituloAtual = null;
      inicioAtual = -1;
      parou = true;
      break;
    }
    const heading = linha.match(HEADING_NUMERADO_RE);
    if (heading) {
      fecharSecaoAtual(i);
      tituloAtual = heading[2];
      inicioAtual = i + 1;
      continue;
    }
  }
  if (!parou) fecharSecaoAtual(linhas.length);

  let alvoSecao: SecaoRange | undefined;
  if (alvo.tipo === "abertura") {
    alvoSecao = secoes.find((s) => removerAcentos(s.titulo).toUpperCase().startsWith("ABERTURA"));
  } else {
    alvoSecao = secoes.find((s) => {
      const tituloNorm = removerAcentos(s.titulo).toUpperCase();
      if (!tituloNorm.startsWith("OBJECAO")) return false;
      const labelMatch = s.titulo.match(/[-—:]\s*["“](.+?)["”]/);
      const labelBruto = (labelMatch?.[1] ?? s.titulo.replace(/^OBJE[CÇ][ÃA]O\s*[-—:]?\s*/i, "")).trim();
      return normalizarParaComparar(labelBruto) === normalizarParaComparar(alvo.label);
    });
  }

  if (!alvoSecao) return { textoAtualizado: pitchTextoOriginal, encontrou: false };

  const corpoLinhas = linhas.slice(alvoSecao.inicio, alvoSecao.fim);
  const corpoOriginal = corpoLinhas.join("\n");
  const textoEscapado = novoTexto.replace(/["“”]/g, "'");

  const quoteMatch = corpoOriginal.match(/["“]([\s\S]*?)["”]/);
  let corpoNovo: string;
  if (quoteMatch && typeof quoteMatch.index === "number") {
    const antes = corpoOriginal.slice(0, quoteMatch.index);
    const depois = corpoOriginal.slice(quoteMatch.index + quoteMatch[0].length);
    corpoNovo = `${antes}"${textoEscapado}"${depois}`;
  } else {
    // Seção sem aspas (raro) — o corpo inteiro vira o texto novo.
    corpoNovo = `"${textoEscapado}"`;
  }

  const novasLinhas = [
    ...linhas.slice(0, alvoSecao.inicio),
    ...corpoNovo.split("\n"),
    ...linhas.slice(alvoSecao.fim),
  ];

  return { textoAtualizado: novasLinhas.join("\n"), encontrou: true };
}

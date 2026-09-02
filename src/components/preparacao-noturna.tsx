import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Play, Plus, Trash2, Loader2, Moon, Check, CalendarDays, X, Pencil, Save, Maximize2, ArrowRight, GripVertical, Search, Sparkles } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { generateWithAI } from "@/lib/prospeccao.functions";
import { consultarCnpj } from "@/lib/cnpj-enriquecimento.functions";
import { loadDeletedPastaIds, markPastaDeleted, unmarkPastaDeleted } from "@/lib/pastas-tombstones";
import { getSessionConsultor, getConsultor } from "@/lib/historico-store";
import {
  parseDadosCnpj,
  cnpjDigitos,
  cnpjRaiz,
  unidadeLabel,
  cidadeUfDoTexto,
} from "@/lib/cnpj-raw-parser";

export const LOAD_PRE_LIGACAO_EVENT = "bhm:load-to-pre-ligacao";
export const PREPARACAO_REALIZADA_EVENT = "bhm:preparacao-realizada";
export const ACTIVE_PREPARATION_ID_KEY = "bhm.activePreparationId";
export const PENDING_PRE_LIGACAO_KEY = "bhm.pending-pre-ligacao";

type EmpresaStatus = "pending" | "realizada" | "sem_interesse";

type Empresa = {
  id: string;
  nome: string;
  textoBruto: string;
  extraido?: boolean;
  status?: EmpresaStatus;
  ligadoEm?: string;
  razaoSocial?: string;
  cnpj?: string;
  contato?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
  uf?: string;
  setor?: string;
  regime?: string;
};

const UFS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];



function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function consultorSlug(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

function storageKey(date: string): string {
  return `bhm-preparacao::${date}::${consultorSlug()}`;
}

function preparationAliases(): string[] {
  const consultor = consultorSlug();
  if (consultor === "Everton Pereira") return ["Everton Pereira", "Everton", "everton"];
  if (consultor === "Eloane Manfroni") {
    return ["Eloane Manfroni", "Heluane Manfroni", "Eluane Manfroni", "Eloane", "Heluane", "Eluane"];
  }
  return [consultor];
}

function parseEmpresaList(raw: string | null): Empresa[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Empresa[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function empresaIdentity(item: Empresa): string {
  const cnpj = (item.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length >= 8) return `cnpj:${cnpj}`;
  const nome = (item.razaoSocial || item.nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return nome ? `nome:${nome}` : `id:${item.id}`;
}

function load(date: string): Empresa[] {
  if (typeof window === "undefined") return [];
  try {
    const canonicalKey = storageKey(date);
    const candidateKeys = new Set<string>([
      canonicalKey,
      ...preparationAliases().map((alias) => `bhm-preparacao::${date}::${alias}`),
      // Formatos anteriores ao isolamento por consultor.
      `bhm-preparacao::${date}`,
    ]);
    const merged = new Map<string, Empresa>();
    for (const key of candidateKeys) {
      for (const item of parseEmpresaList(window.localStorage.getItem(key))) {
        const identity = empresaIdentity(item);
        const previous = merged.get(identity);
        merged.set(identity, previous ? { ...previous, ...item } : item);
      }
    }
    const recovered = Array.from(merged.values());
    // Consolida silenciosamente os registros legados na chave atual.
    if (recovered.length > 0) {
      window.localStorage.setItem(canonicalKey, JSON.stringify(recovered));
    }
    return recovered;
  } catch {
    return [];
  }
}

function save(date: string, list: Empresa[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("bhm:preparacao-updated", { detail: { date } }));
  } catch {
    /* noop */
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ACTIVE_DATE_KEY = "bhm-preparacao::active-date";

// ------------------------------------------------------------------ pastas
// Uma "pasta" (carteira) é apenas outro balde de armazenamento, no mesmo
// formato das listas por data — a chave vira `pasta:<id>` em vez de YYYY-MM-DD.
export type PastaPreparacao = { id: string; nome: string; cor?: string };

const PASTAS_KEY_BASE = "bhm-preparacao::pastas";

function pastasKey(): string {
  return `${PASTAS_KEY_BASE}::${consultorSlug()}`;
}

export function isPastaBucket(bucket: string): boolean {
  return bucket.startsWith("pasta:");
}

export function loadPastas(): PastaPreparacao[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pastasKey());
    const parsed = raw ? (JSON.parse(raw) as PastaPreparacao[]) : [];
    if (!Array.isArray(parsed)) return [];
    const excluidas = loadDeletedPastaIds();
    return parsed.filter((p) => p && p.id && p.nome && !excluidas.has(String(p.id)));
  } catch {
    return [];
  }
}

function savePastas(list: PastaPreparacao[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pastasKey(), JSON.stringify(list));
  } catch {
    /* noop */
  }
}

function latestDateWithCompanies(): string | null {
  if (typeof window === "undefined") return null;
  const aliases = new Set(preparationAliases());
  const dates = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const match = /^bhm-preparacao::(\d{4}-\d{2}-\d{2})(?:::(.+))?$/.exec(key);
      if (!match) continue;
      const [, candidateDate, owner] = match;
      if (owner && !aliases.has(owner)) continue;
      if (parseEmpresaList(window.localStorage.getItem(key)).length > 0) dates.add(candidateDate);
    }
  } catch {
    return null;
  }
  return Array.from(dates).sort().at(-1) ?? null;
}

function loadActiveDate(): string {
  if (typeof window === "undefined") return todayISO();
  try {
    const raw =
      window.localStorage.getItem(`${ACTIVE_DATE_KEY}::${consultorSlug()}`) ??
      window.localStorage.getItem(ACTIVE_DATE_KEY);
    if (raw && isPastaBucket(raw) && loadPastas().some((p) => `pasta:${p.id}` === raw)) return raw;
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && load(raw).length > 0) return raw;
    const recoveredDate = latestDateWithCompanies();
    if (recoveredDate) return recoveredDate;
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  } catch { /* noop */ }
  return todayISO();
}


function saveActiveDate(date: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${ACTIVE_DATE_KEY}::${consultorSlug()}`, date);
  } catch { /* noop */ }
}

// Registra (de volta) uma empresa na lista do dia da Preparação Noturna.
// Usado quando a empresa é chamada à Pré-ligação por fora do fluxo normal.
export function addEmpresaToPreparacaoNoturna(input: {
  razaoSocial?: string | null;
  nome?: string | null;
  cnpj?: string | null;
  contato?: string | null;
  cargo?: string | null;
  telefone?: string | null;
  email?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const date = todayISO();
  const nome = (input.razaoSocial || input.nome || "").trim();
  if (!nome) return;
  const candidato: Empresa = {
    id: `readd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome,
    razaoSocial: input.razaoSocial ?? nome,
    cnpj: input.cnpj ?? undefined,
    contato: input.contato ?? undefined,
    cargo: input.cargo ?? undefined,
    telefone: input.telefone ?? undefined,
    email: input.email ?? undefined,
    textoBruto: nome,
    status: "pending",
  };
  const atual = load(date);
  const identidade = empresaIdentity(candidato);
  if (atual.some((e) => empresaIdentity(e) === identidade)) return;
  save(date, [...atual, candidato]);
}

// Procura, em todas as datas salvas para o consultor atual, uma empresa
// compatível pelo CNPJ (>=8 dígitos) ou pelo nome normalizado. Usado pelo
// Follow-up para reidratar o dossiê salvo na Preparação Noturna quando o
// operador clica em "Iniciar" e queremos preencher também a Pré-ligação.
export type PreparationMatch = {
  nome: string;
  textoBruto: string;
  preparationId: string;
  razaoSocial?: string;
  contato?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
};

export function findPreparationForCompany(
  cnpj?: string | null,
  nome?: string | null,
): PreparationMatch | null {
  if (typeof window === "undefined") return null;
  const cnpjDigits = (cnpj ?? "").replace(/\D/g, "");
  const normalize = (v: string) =>
    v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const target = normalize(nome ?? "");
  const prefix = `bhm-preparacao::`;
  const suffix = `::${consultorSlug()}`;
  let best: Empresa | null = null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(prefix) || !k.endsWith(suffix)) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      let arr: Empresa[] = [];
      try { arr = JSON.parse(raw) as Empresa[]; } catch { continue; }
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        const eCnpj = (e.cnpj ?? "").replace(/\D/g, "");
        if (cnpjDigits.length >= 8 && eCnpj.length >= 8 && eCnpj === cnpjDigits) {
          return toMatch(e, nome);
        }
        const eNorm = normalize(e.nome || e.razaoSocial || "");
        if (target.length >= 5 && eNorm.length >= 5 && (eNorm === target || eNorm.includes(target) || target.includes(eNorm))) {
          best = e;
        }
      }
    }
  } catch { /* noop */ }
  if (!best) return null;
  return toMatch(best, nome);
}

function toMatch(e: Empresa, nome?: string | null): PreparationMatch {
  return {
    nome: e.nome || nome || "Empresa",
    textoBruto: e.textoBruto || "",
    preparationId: e.id,
    razaoSocial: e.razaoSocial,
    contato: e.contato,
    cargo: e.cargo,
    telefone: e.telefone,
    email: e.email,
  };
}

// Marca como "realizada" (LIGADO) todas as empresas da Preparação Noturna
// compatíveis com o CNPJ/nome informados, em qualquer data do consultor atual.
// Usado pela Pós-ligação para dar baixa automática mesmo quando a ligação
// não começou pelo botão "Enviar ao pré-ligação".
export function markPreparacaoRealizadaByCompany(
  cnpj?: string | null,
  nome?: string | null,
  outcome: "realizada" | "sem_interesse" = "realizada",
): number {
  if (typeof window === "undefined") return 0;
  const cnpjDigits = (cnpj ?? "").replace(/\D/g, "");
  const normalize = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(ltda|s\/a|sa|me|epp|eireli|mei|industria|comercio|e)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const target = normalize(nome ?? "");
  const prefix = `bhm-preparacao::`;
  const suffix = `::${consultorSlug()}`;
  let changed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix) && k.endsWith(suffix)) keys.push(k);
    }
    for (const k of keys) {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      let arr: Empresa[] = [];
      try { arr = JSON.parse(raw) as Empresa[]; } catch { continue; }
      if (!Array.isArray(arr)) continue;
      let dirty = false;
      const next = arr.map((e) => {
        if (e.status === outcome) return e;
        const eCnpj = (e.cnpj ?? "").replace(/\D/g, "");
        const byCnpj = cnpjDigits.length >= 8 && eCnpj.length >= 8 && eCnpj === cnpjDigits;
        const eNorm = normalize(e.nome || e.razaoSocial || "");
        const byName =
          !byCnpj &&
          target.length >= 4 &&
          eNorm.length >= 4 &&
          (eNorm === target || eNorm.includes(target) || target.includes(eNorm));
        if (!byCnpj && !byName) return e;
        dirty = true;
        changed++;
        return { ...e, status: outcome, ligadoEm: new Date().toISOString() };
      });
      if (dirty) window.localStorage.setItem(k, JSON.stringify(next));
    }
  } catch { /* noop */ }
  if (changed > 0) {
    window.dispatchEvent(
      new CustomEvent(PREPARACAO_REALIZADA_EVENT, { detail: { byCompany: true, outcome } }),
    );
  }
  return changed;
}

const EXTRACT_SYSTEM_PROMPT =
  "Você recebe um texto bruto com anotações de prospecção B2B. Extraia APENAS o nome/razão social da empresa mencionada. Responda somente com o nome (máx 40 caracteres), sem aspas, sem prefixos, sem explicações. Se não conseguir identificar, responda EXATAMENTE: DESCONHECIDA.";

export function PreparacaoNoturna({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const [hydrated, setHydrated] = useState(false);
  const [date, setDate] = useState<string>(todayISO());
  const [list, setList] = useState<Empresa[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [aba, setAba] = useState<"ativas" | "sem_interesse">("ativas");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState<string>("");
  const [bulkPasta, setBulkPasta] = useState<string>("");
  const [bulkMode, setBulkMode] = useState<"copiar" | "mover">("copiar");
  const [pastas, setPastas] = useState<PastaPreparacao[]>([]);
  const [pastaDialog, setPastaDialog] = useState<{ id?: string; nome: string } | null>(null);
  const [grupoEscolha, setGrupoEscolha] = useState<{ origem: Empresa; unidades: Empresa[] } | null>(
    null,
  );
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"" | EmpresaStatus>("");
  const [filtroUf, setFiltroUf] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [filtroRegime, setFiltroRegime] = useState("");
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [progressoEnriquecimento, setProgressoEnriquecimento] = useState<string | null>(null);
  const runGenerate = useServerFn(generateWithAI);
  const runConsultarCnpj = useServerFn(consultarCnpj);
  const navigate = useNavigate();

  const pastaAtual = useMemo(
    () => (isPastaBucket(date) ? pastas.find((p) => `pasta:${p.id}` === date) ?? null : null),
    [date, pastas],
  );

  useEffect(() => {
    const activeDate = loadActiveDate();
    setPastas(loadPastas());
    setDate(activeDate);
    setList(load(activeDate));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveActiveDate(date);
    setList(load(date));
    setSelecionados([]);
  }, [date, hydrated]);


  useEffect(() => {
    function onSession() {
      const activeDate = loadActiveDate();
      setPastas(loadPastas());
      setDate(activeDate);
      setList(load(activeDate));
    }
    window.addEventListener("bhm:session-changed", onSession);
    return () => window.removeEventListener("bhm:session-changed", onSession);
  }, []);

  /** Cria ou renomeia uma pasta (carteira) de empresas. */
  function salvarPasta() {
    const nome = (pastaDialog?.nome ?? "").trim();
    if (!nome) {
      toast.error("Dê um nome para a pasta.");
      return;
    }
    if (pastaDialog?.id) {
      const next = pastas.map((p) => (p.id === pastaDialog.id ? { ...p, nome } : p));
      setPastas(next);
      savePastas(next);
      toast.success("Pasta renomeada");
    } else {
      const nova: PastaPreparacao = { id: newId(), nome };
      unmarkPastaDeleted(nova.id);
      const next = [...pastas, nova];
      setPastas(next);
      savePastas(next);
      setDate(`pasta:${nova.id}`);
      toast.success(`Pasta criada: ${nome}`);
    }
    setPastaDialog(null);
  }

  /** Remove a pasta e as empresas guardadas dentro dela. */
  function excluirPasta(id: string) {
    const alvo = pastas.find((p) => p.id === id);
    if (!alvo) return;
    const qtd = load(`pasta:${id}`).length;
    if (!window.confirm(`Excluir a pasta "${alvo.nome}"${qtd ? ` e as ${qtd} empresas dentro dela` : ""}?`)) return;
    try {
      // Remove a chave atual, os formatos por apelido e o legado sem dono.
      const keys = new Set<string>([
        storageKey(`pasta:${id}`),
        `bhm-preparacao::pasta:${id}`,
        ...preparationAliases().map((alias) => `bhm-preparacao::pasta:${id}::${alias}`),
      ]);
      keys.forEach((key) => window.localStorage.removeItem(key));
      // Lápide: impede que o restaurador de backup traga a pasta de volta.
      markPastaDeleted(id, consultorSlug());
    } catch { /* noop */ }
    const next = pastas.filter((p) => p.id !== id);
    setPastas(next);
    savePastas(next);
    if (date === `pasta:${id}`) setDate(todayISO());
    toast.success("Pasta excluída");
  }


  const persist = useCallback(
    (next: Empresa[], targetDate: string = date) => {
      if (targetDate === date) setList(next);
      save(targetDate, next);
    },
    [date],
  );

  async function extractNome(texto: string): Promise<string> {
    try {
      const r = await runGenerate({
        data: {
          systemPrompt: EXTRACT_SYSTEM_PROMPT,
          userContent: texto.slice(0, 4000),
        },
      });
      const raw = (r as { text?: string }).text?.trim() ?? "";
      const clean = raw.replace(/^["'`]+|["'`]+$/g, "").slice(0, 40).trim();
      if (clean && clean.toUpperCase() !== "DESCONHECIDA") return clean;
    } catch {
      /* noop */
    }
    const firstLine = texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "Empresa";
    return firstLine.slice(0, 40);
  }

  async function confirmarCadastro() {
    const texto = draftText.trim();
    if (!texto) {
      toast.error("Cole ou digite os dados da empresa.");
      return;
    }
    setSaving(true);
    try {
      const dados = parseDadosCnpj(texto);
      const nome = dados.razaoSocial || (await extractNome(texto));
      const item: Empresa = {
        id: newId(),
        nome,
        textoBruto: texto,
        extraido: true,
        status: "pending",
        razaoSocial: dados.razaoSocial,
        cnpj: dados.cnpj,
        telefone: dados.telefone,
        email: dados.email,
        contato: dados.contato,
        cargo: dados.cargo,
        observacoes: dados.observacoes,
      };

      const digitos = cnpjDigitos(dados.cnpj);
      const mesmoCnpj =
        digitos.length === 14
          ? list.find((e) => cnpjDigitos(e.cnpj) === digitos)
          : undefined;

      if (mesmoCnpj) {
        // Mesma unidade já cadastrada: atualiza em vez de duplicar.
        persist(list.map((e) => (e.id === mesmoCnpj.id ? { ...e, ...item, id: e.id, status: e.status } : e)));
        toast.success(`Unidade já cadastrada — dados atualizados: ${nome}`);
      } else {
        const raiz = cnpjRaiz(dados.cnpj);
        const irmas = raiz ? list.filter((e) => cnpjRaiz(e.cnpj) === raiz) : [];
        persist([...list, item]);
        if (irmas.length > 0) {
          toast.success(
            `${unidadeLabel(dados.cnpj) ?? "Unidade"} unificada ao grupo ${nome} — ${irmas.length + 1} unidades. Você escolhe qual usar ao enviar ao Pré.`,
          );
        } else {
          toast.success(`Cadastrada: ${nome}`);
        }
      }
      setDraftText("");
      setDraftOpen(false);
    } finally {
      setSaving(false);
    }
  }


  function removeEmpresa(id: string) {
    persist(list.filter((e) => e.id !== id));
  }

  function moveToDate(id: string, targetDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return;
    if (targetDate === date) return;
    const item = list.find((e) => e.id === id);
    if (!item) return;
    // Preserva o registro na data de origem — apenas cria uma cópia
    // (novo id, status pendente) na data alvo. O histórico da data original
    // permanece intacto para auditoria e relatórios.
    const targetList = load(targetDate);
    const clone: Empresa = { ...item, id: newId(), status: "pending" };
    save(targetDate, [...targetList, clone]);
    toast.success(`Reagendada para ${targetDate} — registro do dia ${date} preservado.`);
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** Copia/move a seleção para outra data OU para uma pasta (carteira). */
  function moverSelecionados() {
    const target = bulkPasta || bulkDate;
    if (!target) {
      toast.error("Escolha a data ou a pasta de destino.");
      return;
    }
    if (!isPastaBucket(target) && !/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      toast.error("Escolha a data de destino.");
      return;
    }
    if (target === date) {
      toast.error("O destino é o mesmo da lista atual.");
      return;
    }
    const itens = list.filter((e) => selecionados.includes(e.id));
    if (itens.length === 0) {
      toast.error("Selecione ao menos uma empresa.");
      return;
    }
    const targetList = load(target);
    const existentes = new Set(
      targetList.map((e) => (e.cnpj || e.nome).trim().toLowerCase()),
    );
    const clones = itens
      .filter((e) => !existentes.has((e.cnpj || e.nome).trim().toLowerCase()))
      .map((e) => ({ ...e, id: newId(), status: "pending" as EmpresaStatus }));
    save(target, [...targetList, ...clones]);
    if (bulkMode === "mover") {
      persist(list.filter((e) => !selecionados.includes(e.id)));
    }
    setSelecionados([]);
    const dup = itens.length - clones.length;
    const destinoLabel = isPastaBucket(target)
      ? `pasta "${pastas.find((p) => `pasta:${p.id}` === target)?.nome ?? "?"}"`
      : target;
    toast.success(
      `${clones.length} empresa(s) ${bulkMode === "mover" ? "movida(s)" : "copiada(s)"} para ${destinoLabel}` +
        (dup > 0 ? ` · ${dup} já existia(m) no destino` : ""),
    );
  }



  function unidadesDoGrupo(item: Empresa): Empresa[] {
    const raiz = cnpjRaiz(item.cnpj);
    if (!raiz) return [item];
    const irmas = list.filter((e) => cnpjRaiz(e.cnpj) === raiz);
    return irmas.length > 1
      ? [...irmas].sort((a, b) => (a.cnpj ?? "").localeCompare(b.cnpj ?? ""))
      : [item];
  }

  /** Antes de injetar no Pré, se a empresa tiver matriz + filiais, pergunta qual unidade usar. */
  function enviarParaPre(item: Empresa) {
    const unidades = unidadesDoGrupo(item);
    if (unidades.length > 1) {
      setGrupoEscolha({ origem: item, unidades });
      return;
    }
    injetarNoPre(item);
  }

  function injetarNoPre(item: Empresa) {
    if (typeof window === "undefined") return;
    const payload = {
      nome: item.nome,
      textoBruto: item.textoBruto,
      preparationId: item.id,
      razaoSocial: item.razaoSocial ?? "",
      cnpj: item.cnpj ?? "",
      contato: item.contato ?? "",
      cargo: item.cargo ?? "",
      telefone: item.telefone ?? "",
      email: item.email ?? "",
      observacoes: item.observacoes ?? "",
    };
    try {
      window.sessionStorage.setItem(ACTIVE_PREPARATION_ID_KEY, item.id);
    } catch { /* noop */ }

    if (variant === "full") {
      // Handoff via sessionStorage; PreLigacao consome no mount ao chegar em /?tab=pre
      try {
        window.sessionStorage.setItem(PENDING_PRE_LIGACAO_KEY, JSON.stringify(payload));
      } catch { /* noop */ }
      toast.success(`Carregando no Pré-ligação: ${item.nome}`);
      navigate({ to: "/", search: { tab: "pre" } });
      return;
    }

    window.dispatchEvent(
      new CustomEvent(LOAD_PRE_LIGACAO_EVENT, { detail: payload }),
    );
    toast.success(`Carregado no Pré-ligação: ${item.nome}`);
  }

  useEffect(() => {
    function onRealizada(ev: Event) {
      const detail = (ev as CustomEvent<{
        preparationId?: string;
        byCompany?: boolean;
        outcome?: "realizada" | "sem_interesse";
      }>).detail;
      const id = detail?.preparationId;
      const outcome: EmpresaStatus = detail?.outcome === "sem_interesse" ? "sem_interesse" : "realizada";
      if (!id) {
        // Baixa por empresa: o storage já foi atualizado, só recarrega.
        setList(load(date));
        return;
      }
      const current = load(date);
      if (!current.some((e) => e.id === id)) return;
      const next = current.map((e) =>
        e.id === id ? { ...e, status: outcome, ligadoEm: new Date().toISOString() } : e,
      );
      persist(next);
    }
    window.addEventListener(PREPARACAO_REALIZADA_EVENT, onRealizada as EventListener);
    // Ao voltar para a aba, ressincroniza (caso a baixa tenha ocorrido em outra tela).
    function onFocus() { setList(load(date)); }
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(PREPARACAO_REALIZADA_EVENT, onRealizada as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [date, persist]);

  function saveEmpresaEdits(patch: Empresa) {
    const next = list.map((e) => (e.id === patch.id ? { ...e, ...patch } : e));
    persist(next);
    setEditingEmpresa(null);
    toast.success("Dados atualizados");
  }

  const ativas = useMemo(
    () =>
      [...list]
        .filter((e) => e.status !== "sem_interesse")
        .sort((a, b) => Number(a.status === "realizada") - Number(b.status === "realizada")),
    [list],
  );
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const semInteresse = useMemo(() => list.filter((e) => e.status === "sem_interesse"), [list]);
  const empresasOrdenadas = aba === "sem_interesse" ? semInteresse : ativas;

  const ufsDisponiveis = useMemo(
    () => [...new Set(list.map((e) => e.uf).filter((u): u is string => !!u))].sort(),
    [list],
  );
  const setoresDisponiveis = useMemo(
    () => [...new Set(list.map((e) => e.setor).filter((s): s is string => !!s))].sort(),
    [list],
  );
  const filtrosAtivos = !!(filtroBusca.trim() || filtroStatus || filtroUf || filtroSetor || filtroRegime);

  const empresasFiltradas = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    const qDig = filtroBusca.replace(/\D/g, "");
    return empresasOrdenadas.filter((e) => {
      if (filtroStatus && (e.status ?? "pending") !== filtroStatus) return false;
      if (filtroUf && (e.uf ?? "") !== filtroUf) return false;
      if (filtroSetor && (e.setor ?? "") !== filtroSetor) return false;
      if (filtroRegime === "nao_informado") {
        if (e.regime) return false;
      } else if (filtroRegime && (e.regime ?? "") !== filtroRegime) return false;
      if (q) {
        const nome = `${e.razaoSocial ?? ""} ${e.nome ?? ""}`.toLowerCase();
        const cnpjDig = (e.cnpj ?? "").replace(/\D/g, "");
        if (!nome.includes(q) && !(qDig.length >= 2 && cnpjDig.includes(qDig))) return false;
      }
      return true;
    });
  }, [empresasOrdenadas, filtroBusca, filtroStatus, filtroUf, filtroSetor, filtroRegime]);

  function limparFiltros() {
    setFiltroBusca("");
    setFiltroStatus("");
    setFiltroUf("");
    setFiltroSetor("");
    setFiltroRegime("");
  }

  /** Preenche UF/setor/regime (apenas campos vazios) consultando a BrasilAPI. */
  async function enriquecerCnpjs() {
    const alvos = list.filter(
      (e) => cnpjDigitos(e.cnpj).length === 14 && (!e.uf || !e.setor || !e.regime),
    );
    if (alvos.length === 0) {
      toast.info("Nada para enriquecer: todas já têm UF/setor/regime ou estão sem CNPJ válido.");
      return;
    }
    setEnriquecendo(true);
    let atual = [...list];
    let ok = 0;
    let falhas = 0;
    for (let i = 0; i < alvos.length; i++) {
      const alvo = alvos[i];
      setProgressoEnriquecimento(`${i + 1}/${alvos.length} · ${alvo.nome}`);
      try {
        const r = await runConsultarCnpj({ data: { cnpj: alvo.cnpj! } });
        if (r.ok) {
          ok += 1;
          atual = atual.map((e) =>
            e.id === alvo.id
              ? {
                  ...e,
                  uf: e.uf || r.uf || undefined,
                  setor: e.setor || r.setor || undefined,
                  regime: e.regime || r.regime || undefined,
                }
              : e,
          );
        } else {
          falhas += 1;
        }
      } catch {
        falhas += 1;
      }
    }
    persist(atual);
    setProgressoEnriquecimento(null);
    setEnriquecendo(false);
    toast.success(
      `Enriquecimento concluído: ${ok} empresa(s) atualizada(s)` +
        (falhas > 0 ? ` · ${falhas} sem dados (CNPJ inválido ou não encontrado)` : "") +
        ". Campos preenchidos manualmente foram preservados.",
    );
  }

  /** Reordena manualmente e persiste a nova ordem da lista do dia. */
  function onReorder(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId || activeId === overId) return;
    const ids = empresasFiltradas.map((e) => e.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    const novaOrdem = arrayMove(ids, from, to);
    const byId = new Map(list.map((e) => [e.id, e]));
    const reordenadas = novaOrdem.map((id) => byId.get(id)!).filter(Boolean);
    const resto = list.filter((e) => !novaOrdem.includes(e.id));
    persist(aba === "sem_interesse" ? [...resto, ...reordenadas] : [...reordenadas, ...resto]);
  }
  const pendentes = ativas.filter((e) => e.status !== "realizada").length;
  const realizadas = ativas.length - pendentes;

  const cadastroDialog = (
    <Dialog
      open={draftOpen}
      onOpenChange={(v) => {
        if (!v && !saving) {
          setDraftText("");
          setDraftOpen(false);
        } else if (v) {
          setDraftOpen(true);
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-navy-deep">
            <Moon className="h-4 w-4" />
            Cadastrar Empresa — Preparação Noturna
          </DialogTitle>
          <DialogDescription>
            Cole os dados brutos da empresa (razão social, CNPJ, sócios, contatos, observações). A IA extrai o nome automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dados da empresa
          </Label>
          <Textarea
            autoFocus
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={16}
            placeholder={`Ex.:\nRazão Social: Metalúrgica Paraná LTDA\nCNPJ: 00.000.000/0001-00\nContato: João Silva (Diretor)\nTelefone: (41) 99999-9999\nE-mail: joao@empresa.com.br\nObservações: Empresa do setor metalúrgico, faturamento estimado R$ 20MM/ano…`}
            className="min-h-[320px] text-sm leading-relaxed"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setDraftText("");
              setDraftOpen(false);
            }}
            disabled={saving}
          >
            <X className="mr-1 h-4 w-4" />
            Cancelar
          </Button>
          <Button
            onClick={() => void confirmarCadastro()}
            disabled={saving || !draftText.trim()}
            className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Extraindo nome…" : "Confirmar Cadastro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const editDialog = (
    <EditEmpresaDialog
      empresa={editingEmpresa}
      onClose={() => setEditingEmpresa(null)}
      onSave={saveEmpresaEdits}
      onRemove={(id) => { removeEmpresa(id); setEditingEmpresa(null); }}
      onSend={(item) => { setEditingEmpresa(null); enviarParaPre(item); }}
    />
  );

  const pastaDialogNode = (
    <Dialog open={!!pastaDialog} onOpenChange={(v) => !v && setPastaDialog(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy-deep">
            {pastaDialog?.id ? "Renomear pasta" : "Nova pasta de empresas"}
          </DialogTitle>
          <DialogDescription>
            Agrupe empresas por segmento, cidade, campanha ou o critério que quiser (ex.:
            "Metalúrgicas Curitiba"). Depois é só escolher a pasta que vai trabalhar no dia.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={pastaDialog?.nome ?? ""}
          onChange={(ev) => setPastaDialog((p) => ({ ...(p ?? { nome: "" }), nome: ev.target.value }))}
          onKeyDown={(ev) => { if (ev.key === "Enter") salvarPasta(); }}
          placeholder="Ex.: Indústrias de Curitiba"
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setPastaDialog(null)}>
            Cancelar
          </Button>
          <Button onClick={salvarPasta} className="gap-1 bg-navy-deep text-white hover:bg-navy-deep/90">
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const grupoDialog = (

    <Dialog open={!!grupoEscolha} onOpenChange={(v) => !v && setGrupoEscolha(null)}>
      <DialogContent className="max-w-lg overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-navy-deep">
            Grupo com {grupoEscolha?.unidades.length ?? 0} unidades
          </DialogTitle>
          <DialogDescription>
            Este CNPJ tem matriz e filiais cadastradas. Escolha qual unidade enviar ao Pré-ligação.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {grupoEscolha?.unidades.map((u) => {
            const detalhes = [u.cnpj, unidadeLabel(u.cnpj), cidadeUfDoTexto(u.textoBruto), u.telefone]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    setGrupoEscolha(null);
                    injetarNoPre(u);
                  }}
                  className="w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-navy-deep">{u.nome}</span>
                    {unidadeLabel(u.cnpj) && (
                      <span className="rounded-full bg-navy-deep/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy-deep">
                        {unidadeLabel(u.cnpj)}
                      </span>
                    )}
                    {u.id === grupoEscolha.origem.id && (
                      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        clicada
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                    {detalhes || "Sem dados adicionais"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );



  if (variant === "full") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-navy-deep/15 bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-navy-deep">
                <Moon className="h-5 w-5" />
                Preparação Noturna
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Planeje as empresas do dia. Clique em uma para revisar e enviar direto ao Pré-ligação.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-1">
                  Pendentes: <b className="text-navy-deep">{pendentes}</b>
                </span>
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-800">
                  Realizadas: <b>{realizadas}</b>
                </span>
                <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700">
                  Sem interesse: <b>{semInteresse.length}</b>
                </span>
              </div>
              <Input
                type="date"
                value={isPastaBucket(date) ? "" : date}
                onChange={(e) => setDate(e.target.value || todayISO())}
                className="h-8 w-[140px] shrink-0 text-xs"
                title="Lista do dia"
              />

              <Button
                size="sm"
                onClick={() => setDraftOpen(true)}
                className="h-8 gap-1 bg-navy-deep text-white hover:bg-navy-deep/90"
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs font-semibold">Cadastrar Empresa</span>
              </Button>
            </div>
          </div>

          {/* Pastas (carteiras): segmentos, cidades, campanhas… */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Pastas
            </span>
            <button
              type="button"
              onClick={() => setDate(todayISO())}
              className={
                "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                (!isPastaBucket(date)
                  ? "bg-navy-deep text-white"
                  : "border border-border/60 bg-card text-muted-foreground hover:text-navy-deep")
              }
              title="Voltar para a lista por data"
            >
              📅 Lista do dia
            </button>
            {pastas.map((p) => {
              const bucket = `pasta:${p.id}`;
              const ativa = date === bucket;
              const qtd = hydrated ? load(bucket).filter((e) => e.status !== "sem_interesse").length : 0;
              return (
                <span
                  key={p.id}
                  className={
                    "group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
                    (ativa
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 bg-card text-muted-foreground hover:text-navy-deep")
                  }
                >
                  <button type="button" onClick={() => setDate(bucket)} title="Trabalhar esta pasta">
                    📁 {p.nome} · {qtd}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPastaDialog({ id: p.id, nome: p.nome })}
                    className="opacity-60 hover:opacity-100"
                    title="Renomear pasta"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirPasta(p.id)}
                    className="opacity-60 hover:opacity-100"
                    title="Excluir pasta"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setPastaDialog({ nome: "" })}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
            >
              <Plus className="h-3 w-3" />
              Nova pasta
            </button>
          </div>
          {pastaAtual && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Trabalhando a pasta <b className="text-navy-deep">{pastaAtual.nome}</b>. As empresas
              daqui não se misturam com as listas por data — use a seleção em lote para enviá-las a
              um dia específico.
            </p>
          )}
        </div>


        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAba("ativas")}
            className={
              "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
              (aba === "ativas"
                ? "bg-navy-deep text-white"
                : "border border-border/60 bg-white text-muted-foreground hover:text-navy-deep")
            }
          >
            Fila ativa ({ativas.length})
          </button>
          <button
            type="button"
            onClick={() => setAba("sem_interesse")}
            className={
              "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
              (aba === "sem_interesse"
                ? "bg-red-600 text-white"
                : "border border-border/60 bg-white text-muted-foreground hover:text-red-600")
            }
          >
            🔴 Sem interesse / Reabordagem ({semInteresse.length})
          </button>
        </div>

        {/* Barra de filtros — estilo Balcão de Negócios */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-navy-deep/15 bg-card px-3 py-2 shadow-card">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtroBusca}
              onChange={(ev) => setFiltroBusca(ev.target.value)}
              placeholder="Razão social ou CNPJ…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={filtroStatus}
            onChange={(ev) => setFiltroStatus(ev.target.value as "" | EmpresaStatus)}
            className="h-8 rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
            title="Filtrar por status"
          >
            <option value="">Todas</option>
            <option value="pending">Pendentes</option>
            <option value="realizada">Realizadas</option>
            <option value="sem_interesse">Sem interesse</option>
          </select>
          <select
            value={filtroUf}
            onChange={(ev) => setFiltroUf(ev.target.value)}
            className="h-8 rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
            title="Filtrar por UF"
          >
            <option value="">Todas UF</option>
            {ufsDisponiveis.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          <select
            value={filtroSetor}
            onChange={(ev) => setFiltroSetor(ev.target.value)}
            className="h-8 max-w-[180px] rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
            title="Filtrar por setor"
          >
            <option value="">Todos os setores</option>
            {setoresDisponiveis.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filtroRegime}
            onChange={(ev) => setFiltroRegime(ev.target.value)}
            className="h-8 rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
            title="Filtrar por regime tributário"
          >
            <option value="">Todos os regimes</option>
            {REGIMES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="nao_informado">Não informado</option>
          </select>
          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-[11px] font-medium text-muted-foreground underline hover:text-navy-deep"
            >
              Limpar filtros
            </button>
          )}
          <span className="rounded-md bg-navy-deep/10 px-2 py-1 text-[11px] font-semibold text-navy-deep">
            {empresasFiltradas.length} empresa(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={enriquecendo}
            onClick={() => void enriquecerCnpjs()}
            className="h-8 gap-1 text-[11px] font-semibold"
            title="Preenche UF, setor e regime (somente campos vazios) consultando o CNPJ"
          >
            {enriquecendo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {enriquecendo ? (progressoEnriquecimento ?? "Enriquecendo…") : "Enriquecer via CNPJ"}
          </Button>
        </div>

        {empresasFiltradas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-deep/15 bg-muted/30 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-navy-deep">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[var(--color-navy-deep,#1e293b)]"
                checked={
                  selecionados.length > 0 && selecionados.length === empresasOrdenadas.length
                }
                onChange={(ev) =>
                  setSelecionados(ev.target.checked ? empresasOrdenadas.map((x) => x.id) : [])
                }
              />
              Selecionar todas
            </label>
            <button
              type="button"
              onClick={() =>
                setSelecionados(
                  empresasOrdenadas.filter((x) => x.status !== "realizada").map((x) => x.id),
                )
              }
              className="rounded-md border border-border/60 bg-white px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-navy-deep"
            >
              Só pendentes
            </button>
            <span className="rounded-md bg-navy-deep/10 px-2 py-1 text-[11px] font-semibold text-navy-deep">
              {selecionados.length} selecionada(s)
            </span>
            {selecionados.length > 0 && (
              <button
                type="button"
                onClick={() => setSelecionados([])}
                className="text-[11px] text-muted-foreground underline hover:text-navy-deep"
              >
                limpar
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <select
                value={bulkMode}
                onChange={(ev) => setBulkMode(ev.target.value as "copiar" | "mover")}
                className="h-8 rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
              >
                <option value="copiar">Copiar (mantém aqui)</option>
                <option value="mover">Mover (remove daqui)</option>
              </select>
              <select
                value={bulkPasta}
                onChange={(ev) => {
                  setBulkPasta(ev.target.value);
                  if (ev.target.value) setBulkDate("");
                }}
                className="h-8 rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
                title="Enviar para uma pasta"
              >
                <option value="">Destino: data ▸</option>
                {pastas
                  .filter((p) => `pasta:${p.id}` !== date)
                  .map((p) => (
                    <option key={p.id} value={`pasta:${p.id}`}>
                      📁 {p.nome}
                    </option>
                  ))}
              </select>
              <Input
                type="date"
                value={bulkDate}
                onChange={(ev) => {
                  setBulkDate(ev.target.value);
                  if (ev.target.value) setBulkPasta("");
                }}
                className="h-8 w-[150px] text-[11px]"
              />
              <Button
                size="sm"
                disabled={selecionados.length === 0}
                onClick={moverSelecionados}
                className="h-8 gap-1 bg-navy-deep text-[11px] font-semibold text-white hover:bg-navy-deep/90"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Enviar
              </Button>
            </div>
          </div>
        )}

        {empresasOrdenadas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
            {aba === "sem_interesse"
              ? "Nenhuma empresa marcada como sem interesse aqui."
              : pastaAtual
                ? `A pasta "${pastaAtual.nome}" está vazia. Use "Cadastrar Empresa" para adicionar empresas nela.`
                : `Sem empresas planejadas para ${date}. Use "Cadastrar Empresa" para começar.`}
          </div>

        ) : (
          <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
          <SortableContext items={empresasOrdenadas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-white shadow-card">
            {empresasOrdenadas.map((e) => {
              const recusado = e.status === "sem_interesse";
              const done = e.status === "realizada";
              const unidades = unidadesDoGrupo(e);
              const meta: string[] = [];
              if (e.cnpj) meta.push(`CNPJ ${e.cnpj}`);
              if (unidadeLabel(e.cnpj)) meta.push(unidadeLabel(e.cnpj)!);
              if (e.telefone) meta.push(e.telefone);
              if (e.contato) meta.push(e.cargo ? `${e.contato} (${e.cargo})` : e.contato);
              if (e.email) meta.push(e.email);
              return (
                <SortableEmpresaRow
                  key={e.id}
                  id={e.id}
                  className={
                    "group flex flex-wrap items-center gap-2 px-3 py-2.5 transition " +
                    (recusado ? "bg-red-500/5" : done ? "bg-emerald-500/5" : "hover:bg-primary/5")
                  }
                >
                  <input
                    type="checkbox"
                    checked={selecionados.includes(e.id)}
                    onChange={() => toggleSelecionado(e.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--color-navy-deep,#1e293b)]"
                    title="Selecionar para mover em lote"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingEmpresa(e)}
                    className={
                      "min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline " +
                      (recusado ? "text-red-700" : done ? "text-emerald-800" : "text-navy-deep")
                    }
                    title="Abrir e editar dados"
                  >
                    {recusado ? (
                      <X className="mr-1 inline h-3.5 w-3.5 text-red-600" />
                    ) : done ? (
                      <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-700" />
                    ) : null}
                    {e.nome}
                  </button>
                  {unidades.length > 1 && (
                    <span
                      className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                      title="Matriz e filiais do mesmo grupo — você escolhe a unidade ao enviar ao Pré"
                    >
                      Grupo · {unidades.length} unidades
                    </span>
                  )}
                  {recusado ? (
                    <span className="shrink-0 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                      Sem interesse / Descartado
                    </span>
                  ) : done ? (
                    <span className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Ligado / Em andamento
                    </span>
                  ) : null}
                  {meta.length > 0 && (
                    <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground md:inline">
                      {meta.join(" · ")}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant={done || recusado ? "outline" : "default"}
                      onClick={() => enviarParaPre(e)}
                      className={
                        "h-8 gap-1 text-[11px] font-semibold " +
                        (recusado
                          ? "border-red-600/40 bg-red-50 text-red-700 hover:bg-red-100"
                          : done
                            ? "border-emerald-600/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "bg-navy-deep text-white hover:bg-navy-deep/90")
                      }
                      title={
                        recusado
                          ? "Sem interesse — reabordagem futura"
                          : done
                            ? "Já ligada hoje — clique para ligar novamente"
                            : "Enviar ao Pré-ligação"
                      }
                    >
                      {recusado ? <X className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                      {recusado ? "Reabordar" : done ? "Ligar de novo" : "Enviar ao Pré"}
                      {!done && !recusado && <ArrowRight className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingEmpresa(e)}
                      className="h-8 gap-1 text-[11px]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-navy-deep" title="Mudar data">
                          <CalendarDays className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Mover para outro dia
                        </div>
                        <Input
                          type="date"
                          defaultValue={date}
                          onChange={(ev) => { const v = ev.target.value; if (v) moveToDate(e.id, v); }}
                          className="h-8 w-[150px] text-[11px]"
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeEmpresa(e.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </SortableEmpresaRow>
              );
            })}
          </ul>
          </SortableContext>
          </DndContext>

        )}

        {cadastroDialog}
        {editDialog}
        {grupoDialog}
        {pastaDialogNode}

      </div>
    );
  }

  // Compact (sidebar) — link para tela cheia + lista enxuta e rolável
  return (
    <div className="rounded-xl border border-navy-deep/15 bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-deep">
          <Moon className="h-3.5 w-3.5" />
          Preparação Noturna
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/preparacao" })}
          className="inline-flex items-center gap-1 rounded-md border border-navy-deep/20 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-navy-deep hover:bg-primary/5"
          title="Abrir em tela cheia"
        >
          <Maximize2 className="h-3 w-3" />
          Expandir
        </button>
      </div>

      {pastas.length > 0 && (
        <select
          value={isPastaBucket(date) ? date : ""}
          onChange={(ev) => setDate(ev.target.value || todayISO())}
          className="mb-2 h-7 w-full rounded-md border border-border/60 bg-white px-2 text-[11px] text-navy-deep"
        >
          <option value="">📅 Lista do dia</option>
          {pastas.map((p) => (
            <option key={p.id} value={`pasta:${p.id}`}>
              📁 {p.nome}
            </option>
          ))}
        </select>
      )}

      <div className="mb-2 flex items-center gap-2">
        <Input
          type="date"
          value={isPastaBucket(date) ? "" : date}
          onChange={(e) => setDate(e.target.value || todayISO())}
          className="h-7 flex-1 text-[11px]"
          disabled={isPastaBucket(date)}
        />

        <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {pendentes} pend.
        </span>
        {semInteresse.length > 0 && (
          <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" title="Sem interesse — reabordagem futura">
            {semInteresse.length} 🔴
          </span>
        )}
      </div>

      <Button
        size="sm"
        onClick={() => setDraftOpen(true)}
        className="mb-2 h-8 w-full gap-1 bg-navy-deep text-white hover:bg-navy-deep/90"
      >
        <Plus className="h-4 w-4" />
        <span className="text-[11px] font-semibold">Cadastrar Nova Empresa</span>
      </Button>

      {ativas.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-center text-[11px] text-muted-foreground">
          Sem empresas planejadas para {date}.
        </div>
      ) : (
        <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
          {ativas.slice(0, 8).map((e) => {
            const done = e.status === "realizada";
            return (
              <li
                key={e.id}
                className={
                  "group flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition " +
                  (done
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border/60 bg-white hover:border-navy-deep/40 hover:bg-primary/5")
                }
                title={e.nome}
              >
                {done && <Check className="h-3 w-3 shrink-0 text-emerald-700" />}
                <button
                  type="button"
                  onClick={() => setEditingEmpresa(e)}
                  className={
                    "min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:underline " +
                    (done ? "text-emerald-800" : "text-navy-deep")
                  }
                >
                  {e.nome}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => enviarParaPre(e)}
                  className={
                    "h-6 w-6 p-0 " +
                    (done ? "text-emerald-700 hover:bg-emerald-500/20" : "text-navy-deep hover:bg-navy-deep/10")
                  }
                  title="Enviar para Pré-ligação"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </Button>
              </li>
            );
          })}
          {ativas.length > 8 && (
            <li>
              <button
                type="button"
                onClick={() => navigate({ to: "/preparacao" })}
                className="w-full rounded-md border border-dashed border-border/60 px-2 py-1 text-[10px] text-muted-foreground hover:border-navy-deep/40 hover:text-navy-deep"
              >
                Ver todas ({ativas.length}) →
              </button>
            </li>
          )}
        </ul>
      )}

      {cadastroDialog}
      {editDialog}
        {grupoDialog}
        {pastaDialogNode}

    </div>
  );
}

function EditEmpresaDialog({
  empresa,
  onClose,
  onSave,
  onRemove,
  onSend,
}: {
  empresa: Empresa | null;
  onClose: () => void;
  onSave: (patch: Empresa) => void;
  onRemove: (id: string) => void;
  onSend?: (item: Empresa) => void;
}) {
  const [nome, setNome] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contato, setContato] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [textoBruto, setTextoBruto] = useState("");

  useEffect(() => {
    if (!empresa) return;
    // Preenche automaticamente o que estiver vazio a partir dos dados brutos
    const auto = parseDadosCnpj(empresa.textoBruto ?? "");
    setNome(empresa.nome ?? "");
    setRazaoSocial(empresa.razaoSocial || auto.razaoSocial || "");
    setCnpj(empresa.cnpj || auto.cnpj || "");
    setContato(empresa.contato || auto.contato || "");
    setCargo(empresa.cargo || auto.cargo || "");
    setTelefone(empresa.telefone || auto.telefone || "");
    setEmail(empresa.email || auto.email || "");
    setObservacoes(empresa.observacoes || auto.observacoes || "");
    setTextoBruto(empresa.textoBruto ?? "");
  }, [empresa]);

  const open = empresa !== null;

  function buildPatch(): Empresa | null {
    if (!empresa) return null;
    const nomeFinal = nome.trim() || empresa.nome;
    return {
      ...empresa,
      nome: nomeFinal,
      razaoSocial: razaoSocial.trim() || undefined,
      cnpj: cnpj.trim() || undefined,
      contato: contato.trim() || undefined,
      cargo: cargo.trim() || undefined,
      telefone: telefone.trim() || undefined,
      email: email.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
      textoBruto,
    };
  }

  function handleSave() {
    const patch = buildPatch();
    if (patch) onSave(patch);
  }

  function handleSaveAndSend() {
    const patch = buildPatch();
    if (!patch) return;
    onSave(patch);
    onSend?.(patch);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar empresa</DialogTitle>
          <DialogDescription>
            Ajuste os dados e envie direto ao Pré-ligação quando estiver pronto.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <Field label="Nome (exibido no card)" value={nome} onChange={setNome} />
          <Field label="Razão Social" value={razaoSocial} onChange={setRazaoSocial} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
            <Field label="Telefone" value={telefone} onChange={setTelefone} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contato" value={contato} onChange={setContato} />
            <Field label="Cargo" value={cargo} onChange={setCargo} />
          </div>
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Observações</Label>
            <Textarea
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Dados brutos (texto original)</Label>
            <Textarea
              rows={12}
              value={textoBruto}
              onChange={(e) => setTextoBruto(e.target.value)}
              className="min-h-[240px] text-sm leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter className="mt-4 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => empresa && onRemove(empresa.id)}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Excluir
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} variant="secondary">
              <Save className="mr-1 h-4 w-4" />
              Salvar
            </Button>
            {onSend && (
              <Button
                type="button"
                onClick={handleSaveAndSend}
                className="gap-1 bg-navy-deep text-white hover:bg-navy-deep/90"
              >
                <Play className="h-4 w-4 fill-current" />
                Salvar e enviar
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type ?? "text"}
        className="h-9 text-[12px]"
      />
    </div>
  );
}


/** Linha arrastável da lista de empresas (ordem manual da noite). */
function SortableEmpresaRow({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={className + (isDragging ? " opacity-60" : "")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-navy-deep active:cursor-grabbing"
        title="Arraste para reordenar"
        aria-label="Reordenar empresa"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </li>
  );
}

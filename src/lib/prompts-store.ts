import { getSessionConsultor, getConsultor } from "@/lib/historico-store";
import {
  listUserPrompts,
  upsertUserPrompt,
  setActiveUserPrompt as setActiveUserPromptRemote,
  deleteUserPrompt,
  listUserPromptTemas,
  upsertUserPromptTema,
  deleteUserPromptTema as deleteUserPromptTemaRemote,
} from "@/lib/user-prompts.functions";


// =============================================================================
// PROMPT LIBRARY (v2 — com temas/abas)
// -----------------------------------------------------------------------------
// Cada operador (Everton / Heluane / ...) tem a sua própria biblioteca de
// prompts, particionada por chave "::${consultor}". A biblioteca é composta por
// N prompts nomeados de dois tipos ("abordagem" e "historico"). Um único
// prompt de cada tipo é marcado como ATIVO — é esse que a IA usa.
//
// NOVIDADE (v2): prompts de tipo "abordagem" pertencem a um TEMA (aba) — ex:
// "ICMS Intermediário", "Exclusão do ICMS da base do PIS/COFINS". Cada tema
// agrupa os pitches daquela tese, sem nunca se misturar com os de outro tema.
// Prompts de tipo "historico" NÃO têm tema (não fazem parte da organização
// por tese — são só o molde da anotação de CRM).
//
// REGRAS DE OURO:
// - O conteúdo do prompt é ARMAZENADO E ENVIADO À IA DE FORMA LITERAL. O
//   sistema NUNCA reescreve, concatena ou molda o texto do usuário.
// - Não há "fallbacks silenciosos" para um prompt padrão do sistema depois que
//   o usuário criar/editar os dele — os defaults só existem para semear a
//   biblioteca na PRIMEIRA vez em que ela é aberta (ou quando o usuário
//   apagar todos os prompts de um tipo e quiser recriar do zero via botão).
// - As variáveis dinâmicas (dados do lead / transcrição) são anexadas SEPARADAMENTE
//   pela camada de chamada (userContent), fora do texto do prompt do usuário.
// - MIGRAÇÃO: bibliotecas antigas (v1, sem tema) ganham automaticamente um
//   tema "ICMS Intermediário" na primeira sincronização, e todo pitch órfão
//   (sem temaId) é vinculado a ele — nenhum pitch existente "some".
// =============================================================================

const LIB_BASE = "prospeccao-prompt-library-v1";
const LEGACY_BASE = "prospeccao-prompts-v6";
const DEFAULT_TEMA_NOME = "ICMS Intermediário";

export type PromptTipo = "abordagem" | "historico";

export type PromptItem = {
  id: string;
  nome: string;
  conteudo: string;
  tipo: PromptTipo;
  /** Só usado quando tipo === "abordagem". Prompts de "historico" ficam null/undefined. */
  temaId?: string | null;
};

export type Tema = {
  id: string;
  nome: string;
};

export type PromptLibrary = {
  items: PromptItem[];
  temas: Tema[];
  /** Aba selecionada agora na tela (estado de navegação). Se ficar
   * desalinhada (tema apagado em outra aba do navegador, etc.), a UI cai
   * para a primeira aba disponível. */
  activeTemaId: string | null;
  activeAbordagemId: string | null;
  activeHistoricoId: string | null;
};

export const PROMPT_LIBRARY_EVENT = "bhm:prompt-library-updated";

function activeConsultor(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

function libKey(): string {
  return `${LIB_BASE}::${activeConsultor()}`;
}

function legacyKey(): string {
  return `${LEGACY_BASE}::${activeConsultor()}`;
}

function genId(): string {
  // UUID: mesmo identificador no cache local e nas tabelas remotas.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}


/**
 * Mantida para compatibilidade com integrações externas / assinaturas de e-mail
 * geradas fora do fluxo da IA. NÃO É MAIS APLICADA sobre o prompt enviado à IA:
 * o texto do usuário vai literal, sem substituições.
 */
export function personalizePromptForConsultor(text: string, consultor?: string): string {
  const nome = (consultor ?? activeConsultor() ?? "").trim();
  if (!nome) return text;
  const primeiroNome = nome.split(/\s+/)[0]?.toUpperCase() || nome.toUpperCase();
  return text
    .replace(/Everton Pereira/g, nome)
    .replace(/\bEVERTON:/g, `${primeiroNome}:`)
    .replace(/consultor Everton\b/g, `consultor ${nome.split(/\s+/)[0]}`);
}

// ---------------------------------------------------------------------------
// Defaults — usados APENAS para semear a biblioteca na primeira vez.
// ---------------------------------------------------------------------------

export const DEFAULT_SCRIPT_PROMPT = `PROMPT DE COMANDO: COPILOTO DE INTELIGÊNCIA COMERCIAL

Atue como Copiloto de Inteligência Comercial. Gere um script de Cold Call B2B pronto para leitura, em português brasileiro, tom natural de telefone, sem comentários meta.

REGRAS DE EXTRAÇÃO (obrigatórias):
- Leia os <dados_do_lead> e extraia:
  • {NOME}: HIERARQUIA RÍGIDA DE PRIORIDADE:
      1º) Nome de contato das áreas OPERACIONAIS/TÉCNICAS (Fiscal, Contabilidade, Controladoria, Financeiro, Assistente Administrativo/Financeiro, Analista Fiscal, Controller, Contador). Ex.: "Rafaela Bueno - Assistente Financeiro" → use "Rafaela".
      2º) Se e SÓ SE não houver contato fiscal/financeiro/contábil no texto, use o primeiro nome de pessoa física do QSA (ex.: Ezio, Felipe). IGNORE sócios pessoa jurídica (linhas com CNPJ, "LTDA", "S/A", "EIRELI", "ME").
      3º) Se não houver nenhum nome de pessoa física, use a expressão "tudo bem?".
      🛑 PROIBIDO: NUNCA use nome corporativo/Razão Social (FLORENSE, BARBIERI, LTDA, SA, HOLDING).
  • {CIDADE}: município da empresa.
  • {CIDADE_ESTADO}: "Cidade/UF".
  • {SEGMENTO}: setor deduzido do CNAE / atividade principal (ex.: "indústria de plásticos", "metalurgia", "transporte rodoviário de carga").
  • {INSUMOS}: 1 a 3 insumos/matérias-primas típicos do {SEGMENTO} (ex.: para plásticos → "resinas, polietileno e pigmentos"; para metalurgia → "aço, alumínio e insumos energéticos").
- Se um dado realmente não puder ser deduzido, use um substituto natural e curto (ex.: "tudo bem?" no lugar de {NOME}) — NUNCA deixe a tag literal na saída.

REGRAS DE SAÍDA (obrigatórias):
- Substitua TODAS as tags {NOME}, {CIDADE}, {CIDADE_ESTADO}, {SEGMENTO} e {INSUMOS} pelos valores extraídos.
- É PROIBIDO devolver chaves { } no texto final.
- É PROIBIDO copiar estas instruções, listar o que foi alterado ou explicar seu raciocínio.
- Entregue blocos prontos para copiar e colar (Abertura, Descoberta, Pitch, Fechamento), diretos e curtos.`;

export const DEFAULT_HISTORY_PROMPT = `Você recebe uma descrição/transcrição de ligação B2B. Gere uma anotação para CRM em prosa corrida, focando nos fatos positivos e no que foi conversado, sem listar o que "não" aconteceu. Nunca escreva "não informado" — se um dado não foi coletado, apenas omita a linha.`;

// ---------------------------------------------------------------------------
// Migração / bootstrap
// ---------------------------------------------------------------------------

function seedFromLegacyOrDefaults(): PromptLibrary {
  let scriptSeed = DEFAULT_SCRIPT_PROMPT;
  let historySeed = DEFAULT_HISTORY_PROMPT;
  if (typeof window !== "undefined") {
    try {
      const raw =
        window.localStorage.getItem(legacyKey()) ??
        window.localStorage.getItem(LEGACY_BASE);
      if (raw) {
        const p = JSON.parse(raw) as { script?: string; history?: string };
        if (p.script && p.script.trim()) scriptSeed = p.script;
        if (p.history && p.history.trim()) historySeed = p.history;
      }
    } catch {
      /* ignora legado corrompido */
    }
  }
  const temaDefault: Tema = { id: genId(), nome: DEFAULT_TEMA_NOME };
  const abordagem: PromptItem = {
    id: genId(),
    nome: "Abordagem padrão",
    conteudo: scriptSeed,
    tipo: "abordagem",
    temaId: temaDefault.id,
  };
  const historico: PromptItem = {
    id: genId(),
    nome: "Histórico padrão",
    conteudo: historySeed,
    tipo: "historico",
    temaId: null,
  };
  return {
    items: [abordagem, historico],
    temas: [temaDefault],
    activeTemaId: temaDefault.id,
    activeAbordagemId: abordagem.id,
    activeHistoricoId: historico.id,
  };
}

export function loadLibrary(): PromptLibrary {
  if (typeof window === "undefined") {
    return {
      items: [],
      temas: [],
      activeTemaId: null,
      activeAbordagemId: null,
      activeHistoricoId: null,
    };
  }
  try {
    const raw = window.localStorage.getItem(libKey());
    if (raw) {
      const lib = JSON.parse(raw) as PromptLibrary;
      // sanity
      if (!Array.isArray(lib.items)) throw new Error("lib inválida");
      if (!Array.isArray(lib.temas)) lib.temas = [];
      if (lib.activeTemaId === undefined) lib.activeTemaId = lib.temas[0]?.id ?? null;
      return lib;
    }
  } catch {
    /* segue para seed */
  }
  const seeded = seedFromLegacyOrDefaults();
  saveLibrary(seeded);
  return seeded;
}

export function saveLibrary(lib: PromptLibrary): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(libKey(), JSON.stringify(lib));
    window.dispatchEvent(new Event(PROMPT_LIBRARY_EVENT));
  } catch {
    /* quota */
  }
}

// ---------------------------------------------------------------------------
// Sincronização com o banco (tabelas user_prompts + user_prompt_temas)
// ---------------------------------------------------------------------------

function isActiveInLib(lib: PromptLibrary, item: PromptItem): boolean {
  return item.tipo === "abordagem"
    ? lib.activeAbordagemId === item.id
    : lib.activeHistoricoId === item.id;
}

/** Grava/atualiza um prompt no banco (best-effort, sem travar a UI). */
function pushPrompt(item: PromptItem, isActive: boolean): void {
  if (!isUuid(item.id)) return;
  void upsertUserPrompt({
    data: {
      id: item.id,
      consultor: activeConsultor(),
      nome: item.nome,
      conteudo: item.conteudo,
      tipo: item.tipo,
      isActive,
      temaId: item.tipo === "abordagem" ? item.temaId ?? null : null,
    },
  }).catch(() => {});
}

/** Grava/atualiza um tema no banco (best-effort). */
function pushTema(tema: Tema): void {
  if (!isUuid(tema.id)) return;
  void upsertUserPromptTema({
    data: { id: tema.id, consultor: activeConsultor(), nome: tema.nome },
  }).catch(() => {});
}

let syncing: Promise<PromptLibrary> | null = null;

/**
 * Puxa a biblioteca do banco para o cache local. Se o banco ainda estiver
 * vazio para este consultor, sobe o que existe no navegador (migração única).
 * Também cobre o caso de um consultor que já tinha pitches no banco ANTES da
 * feature de temas existir: cria o tema padrão "ICMS Intermediário" na hora
 * e vincula a ele qualquer pitch de abordagem sem tema.
 */
export function syncLibraryFromCloud(): Promise<PromptLibrary> {
  if (typeof window === "undefined") return Promise.resolve(loadLibrary());
  if (syncing) return syncing;
  const consultor = activeConsultor();
  syncing = (async () => {
    try {
      const [rows, temaRows] = await Promise.all([
        listUserPrompts({ data: { consultor } }),
        listUserPromptTemas({ data: { consultor } }),
      ]);

      // Caso 1: nada no banco ainda (nem prompt, nem tema) — primeira vez
      // deste consultor. Migra o que existir localmente (ou semeia default).
      if ((!rows || rows.length === 0) && (!temaRows || temaRows.length === 0)) {
        const local = loadLibrary();
        const temaLocalDefault: Tema =
          local.temas[0] ?? { id: genId(), nome: DEFAULT_TEMA_NOME };
        const remapped: PromptLibrary = {
          items: local.items.map((p) => ({
            ...p,
            id: isUuid(p.id) ? p.id : genId(),
            temaId: p.tipo === "abordagem" ? p.temaId ?? temaLocalDefault.id : null,
          })),
          temas: local.temas.length ? local.temas : [temaLocalDefault],
          activeTemaId: local.activeTemaId ?? temaLocalDefault.id,
          activeAbordagemId: null,
          activeHistoricoId: null,
        };
        local.items.forEach((old, i) => {
          const novo = remapped.items[i];
          if (local.activeAbordagemId === old.id) remapped.activeAbordagemId = novo.id;
          if (local.activeHistoricoId === old.id) remapped.activeHistoricoId = novo.id;
        });
        saveLibrary(remapped);
        for (const tema of remapped.temas) pushTema(tema);
        for (const item of remapped.items) {
          await upsertUserPrompt({
            data: {
              id: item.id,
              consultor,
              nome: item.nome,
              conteudo: item.conteudo,
              tipo: item.tipo,
              isActive: isActiveInLib(remapped, item),
              temaId: item.tipo === "abordagem" ? item.temaId ?? null : null,
            },
          }).catch(() => {});
        }
        return remapped;
      }

      // Caso 2: já existiam prompts no banco (biblioteca v1, sem tema) —
      // migração "in-place": cria o tema padrão e vincula os pitches órfãos.
      let temas: Tema[] = (temaRows ?? []).map((t) => ({ id: t.id, nome: t.nome }));
      const promptsSemTema = (rows ?? []).filter((r) => r.tipo === "abordagem" && !r.tema_id);
      if (promptsSemTema.length > 0) {
        let temaPadrao = temas.find((t) => t.nome === DEFAULT_TEMA_NOME);
        if (!temaPadrao) {
          temaPadrao = { id: genId(), nome: DEFAULT_TEMA_NOME };
          temas = [...temas, temaPadrao];
          pushTema(temaPadrao);
        }
        for (const row of promptsSemTema) {
          row.tema_id = temaPadrao.id;
          void upsertUserPrompt({
            data: {
              id: row.id,
              consultor,
              nome: row.nome,
              conteudo: row.conteudo,
              tipo: row.tipo,
              isActive: row.is_active,
              temaId: temaPadrao.id,
            },
          }).catch(() => {});
        }
      }

      const rowsFinal = rows ?? [];
      const lib: PromptLibrary = {
        items: rowsFinal.map((r) => ({
          id: r.id,
          nome: r.nome,
          conteudo: r.conteudo,
          tipo: r.tipo,
          temaId: r.tipo === "abordagem" ? r.tema_id ?? null : null,
        })),
        temas,
        activeTemaId: temas[0]?.id ?? null,
        activeAbordagemId: rowsFinal.find((r) => r.tipo === "abordagem" && r.is_active)?.id ?? null,
        activeHistoricoId: rowsFinal.find((r) => r.tipo === "historico" && r.is_active)?.id ?? null,
      };
      if (!lib.activeAbordagemId) {
        lib.activeAbordagemId = lib.items.find((p) => p.tipo === "abordagem")?.id ?? null;
      }
      if (!lib.activeHistoricoId) {
        lib.activeHistoricoId = lib.items.find((p) => p.tipo === "historico")?.id ?? null;
      }
      // Aba ativa por padrão = a do pitch marcado como ativo, se existir.
      const abordagemAtiva = lib.items.find((p) => p.id === lib.activeAbordagemId);
      if (abordagemAtiva?.temaId) lib.activeTemaId = abordagemAtiva.temaId;
      saveLibrary(lib);
      return lib;
    } catch {
      // Offline / falha de rede: segue com o cache local.
      return loadLibrary();
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// ---------------------------------------------------------------------------
// CRUD — Prompts (pitches)
// ---------------------------------------------------------------------------

export function createPrompt(
  tipo: PromptTipo,
  nome: string,
  conteudo: string,
  temaId?: string | null,
): PromptItem {
  const lib = loadLibrary();
  const item: PromptItem = {
    id: genId(),
    nome: nome.trim() || (tipo === "abordagem" ? "Novo prompt de abordagem" : "Novo prompt de histórico"),
    conteudo,
    tipo,
    temaId: tipo === "abordagem" ? temaId ?? lib.activeTemaId ?? null : null,
  };
  lib.items.push(item);
  // Se não havia ativo desse tipo, o novo assume automaticamente.
  if (tipo === "abordagem" && !lib.activeAbordagemId) lib.activeAbordagemId = item.id;
  if (tipo === "historico" && !lib.activeHistoricoId) lib.activeHistoricoId = item.id;
  saveLibrary(lib);
  pushPrompt(item, isActiveInLib(lib, item));
  return item;
}

export function updatePrompt(
  id: string,
  patch: Partial<Pick<PromptItem, "nome" | "conteudo" | "temaId">>,
): void {
  const lib = loadLibrary();
  const idx = lib.items.findIndex((p) => p.id === id);
  if (idx < 0) return;
  lib.items[idx] = {
    ...lib.items[idx],
    ...(patch.nome !== undefined ? { nome: patch.nome } : {}),
    ...(patch.conteudo !== undefined ? { conteudo: patch.conteudo } : {}),
    ...(patch.temaId !== undefined ? { temaId: patch.temaId } : {}),
  };
  saveLibrary(lib);
  pushPrompt(lib.items[idx], isActiveInLib(lib, lib.items[idx]));
}

export function deletePrompt(id: string): void {
  const lib = loadLibrary();
  const alvo = lib.items.find((p) => p.id === id);
  if (!alvo) return;
  lib.items = lib.items.filter((p) => p.id !== id);
  if (lib.activeAbordagemId === id) {
    const primeiro = lib.items.find((p) => p.tipo === "abordagem" && p.temaId === alvo.temaId);
    lib.activeAbordagemId = primeiro?.id ?? null;
  }
  if (lib.activeHistoricoId === id) {
    const primeiro = lib.items.find((p) => p.tipo === "historico");
    lib.activeHistoricoId = primeiro?.id ?? null;
  }
  saveLibrary(lib);
  if (isUuid(id)) {
    void deleteUserPrompt({ data: { consultor: activeConsultor(), id } }).catch(() => {});
  }
}

export function setActivePrompt(tipo: PromptTipo, id: string | null): void {
  const lib = loadLibrary();
  if (tipo === "abordagem") lib.activeAbordagemId = id;
  else lib.activeHistoricoId = id;
  saveLibrary(lib);
  if (!id || isUuid(id)) {
    void setActiveUserPromptRemote({
      data: { consultor: activeConsultor(), tipo, id: id ?? null },
    }).catch(() => {});
  }
}


export function getActivePrompt(tipo: PromptTipo): PromptItem | null {
  const lib = loadLibrary();
  const id = tipo === "abordagem" ? lib.activeAbordagemId : lib.activeHistoricoId;
  if (!id) return null;
  return lib.items.find((p) => p.id === id) ?? null;
}

/**
 * Texto LITERAL do prompt ativo. Se não houver prompt ativo, retorna string
 * vazia — a UI deve alertar o operador para criar/selecionar um prompt.
 * NUNCA cai silenciosamente em um padrão do sistema.
 */
export function getActivePromptText(tipo: PromptTipo): string {
  return getActivePrompt(tipo)?.conteudo ?? "";
}

// ---------------------------------------------------------------------------
// CRUD — Temas (abas)
// ---------------------------------------------------------------------------

/** Todos os pitches (tipo "abordagem") de um tema específico. */
export function getPromptsByTema(temaId: string): PromptItem[] {
  const lib = loadLibrary();
  return lib.items.filter((p) => p.tipo === "abordagem" && p.temaId === temaId);
}

export function createTema(nome: string): Tema {
  const lib = loadLibrary();
  const tema: Tema = { id: genId(), nome: nome.trim() || "Novo tema" };
  lib.temas.push(tema);
  if (!lib.activeTemaId) lib.activeTemaId = tema.id;
  saveLibrary(lib);
  pushTema(tema);
  return tema;
}

export function renomearTema(id: string, nome: string): void {
  const lib = loadLibrary();
  const idx = lib.temas.findIndex((t) => t.id === id);
  if (idx < 0) return;
  lib.temas[idx] = { ...lib.temas[idx], nome: nome.trim() || lib.temas[idx].nome };
  saveLibrary(lib);
  pushTema(lib.temas[idx]);
}

/**
 * Remove um tema. Recusa localmente (mesma regra do backend) se ainda houver
 * pitch vinculado a ele, para o operador nunca perder pitch sem perceber.
 * Retorna true se removeu, false se recusou.
 */
export function excluirTema(id: string): boolean {
  const lib = loadLibrary();
  const temPitchDentro = lib.items.some((p) => p.tipo === "abordagem" && p.temaId === id);
  if (temPitchDentro) return false;
  lib.temas = lib.temas.filter((t) => t.id !== id);
  if (lib.activeTemaId === id) {
    lib.activeTemaId = lib.temas[0]?.id ?? null;
  }
  saveLibrary(lib);
  if (isUuid(id)) {
    void deleteUserPromptTemaRemote({ data: { consultor: activeConsultor(), id } }).catch(() => {});
  }
  return true;
}

export function setActiveTema(id: string | null): void {
  const lib = loadLibrary();
  lib.activeTemaId = id;
  saveLibrary(lib);
}
  

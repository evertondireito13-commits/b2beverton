// Parser determinístico do texto bruto copiado de consultas de CNPJ
// (Casa dos Dados / CNPJ.biz / Receita). Extrai o máximo de campos possível
// sem depender de IA — usado na Preparação Noturna.

export type ContatoRaw = { nome: string; cargo?: string };

export type DadosCnpj = {
  razaoSocial?: string;
  cnpj?: string;
  telefone?: string;
  telefoneSecundario?: string;
  email?: string;
  emailSecundario?: string;
  contato?: string;
  cargo?: string;
  // Sócios/administradores adicionais além do primeiro (que vira contato/cargo).
  // Vêm sem telefone/e-mail próprios — o texto bruto normalmente não separa
  // isso por pessoa — o usuário completa manualmente na tela de edição.
  contatosExtras?: ContatoRaw[];
  observacoes?: string;
  uf?: string;
  setor?: string;
  regime?: string;
};

const LIXO = /^(remover dados|ativa|inativa|baixada|suspensa|atualizado|regime tribut|sócios e administradores|atividades econômicas|inscrições estaduais|suframa|empresas|cnae\b)/i;

const SUFIXOS = /\b(ltda|s\.?a\.?|eireli|me|epp|mei|sociedade|comercio|comércio|industria|indústria|servicos|serviços|participacoes|participações|brasil|group|holding)\b/i;

// Mesmas listas usadas nos dropdowns do formulário (preparacao-noturna.tsx),
// repetidas aqui só para validar o que o parser encontra no texto solto.
const UFS_VALIDAS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

const REGIMES_TEXTO: { regex: RegExp; label: string }[] = [
  { regex: /\bsimples nacional\b/i, label: "Simples Nacional" },
  { regex: /\bmei\b/i, label: "MEI" },
  { regex: /\blucro presumido\b/i, label: "Lucro Presumido" },
  { regex: /\blucro real\b/i, label: "Lucro Real" },
];

function limpar(l: string) {
  return l.replace(/\s+/g, " ").trim();
}

export function parseDadosCnpj(texto: string): DadosCnpj {
  const out: DadosCnpj = {};
  if (!texto?.trim()) return out;
  const linhas = texto.split(/\r?\n/).map(limpar).filter(Boolean);

  // CNPJ completo (14 dígitos formatado ou não)
  const mCnpj =
    texto.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) ??
    texto.match(/\b\d{14}\b/);
  if (mCnpj) out.cnpj = mCnpj[0];

  // E-mail(s) — pega todos os que aparecem e usa os 2 primeiros distintos.
  // O primeiro vira o e-mail principal, o segundo (se existir) fica como
  // "E-mail secundário" — comum quando a consulta lista e-mail de contato
  // além do e-mail cadastral da empresa.
  const emailsEncontrados = [
    ...new Set(
      [...texto.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g)].map((m) => m[0].toLowerCase()),
    ),
  ];
  if (emailsEncontrados[0]) out.email = emailsEncontrados[0];
  if (emailsEncontrados[1]) out.emailSecundario = emailsEncontrados[1];

  // Telefone(s) brasileiro(s) — mesma lógica: o primeiro é o principal, o
  // segundo (se existir) vira "Telefone secundário".
  const telefonesEncontrados = [
    ...new Set(
      [...texto.matchAll(/\(?\b\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g)].map((m) => limpar(m[0])),
    ),
  ];
  if (telefonesEncontrados[0]) out.telefone = telefonesEncontrados[0];
  if (telefonesEncontrados[1]) out.telefoneSecundario = telefonesEncontrados[1];

  // Razão social: linha logo após o CNPJ, ou primeira linha "de empresa"
  const idxCnpj = out.cnpj ? linhas.findIndex((l) => l.includes(out.cnpj!)) : -1;
  const candidatas = idxCnpj >= 0 ? linhas.slice(idxCnpj + 1) : linhas;
  const razao = candidatas.find((l) => {
    if (LIXO.test(l)) return false;
    if (l.length < 4 || l.length > 90) return false;
    if (/@|^\(?\d/.test(l)) return false;
    if (/^\d/.test(l)) return false;
    return SUFIXOS.test(l) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 .,'&/-]{6,}$/.test(l);
  });
  if (razao) out.razaoSocial = razao.replace(/\s+$/, "");

  // Contato(s): TODOS os Administrador(es)/Sócio(s) pessoa física listados —
  // o primeiro vira "Contato/Cargo" (campos principais, como antes), os
  // demais entram em contatosExtras para não se perder mais ninguém.
  const contatosEncontrados: ContatoRaw[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const papel = linhas[i].match(/^(Administrador[a]?|Sócio-?Administrador[a]?|Sóci[oa]|Diretor[a]?|Presidente)\b/i);
    if (papel && i > 0) {
      const nome = linhas[i - 1];
      if (nome && !LIXO.test(nome) && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .]{4,60}$/.test(nome) && nome.includes(" ")) {
        const cargoLabel = papel[1].charAt(0).toUpperCase() + papel[1].slice(1);
        if (!contatosEncontrados.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
          contatosEncontrados.push({ nome, cargo: cargoLabel });
        }
      }
    }
  }
  if (contatosEncontrados[0]) {
    out.contato = contatosEncontrados[0].nome;
    out.cargo = contatosEncontrados[0].cargo;
  }
  if (contatosEncontrados.length > 1) {
    out.contatosExtras = contatosEncontrados.slice(1);
  }

  // Observações: CNAE principal + endereço (linha com UF + CEP)
  const obs: string[] = [];
  const cnaeIdx = linhas.findIndex((l) => /principal/i.test(l));
  let cnaeDesc: string | undefined;
  if (cnaeIdx >= 0) {
    cnaeDesc = linhas.slice(cnaeIdx + 1).find((l) => l.length > 8 && !LIXO.test(l));
    const cod = linhas[cnaeIdx].match(/\d{4}-?\d?\/?\d{0,2}/)?.[0] ?? linhas[cnaeIdx - 1]?.match(/\d{4}-\d\/\d{2}/)?.[0];
    if (cnaeDesc) obs.push(`CNAE principal: ${[cod, cnaeDesc].filter(Boolean).join(" — ")}`);
  }
  const endereco = linhas.find((l) => /\b\d{5}-?\d{3}\b/.test(l));
  if (endereco) obs.push(`Endereço: ${endereco}`);
  const capital = texto.match(/R\$\s?[\d.,]+/);
  if (capital) obs.push(`Capital social: ${capital[0]}`);
  if (obs.length) out.observacoes = obs.join("\n");

  // UF: extraída da própria linha de endereço (ex.: "Curitiba PR 80420-060")
  if (endereco) {
    const mUf = endereco.match(/\b([A-Z]{2})\b(?=\s*\d{5}-?\d{3}\b)/);
    if (mUf && UFS_VALIDAS.has(mUf[1])) out.uf = mUf[1];
  }

  // Setor: mesma descrição do CNAE principal usada acima (igual ao que o
  // botão "Enriquecer via CNPJ" já grava como setor via BrasilAPI).
  if (cnaeDesc) out.setor = cnaeDesc;

  // Regime tributário: procura os rótulos exatos usados no formulário
  const regimeEncontrado = REGIMES_TEXTO.find((r) => r.regex.test(texto));
  if (regimeEncontrado) out.regime = regimeEncontrado.label;

  return out;
}

// ---------------------------------------------------------------------------
// Grupo econômico: matriz + filiais compartilham a mesma raiz (8 primeiros
// dígitos do CNPJ). Usado para unificar cadastros do mesmo grupo.
// ---------------------------------------------------------------------------

export function cnpjDigitos(cnpj?: string | null): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/** Raiz do CNPJ (8 dígitos) — identifica o grupo econômico. */
export function cnpjRaiz(cnpj?: string | null): string {
  const d = cnpjDigitos(cnpj);
  return d.length >= 8 ? d.slice(0, 8) : "";
}

/** Ordem da unidade: "0001" = matriz, demais = filiais. */
export function cnpjOrdem(cnpj?: string | null): string {
  const d = cnpjDigitos(cnpj);
  return d.length >= 12 ? d.slice(8, 12) : "";
}

export function isMatriz(cnpj?: string | null): boolean {
  return cnpjOrdem(cnpj) === "0001";
}

/** Rótulo curto da unidade: "Matriz" ou "Filial 0004". */
export function unidadeLabel(cnpj?: string | null): string | null {
  const ordem = cnpjOrdem(cnpj);
  if (!ordem) return null;
  return ordem === "0001" ? "Matriz" : `Filial ${ordem}`;
}

/** Cidade/UF a partir do texto bruto (linha do CEP) — ajuda a distinguir unidades. */
export function cidadeUfDoTexto(texto?: string | null): string | null {
  if (!texto) return null;
  const linha = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => /\b\d{5}-?\d{3}\b/.test(l));
  if (!linha) return null;
  const m = linha.match(/([A-Za-zÀ-ÿ' .]{3,40})\s+([A-Z]{2})\s+\d{5}-?\d{3}/);
  if (m) return `${m[1].trim()}/${m[2]}`;
  return linha.slice(0, 40);
}

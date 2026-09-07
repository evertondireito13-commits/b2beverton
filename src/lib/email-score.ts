// Verificação de e-mail em camadas, com nota de 0 a 100.
// Tudo é feito sem chave de API: as camadas offline (formato, domínio,
// descartável, caixa genérica, erro de digitação) rodam na hora; a camada de
// DNS (MX) usa o DNS público do Google. Não há checagem SMTP — provedores
// bloqueiam esse tipo de teste e o resultado seria pouco confiável.

export type CamadaEmail = {
  nome: string;
  ok: boolean | null; // null = não foi possível checar
  peso: number;
  detalhe: string;
};

export type AvaliacaoEmail = {
  email: string;
  nota: number; // 0-100
  classificacao: "bom" | "atencao" | "ruim";
  resumo: string;
  camadas: CamadaEmail[];
};

const DESCARTAVEIS = new Set([
  "mailinator.com","tempmail.com","temp-mail.org","10minutemail.com","guerrillamail.com",
  "yopmail.com","trashmail.com","getnada.com","sharklasers.com","dispostable.com",
  "fakeinbox.com","throwawaymail.com","maildrop.cc","mailcatch.com","tempr.email",
]);

const GRATUITOS = new Set([
  "gmail.com","hotmail.com","outlook.com","outlook.com.br","yahoo.com","yahoo.com.br",
  "bol.com.br","uol.com.br","terra.com.br","ig.com.br","live.com","icloud.com","globo.com",
]);

const GENERICAS = new Set([
  "contato","comercial","vendas","sac","atendimento","financeiro","fiscal","compras",
  "info","adm","administrativo","rh","suporte","faleconosco","no-reply","noreply","cobranca",
]);

const DOMINIOS_COMUNS = ["gmail.com","hotmail.com","outlook.com","yahoo.com.br","uol.com.br","terra.com.br","bol.com.br"];

const RE_EMAIL = /^[^\s@]+@([^\s@.]+\.[^\s@]+)$/;

function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function nota(camadas: CamadaEmail[]): number {
  const total = camadas.reduce((s, c) => s + c.peso, 0);
  const ganho = camadas.reduce(
    (s, c) => s + (c.ok === true ? c.peso : c.ok === null ? c.peso * 0.5 : 0),
    0,
  );
  return total === 0 ? 0 : Math.round((ganho / total) * 100);
}

function classificar(n: number): AvaliacaoEmail["classificacao"] {
  if (n >= 75) return "bom";
  if (n >= 45) return "atencao";
  return "ruim";
}

/** Camadas offline (instantâneas), sem consulta de DNS. */
export function avaliarEmailOffline(emailBruto: string): AvaliacaoEmail {
  const email = (emailBruto ?? "").trim().toLowerCase();
  const m = email.match(RE_EMAIL);
  const camadas: CamadaEmail[] = [];

  const formatoOk = !!m && email.length <= 254;
  camadas.push({
    nome: "Formato",
    ok: formatoOk,
    peso: 30,
    detalhe: formatoOk ? "Escrito corretamente" : "Endereço mal formatado",
  });

  if (!formatoOk) {
    const n = nota(camadas);
    return { email, nota: n, classificacao: classificar(n), resumo: "Endereço inválido", camadas };
  }

  const dominio = m![1];
  const usuario = email.split("@")[0];

  const descartavel = DESCARTAVEIS.has(dominio);
  camadas.push({
    nome: "E-mail descartável",
    ok: !descartavel,
    peso: 20,
    detalhe: descartavel ? "Domínio de e-mail temporário" : "Não é e-mail temporário",
  });

  const corporativo = !GRATUITOS.has(dominio);
  camadas.push({
    nome: "Domínio corporativo",
    ok: corporativo,
    peso: 10,
    detalhe: corporativo ? "Domínio próprio da empresa" : "E-mail pessoal (provedor gratuito)",
  });

  const generica = GENERICAS.has(usuario.replace(/[._-].*$/, "")) || GENERICAS.has(usuario);
  camadas.push({
    nome: "Caixa pessoal",
    ok: !generica,
    peso: 10,
    detalhe: generica ? "Caixa geral da empresa, não de uma pessoa" : "Parece caixa de uma pessoa",
  });

  const parecido = DOMINIOS_COMUNS.find((d) => d !== dominio && distancia(d, dominio) === 1);
  camadas.push({
    nome: "Erro de digitação",
    ok: !parecido,
    peso: 10,
    detalhe: parecido ? `Parece erro de digitação de "${parecido}"` : "Sem sinal de erro de digitação",
  });

  const n = nota(camadas);
  return { email, nota: n, classificacao: classificar(n), resumo: resumoDe(camadas), camadas };
}

function resumoDe(camadas: CamadaEmail[]): string {
  const ruins = camadas.filter((c) => c.ok === false);
  if (ruins.length === 0) return "Nenhum problema encontrado";
  return ruins.map((c) => c.detalhe).join(" · ");
}

/** Camadas offline + checagem de DNS (o domínio aceita e-mails?). */
export async function verificarEmailEmCamadas(emailBruto: string): Promise<AvaliacaoEmail> {
  const base = avaliarEmailOffline(emailBruto);
  if (base.camadas[0]?.ok !== true) return base;

  const dominio = base.email.split("@")[1];
  let ok: boolean | null = null;
  let detalhe = "Não foi possível consultar agora";
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=MX`);
    if (resp.ok) {
      const data = await resp.json();
      ok = Array.isArray(data.Answer) && data.Answer.length > 0;
      detalhe = ok
        ? `Domínio "${dominio}" recebe e-mails`
        : `Domínio "${dominio}" não está configurado para receber e-mails`;
    }
  } catch {
    /* mantém indeterminado */
  }

  const camadas = [...base.camadas, { nome: "Recebe e-mails (DNS)", ok, peso: 20, detalhe }];
  const n = nota(camadas);
  return { email: base.email, nota: n, classificacao: classificar(n), resumo: resumoDe(camadas), camadas };
}

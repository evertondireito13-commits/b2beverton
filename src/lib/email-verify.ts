// Verificação de e-mail via DNS (registro MX) — gratuita, sem chave de API.
// Usa o DNS público do Google (dns.google/resolve) pra checar se o domínio
// do e-mail realmente existe e está configurado pra receber mensagens.
// Não confirma se a caixa de entrada específica existe (isso exigiria SMTP,
// que a maioria dos provedores bloqueia hoje em dia) — só confirma que o
// domínio não é inventado/digitado errado e que aceita e-mails.

export type ResultadoVerificacaoEmail = {
  email: string;
  valido: boolean;
  motivo: string;
};

function extrairDominio(email: string): string | null {
  const m = email.trim().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  return m ? m[1].toLowerCase() : null;
}

export async function verificarEmailDominio(email: string): Promise<ResultadoVerificacaoEmail> {
  const dominio = extrairDominio(email);
  if (!dominio) {
    return { email, valido: false, motivo: "Formato de e-mail inválido" };
  }

  try {
    const resp = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=MX`,
    );
    if (!resp.ok) {
      return { email, valido: false, motivo: "Não foi possível consultar o DNS agora" };
    }
    const data = await resp.json();
    const temMx = Array.isArray(data.Answer) && data.Answer.length > 0;
    if (temMx) {
      return { email, valido: true, motivo: `Domínio "${dominio}" aceita e-mails (MX encontrado)` };
    }
    return { email, valido: false, motivo: `Domínio "${dominio}" não tem registro de e-mail (MX) — pode estar errado` };
  } catch {
    return { email, valido: false, motivo: "Falha ao consultar o DNS (sem internet ou serviço fora do ar)" };
  }
}

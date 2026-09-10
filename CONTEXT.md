[CONTEXT.md](https://github.com/user-attachments/files/32080360/CONTEXT.md)
# CONTEXT.md — b2beverton (BHM — Central de Prospecção)

> **Convenção:** quando Everton mandar "SALVAR" sozinho numa mensagem, o Claude deve reescrever este arquivo por completo e entregá-lo como arquivo para colar no GitHub.

---

## 🧭 Sobre o projeto

Painel B2B de prospecção para um escritório de advocacia tributária, cobrindo todo o ciclo de prospecção:
**Pré-ligação → Pós-ligação → Preparação Noturna → Painel Executivo → Follow-ups → Central de Reuniões (CRM)**.

**Stack:** React/TypeScript + TanStack Start + Supabase, deploy via Lovable.
**Fluxo de trabalho:** Lovable AI está sem créditos → todas as alterações são feitas manualmente pelo **editor web do GitHub**. Por isso, toda entrega de código deve ser **arquivo completo pronto para colar**, nunca snippet ou instrução de find-and-replace.

**Perfil do Everton:** não-técnico, não localiza trechos de código dentro de arquivos grandes. Comunica urgência/frustração em CAIXA ALTA.

**Busca no GitHub:** usar `repo:evertondireito13-commits/b2beverton <termo>` (não usar o buscador de arquivo "T" da página).

**Limitação do Claude:** não consegue puxar arquivos crus (raw) do GitHub diretamente por causa de rate limit em acesso sem login e o repositório é privado — Everton precisa colar o conteúdo dos arquivos ou, quando possível, o link raw funciona pontualmente mas não é garantido.

---

## 📖 Glossário (termos de domínio)

- `historico` — log de histórico de ligações
- `pós-ligação` — pós-ligação
- `sem interesse` — recusa comercial
- `follow-up frio` — fila de follow-up frio
- `Central de Reuniões` — hub/CRM de reuniões
- `arquivado` — removido da fila ativa
- `decisor` — pessoa que decide
- `portaria` — recepcionista / barreira de acesso

---

## ⚠️ ALERTA URGENTE (aberto) — Regressão em `hydrateFromCloud`

**Arquivo:** `src/lib/cloud-store.ts`

Foi confirmado nesta sessão que a função `hydrateFromCloud` **regrediu** para o comportamento com bug original: ela volta a sobrescrever o `localStorage` diretamente, sem mesclar por `id`:

```ts
window.localStorage.setItem(localKey("historico", consultor), JSON.stringify(historicos));
window.localStorage.setItem(localKey("leads", consultor), JSON.stringify(leadList));
```

**Risco:** se a nuvem (Supabase) estiver vazia ou incompleta no momento da consulta, esse `setItem` **apaga dados locais válidos** — exatamente o bug de "empresas sumindo" que já tinha sido corrigido antes.

**Causa provável:** o Lovable AI sobrescreveu o arquivo em uma edição posterior à correção (merge por `id` + reenvio de itens só-locais foi perdido).

**Status:** correção **ainda não reaplicada** — aguardando confirmação do Everton para:
1. Reaplicar a correção agora (mesclagem por `id`, sem apagar dados locais quando a nuvem vier vazia/incompleta), **ou**
2. Terminar de revisar o resto do repositório antes.

👉 **Próxima ação recomendada:** reaplicar o fix em `cloud-store.ts` assim que possível — é risco ativo de perda de dados, não é só um bug cosmético.

---

## ✅ Estado atual (concluído)

- **`pos-ligacao.tsx` — bug "sem interesse" não arquivava (Problema 2):** corrigido. Um booleano unificado `negativaDetectada` (baseado em `textoIndicaNegativaComercial`, aplicado tanto à transcrição quanto ao histórico gerado) agora controla arquivamento, cancelamento de follow-up e status do lead na Central de Reuniões de forma consistente.

- **`FloatingNotepad.tsx`:** bloco de notas flutuante completo — abas, persistência via localStorage, arrastar, colapsar em bolha, copiar, baixar. Renderizando em `__root.tsx` em todas as páginas.

- **Enriquecer via CNPJ:** causa raiz era incompatibilidade de `AbortSignal.timeout` no runtime do servidor; corrigido com `AbortController` + `setTimeout`. Preenche Telefone, E-mail, Razão Social e bloco estruturado de Observações, sempre preservando campos preenchidos manualmente.

- **Tema visual (`styles.css`):** paleta neon misturada substituída por identidade azul unificada em `:root` (claro) e `.dark` (escuro). `.noir` mantido como alias silencioso de `.dark`. Fontes unificadas em Inter.

- **"Descobrir Empresas" (`descoberta-empresas.functions.ts`):** reescrito com dicionário português→tags OSM (~30 tipos de negócio), corrigindo buscas que usavam nome literal em vez de tag OSM.

- **Drag-and-drop em Preparação Noturna:** as "Pastas" agora usam arrastar de verdade (drag-and-drop real), com o ícone de grip ⠿ (mesmo estilo do menu "PROSPECTAR"), sempre visível (não depende de hover) e funcional em celular. Entregue como arquivo `preparacao-noturna.tsx` completo.

---

## 🔜 Em andamento / próximos passos

1. **Corrigir a regressão de `hydrateFromCloud`** (ver alerta urgente acima) — prioridade máxima.
2. **Expandir drag-and-drop para outros pontos estratégicos do app** — Everton pediu para aplicar o mesmo padrão de arrastar (ícone ⠿) em outras telas além de Preparação Noturna. Ainda faltam:
   - Identificar o arquivo do menu "PROSPECTAR" (provavelmente `app-sidebar.tsx`, `main-nav.tsx` ou similar) — precisa do conteúdo/raw URL do arquivo para confirmar se já é arrastável.
   - Levantar outras telas candidatas: cards da Central de Reuniões, colunas/etapas do pipeline, checklists de módulos.
3. **Validação do estágio "Pontuar" em Preparação Noturna:** investigar possível descompasso assíncrono/síncrono na forma como `scoreEmpresas()` é chamado (`src/lib/lead-score.ts`).

---

## 📌 Aprendizados e princípios fixos

- **NUNCA mexer no fluxo `textoBruto` / `parseDadosCnpj`** (preenchimento automático a partir de dados brutos colados) — restrição definitiva do Everton.
- Bugs costumam vir de lógica aplicada de forma inconsistente entre partes do código (foi assim no bug "sem interesse" e no enriquecimento de CNPJ) — sempre diagnosticar a causa raiz antes de corrigir.
- Cuidado com regressões: correções já aplicadas podem ser desfeitas por edições posteriores (como aconteceu com `hydrateFromCloud`) — vale reconferir arquivos críticos periodicamente.
- Layout e tema padrão importam: visibilidade da sidebar e tema padrão (`dark`, não `noir`) precisaram de correção explícita.
- **Sempre entregar arquivos completos de substituição** — nunca trechos, diffs ou instruções de find-and-replace.

---

## 🗂️ Arquivos-chave frequentemente referenciados

- `src/components/preparacao-noturna.tsx`
- `src/components/pos-ligacao.tsx`
- `src/components/FloatingNotepad.tsx`
- `src/lib/cnpj-enriquecimento.functions.ts`
- `src/lib/descoberta-empresas.functions.ts`
- `src/lib/cloud-store.ts` ⚠️ (regressão ativa — ver alerta acima)
- `src/lib/lead-score.ts`
- `src/routes/index.tsx`
- `src/routes/__root.tsx`
- `src/styles.css`

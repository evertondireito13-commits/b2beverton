# Central de Prospecção B2B — BHM Advogados

Ferramenta interna para o time comercial da Bruno Morais Advogados Associados (área de recuperação tributária ICMS/IPI). Duas etapas:

1. **Pré-ligação**: dado um CNPJ (ou nome/razão social), consulta múltiplas fontes públicas, monta um dossiê da empresa e gera com IA um script de abordagem cirúrgico para ligar ao decisor (Controller/Fiscal/CFO).
2. **Pós-ligação**: transcreve o áudio da ligação, gera um histórico estruturado para colar no RD Station CRM (com bloco separado de e-mails/telefones/pessoas para copiar-colar), e envia direto ao negócio via API do RD.

## Stack

- **TanStack Start v1** (React 19 + Vite 7, SSR, server functions via `createServerFn`)
- **Tailwind CSS v4** (CSS-first, tokens em `src/styles.css`, tema BHM = navy + gold + serifa Cormorant Garamond)
- **shadcn/ui** + lucide-react + sonner
- **Lovable AI Gateway** (`google/gemini-2.5-flash` para geração de script/histórico, `google/gemini-2.5-flash` para transcrição de áudio)
- **Firecrawl** (scrape/search de CNPJ.biz + site oficial atrás de telefones extras)
- **BrasilAPI + CNPJá** (dados cadastrais do CNPJ)
- **RD Station CRM API** (POST de nota no negócio)

## Layout / Identidade visual

Espelha o SaaS interno do BHM (https://intermediarios.brunohenriquemorais.adv.br/):
- Barra superior navy (`--navy-deep`) com diamante-B + "BRUNO MORAIS / SISTEMA JURÍDICO" + nav
- Fundo off-white, título "Painel" em serifa 5xl
- Faixa de 4 KPIs (Módulos ativos, Fontes de dados, CRM, IA)
- Dois cards lado a lado (Pré / Pós), cada um com header navy sólido + título serifado branco + etiqueta gold "Etapa 1/2"
- Outputs (script gerado / histórico gerado) recolhíveis via Collapsible do Radix

## Prompts (Regra dura)

O prompt do pós-ligação foi calibrado para **falar sempre no positivo**: nunca escreve "Não informado / Nenhum" — se um campo não foi mencionado na transcrição, a linha inteira é omitida. Exceção: os 4 rótulos fixos do bloco "DADOS PARA COPIAR E COLAR" sempre aparecem; quando vazios, exibem apenas "—".

## Estrutura de arquivos

\`\`\`
src/
├── routes/
│   ├── __root.tsx              # Shell HTML, imports Google Fonts, providers
│   └── index.tsx               # Página única com Pré-ligação + Pós-ligação
├── lib/
│   ├── prospeccao.functions.ts # Todas as server functions (createServerFn)
│   ├── prompts-store.ts        # Prompts default (script + histórico), persiste em localStorage
│   └── ai-gateway.server.ts    # Helper que chama Lovable AI Gateway
├── styles.css                  # Tokens Tailwind v4 (navy, gold, serifa)
├── router.tsx / start.ts / server.ts   # Bootstrap TanStack Start
\`\`\`

## Server functions expostas (todas em `src/lib/prospeccao.functions.ts`)

| Nome | Método | O que faz |
|------|--------|-----------|
| `lookupCnpj` | POST | Consulta BrasilAPI + CNPJá, normaliza dados cadastrais completos (razão, sócios, CNAEs, endereço, telefones, e-mail) |
| `searchCompanyByName` | POST | Busca por nome/razão via CNPJá autosuggest |
| `enrichPhones` | POST | Roda em background: raspa CNPJ.biz + site oficial da empresa com Firecrawl atrás de telefones extras |
| `generateWithAI` | POST | Chama Lovable AI Gateway com `systemPrompt` + `userContent` |
| `transcribeAudio` | POST | Envia áudio (base64) para Gemini via AI Gateway e devolve transcrição |
| `sendRdStationNote` | POST | POST na API do RD Station CRM (nota no negócio) |
| `fetchRdStationDeal` | POST | GET no RD Station CRM para exibir nome do negócio antes de enviar |

## Secrets configurados

- `LOVABLE_API_KEY` (auto, do Lovable Cloud)
- `CNPJA_API_KEY` (CNPJá)
- `RD_STATION_CRM_TOKEN` (RD Station)
- `FIRECRAWL_API_KEY` (Firecrawl)

---

# CÓDIGO-FONTE COMPLETO


## `src/styles.css`

```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/*
 * BHM Advogados — identidade visual.
 * Paleta navy profunda + dourado, tipografia serifada nos títulos.
 * Todas as cores em oklch.
 */

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Cormorant Garamond", "Times New Roman", serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ring-offset-background: var(--background);
  --color-gold: var(--gold);
  --color-gold-soft: var(--gold-soft);
  --color-navy-deep: var(--navy-deep);
  --color-navy-panel: var(--navy-panel);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.5rem;

  /* Paleta BHM — clara, navy só como tinta */
  --navy-deep: oklch(0.24 0.06 265);
  --navy-panel: oklch(0.3 0.065 265);
  --gold: oklch(0.72 0.13 82);
  --gold-soft: oklch(0.82 0.12 86);
  --page: oklch(0.985 0.005 260);
  --page-alt: oklch(0.965 0.008 260);

  --background: var(--page);
  --foreground: var(--navy-deep);

  --card: oklch(1 0 0);
  --card-foreground: var(--navy-deep);

  --popover: oklch(1 0 0);
  --popover-foreground: var(--navy-deep);

  /* Primária = navy sólido (como os botões escuros do site institucional) */
  --primary: var(--navy-deep);
  --primary-foreground: oklch(0.98 0.005 260);

  --secondary: var(--page-alt);
  --secondary-foreground: var(--navy-deep);

  --muted: oklch(0.955 0.008 260);
  --muted-foreground: oklch(0.45 0.03 265);

  --accent: oklch(0.955 0.008 260);
  --accent-foreground: var(--navy-deep);

  --destructive: oklch(0.58 0.22 25);
  --destructive-foreground: oklch(0.98 0.005 260);

  --border: oklch(0.9 0.01 260);
  --input: oklch(0.9 0.01 260);
  --ring: var(--gold);

  --chart-1: var(--gold);
  --chart-2: var(--navy-deep);
  --chart-3: oklch(0.65 0.1 220);
  --chart-4: oklch(0.6 0.15 30);
  --chart-5: oklch(0.65 0.13 145);

  --sidebar: oklch(1 0 0);
  --sidebar-foreground: var(--navy-deep);
  --sidebar-primary: var(--navy-deep);
  --sidebar-primary-foreground: oklch(0.98 0.005 260);
  --sidebar-accent: var(--page-alt);
  --sidebar-accent-foreground: var(--navy-deep);
  --sidebar-border: oklch(0.9 0.01 260);
  --sidebar-ring: var(--gold);
}

/* Mantém dark class alinhada, mas o app é claro por padrão. */
.dark {
  --background: var(--navy-deep);
  --foreground: oklch(0.97 0.01 260);
  --card: var(--navy-panel);
  --card-foreground: oklch(0.97 0.01 260);
  --popover: oklch(0.24 0.06 265);
  --popover-foreground: oklch(0.97 0.01 260);
  --primary: var(--gold);
  --primary-foreground: var(--navy-deep);
  --secondary: oklch(0.32 0.06 265);
  --secondary-foreground: oklch(0.97 0.01 260);
  --muted: oklch(0.31 0.05 265);
  --muted-foreground: oklch(0.75 0.03 260);
  --accent: oklch(0.33 0.06 265);
  --accent-foreground: oklch(0.97 0.01 260);
  --destructive: oklch(0.62 0.2 25);
  --destructive-foreground: oklch(0.98 0.005 260);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 10%);
  --ring: var(--gold);
}

@utility font-display {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.01em;
}

@utility eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold);
  font-weight: 500;
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  html,
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }

  h1,
  h2,
  h3 {
    font-family: var(--font-serif);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
}

```

## `src/routes/__root.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Central de Prospecção B2B" },
      { name: "description", content: "Gere script de abordagem e histórico pós-ligação para prospecção B2B em advocacia tributária." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Central de Prospecção B2B" },
      { property: "og:description", content: "Gere script de abordagem e histórico pós-ligação para prospecção B2B em advocacia tributária." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Central de Prospecção B2B" },
      { name: "twitter:description", content: "Gere script de abordagem e histórico pós-ligação para prospecção B2B em advocacia tributária." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/V8WtIEGzd5NeH5vmd5Zghzo87ou1/social-images/social-1783218869366-photo_2026-06-03_17-22-41.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/V8WtIEGzd5NeH5vmd5Zghzo87ou1/social-images/social-1783218869366-photo_2026-06-03_17-22-41.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

```

## `src/routes/index.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithAI, lookupCnpj, sendRdStationNote, fetchRdStationDeal, transcribeAudio, searchCompanyByName, enrichPhones } from "@/lib/prospeccao.functions";
import {
  loadPrompts,
  savePrompts,
  DEFAULT_SCRIPT_PROMPT,
  DEFAULT_HISTORY_PROMPT,
} from "@/lib/prompts-store";
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
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Central de Prospecção B2B" },
      {
        name: "description",
        content:
          "Gere script de abordagem e histórico pós-ligação para prospecção B2B em advocacia tributária.",
      },
    ],
  }),
  component: CentralProspeccao,
});

function CentralProspeccao() {
  const [prompts, setPrompts] = useState(() => loadPrompts());

  useEffect(() => {
    savePrompts(prompts);
  }, [prompts]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Watermark diamante-B, sutil no fundo claro */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 right-0 hidden w-[55%] items-center justify-center opacity-[0.04] lg:flex"
      >
        <BhmDiamond className="h-[70vh] w-auto text-navy-deep" />
      </div>

      <Toaster richColors position="top-right" />

      {/* Faixa navy fina no topo — mesma do site institucional (pós-login) */}
      <header className="relative bg-navy-deep text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <BhmDiamond className="h-10 w-10 shrink-0 text-white" />
            <div className="leading-tight">
              <div className="font-display text-lg tracking-[0.18em]">BRUNO MORAIS</div>
              <div className="text-[10px] font-medium tracking-[0.32em] text-white/60">
                SISTEMA JURÍDICO
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-white/85 md:flex">
            <span className="cursor-default font-medium text-white">Prospecção</span>
            <span className="cursor-default text-white/60">Pré-ligação</span>
            <span className="cursor-default text-white/60">Pós-ligação</span>
          </nav>
          <div className="hidden text-right md:block">
            <div className="text-[10px] font-medium tracking-[0.28em] text-gold">
              CENTRAL INTERNA
            </div>
            <div className="text-[10px] font-medium tracking-[0.28em] text-white/60">
              PROSPECÇÃO B2B
            </div>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto max-w-7xl px-6 pt-10 pb-6 md:pt-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="eyebrow">Painel</div>
              <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] text-foreground md:text-5xl">
                Central de prospecção
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Gere o script pré-ligação e o histórico pós-ligação prontos para o RD Station.
              </p>
            </div>
          </div>

          {/* Faixa de indicadores no estilo do painel institucional */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Módulos ativos" value="2" hint="Pré e Pós-ligação" />
            <StatCard label="Fontes de dados" value="4" hint="BrasilAPI · CNPJá · CNPJ.biz · site" />
            <StatCard label="Integração CRM" value="RD Station" hint="Envio direto para o negócio" />
            <StatCard label="IA" value="Lovable AI" hint="Script + transcrição + histórico" />
          </div>
        </div>
      </section>

      <main className="relative mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-2">
        <PreLigacao
          promptText={prompts.script}
          onPromptChange={(v) => setPrompts((p) => ({ ...p, script: v }))}
        />
        <PosLigacao
          promptText={prompts.history}
          onPromptChange={(v) => setPrompts((p) => ({ ...p, history: v }))}
        />
      </main>

      <footer className="relative border-t border-border bg-navy-deep text-white/70">
        <div className="mx-auto max-w-7xl px-6 py-6 text-[10px] font-medium tracking-[0.24em]">
          CURITIBA/PR · BRUNOMORAIS@BRUNOHENRIQUEMORAIS.ADV.BR
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-5 py-4 shadow-sm">
      <div className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl text-navy-deep">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function BhmDiamond({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect
        x="50"
        y="6"
        width="62.2"
        height="62.2"
        transform="rotate(45 50 6)"
        rx="2"
      />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', serif"
        fontSize="46"
        fontWeight="500"
        fill="currentColor"
        stroke="none"
      >
        B
      </text>
    </svg>
  );
}

function PromptEditor({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/50">
          <span className="flex items-center gap-1">
            <Settings2 className="h-3 w-3" />
            {label}
          </span>
          <span className="text-muted-foreground">{open ? "Recolher" : "Editar"}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Restaurar padrão
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreLigacao({
  promptText,
  onPromptChange,
}: {
  promptText: string;
  onPromptChange: (v: string) => void;
}) {
  const [cnpj, setCnpj] = useState("");
  const [dados, setDados] = useState("");
  const [script, setScript] = useState("");
  const [scriptOpen, setScriptOpen] = useState(true);
  const [empresaResumo, setEmpresaResumo] = useState<string | null>(null);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [searchMode, setSearchMode] = useState<"cnpj" | "nome">("cnpj");
  const [nomeBusca, setNomeBusca] = useState("");
  const [loadingBusca, setLoadingBusca] = useState(false);
  type Match = Awaited<ReturnType<typeof searchCompanyByName>>["itens"][number];
  const [resultados, setResultados] = useState<Match[]>([]);

  type Telefones = Awaited<ReturnType<typeof enrichPhones>>;
  const [telefones, setTelefones] = useState<Telefones | null>(null);
  const [loadingFones, setLoadingFones] = useState(false);

  const runLookup = useServerFn(lookupCnpj);
  const runGenerate = useServerFn(generateWithAI);
  const runSearchNome = useServerFn(searchCompanyByName);
  const runEnrichPhones = useServerFn(enrichPhones);

  async function handleLookup(preset?: string) {
    // Lê o valor atual do input (fallback caso o estado ainda não tenha atualizado),
    // aceita qualquer formato: 12.345.678/0001-90, 12345678000190, com espaços, etc.
    let raw: string;
    if (preset !== undefined) {
      raw = preset;
    } else {
      const inputEl = document.getElementById("cnpj") as HTMLInputElement | null;
      raw = (inputEl?.value ?? cnpj ?? "").toString();
    }
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
      const r = await runLookup({ data: { cnpj: digits } });
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
      setDados(bloco);
      setScript("");
      setEmpresaResumo(
        `${r.razaoSocial || "Empresa"}${r.nomeFantasia ? " · " + r.nomeFantasia : ""}${r.porte ? " · " + r.porte : ""}`,
      );
      setResultados([]);
      toast.success("Dados carregados no campo abaixo");

      // Busca telefones em background (BrasilAPI + CNPJá + CNPJ.biz + site oficial)
      setLoadingFones(true);
      runEnrichPhones({ data: { cnpj: digits } })
        .then((res) => setTelefones(res))
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Falha ao buscar telefones");
        })
        .finally(() => setLoadingFones(false));
    } catch (err) {
      setEmpresaResumo(null);
      toast.error(err instanceof Error ? err.message : "Falha ao buscar CNPJ");
    } finally {
      setLoadingCnpj(false);
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
    setLoadingGen(true);
    setScript("");
    try {
      const diaSemana = new Date().toLocaleDateString("pt-BR", { weekday: "long" });
      const userContent = `<dados_do_lead>\n${dados.trim()}\n</dados_do_lead>\n\n<dia_da_semana_atual>${diaSemana}</dia_da_semana_atual>`;
      const { text } = await runGenerate({
        data: { systemPrompt: promptText, userContent },
      });
      setScript(text);
      setScriptOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setLoadingGen(false);
    }
  }

  async function copyScript() {
    await navigator.clipboard.writeText(script);
    toast.success("Script copiado");
  }

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

  return (
    <Card className="relative overflow-hidden border-border bg-card p-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 rounded-none border-b border-navy-deep bg-navy-deep px-6 py-4 text-white">
        <CardTitle className="font-display text-lg tracking-wide text-white">
          Pré-ligação · Script de abordagem
        </CardTitle>
        <span className="text-[10px] font-medium tracking-[0.24em] text-gold uppercase">
          Etapa 1
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <PromptEditor
          label="Prompt de abordagem"
          value={promptText}
          onChange={onPromptChange}
          onReset={() => onPromptChange(DEFAULT_SCRIPT_PROMPT)}
        />

        <div className="space-y-2">
          <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setSearchMode("cnpj")}
              className={`flex-1 rounded px-2 py-1 transition ${searchMode === "cnpj" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Por CNPJ
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("nome")}
              className={`flex-1 rounded px-2 py-1 transition ${searchMode === "nome" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Por nome / razão social
            </button>
          </div>

          {searchMode === "cnpj" ? (
            <div>
              <Label htmlFor="cnpj" className="text-xs">
                Buscar por CNPJ (BrasilAPI)
              </Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00 ou só números"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
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
                <Button onClick={() => handleLookup()} disabled={loadingCnpj} variant="secondary">
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
                <Button onClick={handleBuscaNome} disabled={loadingBusca} variant="secondary">
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
              ✓ {empresaResumo} — dados adicionados abaixo
            </p>
          )}

          {(loadingFones || telefones) && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  📞 Telefones para o RD
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


        <div>
          <Label htmlFor="dados" className="text-xs">
            Dados da empresa
          </Label>
          <Textarea
            id="dados"
            value={dados}
            onChange={(e) => setDados(e.target.value)}
            rows={9}
            placeholder="Cole aqui CNPJ, razão social, sócios, atividade, contato do fiscal, etc. Ou use a busca acima."
            className="mt-1 text-sm"
          />
        </div>

        <Button onClick={handleGenerate} disabled={loadingGen} className="w-full">
          {loadingGen ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar script de abordagem
            </>
          )}
        </Button>

        {script && (
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
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={downloadScript}>
                  <Download className="mr-1 h-3 w-3" />
                  Baixar
                </Button>
                <Button size="sm" variant="ghost" onClick={copyScript}>
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar
                </Button>
              </div>
            </div>
            <CollapsibleContent className="border-t px-3 pb-3 pt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {script}
              </pre>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
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
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={downloadScript}>
                    <Download className="mr-1 h-3 w-3" />
                    Baixar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={copyScript}>
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function PosLigacao({
  promptText,
  onPromptChange,
}: {
  promptText: string;
  onPromptChange: (v: string) => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [historico, setHistorico] = useState("");
  const [historicoOpen, setHistoricoOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dealId, setDealId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("rd-deal-id") ?? "";
  });
  const [sending, setSending] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runGenerate = useServerFn(generateWithAI);
  const runSendRd = useServerFn(sendRdStationNote);
  const runFetchRd = useServerFn(fetchRdStationDeal);
  const runTranscribe = useServerFn(transcribeAudio);

  async function transcribeBlob(blob: Blob, filename: string) {
    if (blob.size < 1024) {
      toast.error("Áudio muito curto ou vazio — grave/envie novamente");
      return;
    }
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const { text } = await runTranscribe({ data: fd });
      setDescricao((prev) => (prev ? prev + "\n\n" + text : text));
      toast.success("Áudio transcrito e adicionado à descrição");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao transcrever");
    } finally {
      setTranscribing(false);
    }
  }

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
    const s = raw.trim();
    const match = s.match(/[a-f0-9]{24}/i);
    return match ? match[0] : s.replace(/\/+$/, "").split("/").pop() ?? "";
  }

  async function handleFetchRd() {
    const cleanId = cleanDealId(dealId);
    if (!cleanId) {
      toast.error("Informe o ID ou o link do negócio no RD Station");
      return;
    }
    setFetching(true);
    try {
      const r = await runFetchRd({ data: { dealId: cleanId } });
      if ("notFound" in r && r.notFound) {
        toast.error(`Negócio ${cleanId} não encontrado no RD Station. Confira o ID/link.`);
        return;
      }
      if (!r.texto) {
        toast.warning("Nenhuma nota ou atividade encontrada nesse negócio");
        return;
      }
      setDealId(cleanId);
      setDescricao((prev) => (prev ? prev + "\n\n" + r.texto : r.texto));
      const tr = "totalTranscricoes" in r ? r.totalTranscricoes : 0;
      toast.success(
        `RD: ${r.totalNotas} nota(s) · ${r.totalAtividades} atividade(s)` +
          (tr ? ` · ${tr} transcrição(ões) — a mais recente foi destacada` : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar no RD");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dealId) window.localStorage.setItem("rd-deal-id", dealId);
    else window.localStorage.removeItem("rd-deal-id");
  }, [dealId]);

  async function handleGenerate() {
    if (!descricao.trim()) {
      toast.error("Escreva o que aconteceu na ligação");
      return;
    }
    setLoading(true);
    setHistorico("");
    try {
      const hoje = new Date();
      const dataStr = hoje.toLocaleDateString("pt-BR");
      const diaSemana = hoje.toLocaleDateString("pt-BR", { weekday: "long" });
      const userContent = `Data da ligação: ${dataStr} (${diaSemana})\n\nTranscrição / descrição:\n${descricao}`;
      const { text } = await runGenerate({
        data: { systemPrompt: promptText, userContent },
      });
      setHistorico(text);
      setHistoricoOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setLoading(false);
    }
  }

  async function copyHistorico() {
    await navigator.clipboard.writeText(historico);
    toast.success("Histórico copiado");
  }

  async function handleSendRd() {
    if (!historico.trim()) {
      toast.error("Gere o histórico primeiro");
      return;
    }
    // Aceita ID puro ou URL como https://crm.rdstation.com/deals/<id>
    const cleanId = cleanDealId(dealId);
    if (!cleanId) {
      toast.error("Informe o ID ou o link do negócio no RD Station");
      return;
    }
    setSending(true);
    try {
      await runSendRd({ data: { dealId: cleanId, text: historico } });
      setDealId(cleanId);
      toast.success("Histórico enviado ao RD Station");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar ao RD");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="relative overflow-hidden border-border bg-card p-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 rounded-none border-b border-navy-deep bg-navy-deep px-6 py-4 text-white">
        <CardTitle className="font-display text-lg tracking-wide text-white">
          Pós-ligação · Histórico para o RD
        </CardTitle>
        <span className="text-[10px] font-medium tracking-[0.24em] text-gold uppercase">
          Etapa 2
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <PromptEditor
          label="Prompt de histórico"
          value={promptText}
          onChange={onPromptChange}
          onReset={() => onPromptChange(DEFAULT_HISTORY_PROMPT)}
        />

        <div>
          <div className="flex items-center justify-between gap-2">
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
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={10}
            placeholder="Cole aqui a transcrição da ligação (Ctrl+V) — copie do Attention/RD e cole direto. Ou use 'Puxar do RD', 'Carregar áudio' ou 'Gravar' para preencher automaticamente."
            className="mt-1 text-sm"
          />
          {transcribing && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Transcrevendo áudio…
            </p>
          )}
        </div>

        <Button onClick={handleGenerate} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
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
              <Button size="sm" variant="ghost" onClick={copyHistorico}>
                <Copy className="mr-1 h-3 w-3" />
                Copiar
              </Button>
            </div>
            <CollapsibleContent className="border-t px-3 pb-3 pt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {historico}
              </pre>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setHistoricoOpen(false)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:underline"
                >
                  <span>▲</span>
                  <span>Recolher histórico</span>
                </button>
                <Button size="sm" variant="ghost" onClick={copyHistorico}>
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}


        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor="deal-id" className="text-xs">
            Enviar ao RD Station CRM
          </Label>
          <div className="flex gap-2">
            <Input
              id="deal-id"
              placeholder="ID ou link do negócio (crm.rdstation.com/deals/…)"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
            />
            <Button
              onClick={handleSendRd}
              disabled={sending || !historico}
              variant="secondary"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-1 h-4 w-4" />
                  Enviar
                </>
              )}
            </Button>
          </div>
          {!historico && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              ⚠ Clique em <strong>Gerar histórico</strong> primeiro — o botão Enviar só ativa depois que o texto for gerado.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Cria uma nota no negócio via API do RD CRM. O ID fica salvo neste navegador.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

```

## `src/lib/prompts-store.ts`

```tsx
const KEY = "prospeccao-prompts-v6";

export const DEFAULT_SCRIPT_PROMPT = `PROMPT DE COMANDO: COPILOTO DE INTELIGÊNCIA COMERCIAL (EVERTON V.1)

Atue estritamente como o Copiloto de Inteligência Comercial da BHM Advogados para o consultor Everton Pereira. Seu único objetivo é realizar a Customização Cirúrgica dos leads fornecidos dentro da estrutura de scripts abaixo.

O texto DEVE soar como uma conversa de telefone e e-mails reais no Brasil: direto, pragmático, com pausas naturais, sem parecer um texto lido ou formal demais.

🛑 REGRAS DE OURO COMPORTAMENTAIS (PROIBIDO VIOLAR)

LINGUAGEM FALADA E SEM JARGÕES DE IA:
Elimine termos artificiais como "prezado", "de profissional para profissional", "mapeamos cirurgicamente". Use a linguagem do chão de fábrica e da controladoria brasileira. Ajuste artigos, preposições e concordâncias dentro das tags [ ] para que a leitura seja fluida e natural.

ANTÍDOTO CONTRA MARCAS DE IA:
É proibido usar introduções robóticas (ex: "Aqui está o seu script customizado:"), comentários sobre o que foi alterado ou perguntas de fechamento feitas pela IA no fim da resposta. Entregue direto os blocos limpos, prontos para copiar e colar.

INFERÊNCIA INTELIGENTE POR SEGMENTO:
Se o input de dados vier sem o insumo ou segmento técnico, deduza automaticamente usando a tabela abaixo:

Alimentos -> [Segmento/Matéria-prima]: Alimentos | [Exemplos de Insumos Intermediários]: fluidos hidráulicos protetivos, amônia e esteiras de lavagem | [Segmento de Benchmark]: indústria de laticínios

Têxtil -> [Segmento/Matéria-prima]: Têxtil | [Exemplos de Insumos Intermediários]: agulhas de tecelagem, corantes e óleos de tear | [Segmento de Benchmark]: fiação e tecelagem

Metalúrgica -> [Segmento/Matéria-prima]: Metalurgia | [Exemplos de Insumos Intermediários]: eletrodos, discos de corte e rebolos de desbaste | [Segmento de Benchmark]: estamparia de metais

Celulose e Papel -> [Segmento/Matéria-prima]: Celulose e Papel | [Exemplos de Insumos Intermediários]: facas de picador, telas formadoras e feltros de prensa | [Segmento de Benchmark]: fabricante de papel embalagem

Se a Cidade/Estado não constar no input, use o termo natural "aí na região".

📅 LÓGICA TEMPORAL DA AGENDA

Leia obrigatoriamente a informação contida na tag <dia_da_semana_atual> para ajustar os gatilhos de data:

Se for Segunda ou Terça-feira: use o gatilho "essa semana ainda" e defina [Dia 1], [Dia 2] e [Dia 3] como os próximos 3 dias úteis da semana atual.

Se for Quarta, Quinta ou Sexta-feira: use o gatilho "na próxima semana" e defina [Dia 1] como Terça-feira, [Dia 2] como Quarta-feira e [Dia 3] como Quinta-feira da semana seguinte.

📞 MODELO 1: PITCH FISCAL DIRETO (COLD CALL)

[APRESENTAÇÃO]

EVERTON: "[Nome do Lead], tudo bem? É o Everton aqui da BHM Advogados. Deixa eu ir direto ao ponto para não tomar seu tempo. A gente está em contato com o pessoal de controladoria e fiscal das indústrias de [Segmento/Matéria-prima] aí de [Cidade/Estado] por causa de um ponto bem específico: créditos de ICMS e IPI sobre os insumos intermediários."

EVERTON: "Hoje a escrita fiscal de vocês fica centralizada aí na fábrica de [Cidade] mesmo?" (Aguardar resposta)

EVERTON: "Legal. [Nome do Lead] seguinte o que acontece na maioria das indústrias de [Segmento/Matéria-prima] é que itens que gastam na produção, tipo [Exemplos de Insumos Intermediários], são classificados como bens de uso e consumo e nessa classificação a empresa não toma crédito ela acaba perdendo, passa batido mesmo. Pelo porte da empresa imagino que vocês tem um jurídico, fiscal contábil interno certo?

EVERTON: Entendo [Nome do Lead, só que assim, em 90% das indústrias do segmento de vocês o ERP do fiscal tá rodando perfeito, e é exatamente por isso que eu te garanto que tem oportunidade na operação de vocês.

(Pausa de 2 segundos. Deixe o silêncio trabalhar. Ele vai processar ou perguntar "Como assim?").

EVERTON: "[Nome do Lead] O sistema que rodam nas empresas é programado para ser seguro. Ele puxa as notas de manutenção, partes e peças e joga as vezes tudo automaticamente para 'Uso e Consumo' como te falei. Só que o ERP não desce até o chão de fábrica para ver o desgaste real do item no processo produtivo dentro da operação da empresa. As vezes o que deveria ser classificado como produto intermediário que daria crédito vira despesa, e o SPED vai lá e ainda consolida essa perda.

Esse é um detalhe operacional que passa batido porque exige um cruzamento técnico e manual também, o time fiscal não tem tempo de fazer essa revisão e mapear a realidade do chão de fábrica, desce lá e ver o que de fato está acontecendo.

[SUA REGIÃO / CONVITE]

EVERTON: "[Nome do Lead], seguinte: como eu tenho uma apresentação agendada com 4 empresas do setor aí em [Cidade/Estado] [essa semana / na próxima semana], queria aproveitar para te mostrar como a gente resolve esse problema. Eu compartilho a tela do computador e te mostro na prática um caso real de uma [Segmento de Benchmark] semelhante a de vocês como a gente identifica a oportunidade com nossos sistema. Você consegue receber a gente aí na fábrica presencialmente?"

[ACEITOU A REUNIÃO PRESENCIAL]

EVERTON: "Excelente, [Nome do Lead]! Mas olha só, para garantirmos que essa visita presencial seja rápida e vá direto ao ponto, nós adotamos um processo padrão de fazer um alinhamento prévio de apenas 10 minutos online. Assim já entendemos a sua estrutura e nossa conversa presencial ganha foco. Fica bom para você organizarmos dessa forma?"

[NEGOU A REUNIÃO PRESENCIAL]

EVERTON: "E se fizermos um formato mais rápido? Uma conversa online de 10 minutinhos. Eu abro a minha tela do computador e te mostro na prática um caso real conforme tinha te falado de uma [Segmento de Benchmark] semelhante, mostro todas as falhas que identificamos e como resolvemos. Assim você avalia se vale a pena para a sua operação, assim vocês não precisa parar o seu dia para uma visita. Fica melhor para você dessa forma?"

🛡️ QUEBRAS DE OBJEÇÕES CRÍTICAS

Posicionamento (Quebrando Objeções na Hora)

Se ele disser: "O nosso sistema já faz isso / Nossa auditoria já olha."

EVERTON: : "Com todo respeito, [Nome], o sistema só faz se alguém imputar a realidade física da máquina no cadastro. O ERP obedece ao input de compras. Se a peça desgasta no processo, o sistema não sabe, ele segue o padrão de Uso e Consumo da nota. É exatamente essa divergência entre o software a o chão de fábrica que a gente está tendo êxito e identificando uma lacuna nas operações de empresas no seu setor. Nenhuma auditoria tradicional desce na linha de produção para checar ciclo de vida de insumo."

Se ele disser: "Me manda um e-mail com a proposta."

Você: "Eu não tenho uma proposta padrão para te mandar porque o volume de recuperação depende do seu maquinário e do volume de compras. O e-mail vai virar só mais um PDF na sua caixa de entrada lotada. Vamos fazer o seguinte: Eu te envio um link com senha e acesso de um programa nosso pra você entender como trabalhamos, você acesso nossos sistema e anexa uma EFD ICMS/IPI de qualquer mês, ali vai gerar um documento com todas as oportunidades que sua empresa está perdendo e tudo que pode ser classificado como intermediário. Se for bom você me avisa e agendamos uma conversa online pode ser assim?"

✉️ SCENARIO A: LIGOU, NÃO FALOU COM O LEAD (FOCO EM AGENDAR VISITA)

Para: [E-mail do Lead 1]

Assunto: Visita técnica / ERP vs Chão de fábrica na [Nome da Empresa]

Olá, [Nome do Lead], tudo bem?

Tentei te dar um toque no telefone agora há pouco, mas imagino que a rotina aí na fábrica esteja corrida. Para ser direto e respeitar seu tempo:

Estou organizando uma agenda de visitas presenciais com algumas indústrias do setor de [Segmento/Matéria-prima] aí na região de [Cidade/Estado] para [essa semana ainda / na próxima semana]. O motivo é um ponto cego comum que o time fiscal raramente tem tempo de mapear: os créditos acumulados de ICMS e IPI sobre insumos intermediários e materiais de desgaste (como [Exemplos de Insumos Intermediários]).

O cenário em 90% das indústrias é o mesmo: o ERP roda redondo, mas ele é programado para ser seguro e classifica automaticamente essas peças como "Uso e Consumo", bloqueando o crédito. Só que o sistema não desce até o chão de fábrica para ver o desgaste real do item no processo produtivo dentro da operação de vocês. Como estarei aí na região realizando algumas visitas, queria te propor um alinhamento rápido de 10 minutos online na tela do computador. Te mostro o layout do cruzamento que aplicamos em uma [Segmento de Benchmark] semelhante e, se fizer sentido para a sua operação, já travamos o horário da nossa visita presencial aí na fábrica.

Separei três opções rápidas na agenda para esse alinhamento online:

[Dia 1] às 14h30

[Dia 2] às 10h30

[Dia 3] às 15h00

Abraço,

Everton Pereira | BHM Advogados

✉️ SCENARIO B: FALOU COM O LEAD NA LIGAÇÃO (E-MAIL DE FECHAMENTO / PRÓXIMO PASSO)

Para: [E-mail do Lead 1]

Assunto: Conforme combinamos / Alinhamento para visita na [Nome da Empresa]

Olá, [Nome do Lead], tudo bem?

Conforme conversamos rapidamente agora há pouco pelo telefone, segue o resumo direto do que combinamos para facilitar:

O foco principal é validarmos a oportunidade de créditos acumulados sobre insumos intermediários e materiais de desgaste (como [Exemplos de Insumos Intermediários]) que o seu ERP joga para "Uso e Consumo" por padrão de fábrica. Como te disse, o software não enxerga a realidade do seu chão de fábrica, e o objetivo é auditar esse passado antes que a transição da Reforma Tributária trave esses saldos antigos.

Como combinamos de avançar para uma visita presencial aí na fábrica em [Cidade], adotamos um processo padrão: fazemos esse alinhamento prévio de apenas 10 minutos online na tela. Eu te mostro o layout do cruzamento que rodamos naquela [Segmento de Benchmark] e assim nossa conversa presencial ganha foco, sem te fazer perder tempo com relatórios longos.

Como estou fechando a agenda de rotas para aí [essa semana ainda / na próxima semana], deixo abaixo os três horários que comentei para travarmos esse alinhamento online de 10 minutos:

[Dia 1] às 14h30

[Dia 2] às 10h30

[Dia 3] às 15h00

Me avise qual dessas janelas funciona melhor aí para você que já te envio o convite com o link da sala virtual para a sua agenda.

Abraço,

Everton Pereira | BHM Advogados`;

export const DEFAULT_HISTORY_PROMPT = `Instruções de Preenchimento para CRM (RD Station)

Você receberá a transcrição de uma ligação ou histórico de conversa com um lead. Seu único objetivo é extrair as informações e preencher o modelo de anotação abaixo, seguindo as regras à risca.

---

REGRAS DE PREENCHIMENTO

1. Foco no Contato Mais Relevante
Se a ligação passou por secretária ou portaria antes de chegar ao decisor, ignore o nome de quem atendeu primeiro no campo CONTATO. Registre apenas o nome e cargo da pessoa mais importante com quem houve conversa real. O atendimento inicial entra resumido no campo ANOTAÇÃO.

2. RESULTADO (marque apenas uma opção)
Escolha a opção que reflete exatamente o que aconteceu:
- Não atendeu: ninguém atendeu a ligação
- Caixa postal: caiu em caixa de voz
- Falou com portaria: conversa ficou retida na recepção, portaria ou secretária
- Falou com decisor: conseguiu falar diretamente com Diretor, CFO, Dono, Contador, Fiscal ou Controller

3. INTERESSE (temperatura real)
Seja honesto. Se o cliente foi frio, deu desculpas, demonstrou desinteresse ou desligou rápido, marque Baixo ou Nenhum. Não infle o interesse para parecer melhor do que foi.

4. OBJEÇÃO PRINCIPAL
Escreva em poucas palavras a principal desculpa ou objeção usada. Seja direto.
Exemplos: "Já tem assessoria", "Contabilidade interna não deixa", "Sem tempo", "Pediu e-mail para descartar", "Número errado".
Se não houve objeção, escreva: "Sem objeção registrada".

5. PRÓXIMA AÇÃO (calcule em dias úteis)
- Se ficou algo combinado na ligação (ex: ligar dia X às X horas), registre o combinado exato.
- Se nada foi combinado, calcule automaticamente um follow-up para 2 dias úteis após a data da ligação, ignorando sábados e domingos.

Referência de cálculo:
- Ligação na segunda: próxima ação na quarta
- Ligação na terça: próxima ação na quinta
- Ligação na quarta: próxima ação na sexta
- Ligação na quinta: próxima ação na segunda
- Ligação na sexta: próxima ação na terça

Formato obrigatório: Realizar novo follow-up de tentativa de contato em DD/MM/AAAA.

6. Fale SEMPRE no positivo — o que aconteceu, o que foi dito, o que avançou
Esta é a regra mais importante. A anotação serve para registrar o que ROLOU na ligação, não para listar o que NÃO rolou. Regras:
- NUNCA escreva frases como "Não informado", "Nenhum", "Não mencionado", "Não teve", "Sem informação", "Nenhuma informação captada", "Nada foi dito sobre X". Se o campo não foi mencionado na transcrição, simplesmente OMITA a linha inteira.
- Só inclua uma linha/bullet/campo quando houver conteúdo real vindo da transcrição.
- A exceção é o bloco "DADOS PARA COPIAR E COLAR" no final, onde os rótulos fixos (E-MAILS, TELEFONES, PESSOAS PARA PROCURAR, OUTROS DADOS ÚTEIS) precisam aparecer sempre. Nesses, se não houve nada, escreva apenas um traço: "—". Nada mais.
- Se puder deduzir pelo contexto (ex: "a dona me atendeu"), registre com "(deduzido pelo contexto)". Se não dá para deduzir, omita.
- Redija a ANOTAÇÃO na voz ativa, descrevendo o que foi feito e o que foi dito. Ex: "Everton falou com a Jennifer da recepção, que confirmou o nome do Vitor como responsável pela Controladoria e tentou transferir." — nunca "Não conseguiu falar com o Vitor porque o número estava ocupado" quando dá para dizer "Jennifer identificou o Vitor como decisor e ficou de retornar a transferência assim que a linha desocupar".

---

MODELO DE SAÍDA

Entregue APENAS este bloco preenchido, sem comentários adicionais. Omita qualquer linha cujo conteúdo seria "Nenhum", "Não informado" ou equivalente — exceto os quatro rótulos fixos da última seção, que devem aparecer com "—" quando vazios.

EMPRESA: [Nome da Empresa]

ANOTAÇÃO:
[Reconstrua a ligação em prosa corrida (sem bullets), em pelo menos 2 parágrafos densos, descrevendo O QUE ACONTECEU na conversa. Foco em ação e conteúdo positivo: quem falou, o que disse com as próprias palavras (parafraseado com fidelidade), o que foi confirmado, o que foi combinado, o que avançou. Se o interesse foi baixo ou surgiram objeções, registre com naturalidade dentro da narrativa — sem transformar a nota num inventário de ausências.

Inclua obrigatoriamente, quando houver na transcrição (se não houver, apenas pule — não diga que não houve):
- Como a ligação começou: quem atendeu primeiro, como se identificou, o que foi pedido, para quem pediu para transferir.
- Trajeto até o decisor: transferências, ramais, pessoas de passagem que forneceram informação útil (nomes, cargos, orientações).
- Conversa com o interlocutor principal: tom, o que disse, o que perguntou, como reagiu ao pitch.
- Pitch aplicado: até onde o Everton avançou no script e a reação a cada parte.
- Informações da empresa colhidas: setor, porte, contabilidade interna ou terceirizada, nome do escritório/contador, ERP, histórico de recuperação de crédito, filiais, faturamento, maquinário, insumos.
- Objeções que apareceram e como o Everton respondeu.
- Combinações concretas: reunião, envio de e-mail, próximo retorno, pessoa a procurar, melhor horário.
- Sinais de interesse ou desinteresse observados na conversa.
- Encerramento: como terminou, clima final.

O que não foi dito, não entra e não é mencionado.]

CONTATO: [Nome da pessoa mais importante com quem falou de fato — ignore recepção/portaria]

CARGO: [Cargo dessa pessoa]

OUTROS CONTATOS MENCIONADOS: [Nomes, cargos e ramais/telefones/e-mails de outras pessoas úteis citadas. Omita esta linha inteira se ninguém foi citado.]

DADOS DA EMPRESA CAPTADOS:
[Liste APENAS os itens que apareceram na transcrição, um por linha, com o rótulo do dado. Ex:
- Estrutura fiscal/contábil: contabilidade interna, responsável Vitor
- ERP mencionado: Sankhya
- Já fez recuperação de crédito antes: nunca fez
- Faturamento comentado: ~R$ 40mi/ano
Se nenhum item foi captado, OMITA a seção "DADOS DA EMPRESA CAPTADOS" inteira, incluindo o título.]

RESULTADO:
[ ] Não atendeu
[ ] Caixa postal
[ ] Falou com portaria
[ ] Falou com decisor

INTERESSE:
[ ] Alto
[ ] Médio
[ ] Baixo
[ ] Nenhum

OBJEÇÃO PRINCIPAL: [A objeção mais forte. Omita a linha se não houve objeção real.]

TODAS AS OBJEÇÕES LEVANTADAS: [Em sequência, separadas por ";". Omita a linha se não houve.]

COMPROMISSOS ASSUMIDOS PELO EVERTON: [O que o Everton se comprometeu a fazer. Omita a linha se não houve.]

COMPROMISSOS ASSUMIDOS PELO LEAD: [O que o lead se comprometeu a fazer. Omita a linha se não houve.]

PRÓXIMA AÇÃO: [Combinado exato ou follow-up calculado em 2 dias úteis: Realizar novo follow-up de tentativa de contato em DD/MM/AAAA.]

---

DADOS PARA COPIAR E COLAR (extraídos da ligação)

Estes quatro rótulos são FIXOS e sempre aparecem. Quando não houver conteúdo, escreva apenas "—" (um traço) na linha abaixo do rótulo. Nunca escreva "Nenhum e-mail informado", "Nenhum telefone novo informado" etc.

E-MAILS INFORMADOS NA LIGAÇÃO:
- [email@dominio.com.br] — [Nome] — [Cargo/Setor] — [Contexto]
(uma linha por e-mail; se vazio: —)

TELEFONES / RAMAIS INFORMADOS NA LIGAÇÃO:
- [(DDD) 9XXXX-XXXX ou ramal XXXX] — [Nome] — [Cargo/Setor] — [Primária/Secundária] — [Contexto]
(uma linha por número; Primária = fiscal/contabilidade/decisor; se vazio: —)

PESSOAS PARA PROCURAR NO PRÓXIMO CONTATO:
- [Nome] — [Cargo] — [Como falar: ramal, horário, canal] — [Motivo]
(uma linha por pessoa; se vazio: —)

OUTROS DADOS ÚTEIS MENCIONADOS (site, WhatsApp corporativo, LinkedIn, endereço de filial, escritório de contabilidade externo):
- [Tipo]: [Valor] — [Contexto]
(uma linha por item; se vazio: —)

Marque a opção escolhida trocando [ ] por [x]. Não inclua comentários fora do bloco.`;

export type Prompts = {
  script: string;
  history: string;
};

export function loadPrompts(): Prompts {
  if (typeof window === "undefined") {
    return { script: DEFAULT_SCRIPT_PROMPT, history: DEFAULT_HISTORY_PROMPT };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { script: DEFAULT_SCRIPT_PROMPT, history: DEFAULT_HISTORY_PROMPT };
    const p = JSON.parse(raw) as Partial<Prompts>;
    return {
      script: p.script || DEFAULT_SCRIPT_PROMPT,
      history: p.history || DEFAULT_HISTORY_PROMPT,
    };
  } catch {
    return { script: DEFAULT_SCRIPT_PROMPT, history: DEFAULT_HISTORY_PROMPT };
  }
}

export function savePrompts(p: Prompts) {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(p));
  }
}

```

## `src/lib/prospeccao.functions.ts`

```tsx
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Envie um arquivo de áudio");
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Arquivo de áudio vazio");
    if (file.size > 24 * 1024 * 1024) throw new Error("Áudio maior que 24MB — divida em partes menores");
    return data;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const file = data.get("file") as File;
    const mime = (file.type || "").split(";")[0];
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/m4a": "m4a",
      "audio/x-m4a": "m4a",
      "audio/flac": "flac",
    };
    const nameFromClient = file.name || "";
    const guessedExt = extMap[mime] ?? nameFromClient.split(".").pop() ?? "webm";
    const filename = /\.[a-z0-9]+$/i.test(nameFromClient) ? nameFromClient : `audio.${guessedExt}`;

    const upstream = new FormData();
    upstream.append("model", "openai/gpt-4o-mini-transcribe");
    upstream.append("file", file, filename);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.");
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      throw new Error(`Falha na transcrição (${res.status}): ${bodyText.slice(0, 200)}`);
    }
    let parsed: { text?: string } = {};
    try {
      parsed = JSON.parse(bodyText) as { text?: string };
    } catch {
      throw new Error("Resposta inválida do serviço de transcrição");
    }
    const text = (parsed.text ?? "").trim();
    if (!text) throw new Error("Não foi possível transcrever (áudio silencioso ou inaudível)");
    return { text };
  });

const GenerateInput = z.object({
  systemPrompt: z.string().min(1),
  userContent: z.string().min(1),
});

export const generateWithAI = createServerFn({ method: "POST" })
  .validator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: data.systemPrompt,
        prompt: data.userContent,
      });
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.");
      throw new Error(`Falha na IA: ${msg}`);
    }
  });

const CnpjInput = z.object({
  cnpj: z.string().transform((v) => v.replace(/\D/g, "")),
});

export const lookupCnpj = createServerFn({ method: "POST" })
  .validator((input: unknown) => CnpjInput.parse(input))
  .handler(async ({ data }) => {
    if (data.cnpj.length !== 14) {
      throw new Error("CNPJ deve ter 14 dígitos");
    }
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ProspeccaoB2B/1.0)",
      },
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error("CNPJ não encontrado");
      if (res.status === 403 || res.status === 429)
        throw new Error("BrasilAPI bloqueou a requisição (limite/anti-bot). Tente novamente em alguns segundos.");
      throw new Error(`BrasilAPI erro ${res.status}`);
    }
    const j = (await res.json()) as {
      cnpj?: string;
      razao_social?: string;
      nome_fantasia?: string;
      cnae_fiscal?: number;
      cnae_fiscal_descricao?: string;
      cnaes_secundarios?: Array<{ codigo?: number; descricao?: string }>;
      natureza_juridica?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      municipio?: string;
      uf?: string;
      cep?: string;
      ddd_telefone_1?: string;
      ddd_telefone_2?: string;
      email?: string;
      capital_social?: number;
      porte?: string;
      opcao_pelo_simples?: boolean;
      data_opcao_pelo_simples?: string | null;
      opcao_pelo_mei?: boolean;
      data_opcao_pelo_mei?: string | null;
      descricao_situacao_cadastral?: string;
      data_situacao_cadastral?: string;
      motivo_situacao_cadastral?: number;
      data_inicio_atividade?: string;
      descricao_identificador_matriz_filial?: string;
      descricao_tipo_de_logradouro?: string;
      ente_federativo_responsavel?: string;
      qsa?: Array<{
        nome_socio?: string;
        qualificacao_socio?: string;
        data_entrada_sociedade?: string;
        faixa_etaria?: string;
        pais?: string;
      }>;
    };

    const fmtCnpj = (v?: string) =>
      v && v.length === 14
        ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`
        : v ?? "";
    const fmtMoney = (v?: number) =>
      typeof v === "number"
        ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";
    const fmtDate = (v?: string | null) => {
      if (!v) return "";
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      return d.toLocaleDateString("pt-BR");
    };

    const endereco = [
      [
        [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
        j.numero,
      ]
        .filter(Boolean)
        .join(", "),
      j.complemento,
      j.bairro,
      [j.municipio, j.uf].filter(Boolean).join("/"),
      j.cep,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      cnpj: fmtCnpj(j.cnpj) || fmtCnpj(data.cnpj),
      razaoSocial: j.razao_social ?? "",
      nomeFantasia: j.nome_fantasia ?? "",
      matrizFilial: j.descricao_identificador_matriz_filial ?? "",
      situacao: j.descricao_situacao_cadastral ?? "",
      dataSituacao: fmtDate(j.data_situacao_cadastral),
      dataAbertura: fmtDate(j.data_inicio_atividade),
      naturezaJuridica: j.natureza_juridica ?? "",
      cnaePrincipal: j.cnae_fiscal
        ? `${j.cnae_fiscal} - ${j.cnae_fiscal_descricao ?? ""}`.trim()
        : j.cnae_fiscal_descricao ?? "",
      cnaesSecundarios: (j.cnaes_secundarios ?? [])
        .filter((c) => c && (c.codigo || c.descricao))
        .map((c) => `${c.codigo ?? ""} - ${c.descricao ?? ""}`.trim()),
      endereco,
      telefone1: j.ddd_telefone_1 ?? "",
      telefone2: j.ddd_telefone_2 ?? "",
      email: j.email ?? "",
      porte: j.porte ?? "",
      capitalSocial: fmtMoney(j.capital_social),
      simples: !!j.opcao_pelo_simples,
      dataSimples: fmtDate(j.data_opcao_pelo_simples),
      mei: !!j.opcao_pelo_mei,
      dataMei: fmtDate(j.data_opcao_pelo_mei),
      enteFederativo: j.ente_federativo_responsavel ?? "",
      socios: (j.qsa ?? []).map((s) => ({
        nome: s.nome_socio ?? "",
        qualificacao: s.qualificacao_socio ?? "",
        dataEntrada: fmtDate(s.data_entrada_sociedade),
        faixaEtaria: s.faixa_etaria ?? "",
        pais: s.pais ?? "",
      })),
    };
  });

const NameInput = z.object({
  nome: z.string().trim().min(3, "Digite ao menos 3 caracteres"),
});

export const searchCompanyByName = createServerFn({ method: "POST" })
  .validator((input: unknown) => NameInput.parse(input))
  .handler(async ({ data }) => {
    const term = data.nome.trim();
    const digits = term.replace(/\D/g, "");
    if (digits.length === 14) {
      // Se o usuário colou um CNPJ no campo de nome, deixa o front chamar lookupCnpj direto.
      return { itens: [], dica: "cnpj" as const };
    }

    const apiKey = process.env.CNPJA_API_KEY;
    if (!apiKey) throw new Error("CNPJA_API_KEY não configurada");

    // CNPJá — busca em razão social + nome fantasia via filtro names.in
    // Docs: /office aceita `names.in` para full-text nos dois campos.
    const url = new URL("https://api.cnpja.com/office");
    url.searchParams.set("names.in", term);
    url.searchParams.set("limit", "25");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("CNPJá: chave inválida ou sem permissão");
      if (res.status === 429)
        throw new Error("CNPJá: limite de requisições atingido. Aguarde alguns segundos.");
      if (res.status === 404) return { itens: [], dica: null };
      const body = await res.text();
      throw new Error(`CNPJá falhou (${res.status}): ${body.slice(0, 200)}`);
    }

    const j = (await res.json()) as {
      records?: Array<{
        taxId?: string;
        alias?: string | null;
        head?: boolean;
        status?: { text?: string };
        company?: { name?: string };
        address?: { city?: string; state?: string };
        mainActivity?: { id?: number; text?: string };
      }>;
    };

    const itens = (j.records ?? [])
      .map((r) => {
        const cnpj = (r.taxId ?? "").replace(/\D/g, "");
        const cidadeUf = [r.address?.city, r.address?.state].filter(Boolean).join("/");
        return {
          cnpj,
          cnpjFormatado:
            cnpj.length === 14
              ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
              : cnpj,
          razaoSocial: r.company?.name ?? "",
          nomeFantasia: r.alias ?? "",
          tipo: r.head === true ? "Matriz" : r.head === false ? "Filial" : "",
          situacao: r.status?.text ?? "",
          cidadeUf,
          atividade: r.mainActivity
            ? `${r.mainActivity.id ?? ""} - ${r.mainActivity.text ?? ""}`.trim()
            : "",
        };
      })
      .filter((x) => x.cnpj.length === 14);

    return { itens, dica: null };
  });

const RdNoteInput = z.object({
  dealId: z.string().trim().min(1, "Informe o ID do negócio"),
  text: z.string().trim().min(1, "Histórico vazio"),
});

export const sendRdStationNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => RdNoteInput.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");

    const url = `https://crm.rdstation.com/api/v1/deals/${encodeURIComponent(
      data.dealId,
    )}/notes?token=${encodeURIComponent(token)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: data.text }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("Token do RD Station inválido ou sem permissão");
      if (res.status === 404) throw new Error("Negócio não encontrado no RD Station");
      throw new Error(`RD Station erro ${res.status}: ${bodyText.slice(0, 200)}`);
    }

    let parsed: { id?: string } = {};
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as { id?: string }) : {};
    } catch {
      /* ignore non-JSON body */
    }
    return { ok: true as const, noteId: parsed.id ?? null };
  });

const RdFetchInput = z.object({
  dealId: z.string().trim().min(1, "Informe o ID do negócio"),
});

export const fetchRdStationDeal = createServerFn({ method: "POST" })
  .validator((input: unknown) => RdFetchInput.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");

    const t = encodeURIComponent(token);
    const dealId = encodeURIComponent(data.dealId);

    async function get(url: string, allow404 = false) {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const body = await r.text();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403)
          throw new Error("Token do RD Station inválido ou sem permissão");
        if (r.status === 404) {
          if (allow404) return null;
          throw new Error("Negócio não encontrado no RD Station");
        }
        throw new Error(`RD Station erro ${r.status}: ${body.slice(0, 200)}`);
      }
      try {
        return body ? JSON.parse(body) : {};
      } catch {
        return {};
      }
    }

    const fmtDate = (v?: string) => {
      if (!v) return "";
      const d = new Date(v);
      return isNaN(d.getTime())
        ? v
        : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    };

    const deal = (await get(
      `https://crm.rdstation.com/api/v1/deals/${dealId}?token=${t}`,
      true,
    )) as {
      name?: string;
      contacts?: Array<{ name?: string; emails?: Array<{ email?: string }>; phones?: Array<{ phone?: string }> }>;
      organization?: { name?: string };
      deal_stage?: { name?: string };
    } | null;

    if (!deal) {
      return {
        texto: "",
        totalNotas: 0,
        totalAtividades: 0,
        notFound: true as const,
      };
    }

    const notas = (await get(
      `https://crm.rdstation.com/api/v1/deals/${dealId}/notes?token=${t}`,
      true,
    )) as
      | { notes?: Array<{ text?: string; created_at?: string; user?: { name?: string } }> }
      | Array<{ text?: string; created_at?: string; user?: { name?: string } }>
      | null;
    const notesArr = notas
      ? Array.isArray(notas)
        ? notas
        : notas.notes ?? []
      : [];

    let activities: Array<{ text?: string; type?: string; created_at?: string; subject?: string; description?: string; user?: { name?: string } }> = [];
    try {
      const act = (await get(
        `https://crm.rdstation.com/api/v1/activities?token=${t}&deal_id=${dealId}`,
        true,
      )) as { activities?: typeof activities } | typeof activities | null;
      activities = act ? (Array.isArray(act) ? act : act.activities ?? []) : [];
    } catch {
      /* activities endpoint pode não estar disponível — segue com notas */
    }

    const linhas: string[] = [];
    if (deal.name) linhas.push(`Negócio: ${deal.name}`);
    if (deal.organization?.name) linhas.push(`Empresa: ${deal.organization.name}`);
    if (deal.deal_stage?.name) linhas.push(`Etapa: ${deal.deal_stage.name}`);
    const contatos = (deal.contacts ?? [])
      .map((c) => {
        const email = c.emails?.[0]?.email;
        const fone = c.phones?.[0]?.phone;
        return [c.name, email, fone].filter(Boolean).join(" · ");
      })
      .filter(Boolean);
    if (contatos.length) linhas.push(`Contatos: ${contatos.join(" | ")}`);

    // Notas de bots/resumidores automáticos que devem ser IGNORADAS
    function isBotSummary(texto: string): boolean {
      if (/\[ATA\b/i.test(texto)) return true;
      if (/\bJARVIS\b/i.test(texto)) return true;
      if (/ATA\s+AUTOMATICA/i.test(texto)) return true;
      return false;
    }

    // Transcrição do Attention (formato específico) — prioridade máxima
    function isAttentionTranscricao(texto: string): boolean {
      if (isBotSummary(texto)) return false;
      if (/resumo\s+e\s+transcri[cç][aã]o\s+d[ao]\s+liga/i.test(texto)) return true;
      if (/\bconversa\s+com\s+.+\s+n[uú]mero\s*\d/i.test(texto)) return true;
      return false;
    }

    // Qualquer outra coisa que pareça transcrição (fallback)
    function isTranscricaoGenerica(texto: string): boolean {
      if (!texto || isBotSummary(texto)) return false;
      if (/\btranscri[cç][aã]o\b/i.test(texto) && /\bresumo\b/i.test(texto)) return true;
      const stamps = texto.match(/\b\d{1,2}:\d{2}\b/g);
      if (stamps && stamps.length >= 3) return true;
      return false;
    }

    type Item = { texto: string; created_at?: string; user?: { name?: string }; origem: "nota" | "atividade" };
    const itens: Item[] = [
      ...notesArr.map((n) => ({
        texto: n.text ?? "",
        created_at: n.created_at,
        user: n.user,
        origem: "nota" as const,
      })),
      ...activities.map((a) => ({
        texto: a.description || a.subject || a.text || "",
        created_at: a.created_at,
        user: a.user,
        origem: "atividade" as const,
      })),
    ].filter((i) => i.texto);

    const sortRecent = (a: Item, b: Item) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    };

    // Prioridade: Attention primeiro; se não achar, cai pra genérico
    const attention = itens.filter((i) => isAttentionTranscricao(i.texto)).sort(sortRecent);
    const genericas = itens.filter((i) => isTranscricaoGenerica(i.texto)).sort(sortRecent);
    const transcricoes = attention.length ? attention : genericas;

    let ultimaTranscricao: Item | null = null;
    if (transcricoes.length) {
      ultimaTranscricao = transcricoes[0];
      const quem = ultimaTranscricao.user?.name ? ` (${ultimaTranscricao.user.name})` : "";
      const quando = ultimaTranscricao.created_at ? ` [${fmtDate(ultimaTranscricao.created_at)}]` : "";
      linhas.push("", `═══ Última transcrição${quem}${quando} ═══`, ultimaTranscricao.texto.trim(), "═══════════════════════");
    }

    // Filtra as outras notas/atividades, excluindo a transcrição já destacada
    // e removendo ATAs/resumos automáticos (Jarvis), porque isso não é a descrição/transcrição real da ligação.
    const jaMostrado = new Set<string>();
    if (ultimaTranscricao) jaMostrado.add(ultimaTranscricao.texto);
    let temConteudoUtil = Boolean(ultimaTranscricao);

    const deveMostrarComoContexto = (texto: string) =>
      Boolean(texto.trim()) && !jaMostrado.has(texto) && !isBotSummary(texto);

    if (activities.length) {
      const restantes = activities
        .filter((a) => {
          const texto = a.description || a.subject || a.text || "";
          return deveMostrarComoContexto(texto);
        })
        .slice(0, 10);
      if (restantes.length) {
        temConteudoUtil = true;
        linhas.push("", "Atividades recentes:");
        for (const a of restantes) {
          const quem = a.user?.name ? ` (${a.user.name})` : "";
          const quando = a.created_at ? ` [${fmtDate(a.created_at)}]` : "";
          const tipo = a.type ? `${a.type}: ` : "";
          const texto = a.description || a.subject || a.text || "";
          linhas.push(`- ${tipo}${texto}${quem}${quando}`);
        }
      }
    }

    if (notesArr.length) {
      const restantes = notesArr
        .filter((n) => n.text && deveMostrarComoContexto(n.text))
        .slice(0, 10);
      if (restantes.length) {
        temConteudoUtil = true;
        linhas.push("", "Notas recentes:");
        for (const n of restantes) {
          const quem = n.user?.name ? ` (${n.user.name})` : "";
          const quando = n.created_at ? ` [${fmtDate(n.created_at)}]` : "";
          linhas.push(`- ${n.text}${quem}${quando}`);
        }
      }
    }

    const texto = temConteudoUtil ? linhas.join("\n").trim() : "";
    return {
      texto,
      totalNotas: notesArr.length,
      totalAtividades: activities.length,
      totalTranscricoes: transcricoes.length,
    };
  });

// ============================================================
// enrichPhones — junta telefones de BrasilAPI + cnpja.com + cnpj.biz + site oficial
// ============================================================

const EnrichPhonesInput = z.object({
  cnpj: z.string().transform((v) => v.replace(/\D/g, "")),
});

type Fonte = "BrasilAPI" | "CNPJá" | "CNPJ.biz" | "Site oficial";
type TelefoneAchado = {
  numero: string; // formatado (XX) XXXX-XXXX ou (XX) 9XXXX-XXXX
  digits: string; // só dígitos (para dedupe)
  setor: string | null;
  prioridade: number;
  fontes: Fonte[];
};

// DDDs válidos no Brasil
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function formatFone(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return null;
  const rest = d.slice(2);
  if (rest.length === 10) {
    // 9XXXX-XXXX
    return `(${d.slice(0, 2)}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  // XXXX-XXXX
  return `(${d.slice(0, 2)}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

// Detecta setor a partir do contexto (150 chars ao redor do match)
function detectSetor(contexto: string): { setor: string | null; prioridade: number } {
  const t = contexto.toLowerCase();
  // ordem = prioridade (menor número = maior prioridade)
  const regras: Array<[RegExp, string, number]> = [
    [/\bfiscal\b/, "Fiscal", 1],
    [/contab|contad/, "Contabilidade", 1],
    [/tribut/, "Tributário", 1],
    [/financ/, "Financeiro", 2],
    [/\b(diretor|ceo|s[oó]cio|presiden|gerente)\b/, "Direção", 3],
    [/comerc|vendas|atendiment|sac/, "Comercial", 4],
    [/rh\b|recursos\s+humanos|departamento\s+pessoal|dp\b/, "RH/DP", 5],
    [/whatsapp|whats\b/, "WhatsApp", 6],
    [/celular|m[oó]vel/, "Celular", 6],
    [/fixo|telefone/, "Fixo", 7],
  ];
  for (const [re, nome, p] of regras) {
    if (re.test(t)) return { setor: nome, prioridade: p };
  }
  return { setor: null, prioridade: 8 };
}

// Extrai telefones de um texto qualquer, retorna com contexto
function extractPhonesFromText(text: string): Array<{ digits: string; contexto: string }> {
  if (!text) return [];
  const found: Array<{ digits: string; contexto: string }> = [];
  // Aceita: (11) 3456-7890, 11 34567890, +55 11 3456-7890, 11.3456.7890, etc.
  const re = /(?:\+?55\s*)?\(?(\d{2})\)?[\s\-.]{0,3}(9?\d{4})[\s\-.]{0,3}(\d{4})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) continue;
    const start = Math.max(0, m.index - 80);
    const end = Math.min(text.length, m.index + m[0].length + 80);
    const contexto = text.slice(start, end).replace(/\s+/g, " ");
    found.push({ digits, contexto });
  }
  return found;
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 1500,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { markdown?: string };
      markdown?: string;
    };
    return j.data?.markdown ?? j.markdown ?? null;
  } catch {
    return null;
  }
}

export const enrichPhones = createServerFn({ method: "POST" })
  .validator((input: unknown) => EnrichPhonesInput.parse(input))
  .handler(async ({ data }) => {
    const cnpj = data.cnpj;
    if (cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");

    const acumulador = new Map<string, TelefoneAchado>();
    const fontesUsadas: Fonte[] = [];
    const fontesFalhas: Array<{ fonte: Fonte; motivo: string }> = [];
    let siteOficial: string | null = null;

    function registrar(rawDigits: string, contexto: string, fonte: Fonte) {
      const numero = formatFone(rawDigits);
      if (!numero) return;
      const digits = rawDigits.replace(/\D/g, "");
      const { setor, prioridade } = detectSetor(contexto);
      const existente = acumulador.get(digits);
      if (existente) {
        if (!existente.fontes.includes(fonte)) existente.fontes.push(fonte);
        // se novo contexto trouxe setor melhor, atualiza
        if (setor && prioridade < existente.prioridade) {
          existente.setor = setor;
          existente.prioridade = prioridade;
        }
        return;
      }
      acumulador.set(digits, {
        numero,
        digits,
        setor,
        prioridade,
        fontes: [fonte],
      });
    }

    // ---- 1) BrasilAPI ----
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const j = (await r.json()) as { ddd_telefone_1?: string; ddd_telefone_2?: string };
        if (j.ddd_telefone_1) registrar(j.ddd_telefone_1, "telefone principal cadastrado na Receita", "BrasilAPI");
        if (j.ddd_telefone_2) registrar(j.ddd_telefone_2, "telefone secundário cadastrado na Receita", "BrasilAPI");
        fontesUsadas.push("BrasilAPI");
      } else {
        fontesFalhas.push({ fonte: "BrasilAPI", motivo: `HTTP ${r.status}` });
      }
    } catch (e) {
      fontesFalhas.push({ fonte: "BrasilAPI", motivo: e instanceof Error ? e.message : "erro" });
    }

    // ---- 2) CNPJá ----
    const cnpjaKey = process.env.CNPJA_API_KEY;
    if (cnpjaKey) {
      try {
        const r = await fetch(`https://api.cnpja.com/office/${cnpj}`, {
          headers: { Accept: "application/json", Authorization: cnpjaKey },
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const j = (await r.json()) as {
            phones?: Array<{ area?: string | number; number?: string; type?: string }>;
            emails?: Array<{ address?: string }>;
          };
          for (const p of j.phones ?? []) {
            const raw = `${p.area ?? ""}${p.number ?? ""}`.replace(/\D/g, "");
            const ctx = `${p.type ?? ""} cadastrado na Receita`;
            registrar(raw, ctx, "CNPJá");
          }
          // tenta derivar site a partir do domínio do e-mail
          if (!siteOficial) {
            for (const e of j.emails ?? []) {
              const dominio = e.address?.split("@")[1];
              if (
                dominio &&
                !/gmail|hotmail|outlook|yahoo|uol|bol|terra|live|icloud/i.test(dominio)
              ) {
                siteOficial = `https://${dominio}`;
                break;
              }
            }
          }
          fontesUsadas.push("CNPJá");
        } else {
          fontesFalhas.push({ fonte: "CNPJá", motivo: `HTTP ${r.status}` });
        }
      } catch (e) {
        fontesFalhas.push({ fonte: "CNPJá", motivo: e instanceof Error ? e.message : "erro" });
      }
    }

    // ---- 3) CNPJ.biz (via Firecrawl) ----
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
      const md = await firecrawlScrape(`https://cnpj.biz/${cnpj}`, firecrawlKey);
      if (md) {
        // tenta descobrir site oficial se ainda não temos
        if (!siteOficial) {
          const mSite = md.match(/https?:\/\/(?!cnpj\.biz|receita|brasilapi|whatsapp|wa\.me|facebook|instagram|linkedin|youtube|twitter|maps\.google|google\.com)([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/i);
          if (mSite) siteOficial = mSite[0];
        }
        for (const ph of extractPhonesFromText(md)) {
          registrar(ph.digits, ph.contexto, "CNPJ.biz");
        }
        fontesUsadas.push("CNPJ.biz");
      } else {
        fontesFalhas.push({ fonte: "CNPJ.biz", motivo: "sem resposta do Firecrawl" });
      }
    } else {
      fontesFalhas.push({ fonte: "CNPJ.biz", motivo: "FIRECRAWL_API_KEY não configurada" });
    }

    // ---- 4) Site oficial (via Firecrawl) ----
    if (siteOficial && firecrawlKey) {
      const urls: string[] = [siteOficial];
      // páginas comuns de contato
      const base = siteOficial.replace(/\/$/, "");
      urls.push(`${base}/contato`, `${base}/contact`, `${base}/fale-conosco`);
      let algumaOk = false;
      for (const u of urls) {
        const md = await firecrawlScrape(u, firecrawlKey);
        if (!md) continue;
        algumaOk = true;
        for (const ph of extractPhonesFromText(md)) {
          registrar(ph.digits, ph.contexto, "Site oficial");
        }
      }
      if (algumaOk) fontesUsadas.push("Site oficial");
      else fontesFalhas.push({ fonte: "Site oficial", motivo: `nenhuma página respondeu (${siteOficial})` });
    } else if (!siteOficial) {
      fontesFalhas.push({ fonte: "Site oficial", motivo: "site não identificado" });
    }

    // ordena: prioridade ↑, depois número de fontes ↓ (quanto mais fontes confirmarem, melhor)
    const telefones = Array.from(acumulador.values()).sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return b.fontes.length - a.fontes.length;
    });

    return {
      telefones: telefones.map((t) => ({
        numero: t.numero,
        setor: t.setor,
        fontes: t.fontes,
      })),
      siteOficial,
      fontesUsadas,
      fontesFalhas,
    };
  });


```

## `src/lib/ai-gateway.server.ts`

```tsx
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

```

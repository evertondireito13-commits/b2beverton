// Busca de empresas por linguagem natural ("ache metalúrgicas em Curitiba"),
// usando OpenStreetMap (Nominatim + Overpass) — 100% gratuito, SEM usar IA e
// SEM gastar créditos do Lovable. A extração de cidade/tipo é feita por
// reconhecimento de padrão de texto (regex), não por modelo de linguagem.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBhmGate } from "@/lib/bhm-gate";

const USER_AGENT = "PainelCentralDeProspeccao/1.0 (uso interno)";

export type EmpresaDescoberta = {
  nome: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  lat: number;
  lon: number;
};

/** Separa "TIPO em/na/no CIDADE" em duas partes usando regex simples (sem IA). */
export function interpretarConsulta(texto: string): { tipo: string; cidade: string } | null {
  const limpo = texto.trim();
  const m = limpo.match(/^(.*?)\s+(?:em|na|no|de)\s+([^,]+?)\s*$/i);
  if (!m) return null;
  const tipo = m[1].trim();
  const cidade = m[2].trim();
  if (!tipo || !cidade) return null;
  return { tipo, cidade };
}

/** Remove acentos, deixa minúsculo e tira um "s" final simples (singulariza). */
function normalizar(texto: string): string {
  const semAcento = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return semAcento.replace(/s$/, "");
}

/**
 * Dicionário: termo comum em português (já normalizado/singular) -> filtro(s)
 * de tag do OpenStreetMap. Isso é o que faltava: sem isso, a busca só
 * encontrava empresas cujo NOME continha a palavra digitada, o que quase
 * nunca acontece (uma metalúrgica raramente se chama "Metalúrgica" no mapa).
 */
const TIPO_TAGS: Record<string, string[]> = {
  metalurgica: ['["craft"="metal_construction"]', '["industrial"="metal"]'],
  serralheria: ['["craft"="metal_construction"]'],
  transportadora: ['["office"="logistics"]', '["amenity"="freight_terminal"]'],
  advocacia: ['["office"="lawyer"]'],
  escritoriodeadvocacia: ['["office"="lawyer"]'],
  contabilidade: ['["office"="accountant"]'],
  contador: ['["office"="accountant"]'],
  grafica: ['["shop"="printing"]', '["craft"="printer"]'],
  industria: ['["landuse"="industrial"]', '["building"="industrial"]'],
  fabrica: ['["landuse"="industrial"]', '["building"="industrial"]'],
  oficinamecanica: ['["shop"="car_repair"]'],
  oficina: ['["shop"="car_repair"]'],
  imobiliaria: ['["office"="estate_agent"]'],
  seguradora: ['["office"="insurance"]'],
  farmacia: ['["amenity"="pharmacy"]'],
  restaurante: ['["amenity"="restaurant"]'],
  hotel: ['["tourism"="hotel"]'],
  pousada: ['["tourism"="guest_house"]'],
  padaria: ['["shop"="bakery"]'],
  supermercado: ['["shop"="supermarket"]'],
  mercado: ['["shop"="supermarket"]', '["shop"="convenience"]'],
  postodegasolina: ['["amenity"="fuel"]'],
  posto: ['["amenity"="fuel"]'],
  clinica: ['["amenity"="clinic"]'],
  clinicamedica: ['["amenity"="clinic"]'],
  hospital: ['["amenity"="hospital"]'],
  escola: ['["amenity"="school"]'],
  academia: ['["leisure"="fitness_centre"]'],
  salaodebeleza: ['["shop"="hairdresser"]'],
  salao: ['["shop"="hairdresser"]'],
  lojaderoupas: ['["shop"="clothes"]'],
  materiaisdeconstrucao: ['["shop"="hardware"]', '["shop"="doityourself"]'],
  marcenaria: ['["craft"="carpenter"]'],
  eletricista: ['["craft"="electrician"]'],
  transportes: ['["office"="logistics"]'],
  logistica: ['["office"="logistics"]'],
  consultoria: ['["office"="consulting"]'],
  arquitetura: ['["office"="architect"]'],
  engenharia: ['["office"="engineer"]'],
  ti: ['["office"="it"]'],
  tecnologia: ['["office"="it"]'],
  software: ['["office"="it"]'],
};

function tagsParaTipo(tipo: string): string[] {
  const chave = normalizar(tipo).replace(/\s+/g, "");
  return TIPO_TAGS[chave] ?? [];
}

type Bbox = { south: number; north: number; west: number; east: number };

async function geocodarCidade(cidade: string): Promise<Bbox | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(cidade)}`;
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) return null;
  const arr = (await r.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const bb = arr[0]?.boundingbox;
  if (!bb) return null;
  const [south, north, west, east] = bb.map(Number);
  if ([south, north, west, east].some((n) => !Number.isFinite(n))) return null;
  return { south, north, west, east };
}

function firstTag(tags: Record<string, string> | undefined, ...keys: string[]): string | undefined {
  if (!tags) return undefined;
  for (const k of keys) {
    if (tags[k]) return tags[k];
  }
  return undefined;
}

function enderecoDe(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  const partes = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : undefined;
}

function elementoParaEmpresa(el: {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}): EmpresaDescoberta | null {
  const nome = el.tags?.name;
  if (!nome) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  return {
    nome,
    telefone: firstTag(el.tags, "contact:phone", "phone"),
    endereco: enderecoDe(el.tags),
    cidade: el.tags?.["addr:city"],
    lat,
    lon,
  };
}

async function rodarOverpass(query: string): Promise<
  Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>
> {
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
    body: query,
  });
  if (!r.ok) throw new Error(`Overpass respondeu ${r.status}`);
  const data = (await r.json()) as {
    elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
  };
  return data.elements ?? [];
}

async function buscarNoOverpass(tipo: string, bbox: Bbox, limite: number): Promise<EmpresaDescoberta[]> {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const limiteSeguro = Math.min(Math.max(limite, 1), 60);
  const tagsConhecidas = tagsParaTipo(tipo);

  // Termo pra busca por NOME: usa a forma singular (sem "s" final) pra achar
  // "Metalúrgica Fulano" mesmo quando o usuário digitou "metalúrgicas".
  const termoSingular = tipo.trim().replace(/s(\s|$)/i, "$1").trim();
  const termoEscapado = termoSingular.replace(/["\\]/g, "");

  const blocos: string[] = [];

  // 1) Busca pela TAG certa (quando conhecemos o tipo de negócio).
  for (const tag of tagsConhecidas) {
    blocos.push(`node${tag}(${bboxStr});`, `way${tag}(${bboxStr});`);
  }

  // 2) Busca por NOME (sempre roda, como rede de segurança — pega empresas
  //    que por acaso têm o termo no nome, mesmo sem tag mapeada).
  if (termoEscapado) {
    blocos.push(
      `node["name"~"${termoEscapado}",i](${bboxStr});`,
      `way["name"~"${termoEscapado}",i](${bboxStr});`,
    );
  }

  if (blocos.length === 0) return [];

  const query = `[out:json][timeout:25];(${blocos.join("")});out center ${limiteSeguro * 2};`;
  const elementos = await rodarOverpass(query);

  const vistos = new Set<string>();
  const resultados: EmpresaDescoberta[] = [];
  for (const el of elementos) {
    const empresa = elementoParaEmpresa(el);
    if (!empresa) continue;
    const chave = `${empresa.nome}|${empresa.lat.toFixed(5)}|${empresa.lon.toFixed(5)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultados.push(empresa);
    if (resultados.length >= limiteSeguro) break;
  }
  return resultados;
}

export const buscarEmpresasPorTexto = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) =>
    z
      .object({
        consulta: z.string().trim().min(3).max(200),
        limite: z.number().int().min(1).max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const partes = interpretarConsulta(data.consulta);
    if (!partes) {
      return {
        ok: false as const,
        erro:
          'Não consegui identificar a cidade. Tente escrever assim: "metalúrgicas em Curitiba" ou "transportadoras em Londrina".',
      };
    }
    const bbox = await geocodarCidade(partes.cidade);
    if (!bbox) {
      return {
        ok: false as const,
        erro: `Não encontrei a cidade "${partes.cidade}". Confira a grafia e tente de novo.`,
      };
    }
    try {
      const resultados = await buscarNoOverpass(partes.tipo, bbox, data.limite ?? 20);
      return {
        ok: true as const,
        tipo: partes.tipo,
        cidade: partes.cidade,
        resultados,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false as const,
        erro: `A busca no OpenStreetMap falhou (${msg}). Tente novamente em alguns segundos.`,
      };
    }
  });

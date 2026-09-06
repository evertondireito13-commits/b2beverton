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

async function buscarNoOverpass(tipo: string, bbox: Bbox, limite: number): Promise<EmpresaDescoberta[]> {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const termoEscapado = tipo.replace(/["\\]/g, "");
  const query = `[out:json][timeout:25];(
    node["name"~"${termoEscapado}",i](${bboxStr});
    way["name"~"${termoEscapado}",i](${bboxStr});
  );out center ${Math.min(Math.max(limite, 1), 60)};`;

  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
    body: query,
  });
  if (!r.ok) throw new Error(`Overpass respondeu ${r.status}`);
  const data = (await r.json()) as {
    elements: Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const resultados: EmpresaDescoberta[] = [];
  for (const el of data.elements ?? []) {
    const nome = el.tags?.name;
    if (!nome) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    resultados.push({
      nome,
      telefone: firstTag(el.tags, "contact:phone", "phone"),
      endereco: enderecoDe(el.tags),
      cidade: el.tags?.["addr:city"],
      lat,
      lon,
    });
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

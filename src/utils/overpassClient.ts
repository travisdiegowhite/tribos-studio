/**
 * overpassClient — one place to POST an Overpass QL query.
 *
 * Three public mirrors tried in order, a per-request timeout, and the
 * elements array (or a throw after the last mirror fails). Shared by the
 * route-corridor consumers (surface, traffic stress); the viewport overlays
 * (`bikeInfrastructureService`, `routePOIService`) keep their own loops
 * because they also manage abort controllers and grid caches.
 */

export const OVERPASS_SERVERS: ReadonlyArray<string> = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export interface OverpassNode {
  lat: number;
  lon: number;
}

export interface OverpassElement {
  type: string;
  id: number;
  geometry?: OverpassNode[];
  tags?: Record<string, string>;
}

export interface FetchOverpassOptions {
  timeoutMs?: number;
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * POST `query` to each mirror until one answers with JSON. Resolves to the
 * `elements` array (possibly empty). Rejects only when every mirror failed.
 */
export async function fetchOverpassElements(
  query: string,
  options: FetchOverpassOptions = {},
): Promise<OverpassElement[]> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError: unknown = null;

  for (const server of OVERPASS_SERVERS) {
    try {
      const resp = await fetchImpl(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) {
        console.warn(`Overpass API error from ${server}: ${resp.status}`);
        lastError = new Error(`Overpass ${resp.status}`);
        continue;
      }
      const data = (await resp.json()) as { elements?: unknown };
      return Array.isArray(data?.elements) ? (data.elements as OverpassElement[]) : [];
    } catch (err) {
      console.warn(`Overpass request to ${server} failed:`, (err as Error)?.message ?? err);
      lastError = err;
    }
  }
  throw lastError ?? new Error('Overpass unavailable');
}

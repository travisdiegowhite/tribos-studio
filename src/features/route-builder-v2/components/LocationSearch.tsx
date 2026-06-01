/**
 * LocationSearch — Route Builder 2.0 place search.
 *
 * A geocoding box surfaced behind the control rail's search icon. Type a
 * place / address, hit Enter (or the button), and the map flies there. The
 * generation form uses the map's viewport center as its start fallback, so
 * "search a place → generate" naturally starts the ride at that location.
 *
 * Single best-match via geocodeWaypoint (proximity-biased to the current
 * viewport center); not a multi-result list — that keeps the boundary small
 * and matches how the rest of RB2 resolves a start point.
 */

import { useCallback, useState } from 'react';
import { Box, Text, TextInput, UnstyledButton, Loader } from '@mantine/core';
import { MagnifyingGlass, MapPin } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { Coordinate } from '../../../types/geo';
import { geocodeWaypoint } from '../../../utils/geocoding.js';

export interface LocationSearchProps {
  /** Recenter the camera on the resolved coordinate. */
  onFlyTo: (coord: Coordinate, zoom?: number) => void;
  /** Proximity bias for geocoding (usually the current viewport center). */
  proximity?: Coordinate | null;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; name: string; coord: Coordinate }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export function LocationSearch({ onFlyTo, proximity = null }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setState({ status: 'searching' });
    trackRb2('location_search_submitted', { query_length: trimmed.length });
    try {
      const bias = proximity ? ([proximity[0], proximity[1]] as [number, number]) : null;
      const result = await (geocodeWaypoint as (
        name: string,
        proximity: [number, number] | null,
      ) => Promise<{ coordinates: [number, number]; name: string } | null>)(trimmed, bias);
      if (result?.coordinates) {
        const coord = result.coordinates as Coordinate;
        setState({ status: 'found', name: result.name ?? trimmed, coord });
        onFlyTo(coord, 13);
        trackRb2('location_search_result', { found: true });
      } else {
        setState({ status: 'empty' });
        trackRb2('location_search_result', { found: false });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: 'error', message });
      trackRb2('location_search_failed', { error_message: message.slice(0, 200) });
    }
  }, [query, proximity, onFlyTo]);

  return (
    <Box data-testid="rb2-location-search">
      <Box style={{ display: 'flex', gap: 6 }}>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Search address or place"
          aria-label="Search for a location"
          data-testid="rb2-location-search-input"
          styles={{ input: { borderRadius: 0, fontSize: 13 } }}
          style={{ flex: 1 }}
          autoFocus
        />
        <UnstyledButton
          onClick={() => void runSearch()}
          disabled={!query.trim() || state.status === 'searching'}
          aria-label="Search"
          data-testid="rb2-location-search-submit"
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: RB2.teal,
            color: RB2.textInverse,
            opacity: !query.trim() || state.status === 'searching' ? 0.5 : 1,
          }}
        >
          {state.status === 'searching' ? (
            <Loader size="xs" color="white" />
          ) : (
            <MagnifyingGlass size={16} />
          )}
        </UnstyledButton>
      </Box>

      {state.status === 'found' && (
        <Box
          data-testid="rb2-location-search-result"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10 }}
        >
          <MapPin size={14} color={RB2.teal} weight="duotone" style={{ marginTop: 2 }} />
          <Box style={{ minWidth: 0 }}>
            <Text style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textPrimary }}>
              {state.name}
            </Text>
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                color: RB2.textTertiary,
                letterSpacing: '0.04em',
              }}
            >
              {state.coord[1].toFixed(4)}, {state.coord[0].toFixed(4)} · map centered here
            </Text>
          </Box>
        </Box>
      )}

      {state.status === 'empty' && (
        <Text
          data-testid="rb2-location-search-empty"
          style={{ marginTop: 10, fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary }}
        >
          No match found. Try a more specific address.
        </Text>
      )}

      {state.status === 'error' && (
        <Text
          data-testid="rb2-location-search-error"
          style={{ marginTop: 10, fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.coral }}
        >
          {state.message}
        </Text>
      )}
    </Box>
  );
}

export default LocationSearch;

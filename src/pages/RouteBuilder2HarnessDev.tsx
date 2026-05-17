/**
 * Route Builder 2.0 dev harness (S2 rewire).
 *
 * Buttons that exercise each of the five Route Builder 2.0 hooks so the
 * v1-backed plumbing can be verified at a glance. After S2, the hooks
 * call v1 services directly (no executor adapter), so the buttons
 * exercise the same paths the production page does.
 *
 * Gating: this page is mounted only when
 *   - `import.meta.env.DEV === true`, AND
 *   - `VITE_ROUTE_BUILDER_V2_ENABLED === 'true'`
 *
 * Intentionally unstyled — this is a verification surface, not a UI.
 */

import { useState } from 'react';
import {
  useAIGeneration,
  useRouteEditing,
  useMapInteraction,
  useRoutePersistence,
  useRouteAnalysis,
  type POILayer,
} from '../hooks/route-builder';

const BOULDER: [number, number] = [-105.27, 40.02];
const NEDERLAND: [number, number] = [-105.51, 39.96];

const ALL_LAYERS: POILayer[] = ['coffee', 'water', 'food', 'bike_shop', 'restroom', 'viewpoint'];

const sectionStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: 12,
  marginBottom: 12,
  fontFamily: 'monospace',
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  margin: '4px 6px 4px 0',
  padding: '4px 8px',
};

const preStyle: React.CSSProperties = {
  background: '#f5f5f5',
  padding: 8,
  marginTop: 8,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export default function RouteBuilder2HarnessDev() {
  const gen = useAIGeneration();
  const edit = useRouteEditing();
  const map = useMapInteraction();
  const persistence = useRoutePersistence();
  const analysis = useRouteAnalysis();

  const [chatInput, setChatInput] = useState('');

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 0 }}>Route Builder 2.0 — Hook Harness</h1>
      <p style={{ color: '#666', marginTop: 4 }}>
        Dev-only. Not user-facing. Each section exercises one hook, now
        wired through v1's backend.
      </p>

      <section style={sectionStyle}>
        <h2>useAIGeneration</h2>
        <button
          style={buttonStyle}
          onClick={() =>
            gen.generate({
              goal: 'endurance',
              duration_minutes: 60,
              start_coord: BOULDER,
              route_profile: 'road',
              route_shape: 'loop',
            })
          }
        >
          generate 1
        </button>
        <button
          style={buttonStyle}
          onClick={() =>
            gen.generate(
              {
                goal: 'endurance',
                duration_minutes: 90,
                start_coord: BOULDER,
                route_profile: 'road',
                route_shape: 'loop',
              },
              3,
            )
          }
        >
          generate 3 alts
        </button>
        <button style={buttonStyle} onClick={() => gen.selectSuggestion(0)}>
          select [0]
        </button>
        <button style={buttonStyle} onClick={gen.clearSuggestions}>
          clear
        </button>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              isGenerating: gen.isGenerating,
              lastError: gen.lastError,
              suggestionCount: gen.suggestions.length,
              first: gen.suggestions[0]
                ? {
                    distance_km: gen.suggestions[0].stats.distance_km,
                    elevation_gain_m: gen.suggestions[0].stats.elevation_gain_m,
                    geometry_pts: gen.suggestions[0].geometry.length,
                  }
                : null,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>useRouteEditing (chat-style edits via v1)</h2>
        <input
          type="text"
          placeholder='try "make it flatter" or "more gravel"'
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          style={{ ...buttonStyle, width: 280 }}
        />
        <button style={buttonStyle} onClick={() => edit.applyAIEdit(chatInput)}>
          applyAIEdit
        </button>
        <button style={buttonStyle} disabled={!edit.canUndo} onClick={edit.undo}>
          undo
        </button>
        <button style={buttonStyle} disabled={!edit.canRedo} onClick={edit.redo}>
          redo
        </button>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              isApplying: edit.isApplying,
              lastError: edit.lastError,
              canUndo: edit.canUndo,
              canRedo: edit.canRedo,
              historyDepth: edit.historyDepth,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>useMapInteraction</h2>
        <button
          style={buttonStyle}
          onClick={() =>
            map.setViewport({ longitude: BOULDER[0], latitude: BOULDER[1], zoom: 11 })
          }
        >
          viewport → Boulder
        </button>
        <button style={buttonStyle} onClick={() => map.handleMapClick(NEDERLAND)}>
          click @ Nederland
        </button>
        <button style={buttonStyle} onClick={() => map.handleWaypointDrag(0, BOULDER)}>
          drag wp[0] → Boulder
        </button>
        <button style={buttonStyle} onClick={() => map.handleAddWaypointAtClick(NEDERLAND)}>
          add wp @ Nederland
        </button>
        <button style={buttonStyle} onClick={() => map.handleRemoveWaypoint(0)}>
          remove wp[0]
        </button>
        <button style={buttonStyle} onClick={map.handleReverseRoute}>
          reverse
        </button>
        <button style={buttonStyle} onClick={map.handleClearRoute}>
          clear
        </button>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              viewport: map.viewport,
              isApplying: map.isApplying,
              lastError: map.lastError,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>useRoutePersistence</h2>
        <button style={buttonStyle} onClick={() => persistence.save('Harness Save')}>
          save
        </button>
        <button style={buttonStyle} onClick={() => persistence.exportRoute('gpx')}>
          export gpx
        </button>
        <button style={buttonStyle} onClick={() => persistence.exportRoute('tcx')}>
          export tcx
        </button>
        <button style={buttonStyle} onClick={() => persistence.exportRoute('fit')}>
          export fit
        </button>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              isSaving: persistence.isSaving,
              isLoading: persistence.isLoading,
              lastError: persistence.lastError,
              savedRouteId: persistence.savedRouteId,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>useRouteAnalysis</h2>
        <button style={buttonStyle} onClick={analysis.refreshAnalysis}>
          refresh
        </button>
        {ALL_LAYERS.map((layer) => (
          <button
            key={layer}
            style={{
              ...buttonStyle,
              fontWeight: analysis.activeLayers.includes(layer) ? 700 : 400,
            }}
            onClick={() => analysis.togglePOILayer(layer)}
          >
            {layer}
          </button>
        ))}
        <pre style={preStyle}>
          {JSON.stringify(
            {
              isAnalyzing: analysis.isAnalyzing,
              lastError: analysis.lastError,
              elevationProfilePts: analysis.elevationProfile?.length ?? 0,
              gradientSegments: analysis.gradientData?.length ?? 0,
              activeLayers: analysis.activeLayers,
              poiCounts: Object.fromEntries(
                ALL_LAYERS.map((l) => [l, analysis.poiResults[l]?.features.length ?? 0]),
              ),
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}

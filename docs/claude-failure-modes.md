# Claude Failure Modes — Route Generation Pipeline

T1.3 audit of every place the Claude AI call can fail during route generation,
and what the user sees today. The new fallback (see
`src/utils/routeGenerationFallback.ts` and the wrapper inside
`src/utils/aiRouteGenerator.js`) is the target behavior in every row.

## Pipeline

```
RouteBuilder.jsx → generateAIRoutes(aiRouteGenerator.js:41)
   → generateClaudeRoutes(claudeRouteService.js:25)
      → fetch /api/claude-routes (claudeRouteService.js:69)
         → Anthropic SDK (api/claude-routes.js:53)
```

## Failure-mode matrix

| # | Trigger                                             | Where it surfaces                              | Current behavior                                                                | Target behavior (after T1.3)                          |
|---|-----------------------------------------------------|------------------------------------------------|---------------------------------------------------------------------------------|-------------------------------------------------------|
| 1 | Network error / DNS / connection refused            | `claudeRouteService.js:69` fetch rejects        | catch at line 97 logs and returns `[]`                                          | catch propagates, `generateAIRoutes` triggers Tier 1  |
| 2 | Anthropic 429 (rate limit)                          | `api/claude-routes.js:81` → `success:false`     | `claudeRouteService.js:88` throws → catch → `[]`                                | Same throw, caught by wrapper → Tier 1                |
| 3 | Anthropic 401/403 (bad key)                         | `api/claude-routes.js:81`                       | throw → `[]`                                                                    | Tier 1                                                |
| 4 | Anthropic 400 (invalid prompt)                      | `api/claude-routes.js:81`                       | throw → `[]`                                                                    | Tier 1                                                |
| 5 | Anthropic 5xx                                       | `api/claude-routes.js:81`                       | throw → `[]`                                                                    | Tier 1                                                |
| 6 | Anthropic latency > 15s                             | No timeout today — request hangs               | UI shows spinner indefinitely; user gives up                                    | `AbortController` 15s → reject → Tier 1               |
| 7 | Malformed JSON in Claude response                   | `parseClaudeResponse` (claudeRouteService.js)   | Returns `[]` (no throw)                                                         | empty array detected by wrapper → Tier 1              |
| 8 | Empty `suggestions` array                           | Valid response, no items                       | `aiRouteGenerator.js:218` logs "no routes"; falls through to pattern / Mapbox   | Wrapper detects empty → Tier 1                        |
| 9 | All suggestions rejected by validator               | `aiRouteGenerator.js:167-187` filter           | `validClaudeRoutes.length === 0` → falls through to Mapbox heuristics            | Wrapper treats as fallback trigger → Tier 1           |
| 10| `convertClaudeToFullRoute` all reject               | `Promise.allSettled` results all `rejected`     | `routes` array stays empty; falls through                                       | Wrapper detects empty `routes` → Tier 1               |
| 11| Mapbox / Stadia / BRouter all down                  | `generateMapboxBasedRoutes` returns `[]`        | line 311: emergency `createMockRoute` (single fallback)                         | Tier 2 (radial) → Tier 3 (out-and-back)               |
| 12| User has no past rides (Tier 1 has nothing to use)  | `fetchPastRides` returns `[]`                  | Today: never relevant — Claude path or Mapbox heuristics used                   | Tier 1 returns null → Tier 2                          |

## Caller-visible shape today

`generateAIRoutes` returns an array. The worst-case failure is an array with
zero items, which propagates to `RouteBuilder.jsx:2788` where the conditional
`aiSuggestions.length > 0` simply hides the panel. The user sees no routes
and no explanation.

## Target shape

Every path through `generateAIRoutes` returns at least one route. When the
Claude path failed and a heuristic fallback ran, the returned suggestion
carries `isFallback: true` and `fallbackTier: 1 | 2 | 3` so the UI can
render a banner explaining what happened.

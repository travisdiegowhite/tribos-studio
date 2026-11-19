# Coach page (`/coach`)

The coach used to live only in small surfaces: the Cmd+K command bar, the
panel on Today, and the check-in feed on Train → Coach. `/coach` is the
full-height conversation, a fifth nav item. Those surfaces still work and link
here. All of them read and write the same `coach_conversations` rows, so the
coach keeps one memory across them.

Code: `src/features/coach-chat/` (page, hook, visuals), plus
`api/utils/showVisualTool.js` and `api/utils/coachFocus.js` on the server.

## What the page adds

- **Visuals in replies.** The coach can call `show_visual` to put up to three
  charts or maps in a reply:
  - `fitness_load`: TFI, AFI, Form Score and RSS over a date range.
  - `ride_streams`: a ride's map plus its power, HR and speed, with an
    optional km stretch marked in lime.
  - `power_curve`: one ride, or the best values over a period; can add zones.
  - `route_preview`: a saved route, or one stretch of it.
- **Selecting part of a chart.** Drag across a ride chart, or click a day on
  the fitness chart. That puts a chip above the composer, and the next message
  carries a `focus`. The server re-reads the activity under the athlete's
  `user_id`, works out that stretch's numbers from the stored streams, and
  gives them to the model.
- **New topic.** The next user message is saved with
  `context_snapshot.topic_start = true`. Only turns from there on are sent as
  history. There is no thread table.

## Rules

- **A visual is a reference, never data.** The model sends ids and ranges.
  `handleShowVisual` checks each id against the athlete's own rows (the
  service-role client, so the `user_id` filter is the boundary). The browser
  then loads the rows under RLS and draws them with the existing components:
  `TrainingLoadChart`, `RideStreamsChart`, `ColoredRouteMap`,
  `ActivityPowerCurve`, `RideZonesChart` and `RoutePreviewMap`. The model never
  supplies a number that ends up in a chart.
- **`show_visual` is offered only when the request sends
  `canShowVisuals: true`.** Only this page sends it. Any other surface would
  get a reply pointing at a chart it can't draw.
- **Visual specs are stored in `context_snapshot.visuals`.** A reload draws
  them again, and no migration was needed. Athletes have no UPDATE policy on
  `coach_conversations` (migration 013), so state that changes later, such as
  a plan being activated, is not written back to the row.
- **Keep the kinds in step.** `VISUAL_KINDS` in `showVisualTool.js` must match
  the union in `src/features/coach-chat/visuals/types.ts`.
- **Attribution.** Each visual shows `PoweredByGarmin` or `PoweredByStrava`
  for the provider of the rows it draws.

## Before launch: Garmin notice

`/coach` is a **new surface that displays Garmin-sourced data**. Under the
Garmin program 2.0 terms, Garmin must get **30 days' notice** before it
launches (see `docs/garmin-program-v2-compliance.md`). Send that notice before
`/coach` reaches athletes with Garmin connected.

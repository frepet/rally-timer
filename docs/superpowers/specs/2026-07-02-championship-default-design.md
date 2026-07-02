# Championship Default ("Star") Feature

**Date:** 2026-07-02

## Summary

Admins can star one championship as the global default. All users land on the starred championship when opening the championships page. The `?id=` URL param overrides the default (preserving deep-link behaviour). The star button is visible only to admins and reflects current state via outline/solid icon.

## Database

Migration `022_championship_default.ts` — extend the existing singleton settings table:

```sql
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS default_championship_id UUID
    REFERENCES championships(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` automatically clears the default when the starred championship is deleted, with no extra application logic needed.

## API

### `GET /api/championship`

Join with settings to compute `is_default` per championship:

```sql
SELECT c.id, c.name, c.created_at,
       (s.default_championship_id = c.id) AS is_default
FROM championships c, settings s
ORDER BY c.created_at
```

Response shape gains `is_default: boolean` per item — backwards-compatible addition.

### `PUT /api/championship/[id]/default` (new)

Admin-only. Toggles the default:

- If this championship is already the default → clear it (`SET default_championship_id = NULL`).
- Otherwise → set it (`SET default_championship_id = <id>`).

Returns 204 No Content. File: `src/routes/api/championship/[id]/default/+server.ts`.

## UI (`src/routes/championships/+page.svelte`)

**Type change:** `Championship` gains `is_default: boolean`.

**Initial selection logic in `loadChampionships`:**

1. If `?id=` param present and matches a championship → select that one (existing behaviour).
2. Else if a championship has `is_default: true` → select it.
3. Else → select `championships[0]` (existing fallback).

**Star button** — rendered next to the existing pen/trash buttons when `auth.isAdmin && selectedId`:

- `StarOutline` (gray) when `!selectedChamp.is_default` — tooltip: `t.starChampionship`
- `StarSolid` (yellow/amber) when `selectedChamp.is_default` — tooltip: `t.unstarChampionship`
- On click: call `PUT /api/championship/[id]/default`, then `await loadChampionships()` to refresh `is_default` state.

## i18n (`src/lib/i18n.ts`)

Two new keys in both `sv` and `en`:

| Key | sv | en |
|-----|----|----|
| `starChampionship` | `"Sätt som standardmästerskap"` | `"Set as default championship"` |
| `unstarChampionship` | `"Ta bort som standardmästerskap"` | `"Remove as default championship"` |

## Error handling

- `PUT /api/championship/[id]/default` returns 404 if the championship does not exist.
- Auth: `throwIfNotAdmin` guards the PUT endpoint.
- UI: wraps the toggle call in try/catch and shows `alert` on error (consistent with existing rename/delete pattern).

## Testing

- Existing e2e verify scripts cover the GET standings/list endpoints; no changes needed there.
- The toggle endpoint is simple enough to cover via the existing manual seed/verify flow.
- Unit tests are not required for this thin API layer (consistent with existing championship endpoints).

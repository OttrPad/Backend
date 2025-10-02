# Frontend Execution – Quick Integration

Minimal instructions for wiring the execution feature. No deep explanations.

## Base

Gateway base URL (env):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

All calls go through gateway paths below.

## Endpoints

```
POST /api/execute/room/:roomId/start   -> { status: "started" }
POST /api/execute/room/:roomId/exec    -> body { code } -> { output }
POST /api/execute/room/:roomId/stop    -> { status: "stopped" }
```

Error cases you must handle:

- 400 code is required
- 400 Room not running (call start then retry once)
- 500 execution_failed (show error)

## Basic Flow

1. User clicks Run.
2. If not started: POST start.
3. POST exec with { code }.
4. Show output (or "(no output)" if empty).
5. Optional Stop button calls POST stop.
6. If exec returns 400 Room not running: start → retry exec (one time only).

## UI Requirements

- Disable Run while an execution is in flight.
- Show last output and optionally elapsed time (measure client-side).
- Provide clear error banner for 400/500 cases.
- Truncate very large output (e.g. > 10k chars) with “Show more”.

## Suggested State Flags

```
isStarted: boolean
isRunning: boolean (current exec in progress)
lastOutput: string
lastError: { code: string; message?: string } | null
```

## Retry Policy

- Auto-start + single retry only for 400 Room not running.
- Do not auto-retry other errors.

## Quick Checklist

- [ ] Env base URL set
- [ ] Start before first exec or lazy auto-start
- [ ] Run disabled during exec
- [ ] Error surfaced clearly
- [ ] Stop button (optional)

## Notes

- No variable/state persistence between exec calls.
- Idle timeout (~5m) means you may need to auto-start again later.

That’s it. Build the small client wrapper + hook around these three endpoints and you’re done.

**End of Guide**

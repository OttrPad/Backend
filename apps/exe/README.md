# exe Service

Executes untrusted (or semi-trusted) code snippets in isolated sandboxes (future: Docker w/ seccomp, cgroups, non-root user). Currently only a placeholder for JavaScript execution via a local Node.js process.

## Endpoints

### `POST /execute`

Request Body:

```json
{
  "language": "javascript",
  "code": "console.log('hi')",
  "stdin": "optional stdin",
  "timeoutMs": 3000
}
```

Response:

```json
{
  "id": "uuid",
  "stdout": "hi\n",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false,
  "durationMs": 12
}
```

## Environment Variables

- `PORT` (default: 4004) Service port.

## Security Roadmap

- Replace local spawn with Docker isolated execution.
- Language-specific base images (node, python, bash) with pinned versions.
- Resource limits: CPU, memory, pids, network disabled.
- Non-root UID/GID inside containers + dropped capabilities.
- Input size limits & streaming output caps.
- Auditing & logging of executions.
- Deterministic ephemeral filesystem (tmpfs) with automatic cleanup.

## Development

Install deps (root workspace):

```
pnpm install
```

Run dev:

```
pnpm --filter exe dev
```

Build:

```
pnpm --filter exe build
```

## Notes

This is an MVP skeleton; do **NOT** use for executing untrusted user code in production yet.

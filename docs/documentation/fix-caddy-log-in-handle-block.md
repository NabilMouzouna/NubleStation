# Fix: Caddy `log` Directive Inside `handle` Block

## Symptom

The Caddy container enters a crash-restart loop immediately after `docker compose up`. Running `docker logs nublestation-caddy-1` shows:

```
Error: adapting config using caddyfile: parsing caddyfile tokens for 'handle':
directive 'log' is not an ordered HTTP handler, so it cannot be used here
- try placing within a route block or using the order global option
```

Port 80 is never bound, so no service is reachable — not even by raw IP.

## Root Cause

In Caddy v2, `log` is a **site-level directive**, not an HTTP handler directive. It configures access logging for the whole site and must live at the top level of a site block. Placing it inside a `handle` or `route` block is invalid.

```caddy
# WRONG — log inside handle
*.example.local:80 {
    handle @matcher {
        file_server
        log {          # ← invalid here
            output stdout
        }
    }
}

# CORRECT — log at site level
*.example.local:80 {
    handle @matcher {
        file_server
    }
    log {              # ← valid here
        output stdout
    }
}
```

## Fix

Move the `log` block out of any `handle` or `route` block and place it directly inside the site block.

## Applying the Fix to a Running Container

Because the Caddyfile is mounted as a read-only bind volume, `docker cp` cannot overwrite it. Instead, edit the source file on the host (the compose bind-mount source), then reload Caddy in-place:

```sh
# After editing infra/caddy/Caddyfile on the host:
docker exec nublestation-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Caddy re-reads the mounted file and applies the new config without a container restart. A formatting warning (`Caddyfile input is not formatted`) may appear — it is cosmetic and does not affect operation.

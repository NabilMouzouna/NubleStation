---
title: Quick Start
description: Deploy your first frontend to NubleStation in under five minutes.
---

import { Aside, Steps, Tabs, TabItem } from '@astrojs/starlight/components';

This guide assumes NubleStation is already [installed and running](/NubleStation/getting-started/installation/). You'll create an app in the Console, configure the CLI, and deploy a frontend that is live on your LAN immediately.

## Step 1 — Create an app in the Console

<Steps>
1. Open `http://console.{org}.local` in a browser and sign in with your admin email and password.
2. Go to **Apps → New App**.
3. Enter an app name, e.g. `tasks`. NubleStation reserves `tasks.{org}.local` and generates an API key.
4. Copy the API key — it looks like `nbl_<keyId>.<secret>`. You will not see the secret again after closing the dialog.
</Steps>

## Step 2 — Install and configure the CLI

Install the NubleStation CLI globally:

```bash
npm install -g @nublestation/cli
```

Then initialize it for your app. The `nuble init` command writes your connection config to `~/.config/nuble/config.toml`:

```bash
nuble init \
  --url http://api.{org}.local \
  --slug tasks \
  --key nbl_<keyId>.<secret>
```

Replace `{org}` with your actual org name (e.g., `clinic`). After this, `nuble` commands will automatically use these settings.

<Aside type="tip">
  Run `nuble status` to verify the CLI can reach the API Gateway and that your key is valid.
</Aside>

## Step 3 — Deploy a frontend

<Tabs>
  <TabItem label="Existing project">
    If you already have a Vite, React, or any SPA project, build it and deploy:

    ```bash
    npm run build       # produces dist/ (or build/, configure with --dist)
    nuble deploy        # zips dist/, uploads to Gateway, Orbit extracts it
    ```

    If your build output is in a different directory:

    ```bash
    nuble deploy --dist ./build
    ```
  </TabItem>
  <TabItem label="From scratch (plain HTML)">
    No existing project? Create a minimal test page and deploy it:

    ```bash
    mkdir my-app && cd my-app
    mkdir dist

    # Create a simple index.html
    cat > dist/index.html << 'EOF'
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Tasks — NubleStation</title>
    </head>
    <body>
      <h1>Hello from NubleStation</h1>
      <p>App: tasks · Deployed via Orbit</p>
    </body>
    </html>
    EOF

    nuble deploy --dist dist
    ```
  </TabItem>
</Tabs>

You will see output like:

```
✔ Zipping dist/ ...
✔ Uploading to http://api.clinic.local ...
✔ Deployed to tasks.clinic.local
```

Open `http://tasks.{org}.local` in a browser — your frontend is live immediately. No restart, no cache clearing needed.

## What just happened

```
Your machine
  └── nuble deploy
        → zips dist/
        → POST /v1/orbit/deploy  (multipart, HMAC-signed by CLI)
        → Gateway verifies API key, forwards to Orbit with HMAC headers
        → Orbit verifies HMAC, extracts bundle to /var/nuble/tasks/current/
        → returns 200 OK

Any device on the LAN
  └── DNS query: tasks.clinic.local → 192.168.1.100 (CoreDNS)
  └── HTTP: 192.168.1.100:80 → Caddy → /var/nuble/tasks/current/ (static files)
```

## Rollback

Orbit keeps the previous deployment under `previous/` alongside `current/`. If a deployment breaks something:

```bash
# Coming soon to CLI — rollback via Gateway endpoint
# nuble rollback

# Today, you can redeploy the previous build manually:
nuble deploy --dist ./path/to/previous-dist
```

Full rollback CLI support (`nuble rollback`) is on the roadmap. Orbit's rollback endpoint (`POST /v1/orbit/rollback`) is already implemented — the CLI wrapper is coming.

<Aside type="tip">
  **Works offline.** Unplug the internet cable after installation. CoreDNS, Caddy, and Orbit all run locally — your deployed app keeps serving.
</Aside>

## Next steps

- [Orbit service reference](/NubleStation/services/deploy/) — endpoints, storage layout, versioning
- [CLI commands](/NubleStation/cli/commands/) — full reference for `nuble deploy`, `nuble status`, and more
- [Architecture overview](/NubleStation/concepts/architecture/) — how the containers relate to each other

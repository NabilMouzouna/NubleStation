#!/usr/bin/env node
import { Command } from "commander";
import { runDeploy } from "./commands/deploy.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import {
  serverStart,
  serverStop,
  serverRestart,
  serverLogs,
  serverStatus,
} from "./commands/server.js";

const program = new Command();

program
  .name("nuble")
  .description("NubleStation developer CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Connect to a NubleStation org and write config")
  .option("--url <url>",      "Gateway URL (e.g. http://api.clinic.local)")
  .option("--key <key>",      "API key (nbl_...)")
  .option("--slug <slug>",    "App slug")
  .option("--profile <name>", "Config profile name", "default")
  .action((opts: { url?: string; key?: string; slug?: string; profile: string }) => runInit(opts));

program
  .command("deploy")
  .description("Zip dist/ and deploy to Orbit via Gateway")
  .option("--dist <path>",    "Path to built frontend directory", "dist")
  .option("--profile <name>", "Config profile to use", "default")
  .action((opts: { dist: string; profile: string }) => runDeploy(opts));

program
  .command("status")
  .description("Check Gateway health for all configured profiles")
  .action(() => runStatus());

// ── Server management (runs on the NubleStation host) ─────────────────────────
const server = program
  .command("server")
  .description("Manage the NubleStation stack on this machine");

server
  .command("start")
  .description("Start all NubleStation services")
  .action(() => serverStart());

server
  .command("stop")
  .description("Stop all services (data is preserved)")
  .action(() => serverStop());

server
  .command("restart")
  .description("Restart all services")
  .action(() => serverRestart());

server
  .command("status")
  .description("Show container health status")
  .action(() => serverStatus());

server
  .command("logs [service]")
  .description("Tail service logs (omit service to show all)")
  .option("-f, --follow", "Follow log output", false)
  .action((service: string | undefined, opts: { follow: boolean }) =>
    serverLogs(service, opts.follow),
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});

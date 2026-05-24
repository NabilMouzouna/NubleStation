#!/usr/bin/env node
import { Command } from "commander";
import { runDeploy } from "./commands/deploy.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";

const program = new Command();

program
  .name("nuble")
  .description("NubleStation developer CLI")
  .version("0.0.0");

program
  .command("init")
  .description("Connect to a NubleStation org and write config")
  .option("--profile <name>", "Config profile name", "default")
  .action((opts: { profile: string }) => runInit(opts));

program
  .command("deploy")
  .description("Zip dist/ and deploy to Orbit via Gateway")
  .option("--dist <path>", "Path to built frontend directory", "dist")
  .option("--profile <name>", "Config profile to use", "default")
  .action((opts: { dist: string; profile: string }) => runDeploy(opts));

program
  .command("status")
  .description("Check Gateway health for all configured profiles")
  .action(() => runStatus());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});

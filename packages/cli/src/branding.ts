const i = "\x1b[38;5;99m";    // Indigo
const g = "\x1b[38;5;245m";   // Gray
const b = "\x1b[1m";          // Bold
const r = "\x1b[0m";          // Reset

export function printBranding(version?: string): void {
  process.stdout.write("\n");
  process.stdout.write(`  ${i}       .--.       ${r}\n`);
  process.stdout.write(`  ${i}    .-(    ).    ${r}\n`);
  process.stdout.write(`  ${i}   (___.__)__)   ${r}\n`);
  process.stdout.write("\n");
  process.stdout.write(`  ${b}███╗   ██╗██╗   ██╗██████╗ ██╗     ███████╗${r}\n`);
  process.stdout.write(`  ${b}████╗  ██║██║   ██║██╔══██╗██║     ██╔════╝${r}\n`);
  process.stdout.write(`  ${b}██╔██╗ ██║██║   ██║██████╔╝██║     █████╗  ${r}\n`);
  process.stdout.write(`  ${b}██║╚██╗██║██║   ██║██╔══██╗██║     ██╔══╝  ${r}\n`);
  process.stdout.write(`  ${b}██║ ╚████║╚██████╔╝██████╔╝███████╗███████╗${r}\n`);
  process.stdout.write(`  ${b}╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝${r}\n`);
  process.stdout.write(`  ${g}███████╗████████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗${r}\n`);
  process.stdout.write(`  ${g}██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║${r}\n`);
  process.stdout.write(`  ${g}███████╗   ██║   ███████║   ██║   ██║██║   ██║██╔██╗ ██║${r}\n`);
  process.stdout.write(`  ${g}╚════██║   ██║   ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║${r}\n`);
  process.stdout.write(`  ${g}███████║   ██║   ██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║${r}\n`);
  process.stdout.write(`  ${g}╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝${r}\n`);
  process.stdout.write("\n");
  process.stdout.write(`  ${g}PRIVATE · LOCAL · YOURS${r}\n`);
  if (version) process.stdout.write(`  ${g}${version}${r}\n`);
  process.stdout.write("\n");
}

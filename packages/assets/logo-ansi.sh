#!/usr/bin/env sh
# NubleStation ANSI terminal logo
# Usage:
#   source ./logo.sh
#   print_logo "v1.0.0"

print_logo() {
  _ver="${1:-}"

  _i="$(printf '\033[38;5;99m')"    # Indigo
  _p="$(printf '\033[38;5;135m')"   # Purple
  _b="$(printf '\033[1m')"          # Bold
  _g="$(printf '\033[38;5;245m')"   # Gray
  _r="$(printf '\033[0m')"          # Reset

  printf '\n'

  # Cloud + network icon (improved shape)
  printf '  %s        .--.        %s\n' "$_i" "$_r"
  printf '  %s     .-(    ).      %s\n' "$_i" "$_r"
  printf '  %s    (___.__)__)     %s\n' "$_i" "$_r"

  printf '\n'

  # Product name (larger and emphasized)
  printf '  %s███╗   ██╗██╗   ██╗██████╗ ██╗     ███████╗%s\n' "$_b" "$_r"
  printf '  %s████╗  ██║██║   ██║██╔══██╗██║     ██╔════╝%s\n' "$_b" "$_r"
  printf '  %s██╔██╗ ██║██║   ██║██████╔╝██║     █████╗  %s\n' "$_b" "$_r"
  printf '  %s██║╚██╗██║██║   ██║██╔══██╗██║     ██╔══╝  %s\n' "$_b" "$_r"
  printf '  %s██║ ╚████║╚██████╔╝██████╔╝███████╗███████╗%s\n' "$_b" "$_r"
  printf '  %s╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝%s\n' "$_b" "$_r"

  printf '  %s███████╗████████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗%s\n' "$_g" "$_r"
  printf '  %s██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║%s\n' "$_g" "$_r"
  printf '  %s███████╗   ██║   ███████║   ██║   ██║██║   ██║██╔██╗ ██║%s\n' "$_g" "$_r"
  printf '  %s╚════██║   ██║   ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║%s\n' "$_g" "$_r"
  printf '  %s███████║   ██║   ██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║%s\n' "$_g" "$_r"
  printf '  %s╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝%s\n' "$_g" "$_r"

  printf '\n'

  # Tagline
  printf '  %sPRIVATE · LOCAL · YOURS%s\n' "$_g" "$_r"

  # Version
  if [ -n "$_ver" ]; then
    printf '  %s%s%s\n' "$_g" "$_ver" "$_r"
  fi

  printf '\n'
}
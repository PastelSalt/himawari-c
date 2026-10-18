#!/bin/sh
# Plan §8.1 budgets from a `himawari --perf` report (CI, plan §16.3). Usage: check_budgets.sh perf.json himawari.exe
# The .exe size and memory are hard limits. Startup and frame time depend on the machine (CI runners have no GPU),
# so over-budget values there are reported as warnings.
set -eu
perf="$1"
exe="$2"
value() { sed -n "s/.*\"$1\": *\([0-9.]*\).*/\1/p" "$perf" | head -1; }
status=0
check() { # name value limit hard
  if awk "BEGIN { exit !($2 > $3) }"; then
    if [ "$4" = hard ]; then echo "::error::$1 is $2 (budget $3)"; status=1; else echo "::warning::$1 is $2 (budget $3; machine-dependent)"; fi
  else
    echo "ok: $1 = $2 (budget $3)"
  fi
}
size_mb=$(awk "BEGIN { print $(stat -c %s "$exe") / 1048576 }")
check "release .exe (MB)" "$size_mb" 4 hard
check "peak memory (MB)" "$(value peak_memory_mb)" 150 hard
check "first frame (ms)" "$(value first_frame_ms)" 250 soft
check "frame CPU p95 (ms)" "$(value frame_cpu_ms_p95)" 2 soft
exit $status

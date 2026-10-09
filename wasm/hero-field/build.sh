#!/usr/bin/env bash
# Builds the hero particle field to public/wasm/hero_field.wasm. Needs Rust with the wasm32-unknown-unknown
# target; the .wasm is committed so Vercel builds the site without a Rust toolchain.
set -euo pipefail
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
out=../../public/wasm/hero_field.wasm
mkdir -p "$(dirname "$out")"
cp target/wasm32-unknown-unknown/release/hero_field.wasm "$out"

# Older wasm-opt builds do not detect the features rustc emits by default for wasm32 (all supported by
# current browsers), so enable them explicitly. A failed optimization keeps the unoptimized module.
opt=$(command -v wasm-opt || ls ~/.cache/.wasm-pack/wasm-opt-*/bin/wasm-opt 2>/dev/null | head -1 || true)
if [ -n "$opt" ]; then
  if "$opt" -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
    --enable-mutable-globals --enable-multivalue --enable-reference-types -o "$out.opt" "$out"; then
    mv "$out.opt" "$out"
  else
    rm -f "$out.opt"
    echo "wasm-opt failed; keeping the unoptimized module" >&2
  fi
fi
echo "hero_field.wasm: $(wc -c < "$out") bytes"

#!/bin/bash
set -e

TARGET=${1:-}
MODE=${2:-release}

echo "=== Karat DLL/SO/Dylib Build ==="

cd "$(dirname "$0")/.."

if [ -n "$TARGET" ]; then
    echo "Target: $TARGET"
    if [ "$MODE" = "release" ]; then
        cargo build --release --lib --target "$TARGET"
        OUT="target/$TARGET/release"
    else
        cargo build --lib --target "$TARGET"
        OUT="target/$TARGET/debug"
    fi
else
    if [ "$MODE" = "release" ]; then
        cargo build --release --lib
        OUT="target/release"
    else
        cargo build --lib
        OUT="target/debug"
    fi
fi

echo ""
echo "Build output in: $OUT"
ls -lh "$OUT"/libkarat.* "$OUT"/*.so "$OUT"/*.dylib "$OUT"/karat.dll 2>/dev/null || true

mkdir -p dist
cp "$OUT"/libkarat.* dist/ 2>/dev/null || true
cp "$OUT"/*.so dist/ 2>/dev/null || true
cp "$OUT"/*.dylib dist/ 2>/dev/null || true
cp "$OUT"/karat.dll dist/ 2>/dev/null || true

echo ""
echo "Library ready in ./dist/"

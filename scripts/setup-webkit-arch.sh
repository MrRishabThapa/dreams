#!/usr/bin/env bash
# One-time: make Playwright WebKit run on Arch (no sudo). Downloads ICU 74 + libxml2 2.9 from Ubuntu 24.04.
set -euo pipefail
D="$HOME/.cache/dreams-webkit-libs"; mkdir -p "$D/debs" "$D/lib"
cd "$D/debs"
icu=$(curl -s https://archive.ubuntu.com/ubuntu/pool/main/i/icu/ | grep -o 'libicu74_74[^"]*_amd64.deb' | sort -u | tail -1)
xml=$(curl -s https://archive.ubuntu.com/ubuntu/pool/main/libx/libxml2/ | grep -o 'libxml2_2.9.14[^"]*_amd64.deb' | sort -u | tail -1)
curl -sSfLO "https://archive.ubuntu.com/ubuntu/pool/main/i/icu/$icu"
curl -sSfLO "https://archive.ubuntu.com/ubuntu/pool/main/libx/libxml2/$xml"
cd "$D"; rm -rf x
for f in debs/*.deb; do n=$(basename "$f" .deb); mkdir -p "x/$n"; (cd "x/$n" && bsdtar -xf "../../$f" && for t in data.tar.*; do bsdtar -xf "$t"; done); done
cp -a x/*/usr/lib/x86_64-linux-gnu/*.so.* lib/
for v in "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-*; do
  mkdir -p "$v/sys/lib"
  for f in libicudata.so.74 libicui18n.so.74 libicuuc.so.74 libxml2.so.2; do ln -sf "$D/lib/$f" "$v/sys/lib/$f"; done
done
echo "WebKit libs ready"

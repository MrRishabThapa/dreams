#!/usr/bin/env bash
# Arch Linux lacks the ICU 74 / libxml2.so.2 that Playwright's WebKit build links against.
# They are extracted from Ubuntu 24.04 packages into ~/.cache/dreams-webkit-libs/lib and
# symlinked into ~/.cache/ms-playwright/webkit-*/minibrowser-*/sys/lib (see scripts/setup-webkit-arch.sh).
# Usage: scripts/webkit-env.sh npx playwright test
if [ -d "$HOME/.cache/dreams-webkit-libs/lib" ]; then
  export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
fi
exec "$@"

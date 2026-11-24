#!/usr/bin/env bash
# Decides which version a "Desktop app" run releases, and whether to publish it.
# Inputs (environment): EVENT, GITHUB_REF, GITHUB_REF_NAME, INPUT, GITHUB_REPOSITORY, GH_TOKEN.
# Outputs (to $GITHUB_OUTPUT): tag=vX.Y.Z (or empty), publish=true|false.
set -euo pipefail

tag=""
case "$EVENT" in
  push)
    if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
      tag="$GITHUB_REF_NAME"
    else
      tag="v$(node -p 'require("./desktop/package.json").version')"
    fi
    ;;
  workflow_dispatch)
    tag="${INPUT:-}"
    ;;
esac

publish=false
if [[ -n "$tag" ]]; then
  if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    echo "::error::Version must look like v0.1.0 (got \"$tag\")"
    exit 1
  fi
  if gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
    if [[ "$EVENT" == "push" && "$GITHUB_REF" != refs/tags/* ]]; then
      echo "$tag is already released. Raise the version in desktop/package.json to release again."
    else
      echo "::error::$tag is already released. Use a higher version."
      exit 1
    fi
  else
    publish=true
  fi
fi

echo "Version: ${tag:-none}, publish: $publish"
{
  echo "tag=$tag"
  echo "publish=$publish"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"

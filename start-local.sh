#!/usr/bin/env bash
set -e
corepack enable
corepack prepare pnpm@11.25.0 --activate
if [ ! -d node_modules ]; then pnpm install; fi
pnpm dev

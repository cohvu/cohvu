#!/bin/bash
set -e

cd "$(dirname "$0")"
npm install
zip -r cohvu.mcpb manifest.json server/ node_modules/ icon.png
echo "Built cohvu.mcpb — replace icon.png before submitting"

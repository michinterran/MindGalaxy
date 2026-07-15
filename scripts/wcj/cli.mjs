#!/usr/bin/env node

import process from "node:process";
import { formatHuman, validateWcj } from "./core.mjs";

function parseArguments(argv) {
  const options = { format: "human", root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--format") {
      options.format = argv[index + 1];
      index += 1;
    } else if (argument === "--root") {
      options.root = argv[index + 1];
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!["human", "json"].includes(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/wcj/cli.mjs [--format human|json] [--root PATH]\n");
    process.exit(0);
  }
  const result = await validateWcj({ root: options.root });
  process.stdout.write(
    options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : formatHuman(result),
  );
  process.exitCode = result.score.passed ? 0 : 1;
} catch (error) {
  process.stderr.write(`WCJ validator error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}

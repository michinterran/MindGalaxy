import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const nextOutput = resolve(process.cwd(), ".next");

await rm(nextOutput, { force: true, recursive: true });

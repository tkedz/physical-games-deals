/**
 * Starts Vitest from the working directory's canonical path.
 *
 *   npm test
 *   npm test -- --project db
 *
 * On Windows, Vitest 5.0.4 fails every test file when the process starts in a
 * directory whose drive letter is lowercase (`c:\…`, as an editor's terminal
 * may open the project): its worker loads Vitest as `file:///c:/…`, the test
 * files import it as `file:///C:/…`, Node keeps the two as separate modules,
 * and each file fails with "Cannot read properties of undefined (reading
 * 'config')". A `chdir` in vitest.config.mts comes too late, because Vitest is
 * already loaded by then. So this script changes into the path as the file
 * system spells it and only then loads Vitest from there, which gives both
 * sides one spelling. On Linux and macOS it changes nothing.
 *
 * npm runs it from the repository root, so node_modules/ is found there. The
 * arguments after the script name reach Vitest unchanged.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.chdir(realpathSync.native(process.cwd()));

// The `bin` of vitest's package.json. Built from the canonical directory, not
// from import.meta.url, which carries whatever spelling started this script.
await import(
  pathToFileURL(join(process.cwd(), "node_modules", "vitest", "vitest.mjs"))
    .href
);

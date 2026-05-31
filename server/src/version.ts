import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A short, stable id for the currently built client. Hashing the built index.html means it changes
// exactly when the client bundle changes (index.html embeds the content-hashed asset filenames), but
// stays constant across plain server restarts (e.g. a Render cold start), so it never raises a false
// "new version" prompt. Falls back to the git commit, then "dev", when there's no built client (dev).
function computeBuildId(): string {
  try {
    const indexHtml = path.resolve(__dirname, "../../client/dist/index.html");
    const contents = fs.readFileSync(indexHtml);
    return crypto.createHash("sha1").update(contents).digest("hex").slice(0, 12);
  } catch {
    return process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? "dev";
  }
}

export const BUILD_ID = computeBuildId();

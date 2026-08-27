import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function git(args: string): string | undefined {
  try {
    return (
      execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Incremental build number: CI BUILD_NUMBER when present, else the git commit count (monotonic).
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? packageVersion();
const buildNumber =
  process.env.NEXT_PUBLIC_BUILD_NUMBER ??
  process.env.BUILD_NUMBER ??
  git("rev-list --count HEAD") ??
  "0";
const gitSha =
  process.env.NEXT_PUBLIC_GIT_SHA ??
  process.env.GIT_SHA ??
  git("rev-parse --short HEAD") ??
  "unknown";

// Note: this app reads and writes through server components and server actions,
// so it needs a Node runtime. `output: "export"` is deliberately not offered.
const nextConfig: NextConfig = {
  trailingSlash: true,
  // Hosts allowed to load dev-only resources (/_next/hmr, /_next/static…) when the
  // dev server is reached from something other than localhost — a phone or another
  // machine on the LAN. Matched on hostname alone: ports are ignored, so this has
  // nothing to do with the backend's :8000. `localhost` and `**.localhost` are
  // already allowed by default; they are listed for the next person reading this.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.0.15"],
  // `/` is not a page: the app is the contacts manager. A routing-layer redirect
  // is a real 308, unlike a prerendered page that would meta-refresh the browser.
  async redirects() {
    return [{ source: "/", destination: "/contacts", permanent: true }];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;

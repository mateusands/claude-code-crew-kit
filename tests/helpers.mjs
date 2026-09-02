/**
 * Test helpers: a real MCP stdio client and throwaway git fixtures.
 * The server under test is spawned exactly as an MCP client would spawn it.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

export const REPO_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

/** A fresh git repo with the given files committed. */
export function makeRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "crew-fixture-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main", ".");
  git("config", "user.email", "t@t.co");
  git("config", "user.name", "t");
  for (const [name, body] of Object.entries(files)) {
    // Fixtures may name nested paths — a real repo has directories.
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "baseline");
  return { dir, git, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Speaks MCP over stdio to a server process. */
export class Client {
  constructor(serverPath, env = {}) {
    this.p = spawn(process.execPath, [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    this.id = 0;
    this.pending = new Map();
    this.buf = "";
    this.p.stdout.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) !== -1) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        const r = this.pending.get(m.id);
        if (r) { this.pending.delete(m.id); r(m); }
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    const done = new Promise((res) => this.pending.set(id, res));
    this.p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return done;
  }
  async init() { return this.send("initialize", {}); }
  /** Returns the tool's text output. */
  async call(name, args) {
    const m = await this.send("tools/call", { name, arguments: args });
    return { text: m.result?.content?.[0]?.text ?? "", isError: !!m.result?.isError };
  }
  close() { this.p.kill(); }
}

/** Every `OUT-OF-SCOPE WRITE` path named in a report. */
export function outOfScope(text) {
  return [...text.matchAll(/OUT-OF-SCOPE WRITE — `([^`]+)`/g)].map((m) => m[1]).sort();
}

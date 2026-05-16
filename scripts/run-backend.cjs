/**
 * Starts Spring Boot from backend/ using the Maven wrapper.
 * Sets JAVA_HOME on Windows when it is missing but `java` is on PATH.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const backendDir = path.join(repoRoot, "backend");

/** Load repo-root .env into process.env (does not override variables already set in the shell). */
function loadDotEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function ensureJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, "bin", "java.exe"))) {
    return;
  }
  if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, "bin", "java"))) {
    return;
  }
  const { execFileSync } = require("child_process");
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(cmd, ["java"], { encoding: "utf8" }).trim();
    const javaExe = process.platform === "win32" ? out.split(/\r?\n/)[0] : out.split("\n")[0];
    if (javaExe && !javaExe.toLowerCase().includes("windowsapps")) {
      const binDir = path.dirname(javaExe);
      if (path.basename(binDir).toLowerCase() === "bin") {
        process.env.JAVA_HOME = path.dirname(binDir);
        return;
      }
    }
  } catch {
    // continue scanning
  }
  const roots = [];
  if (process.env.PROGRAMFILES) roots.push(path.join(process.env.PROGRAMFILES, "Java"));
  if (process.env["PROGRAMFILES(X86)"]) roots.push(path.join(process.env["PROGRAMFILES(X86)"], "Java"));
  roots.push(path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Eclipse Adoptium"));
  roots.push(path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft"));
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const name of fs.readdirSync(root)) {
        if (!/jdk|java/i.test(name)) continue;
        const home = path.join(root, name);
        const javaExe = path.join(home, "bin", "java.exe");
        if (fs.existsSync(javaExe)) {
          process.env.JAVA_HOME = home;
          return;
        }
      }
    } catch {
      // ignore
    }
  }
}

loadDotEnv();

if (!process.env.MONGODB_URI) {
  console.warn(
    "\n[docuflex] MONGODB_URI is not set. The API defaults to mongodb://localhost:27017/docuflex.\n" +
      "For MongoDB Atlas: copy .env.example to .env in the repo root and set MONGODB_URI before npm run dev.\n" +
      "For local Docker Mongo instead: npm run db:up (requires Docker Desktop), then npm run dev.\n",
  );
}

ensureJavaHome();

const mvnw = process.platform === "win32" ? "mvnw.cmd" : "./mvnw";
const child = spawn(mvnw, ["spring-boot:run"], {
  cwd: backendDir,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

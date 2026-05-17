import { spawn } from "node:child_process";

const scripts = [
  "migrate-for-repair-trucks-to-supabase.mjs",
  "migrate-repair-truck-events-to-supabase.mjs",
  "migrate-completed-repairs-to-supabase.mjs"
];

function runScript(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: new URL(".", import.meta.url),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", code => resolve({ script, code, stdout, stderr }));
  });
}

const results = [];
for (const script of scripts) {
  console.log(`\nRunning ${script}...`);
  results.push(await runScript(script));
}

console.log("\nSummary:");
console.log(JSON.stringify(results.map(result => ({
  script: result.script,
  ok: result.code === 0,
  code: result.code
})), null, 2));

if (results.some(result => result.code !== 0)) {
  process.exitCode = 1;
}

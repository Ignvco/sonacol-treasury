import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
const problems = [];
for (const path of new Set(files)) {
  if (/(^|\/)\.env$|(^|\/)(sap|backup)\.env$|\.(dump|pem|p12|key)$/.test(path))
    problems.push(path + ": archivo de credenciales o respaldo");
  if (!/\.(tsx?|m?js|json|ya?ml|toml|md|example|sql)$/.test(path)) continue;
  const text = readFileSync(path, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
    problems.push(path + ": clave privada");
  if (
    path.startsWith("src/") &&
    /VITE_[A-Z_]*(SERVICE_ROLE|SAP_PASSWORD|OPENAI_API_KEY)/.test(text)
  )
    problems.push(path + ": secreto expuesto al navegador");
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Control estático: sin archivos de credenciales ni secretos de servidor en variables VITE.",
  );

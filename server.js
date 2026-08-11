import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
const API_ONLY = process.argv.includes("--api-only");
const DIST_DIR = join(process.cwd(), "dist");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/coach") {
      await handleCoach(req, res);
      return;
    }

    if (API_ONLY) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`UTM practice server running at http://127.0.0.1:${PORT}`);
});

async function handleCoach(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    sendJson(res, 503, { fallback: true, error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  const payload = await readJson(req);
  const safePayload = sanitizeCoachPayload(payload);

  const openRouterResponse = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://127.0.0.1",
      "X-OpenRouter-Title": "UTM Academia Practica",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 55,
      messages: [
        {
          role: "system",
          content:
            "Eres un tutor universitario para estudiantes adultos. Ayudas a analizar preguntas de examen sin revelar la respuesta correcta, sin mencionar letras de opciones y sin decir cual opcion elegir. Responde en espanol con una sola pista directa, maximo 25 palabras.",
        },
        {
          role: "user",
          content: buildCoachPrompt(safePayload),
        },
      ],
    }),
  });

  if (!openRouterResponse.ok) {
    sendJson(res, 503, { fallback: true, error: "OpenRouter unavailable or credits exhausted" });
    return;
  }

  const data = await openRouterResponse.json();
  const hint = trimHint(data?.choices?.[0]?.message?.content?.trim() || "");

  if (!hint) {
    sendJson(res, 503, { fallback: true, error: "Empty AI response" });
    return;
  }

  sendJson(res, 200, { hint });
}

function buildCoachPrompt(payload) {
  return [
    `Materia: ${payload.subject}`,
    `Unidad: ${payload.unit}`,
    `Dificultad: ${payload.difficulty}`,
    `Modo de ayuda: ${payload.mode}`,
    `Pregunta: ${payload.question}`,
    "Opciones disponibles, sin informacion de cual es correcta:",
    ...payload.options.map((option, index) => `${index + 1}. ${option}`),
    "Instrucciones: da una pista directa segun el modo. No reveles la respuesta, no nombres el numero de opcion correcta, no uses frases como 'la respuesta es' y no superes 25 palabras.",
  ].join("\n");
}

function sanitizeCoachPayload(payload) {
  return {
    mode: String(payload?.mode || "enunciado").slice(0, 24),
    subject: String(payload?.subject || "Asignatura").slice(0, 80),
    unit: String(payload?.unit || "").slice(0, 20),
    difficulty: String(payload?.difficulty || "").slice(0, 30),
    question: String(payload?.question || "").slice(0, 1200),
    options: Array.isArray(payload?.options)
      ? payload.options.map((option) => String(option).slice(0, 500)).slice(0, 6)
      : [],
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(DIST_DIR, normalizedPath);
  const indexPath = join(DIST_DIR, "index.html");
  const targetPath = existsSync(filePath) ? filePath : indexPath;
  const extension = extname(targetPath);
  const content = await readFile(targetPath);

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  res.end(content);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function trimHint(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= 28) {
    return words.join(" ");
  }

  return `${words.slice(0, 28).join(" ")}...`;
}

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

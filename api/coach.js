const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    response.status(503).json({ fallback: true, error: "OPENROUTER_API_KEY is not configured" });
    return;
  }

  try {
    const safePayload = sanitizeCoachPayload(request.body || {});

    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://vercel.app",
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
      response.status(503).json({ fallback: true, error: "OpenRouter unavailable or credits exhausted" });
      return;
    }

    const data = await openRouterResponse.json();
    const hint = trimHint(data?.choices?.[0]?.message?.content?.trim() || "");

    if (!hint) {
      response.status(503).json({ fallback: true, error: "Empty AI response" });
      return;
    }

    response.status(200).json({ hint });
  } catch (error) {
    response.status(503).json({ fallback: true, error: "AI coach unavailable" });
  }
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

function trimHint(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= 28) return words.join(" ");
  return `${words.slice(0, 28).join(" ")}...`;
}

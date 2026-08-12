export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Use POST for this endpoint." },
      { status: 405 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured in Netlify." },
      { status: 500 }
    );
  }

  const body = await req.json();

  const mode = String(body?.mode || "claim").trim();
  const text = String(body?.text || body?.message || "").trim();
  const url = String(body?.url || "").trim();

  if (!text) {
    return Response.json(
      { error: "Please provide a message." },
      { status: 400 }
    );
  }

  let task = "";

  if (mode === "otto") {
    task = `
You are Otto, the friendly chatbot inside the VERIFY
fake-news checker website.

Answer the user's question naturally and conversationally.

IMPORTANT:
- For general questions, answer normally.
- Do NOT automatically use VERDICT.
- Do NOT automatically use CONFIDENCE.
- Do NOT force general questions into a fact-checking format.
- Do not invent sources, URLs, quotes, statistics, dates, or evidence.
- Do not pretend that you browsed the internet.
- If you don't know something, say so clearly.

If the user asks about fake news, fact checking, claims,
sources, or how to use VERIFY, explain it normally.

If the user specifically asks you to verify a claim,
give a cautious assessment.

USER:
${text}
`;
  }

  else if (mode === "article") {
    task = `
Analyze the supplied article text.

Give one overall verdict:
LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE.

Give CONFIDENCE:
LOW / MEDIUM / HIGH.

Explain the important claims and evidence.

ARTICLE:
${text}
`;
  }

  else if (mode === "url") {
    task = `
A user supplied a news URL.

Do not pretend that you read the article unless its contents
were actually retrieved.

Give one overall verdict:
LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE.

Give CONFIDENCE:
LOW / MEDIUM / HIGH.

Explain what can actually be established.

URL:
${url || text}
`;
  }

  else if (mode === "source") {
    task = `
Assess the named news source or outlet.

Do not claim that every article from the source is true or false.

Do not invent ownership details, scandals, ratings,
citations, or other facts.

SOURCE:
${text}
`;
  }

  else {
    task = `
Analyze the supplied news claim.

Give one overall verdict:
LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE.

Give CONFIDENCE:
LOW / MEDIUM / HIGH.

Explain your reasoning clearly and briefly.

CLAIM:
${text}
`;
  }

  const prompt = mode === "otto"
    ? `
You are Otto, a friendly chatbot.

${task}

Answer naturally.

Do NOT use:
VERDICT:
CONFIDENCE:

unless the user specifically asks for a structured
verification result.
`
    : `
You are a careful fake-news verification assistant.

${task}

IMPORTANT:
- Do not invent sources.
- Do not invent URLs.
- Do not invent quotes.
- Do not invent statistics.
- Do not invent dates.
- Do not claim that you browsed a webpage unless the backend
  actually retrieved its contents.
- Distinguish evidence from inference.
- If reliable evidence is insufficient, use UNVERIFIABLE.
- AI verification is not guaranteed to be correct.

USER INPUT:
"${text}"

Return:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Short, clear explanation.

EVIDENCE:
List only evidence that you can actually support.
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error:
            data?.error?.message ||
            "Gemini API request failed."
        },
        {
          status: response.status,
          headers: {
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!reply) {
      return Response.json(
        { error: "Gemini returned no answer." },
        { status: 502 }
      );
    }

    return Response.json(
      {
        answer: reply,
        reply: reply
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: "Could not connect to Gemini."
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};

export const config = {
  path: "/api/chat"
};

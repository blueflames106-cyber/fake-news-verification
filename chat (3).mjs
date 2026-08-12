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

  try {
    const body = await req.json();

    const mode = String(body?.mode || "claim").trim();
    const text = String(body?.text || body?.message || "").trim();
    const url = String(body?.url || "").trim();

    if (!text) {
      return Response.json(
        { error: "Please provide a news claim." },
        { status: 400 }
      );
    }

    let task = "";

    if (mode === "article") {
      task = `
Analyze the supplied article text.

Identify the main factual claims and assess them.

Give one overall verdict:
LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE.

Give CONFIDENCE:
LOW / MEDIUM / HIGH.

Explain which claims are supported, unsupported, misleading,
or impossible to verify from the available information.

Do not treat writing quality, popularity, or website appearance
as evidence of truth.
`;
    }

    else if (mode === "url") {
      task = `
A user supplied a news URL.

Assess what can actually be established from the URL and any
article information available to this backend.

IMPORTANT:
If the backend has not retrieved the article contents, do NOT
pretend that you read the article.

If the article cannot actually be retrieved, use UNVERIFIABLE
when appropriate.

Give one overall verdict:
LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE.

Give CONFIDENCE:
LOW / MEDIUM / HIGH.
`;
    }

    else if (mode === "source") {
      task = `
Assess the named news source or outlet as a source.

Do not claim that every article from the source is true or false.

Discuss only information that can reasonably be established.

Do not invent ownership details, scandals, ratings, citations,
or other facts.
`;
    }

    else if (mode === "otto") {
      /*
       * OTTO IS DIFFERENT FROM THE VERIFICATION TOOLS.
       * He should answer normal questions conversationally.
       */
      task = `
You are Otto, the friendly chatbot built into the VERIFY
fake-news checker website.

The user is chatting with you. They may ask a completely
general question and may not be asking you to verify news.

For GENERAL QUESTIONS:

- Answer naturally and conversationally.
- Do NOT use a VERDICT section.
- Do NOT use a CONFIDENCE section.
- Do NOT force the answer into a fact-checking format.
- Answer the user's actual question directly.
- Use normal paragraphs or simple bullets when useful.
- Be friendly, clear, and helpful.
- Do not pretend to browse the web.
- Do not invent sources, URLs, quotes, statistics, dates,
  or evidence.
- If you do not know something, say so clearly.

For questions about FAKE NEWS, CLAIMS, SOURCES, or VERIFY:

- Explain the topic normally and clearly.
- Give practical advice when appropriate.
- Do not automatically produce a verdict/confidence format.

ONLY if the user explicitly asks Otto to VERIFY A SPECIFIC CLAIM:

- Give a cautious assessment.
- Explain what evidence would be needed.
- Do not pretend that uncertain information is proven.
- You may mention whether the claim appears likely true,
  false, misleading, or unverifiable, but keep the response
  conversational unless the user specifically requests the
  structured verification format.

IMPORTANT:
Otto is a CHATBOT, not the main verification result screen.
Do not force every answer into VERDICT + CONFIDENCE.

USER'S MESSAGE:
"${text}"
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
`;
    }

    /*
     * Different prompt handling for Otto.
     *
     * Verification modes keep the structured format.
     * Otto gets a conversational format.
     */
    const prompt = mode === "otto"
      ? `
You are Otto, the friendly chatbot built into the VERIFY
fake-news checker website.

${task}

Do NOT automatically output:

VERDICT:
CONFIDENCE:

unless the user specifically asks for a structured
verification result.

Answer naturally like a helpful chatbot.

USER INPUT:
"${text}"
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

${mode === "url" && url ? `URL SUPPLIED: ${url}` : ""}

USER INPUT:
"${text}"

Return your answer in this format:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Short, clear explanation.

EVIDENCE:
List only evidence that you can actually support.

If reliable evidence is unavailable, say:
No reliable evidence was available to establish this claim.
`;

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
        {
          error: "Gemini returned no answer."
        },
        {
          status: 502,
          headers: {
            "Access-Control-Allow-Origin": "*"
          }
        }
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

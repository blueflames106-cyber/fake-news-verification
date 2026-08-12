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
        { error: "Please provide something to check." },
        { status: 400 }
      );
    }

    let task = "";

    // =========================
    // NORMAL CLAIM
    // =========================

    if (mode === "claim") {
      task = `
Analyze the supplied news claim.

Give:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Give a short, clear explanation.

EVIDENCE:
Give only evidence you can actually support.
`;
    }

    // =========================
    // ARTICLE
    // =========================

    else if (mode === "article") {
      task = `
Analyze the supplied article text.

Identify the important factual claims.

Give:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Explain the important claims clearly.

EVIDENCE:
Give only evidence you can actually support.
`;
    }

    // =========================
    // URL
    // =========================

    else if (mode === "url") {
      task = `
Analyze the supplied news URL.

Do not pretend that you read the webpage unless
the article contents were actually retrieved.

Give:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Explain what can actually be established.

EVIDENCE:
Give only evidence you can actually support.
`;
    }

    // =========================
    // SOURCE
    // =========================

    else if (mode === "source") {
      task = `
Assess the named news source or publication.

Do not claim that everything published by the source
is true or false.

Explain what can reasonably be established about the source.

Do not invent ownership, scandals, ratings, statistics,
citations, or other facts.
`;
    }

    // =========================
    // OTTO
    // =========================

    else if (mode === "otto") {
      task = `
You are Otto, the friendly chatbot inside VERIFY.

Answer the user's question naturally.

For normal questions:
- Answer conversationally.
- Do NOT use VERDICT.
- Do NOT use CONFIDENCE.
- Do NOT force the answer into a fact-checking format.

If the user asks about fake news, misinformation,
fact checking, claims, sources, or VERIFY, explain
the subject normally.

Only use VERDICT and CONFIDENCE if the user explicitly
asks Otto to verify a specific claim.

Do not invent sources, URLs, statistics, dates, quotes,
or evidence.

Do not pretend that you browsed the internet.
`;
    }

    // =========================
    // CLAIM EVOLUTION
    // =========================

    else if (mode === "claim_evolution") {
      task = `
Trace the evolution of the supplied viral claim.

IMPORTANT OUTPUT RULES:

- Give ONLY the story of the claim's evolution.
- Explain where the claim appears to have started, if this
  can actually be established.
- Explain how the claim changed, spread, was reframed,
  had context removed, or developed over time.
- Present the information as a chronological story.
- If the earliest version cannot be established, say that.
- Do NOT give a verdict.
- Do NOT give confidence.
- Do NOT say TRUE, FALSE, MISLEADING, or UNVERIFIABLE
  as a final judgment.
- Do NOT create a fact-check scorecard.
- Do NOT add a separate evidence section.
- Do not invent dates, sources, people, events, or versions.

The response should be ONLY the claim's evolution story.
`;
    }

    // =========================
    // MISSING CONTEXT
    // =========================

    else if (mode === "missing_context") {
      task = `
Identify ONLY the missing context in the supplied claim,
headline, post, or statement.

IMPORTANT OUTPUT RULES:

- Give ONLY the missing context.
- Explain what important information is missing.
- Explain why each missing piece of context matters.
- Use short bullet points when useful.
- Do NOT give a verdict.
- Do NOT give confidence.
- Do NOT say whether the claim is true or false.
- Do NOT add an evidence section.
- Do not add a fact-check score.
- Do not invent missing facts.

The response should contain ONLY the context that is missing.
`;
    }

    // =========================
    // FACT VS OPINION
    // =========================

    else if (mode === "fact_opinion") {
      task = `
Determine whether the supplied statement is a FACT or an OPINION.

IMPORTANT OUTPUT RULES:

Start with exactly:

FACT

or:

OPINION

Then give one short explanation.

If it is a FACT, explain that it is a statement that can
be checked against evidence.

If it is an OPINION, explain that it expresses a belief,
judgment, interpretation, preference, or value.

IMPORTANT:
FACT does NOT automatically mean TRUE.

Do NOT give:
VERDICT
CONFIDENCE
EVIDENCE SCORE
FACT-CHECK RESULT

The response should ONLY identify FACT or OPINION
and briefly explain why.
`;
    }

    // =========================
    // DEFAULT
    // =========================

    else {
      task = `
Analyze the supplied news claim.

Give:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Give a short explanation.

EVIDENCE:
Give only evidence you can support.
`;
    }

    let prompt;

    // Special prompt for Otto
    if (mode === "otto") {
      prompt = `
You are Otto, the friendly chatbot inside VERIFY.

${task}

USER:
${text}
`;
    }

    // Special prompts for Media Lab
    else if (
      mode === "claim_evolution" ||
      mode === "missing_context" ||
      mode === "fact_opinion"
    ) {
      prompt = `
You are a media-literacy assistant inside VERIFY.

${task}

USER INPUT:
${text}

Follow the output rules exactly.
`;
    }

    // Normal verification prompt
    else {
      prompt = `
You are a careful fake-news verification assistant.

${task}

IMPORTANT:
- Do not invent sources.
- Do not invent URLs.
- Do not invent quotes.
- Do not invent statistics.
- Do not invent dates.
- Do not pretend you browsed the internet.
- Distinguish evidence from inference.
- If reliable evidence is unavailable, say so.

${mode === "url" && url ? `URL: ${url}` : ""}

USER INPUT:
${text}
`;
    }

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

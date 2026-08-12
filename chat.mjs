import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const mode = String(req.body?.mode || "claim").trim();

    const text = String(
      req.body?.text ||
      req.body?.message ||
      ""
    ).trim();

    const url = String(
      req.body?.url || ""
    ).trim();

    if (!text) {
      return res.status(400).json({
        error: "Please provide a message."
      });
    }

    let prompt = "";

    // ==================================================
    // OTTO CHATBOT
    // ==================================================

    if (mode === "otto") {
      prompt = `
You are Otto, the friendly chatbot inside the VERIFY
Fake News Checker website.

The user is talking to you.

Your job is to have a natural conversation.

IMPORTANT RULES:

- Answer general questions normally.
- Do NOT automatically give a VERDICT.
- Do NOT automatically give CONFIDENCE.
- Do NOT force general questions into a fact-checking format.
- Do NOT write "VERDICT:" unless the user asks for verification.
- Do NOT write "CONFIDENCE:" unless the user asks for verification.
- Be friendly, clear and helpful.
- Answer the actual question directly.
- Use normal paragraphs when appropriate.
- Use bullet points only when they make the answer clearer.
- Do not invent sources.
- Do not invent URLs.
- Do not invent quotes.
- Do not invent statistics.
- Do not invent dates.
- Do not pretend that you browsed the internet.
- If you do not know something, say so honestly.

If the user asks about fake news, misinformation,
fact-checking, news sources, or how to use VERIFY,
explain the subject normally.

If the user specifically asks you to verify a claim,
you can provide a cautious assessment.

USER MESSAGE:
${text}
`;
    }

    // ==================================================
    // ARTICLE VERIFICATION
    // ==================================================

    else if (mode === "article") {
      prompt = `
You are a careful fake-news verification assistant.

Analyze the supplied article.

Identify the important factual claims.

Return:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Give a short and clear explanation.

EVIDENCE:
Give only evidence that you can actually support.

Do not invent sources or facts.

ARTICLE:
${text}
`;
    }

    // ==================================================
    // URL VERIFICATION
    // ==================================================

    else if (mode === "url") {
      prompt = `
You are a careful fake-news verification assistant.

The user supplied a news URL.

IMPORTANT:

Do not pretend that you read the webpage.

Only discuss information that was actually provided
to the backend.

If the article contents cannot be retrieved,
use UNVERIFIABLE when appropriate.

Return:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Explain what can actually be established.

EVIDENCE:
Only provide evidence you can support.

URL:
${url || text}
`;
    }

    // ==================================================
    // SOURCE VERIFICATION
    // ==================================================

    else if (mode === "source") {
      prompt = `
You are a careful news-source evaluation assistant.

Assess the named news outlet or publication.

Do not claim that every article from the source
is true or false.

Do not invent:

- ownership information
- scandals
- ratings
- statistics
- citations
- reputation claims

Only discuss information that can reasonably
be established.

SOURCE:
${text}
`;
    }

    // ==================================================
    // NORMAL NEWS CLAIM VERIFICATION
    // ==================================================

    else {
      prompt = `
You are a careful fake-news verification assistant.

Analyze this news claim.

Return:

VERDICT: LIKELY TRUE / LIKELY FALSE / MISLEADING / UNVERIFIABLE

CONFIDENCE: LOW / MEDIUM / HIGH

WHY:
Give a short and clear explanation.

EVIDENCE:
List only evidence you can actually support.

Do not invent:

- sources
- URLs
- quotes
- statistics
- dates

CLAIM:
${text}
`;
    }

    // ==================================================
    // SEND REQUEST TO GEMINI
    // ==================================================

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

    // ==================================================
    // GEMINI ERROR
    // ==================================================

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    // ==================================================
    // GET GEMINI RESPONSE
    // ==================================================

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!answer) {
      return res.status(502).json({
        error: "Gemini returned no answer."
      });
    }

    // ==================================================
    // SEND RESPONSE TO FRONTEND
    // ==================================================

    return res.json({
      answer: answer,
      reply: answer
    });

  } catch (error) {

    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: "Could not connect to Gemini."
    });
  }
});

// ======================================================
// START NODE.JS SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`VERIFY server running on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b";

// Separate memory for each browser session
const sessions = new Map();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "JARVIS 3.0 backend is running",
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, accountMemory } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        error: "Session ID is required",
      });
    }

    // Create a separate session if this browser is new
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        userName: "",
        conversation: [
          {
            role: "system",
            content:
              "You are JARVIS 3.0, a personal AI assistant created by Saravna. " +
              "You are powered by the Qwen2.5 model running locally through Ollama. " +
              "If asked who created you, say you were created by Saravna. " +
              "Never claim to be created by another company. " +

              "PERSONALITY: " +
              "Be friendly, natural, conversational, and helpful. " +
              "Talk like a real assistant having a normal conversation. " +
              "Avoid robotic, overly formal, or repetitive replies. " +

              "ANSWER STYLE: " +
              
                "RESPONSE STYLE: " +
                "Adapt every response to the user's requested level of detail. " +
                "For normal conversation and ordinary questions, answer naturally " +
                "in 1 or 2 sentences, keeping the response clear and useful. " +

                "EXPLANATION: " +
                "When the user explicitly requests an explanation, provide at least " +
                "5 meaningful sentences, covering the essential information in a " +
                "logical and easy-to-understand way. Avoid unnecessary repetition " +
                "and irrelevant details. " +

                "DETAILED RESPONSES: " +
                "When the user requests a detailed or comprehensive explanation, " +
                "provide sufficient depth, relevant context, and examples where useful. " +
                "Organize longer responses clearly without adding filler. " +

                "BRIEF RESPONSES: " +
                "When the user requests a brief or shorter response, prioritize only " +
                "the most essential information and keep it to 1 or 2 sentences. " +

                "SIMPLE LANGUAGE: " +
                "When the user requests simple language, use familiar words and " +
                "clear sentences while preserving the information they requested. " +

                "CONVERSATION AWARENESS: " +
                "Pay attention to the user's previous messages and your previous replies. " +
                "Understand the context and intent of follow-up messages. " +
                "Do not repeat the same information unnecessarily. " +
                "When the user asks for more information, add relevant new details. " +
                "When the user asks to simplify or shorten a previous answer, " +
                "revise that answer according to the request. " +

                "PRIORITY: " +
                "Follow the user's explicit instructions about length and detail. " +
                "If multiple style instructions apply, prioritize the most specific " +
                "request. Keep every response accurate, relevant, natural, friendly, " +
                "and easy to understand."+

              "FORMATTING: " +
              "Prefer plain text for normal conversation. " +
              "Avoid unnecessary headings, asterisks, and long bullet lists. " +
              "Use lists only when they make the answer easier to understand. " +

              "MEMORY: " +
              "Remember the user's name when they tell you. " +
              "Use their name naturally, but do not overuse it. " +
              "Never invent personal information or claim to remember something you do not know. " +

              "Be accurate, concise, friendly, and helpful.",
          },
        ],
      });
    }

    const session = sessions.get(sessionId);

    // Detect the user's name from the current conversation

    const nameMatch = message.match(
      /(?:my name is|i am|i'm|it's|its|call me)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i
    );

    if (nameMatch) {
      session.userName = nameMatch[1].trim();
    }

    // Use account memory as the permanent source of the user's name

    if (accountMemory && accountMemory.name) {
      session.userName = accountMemory.name;
    }
    // Directly answer identity questions
    const identityQuestion = /^(who am i|what is my name|what's my name)\??$/i;

    if (identityQuestion.test(message.trim())) {
      if (session.userName) {
        return res.json({
          reply: `Your name is ${session.userName}.`,
          userName: session.userName,
        });
      }

      return res.json({
        reply: "I don't know your name yet. What should I call you?",
        userName: "",
      });
    }

    const currentUserInstruction = session.userName
      ? `The current user's name is ${session.userName}. Use this exact name naturally.`
      : "The current user's name is not known yet. Do not invent a name.";

    const accountMemoryInstruction =
      accountMemory && Object.keys(accountMemory).length > 0
        ? `ACCOUNT MEMORY:
    ${JSON.stringify(accountMemory)}

    Use this account memory when relevant.
    This memory belongs to the current signed-in user.
    Do not invent information that is not present in the account memory.`
        : "ACCOUNT MEMORY: No saved account memory is available yet.";

    const messages = [
      ...session.conversation,
      {
        role: "system",
        content: currentUserInstruction,
      },
      {
        role: "system",
        content: accountMemoryInstruction,
      },
      {
        role: "user",
        content: message,
      },
    ];

    const ollamaResponse = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
      }),
    });

    if (!ollamaResponse.ok) {
      throw new Error(
        `Ollama returned HTTP ${ollamaResponse.status}`
      );
    }

    const data = await ollamaResponse.json();
    const reply = data.message.content;

    // Save only this session's conversation
    session.conversation.push(
      { role: "user", content: message },
      { role: "assistant", content: reply }
    );

    res.json({
      reply,
      userName: session.userName,
    });
  } catch (error) {
    console.error("Ollama error:", error);

    res.status(500).json({
      error: "Could not connect to Ollama",
    });
  }
});
// Clear one browser session's memory
app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      error: "Session ID is required",
    });
  }

  sessions.delete(sessionId);

  res.json({
    message: "Session memory cleared",
  });
});

app.listen(PORT, () => {
  console.log(`JARVIS backend running at http://localhost:${PORT}`);
});
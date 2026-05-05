const dotenv = require("dotenv");
dotenv.config();

const OpenAI = require("openai");

// ---------------------------------------------------------------------------
// Shared OpenAI-compatible client pointing at OpenRouter
// ---------------------------------------------------------------------------
function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in server/.env");
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL || "https://studynotion-six-pied.vercel.app",
      "X-Title": "StudyNotion",
    },
  });
}

// Free model to use — change to any other free model on OpenRouter if needed
const FREE_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

// ---------------------------------------------------------------------------
// Helper: classify OpenRouter errors
// ---------------------------------------------------------------------------
function friendlyError(err) {
  const msg = err?.message || "";
  if (/quota|rate.?limit|429|insufficient/i.test(msg))
    return "AI quota reached. Please try again in a few minutes.";
  if (/api.?key|auth|401|403/i.test(msg))
    return "Invalid OpenRouter API key.";
  return msg || "AI assistant is temporarily unavailable.";
}

/**
 * POST /api/v1/ai/chat
 * Body: { messages: [{role, text}], context: { courseTitle, description, sections, currentLecture } }
 */
exports.chat = async (req, res) => {
  try {
    const client = getOpenRouterClient();

    const { messages = [], context = {} } = req.body;
    if (!messages.length) {
      return res.status(400).json({ success: false, message: "No messages provided" });
    }

    // Build system prompt from course context
    const contextLines = [];
    if (context.courseTitle)      contextLines.push(`Course: ${context.courseTitle}`);
    if (context.description)      contextLines.push(`Description: ${context.description}`);
    if (context.currentLecture)
      contextLines.push(
        `Currently watching: "${context.currentLecture.title}" — ${
          context.currentLecture.description || ""
        }`
      );
    if (context.sections?.length) {
      const toc = context.sections
        .map((s) => ` • ${s.sectionName}: ${s.subSection?.map((ss) => ss.title).join(", ")}`)
        .join("\n");
      contextLines.push(`Course outline:\n${toc}`);
    }
    if (context.whatYouWillLearn)
      contextLines.push(`What students will learn: ${context.whatYouWillLearn}`);

    const systemPrompt =
      contextLines.length
        ? `You are an expert AI tutor for StudyNotion, an online learning platform. You are helping a student with the following course:

${contextLines.join("\n")}

Your job:
- Answer questions clearly and concisely about the course content.
- Explain concepts, summarise topics, and help with exercises.
- If a question is unrelated to learning, politely redirect the student.
- Format your answers with markdown when it aids clarity (code blocks, bullet points, etc.).
- Keep answers focused and practical.`
        : `You are an expert AI tutor for StudyNotion, an online learning platform. Help students understand course content, answer questions, explain concepts, and guide learning. Be concise, clear, and educational.`;

    // Convert frontend message format to OpenAI format
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text || "",
      })),
    ];

    const completion = await client.chat.completions.create({
      model: FREE_MODEL,
      messages: openaiMessages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const reply = completion.choices?.[0]?.message?.content || "";
    return res.status(200).json({ success: true, data: { reply } });
  } catch (error) {
    console.error("OpenRouter AI chat error:", error);
    return res.status(500).json({ success: false, message: friendlyError(error) });
  }
};

/**
 * POST /api/v1/ai/describe-course
 * Body: { courseTitle, description, sections, whatYouWillLearn, instructor }
 */
exports.describeCourse = async (req, res) => {
  try {
    const client = getOpenRouterClient();

    const { courseTitle, description, sections = [], whatYouWillLearn, instructor } = req.body;
    if (!courseTitle) {
      return res.status(400).json({ success: false, message: "courseTitle is required" });
    }

    const toc = sections
      .map((s) => `- ${s.sectionName}: ${s.subSection?.map((ss) => ss.title).join(", ")}`)
      .join("\n");

    const prompt = `You are a professional course description writer for an online learning platform.
Given the following raw course data, write a compelling, well-structured AI-generated course overview.

Course Title: ${courseTitle}
${instructor ? `Instructor: ${instructor}` : ""}
Raw Description: ${description || "Not provided"}
What students will learn: ${whatYouWillLearn || "Not provided"}
Course outline:
${toc || "No sections yet"}

Respond ONLY with a valid JSON object — no markdown fences, no extra text. Use this exact structure:
{
  "headline": "A one-line compelling course headline (max 15 words)",
  "summary": "A 2-3 sentence engaging overview of the course",
  "keyTopics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "targetAudience": "Who this course is best for (1-2 sentences)",
  "prerequisites": "What students should know before starting (1 sentence)",
  "outcome": "What students will be able to do after completing this course (1-2 sentences)"
}`;

    const completion = await client.chat.completions.create({
      model: FREE_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    let text = completion.choices?.[0]?.message?.content?.trim() || "{}";

    // Strip markdown fences if the model adds them
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: text };
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (error) {
    console.error("OpenRouter describeCourse error:", error);
    return res.status(500).json({
      success: false,
      message: friendlyError(error),
    });
  }
};

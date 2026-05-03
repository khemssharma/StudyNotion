const dotenv = require("dotenv");
dotenv.config();

/**
 * POST /api/v1/ai/chat
 * Body: { messages: [{role, text}], context: { courseTitle, description, sections, currentLecture } }
 */
exports.chat = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is not set in server/.env",
      });
    }

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const { messages = [], context = {} } = req.body;

    if (!messages.length) {
      return res.status(400).json({ success: false, message: "No messages provided" });
    }

    // Build system prompt from course context
    const contextLines = [];
    if (context.courseTitle)     contextLines.push(`Course: ${context.courseTitle}`);
    if (context.description)     contextLines.push(`Description: ${context.description}`);
    if (context.currentLecture)  contextLines.push(`Currently watching: "${context.currentLecture.title}" — ${context.currentLecture.description || ""}`);
    if (context.sections?.length) {
      const toc = context.sections
        .map((s) => `  • ${s.sectionName}: ${s.subSection?.map((ss) => ss.title).join(", ")}`)
        .join("\n");
      contextLines.push(`Course outline:\n${toc}`);
    }
    if (context.whatYouWillLearn) contextLines.push(`What students will learn: ${context.whatYouWillLearn}`);

    const systemPrompt = contextLines.length
      ? `You are an expert AI tutor for StudyNotion, an online learning platform.
You are helping a student with the following course:

${contextLines.join("\n")}

Your job:
- Answer questions clearly and concisely about the course content.
- Explain concepts, summarise topics, and help with exercises.
- If a question is unrelated to learning, politely redirect the student.
- Format your answers with markdown when it aids clarity (code blocks, bullet points, etc.).
- Keep answers focused and practical.`
      : `You are an expert AI tutor for StudyNotion, an online learning platform.
Help students understand course content, answer questions, explain concepts, and guide learning.
Be concise, clear, and educational.`;

    // Gemini requires:
    //   - history must start with "user" role (never "model")
    //   - roles must strictly alternate user → model → user → model
    //   - the current message is sent via sendMessage(), NOT included in history

    const allButLast = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    // Map frontend roles → Gemini roles
    const mapped = allButLast.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text || "" }],
    }));

    // Drop all leading "model" messages (our local greeting sits here)
    const firstUserIdx = mapped.findIndex((m) => m.role === "user");
    const trimmed = firstUserIdx === -1 ? [] : mapped.slice(firstUserIdx);

    // Merge consecutive same-role entries so roles always alternate
    const history = trimmed.reduce((acc, cur) => {
      if (acc.length && acc[acc.length - 1].role === cur.role) {
        acc[acc.length - 1].parts[0].text += "\n" + cur.parts[0].text;
      } else {
        acc.push({ role: cur.role, parts: [{ text: cur.parts[0].text }] });
      }
      return acc;
    }, []);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({
      history,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });

    const result = await chat.sendMessage(lastMessage.text);
    const reply = result.response.text();

    return res.status(200).json({ success: true, data: { reply } });

  } catch (error) {
    console.error("Gemini AI error:", error);
    const msg = error?.message?.includes("API_KEY")
      ? "Invalid Gemini API key."
      : error?.message?.includes("quota")
      ? "Gemini API quota exceeded. Please try again later."
      : error?.message || "AI assistant is temporarily unavailable.";
    return res.status(500).json({ success: false, message: msg });
  }
};

/**
 * POST /api/v1/ai/describe-course
 * Body: { courseTitle, description, sections, whatYouWillLearn, instructor }
 */
exports.describeCourse = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is not set in server/.env",
      });
    }

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Strip markdown fences if Gemini adds them anyway
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: text };
    }

    return res.status(200).json({ success: true, data: parsed });

  } catch (error) {
    console.error("Gemini describeCourse error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to generate course description.",
    });
  }
};
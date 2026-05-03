import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { apiConnector } from "../../../services/apiconnector";
import { aiEndpoints } from "../../../services/apis";
import ReactMarkdown from "react-markdown";

const { AI_CHAT_API } = aiEndpoints;

// Simple sparkle/robot icon as inline SVG
const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" />
    <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" />
    <line x1="12" y1="16" x2="12" y2="16" strokeWidth="3" />
    <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MinimiseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Typing dots animation
function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-4 py-2">
      <div className="flex gap-1 bg-richblack-700 rounded-2xl rounded-bl-sm px-4 py-3">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-richblack-300 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// Renders a single message bubble
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-3 py-1`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-yellow-50 text-richblack-900 flex items-center justify-center mr-2 mt-1 shrink-0">
          <BotIcon />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-yellow-50 text-richblack-900 rounded-br-sm"
            : "bg-richblack-700 text-richblack-5 rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p>{msg.text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none
            prose-p:my-1 prose-ul:my-1 prose-li:my-0.5
            prose-code:bg-richblack-800 prose-code:px-1 prose-code:rounded
            prose-pre:bg-richblack-800 prose-pre:p-2 prose-pre:rounded">
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AIAssistant — floating chat widget
 *
 * Props:
 *   courseContext — { courseTitle, description, sections, whatYouWillLearn, currentLecture? }
 *   position      — "bottom-right" (default) | "bottom-left" | "inline"
 *   suggestedQuestions — string[] (shown as quick chips)
 */
export default function AIAssistant({
  courseContext = {},
  position = "bottom-right",
  suggestedQuestions = [],
}) {
  const { token } = useSelector((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryTimerRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Clear countdown timer on unmount
  useEffect(() => () => clearInterval(retryTimerRef.current), []);

  const startRetryCountdown = (seconds = 60) => {
    setRetryCountdown(seconds);
    retryTimerRef.current = setInterval(() => {
      setRetryCountdown((s) => {
        if (s <= 1) { clearInterval(retryTimerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  // Build default suggested questions from context
  const defaultSuggestions = suggestedQuestions.length ? suggestedQuestions : [
    courseContext.courseTitle
      ? `What will I learn in "${courseContext.courseTitle}"?`
      : "What is this course about?",
    courseContext.currentLecture?.title
      ? `Explain "${courseContext.currentLecture.title}" in simple terms`
      : "Summarise the course content",
    "What are the prerequisites for this course?",
    "Give me a quick quiz on what I just watched",
  ];

  // Greet on open
  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = courseContext.courseTitle
        ? `Hi there! 👋 I'm your AI tutor for **${courseContext.courseTitle}**. Ask me anything about the course — concepts, summaries, exercises, or anything you're confused about!`
        : "Hi! I'm your AI tutor. Ask me anything about this course!";
      setMessages([{ role: "assistant", text: greeting }]);
    }
  }, [open]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimised]);

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading || retryCountdown > 0) return;
    setInput("");
    setError(null);

    const userMsg = { role: "user", text: userText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await apiConnector("POST", AI_CHAT_API, {
        messages: updatedMessages.map((m) => ({ role: m.role, text: m.text })),
        context: courseContext,
      }, headers);

      if (res?.data?.success) {
        setMessages((prev) => [...prev, { role: "assistant", text: res.data.data.reply }]);
      } else {
        throw new Error(res?.data?.message || "No response");
      }
    } catch (err) {
      console.error("AI chat error:", err);
      const isRateLimit = err?.response?.status === 429 || err?.response?.data?.retryable;
      const errMsg = err?.response?.data?.message
        || err?.message
        || "Sorry, I couldn't respond right now. Please try again.";

      if (isRateLimit) {
        startRetryCountdown(60);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `⏳ **Rate limit reached** — the free Gemini API allows ~15 requests per minute. I'll be ready again in about 60 seconds. You can still type your message and send it once the timer clears!` },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${errMsg}` }]);
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [messages, input, loading, retryCountdown, token, courseContext]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Position classes
  const positionClass = position === "bottom-left"
    ? "bottom-6 left-6"
    : "bottom-6 right-6";

  const chatWidth = "w-[360px] sm:w-[400px]";

  return (
    <div className={`fixed ${positionClass} z-[9999] flex flex-col items-end gap-3`}>
      {/* Chat Panel */}
      {open && (
        <div
          className={`${chatWidth} rounded-2xl overflow-hidden shadow-2xl border border-richblack-700
            flex flex-col bg-richblack-900 transition-all duration-300
            ${minimised ? "h-14" : "h-[520px]"}`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-richblack-800 px-4 py-3 border-b border-richblack-700 shrink-0">
            <div className="w-8 h-8 rounded-full bg-yellow-50 text-richblack-900 flex items-center justify-center">
              <BotIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-richblack-5 truncate">
                AI Tutor
              </p>
              <p className="text-xs text-richblack-400 truncate">
                {courseContext.currentLecture?.title
                  ? `📍 ${courseContext.currentLecture.title}`
                  : courseContext.courseTitle || "Course Assistant"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimised((v) => !v)}
                className="p-1.5 rounded-lg hover:bg-richblack-700 text-richblack-400 hover:text-richblack-5 transition-colors"
                title={minimised ? "Expand" : "Minimise"}
              >
                <MinimiseIcon />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-richblack-700 text-richblack-400 hover:text-richblack-5 transition-colors"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          {!minimised && (
            <>
              <div className="flex-1 overflow-y-auto py-3 space-y-1">
                {messages.map((m, i) => (
                  <MessageBubble key={i} msg={m} />
                ))}
                {loading && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>

              {/* Suggested questions (shown when only greeting is present) */}
              {messages.length <= 1 && !loading && (
                <div className="px-3 pb-2 flex flex-wrap gap-2">
                  {defaultSuggestions.slice(0, 3).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="text-xs bg-richblack-800 hover:bg-richblack-700 text-richblack-200
                        border border-richblack-600 rounded-full px-3 py-1.5 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="shrink-0 border-t border-richblack-700 bg-richblack-800 px-3 py-3">
                {/* Rate limit banner */}
                {retryCountdown > 0 && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-yellow-900/30 border border-yellow-500/30 px-3 py-2">
                    <span className="text-lg">⏳</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-yellow-300">Rate limit — please wait</p>
                      <p className="text-xs text-yellow-500">Ready in {retryCountdown}s</p>
                    </div>
                    <span className="text-xl font-bold text-yellow-300 tabular-nums">{retryCountdown}s</span>
                  </div>
                )}
                <div className={`flex items-end gap-2 rounded-xl px-3 py-2 transition-colors ${
                  retryCountdown > 0 ? "bg-richblack-600 opacity-60" : "bg-richblack-700"
                }`}>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={retryCountdown > 0 ? `Cooling down… (${retryCountdown}s)` : "Ask anything about this course…"}
                    className="flex-1 bg-transparent text-sm text-richblack-5 placeholder-richblack-400
                      resize-none outline-none min-h-[24px] max-h-[96px]"
                    disabled={loading || retryCountdown > 0}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim() || retryCountdown > 0}
                    className="p-2 rounded-lg bg-yellow-50 text-richblack-900
                      hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-colors shrink-0"
                  >
                    {retryCountdown > 0
                      ? <span className="text-xs font-bold tabular-nums w-4 text-center block">{retryCountdown}</span>
                      : <SendIcon />
                    }
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-richblack-500">
                  Powered by Gemini · Free tier: ~15 requests/min
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => { setOpen((v) => !v); setMinimised(false); }}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center
          transition-all duration-300 hover:scale-110
          ${open ? "bg-richblack-700 text-richblack-5" : "bg-yellow-50 text-richblack-900"}`}
        title={open ? "Close AI Tutor" : "Open AI Tutor"}
      >
        {open ? (
          <CloseIcon />
        ) : (
          <span className="text-2xl select-none">✨</span>
        )}
      </button>
    </div>
  );
}
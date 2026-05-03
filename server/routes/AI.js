const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const AI = require("../controllers/AI");

// Optional auth — attaches req.user if a valid token is present, but never blocks the request
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    }
  } catch (_) {
    // Invalid token is fine — just proceed as guest
  }
  next();
};

// POST /api/v1/ai/chat
router.post("/chat", optionalAuth, AI.chat);

// POST /api/v1/ai/describe-course
router.post("/describe-course", optionalAuth, AI.describeCourse);

module.exports = router;
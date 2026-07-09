/**
 * pipelineRoutes.js — Express router for the Data Engineering Pipeline
 * Mounted at /api/v1/pipeline in server/index.js
 */

const express    = require("express");
const router     = express.Router();
const { auth, isAdmin } = require("../middlewares/auth");
const ctrl       = require("./pipelineController");

// Public (or optionally auth-gated) event ingestion
// We allow unauthenticated events so pre-login sessions are tracked too.
// The controller reads req.user only if it exists.
router.post("/event",        ctrl.ingestEvent);
router.post("/events",       ctrl.ingestEvents);

// Analytics reads — require auth
router.get ("/summary",      auth, ctrl.getSummaries);
router.get ("/funnel",       auth, ctrl.getCourseFunnel);
router.get ("/retention",    auth, ctrl.getRetention);

// Admin-only ops
router.post("/aggregate",    auth, isAdmin, ctrl.triggerAggregation);

module.exports = router;

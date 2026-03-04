/**
 * Checksum: b4ck-3nd-v6-deploy-ready
 * Status: Rover Bypass | Optimized for Render Deploy
 */

const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors"); // Added to prevent cross-origin blocks

const app = express();
app.use(express.json());
app.use(cors());

// ===== ENV CHECK =====
const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EPN_CAMPAIGN_ID,
  PORT
} = process.env;

// OGR Check: Ensure Render actually has these keys in the "Environment" tab
if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EPN_CAMPAIGN_ID) {
  console.error("CRITICAL: Missing EPN/eBay Environment Variables");
  process.exit(1);
}

// ===== REDIRECT ROUTE (The "Discrete Arrow" Fix) =====
app.get("/api/ebay-redirect", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("Missing query");

  // Step 1: Define EPN Parameters
  const toolid = "10001";
  const mkevt = "1";
  const mkcid = "1";
  const mkrid = "706-53473-19255-0"; // eBay Canada specific

  // Step 2: Build the Direct Search URL
  // encodeURIComponent(q) ensures the space between card name and condition doesn't break the pipe.
  const query = encodeURIComponent(q);
  const affiliateUrl = `https://www.ebay.ca/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&mkcid=${mkcid}&mkrid=${mkrid}&campid=${EPN_CAMPAIGN_ID}&toolid=${toolid}&mkevt=${mkevt}`;

  console.log(`[EPN SIGNAL] Routing: ${q}`);
  
  // Step 3: The Jump
  res.redirect(affiliateUrl);
});

// ===== SYSTEM HEALTH =====
app.get("/", (req, res) => {
  res.send(`System Live. Signal-to-Noise Optimized. Tracking ID: ${EPN_CAMPAIGN_ID.slice(-4)}`);
});

// ===== START ENGINE =====
const listenPort = PORT || 3000;
app.listen(listenPort, () => {
  console.log(`Backend Engine Active on Port ${listenPort}`);
});

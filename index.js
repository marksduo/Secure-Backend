/**
 * Checksum: b4ck-3nd-s3cur3-2026
 * Status: EPN Hardened | Single-Route Injection
 */
const express = require("express");
const axios = require("axios");
const qs = require("qs");

const app = express();
app.use(express.json());

const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EPN_CAMPAIGN_ID,
  PORT
} = process.env;

// Validate hardware before startup
if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EPN_CAMPAIGN_ID) {
  console.error("CRITICAL: Missing EPN/eBay Environment Variables");
  process.exit(1);
}

const EBAY_OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";

// Token Cache to prevent rate-limiting
let tokenCache = { token: null, expiresAt: 0 };

async function getAppToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) return tokenCache.token;

  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const body = qs.stringify({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope"
  });

  const resp = await axios.post(EBAY_OAUTH, body, {
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  tokenCache.token = resp.data.access_token;
  tokenCache.expiresAt = now + resp.data.expires_in * 1000;
  return tokenCache.token;
}

// ROUTE 1: The "Discrete Arrow" Redirect (Monetized Search)
app.get("/api/ebay-redirect", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("Missing query");

  // Step 1: Build the RAW destination URL (No encoding here yet)
  // We want the literal string that a browser would use.
  const rawSearch = `https://www.ebay.ca/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
  
  // Step 2: Wrap it in the EPN Rover Link
  // We encode the ENTIRE destination (mpre) precisely ONCE.
  const affiliateUrl = `https://rover.ebay.com/rover/1/706-53473-19255-0/1?ff3=4&pub=5575561320&toolid=10001&campid=${EPN_CAMPAIGN_ID}&customid=cold-graphite-app&mpre=${encodeURIComponent(rawSearch)}`;

  console.log(`[AFFILIATE SIGNAL] Routing: ${q}`);
  
  // Step 3: The Jump
  res.redirect(affiliateUrl);
});

app.get("/", (req, res) => res.send("System Live. Signal-to-Noise Optimized."));

const listenPort = PORT || 3000;
app.listen(listenPort, () => console.log(`Backend Engine Active on Port ${listenPort}`));

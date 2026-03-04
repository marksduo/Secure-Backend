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

/**
 * Checksum: b4ck-3nd-v5-direct-2026
 * Status: Rover Bypass | Direct Affiliate Injection
 */

app.get("/api/ebay-redirect", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("Missing query");

  // Step 1: Define your EPN Parameters
  const campid = process.env.EPN_CAMPAIGN_ID;
  const toolid = "10001";
  const mkevt = "1";
  const mkcid = "1"; // General eBay Partner Network CID
  const mkrid = "706-53473-19255-0"; // eBay Canada specific RID

  // Step 2: Build the Direct Search URL with parameters appended
  // This bypasses the 1x1 pixel "Rover" ghost.
  const query = encodeURIComponent(q);
  const affiliateUrl = `https://www.ebay.ca/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&mkcid=${mkcid}&mkrid=${mkrid}&campid=${campid}&toolid=${toolid}&mkevt=${mkevt}`;

  console.log(`[DIRECT AFFILIATE] Routing Signal: ${q}`);
  
  // Step 3: The Jump
  res.redirect(affiliateUrl);
});

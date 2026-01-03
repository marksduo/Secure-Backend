// index.js
// Minimal secure eBay search proxy with EPN affiliate links

const express = require("express");
const axios = require("axios");
const qs = require("qs");

const app = express();
app.use(express.json());

// ===== ENV CHECK =====
const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EPN_CAMPAIGN_ID,
  PORT
} = process.env;

if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EPN_CAMPAIGN_ID) {
  console.error("Missing required environment variables");
  process.exit(1);
}

// ===== CONSTANTS =====
const EBAY_OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";

// ===== TOKEN CACHE =====
let tokenCache = {
  token: null,
  expiresAt: 0
};

async function getAppToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const creds = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString("base64");

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

// ===== AFFILIATE LINK BUILDER =====
function buildAffiliateUrl(itemUrl) {
  const sep = itemUrl.includes("?") ? "&" : "?";
  return (
    itemUrl +
    sep +
    `mkevt=1&mkcid=1&campid=${EPN_CAMPAIGN_ID}&toolid=10001`
  );
}

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.send("MPAutoHunter backend running");
});

app.get("/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    const token = await getAppToken();

    const r = await axios.get(EBAY_SEARCH, {
      params: { q, limit: 25 },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    const items = (r.data.itemSummaries || []).map(item => ({
      title: item.title,
      price: item.price,
      image: item.image,
      affiliateUrl: item.itemWebUrl
        ? buildAffiliateUrl(item.itemWebUrl)
        : null
    }));

    res.json({ items });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// ===== START =====
const listenPort = PORT || 3000;
app.listen(listenPort, () =>
  console.log(`Server running on port ${listenPort}`)
);

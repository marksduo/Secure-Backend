/**
 * Checksum: srv-v10-intake-optimized
 * Status: Unified Signal Engine | Payload Limit Increased (10MB) | EPN Fixed
 */

const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors"); 

const app = express();

// OGR Fix: Expand intake port to handle large Base64 image strings from modern cameras
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(cors());

// ===== ENV CHECK =====
const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EPN_CAMPAIGN_ID,
  PORT,
  VISION_API_KEY, 
} = process.env;

if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EPN_CAMPAIGN_ID) {
  console.error("CRITICAL: Missing EPN/eBay Environment Variables in Render.");
}

// ===== REDIRECT ROUTE (The "Discrete Arrow" Fix) =====
app.get("/api/ebay-redirect", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("Missing query");

  const toolid = "10001";
  const mkevt = "1";
  const mkcid = "1";
  const mkrid = "706-53473-19255-0"; 

  const query = encodeURIComponent(q);
  const affiliateUrl = `https://www.ebay.ca/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&mkcid=${mkcid}&mkrid=${mkrid}&campid=${EPN_CAMPAIGN_ID}&toolid=${toolid}&mkevt=${mkevt}`;

  console.log(`[EPN SIGNAL] Routing: ${q}`);
  res.redirect(affiliateUrl);
});

// ===== VISION PROXY (Keeps Key Server-Side) =====
app.post("/api/vision-scan", async (req, res) => {
  try {
    if (!VISION_API_KEY) return res.status(503).json({ error: "Vision not configured" });

    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Missing imageBase64" });

    const visionRes = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        requests: [{ image: { content: imageBase64 }, features: [{ type: "TEXT_DETECTION" }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const fullText = visionRes.data?.responses?.[0]?.fullTextAnnotation?.text || "";
    return res.json({ text: fullText });
  } catch (err) {
    console.error("Vision proxy failure", err?.response?.data || err.message);
    return res.status(500).json({ error: "Vision failed" });
  }
});

// ===== PRICE SUGGESTION (The New Nerve Center) =====
app.get("/api/price-suggestion", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Missing query (q)" });
    }

    if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
      return res.status(503).json({ error: "Price suggestion not configured" });
    }

    const tokenRes = await axios.post(
      "https://api.ebay.com/identity/v1/oauth2/token",
      qs.stringify({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64"),
        },
      }
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) return res.status(502).json({ error: "eBay auth failed" });

    const searchRes = await axios.get(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
      {
        params: { q: q.trim(), limit: 20 },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA",
        },
      }
    );

    const summaries = searchRes.data?.itemSummaries || [];
    const prices = summaries
      .map((item) => parseFloat(item?.price?.value))
      .filter((n) => !isNaN(n) && n > 0);

    if (prices.length === 0) {
      return res.json({ suggestedPrice: null, message: "No listings found" });
    }

    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

    return res.json({
      suggestedPrice: median.toFixed(2),
      currency: "CAD",
      sampleSize: prices.length,
    });
  } catch (err) {
    console.error("Price suggestion failure", err?.response?.data || err?.message);
    return res.status(500).json({ error: "Price suggestion failed", suggestedPrice: null });
  }
});

// ===== SYSTEM HEALTH =====
app.get("/", (req, res) => {
  res.send(`System Live. Signal-to-Noise Optimized. Tracking ID: ${EPN_CAMPAIGN_ID ? EPN_CAMPAIGN_ID.slice(-4) : "OFFLINE"}`);
});

// ===== START ENGINE =====
const listenPort = PORT || 3000;
app.listen(listenPort, () => {
  console.log(`Backend Engine Active on Port ${listenPort}`);
});

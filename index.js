// index.js
// Secure eBay token proxy + search proxy that builds affiliate links server-side.

const express = require('express')
const axios = require('axios')
const qs = require('qs')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

require('dotenv').config()

const app = express()
app.use(express.json())
app.use(cors({
  origin: '*' // For testing. For production, restrict origins to your Android app
}))

// Basic in-memory cache for token
let cached = { token: null, expiresAt: 0 }

const EBAY_OAUTH = 'https://api.ebay.com/identity/v1/oauth2/token'
const BROWSE_BASE = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

// Read environment variables
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET
const EBAY_CAMPAIGN_ID = process.env.EBAY_CAMPAIGN_ID

if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_CAMPAIGN_ID) {
  console.error('Missing one of EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_CAMPAIGN_ID in environment')
  process.exit(1)
}

// Root endpoint
app.get("/", (req, res) => {
    res.send("MPAutoHunter backend running.");
})

// Basic rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120 // max requests per minute per IP
})
app.use(limiter)

// Get or refresh app access token
async function getAppToken() {
  const now = Date.now()
  if (cached.token && cached.expiresAt > now + 5000) return cached.token

  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64')
  const body = qs.stringify({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' })

  const resp = await axios.post(EBAY_OAUTH, body, {
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 10000
  })

  cached.token = resp.data.access_token
  cached.expiresAt = now + (resp.data.expires_in * 1000)
  return cached.token
}

// Build affiliate URL from eBay item URL
function buildAffiliateUrl(itemWebUrl, customId = null) {
  const MKEVT = '1'
  const MKCID = '1'
  const TOOLID = '10001'
  const CAMPID = encodeURIComponent(EBAY_CAMPAIGN_ID)

  const separator = itemWebUrl.includes('?') ? '&' : '?'
  let out = itemWebUrl + separator + `mkevt=${MKEVT}&mkcid=${MKCID}&campid=${CAMPID}&toolid=${TOOLID}`
  if (customId) out += `&customid=${encodeURIComponent(customId)}`
  return out
}

// /search?q=brake pads&limit=20
app.get('/search', async (req, res) => {
  try {
    const q = req.query.q
    if (!q || String(q).trim().length === 0) return res.status(400).json({ error: 'Missing q parameter' })

    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100)
    const token = await getAppToken()

    // Call eBay Browse API
    const r = await axios.get(BROWSE_BASE, {
      params: { q, limit },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    })

    const body = r.data || {}
    const summaries = (body.itemSummaries || []).map(it => {
      const affiliateUrl = it.itemWebUrl ? buildAffiliateUrl(it.itemWebUrl) : null
      return {
        itemId: it.itemId,
        title: it.title,
        price: it.price,
        image: it.image,
        itemWebUrl: it.itemWebUrl,
        affiliateUrl
      }
    })

    res.json({ total: body.total || summaries.length, items: summaries })
  } catch (err) {
    console.error('Search proxy error', err.response ? err.response.data : err.message)
    const status = err.response?.status || 500
    res.status(status).json({ error: 'search_error', detail: err.response?.data || err.message })
  }
})

// /go?url=<encoded eBay URL>
app.get('/go', (req, res) => {
  const raw = req.query.url
  if (!raw) return res.status(400).send('Missing url')
  try {
    const decoded = decodeURIComponent(raw)
    const aff = buildAffiliateUrl(decoded)
    return res.redirect(302, aff)
  } catch (e) {
    return res.status(400).send('Invalid url')
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`MPAutoHunter backend running on port ${PORT}`))

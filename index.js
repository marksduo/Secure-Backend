// index.js
// Secure eBay token proxy + search proxy that builds affiliate links server-side.
//
// ENV vars required:
// EBAY_CLIENT_ID
// EBAY_CLIENT_SECRET
// EPN_CAMPAIGN_ID
// PORT (optional, default 3000)

const express = require('express')
const axios = require('axios')
const qs = require('qs')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

require('dotenv').config()

const app = express()
app.use(express.json())
app.use(cors({
  origin: '*' // For testing. For production, set this to your Android app host or restrict origins.
}))

// Basic in-memory cache for token
let cached = { token: null, expiresAt: 0 }

const EBAY_OAUTH = 'https://api.ebay.com/identity/v1/oauth2/token'
const BROWSE_BASE = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

const CAMP_ID = process.env.EPN_CAMPAIGN_ID || ''
if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !CAMP_ID) {
  console.error('Missing one of EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EPN_CAMPAIGN_ID in environment')
  process.exit(1)
}

// Basic rate limiter (tune for your needs)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120 // max requests per minute per IP
})
app.use(limiter)

// Get or refresh app access token (client credentials)
async function getAppToken() {
  const now = Date.now()
  if (cached.token && cached.expiresAt > now + 5000) return cached.token

  const creds = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64')
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

// Build affiliate URL from eBay item URL (server-side so campid not in APK)
// This app will attach EPN params to the item webUrl.
function buildAffiliateUrl(itemWebUrl, customId = null) {
  // EPN params - these are standard names. toolid and mkcid can stay constant, mkrid optional.
  const MKEVT = '1'
  const MKCID = '1'
  const TOOLID = '10001'
  const CAMPID = encodeURIComponent(process.env.EPN_CAMPAIGN_ID)

  const separator = itemWebUrl.includes('?') ? '&' : '?'
  let out = itemWebUrl + separator + `mkevt=${MKEVT}&mkcid=${MKCID}&campid=${CAMPID}&toolid=${TOOLID}`
  if (customId) out += `&customid=${encodeURIComponent(customId)}`
  return out
}

// /search?q=brake%20pads&limit=20
// Proxies the Browse API search and attaches affiliateUrl to each item summary
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

// Optional endpoint that returns only an affiliate redirect for raw item web url
// /go?url=https%3A%2F%2Fwww.ebay.com%2Fitm%2F12345
app.get('/go', (req, res) => {
  const raw = req.query.url
  if (!raw) return res.status(400).send('Missing url')
  try {
    const decoded = decodeURIComponent(raw)
    const aff = buildAffiliateUrl(decoded)
    // Redirect (HTTP 302) to affiliate link
    return res.redirect(302, aff)
  } catch (e) {
    return res.status(400).send('Invalid url')
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`eBay proxy running on port ${PORT}`))
# 08 — Job Requirements Baseline

Captured from direct conversation with the Payclaw (Flowglad Pay) engineering team.

- Date: 2026-02-18
- Source: Engineer Q&A in Payclaw codebase chat
- Previous baseline: `07-jobs-api-contract-baseline.md`

---

## Job Submission — Two Modes

**Direct buy** — exact product page URL known:

```json
{
  "url": "https://example.com/products/specific-item",
  "maxSpend": 2000
}
```

**Indirect buy** — vendor known, product requires search:

```json
{
  "vendor": "https://supabase.com",
  "product": "Pro plan",
  "maxSpend": 2000
}
```

Mutually exclusive: cannot send both `url` and `vendor`. If `vendor` is provided, `product` is required. Validation rejects a request with both or with `product` but no `vendor`.

**Reliability:** Direct buy is more reliable — agent navigates straight to the product page. Indirect buy depends on the `product` string being specific enough for the agent to identify the right item.

**Known failure vendors:** No hard blocklist, but Cloudflare challenges, reCAPTCHA, and hCaptcha are detected as bot indicators and cause failures. The agent reports these in the error.

---

## Spending — `maxSpend`

- **Unit:** Cents. `1500` = $15.00.
- **Required:** Yes, must be a positive integer.
- **CLI default:** 1500 (the API requires it explicitly).

### Budget enforcement (two levels, both strict)

1. **Product selection** — For Shopify, the agent filters variants to those within budget. If all exceed `maxSpend`, job fails: `"All available variants exceed budget of 1500 cents. Cheapest: 1799 cents"`.

2. **Card spending limit** — Virtual card is created with a hard limit equal to `maxSpend`. Enforced by the card issuer (Brex/Wex) — any charge exceeding the limit is declined at the payment processor.

### Critical: No tolerance for tax/shipping overages

If a product costs $14.00 but tax + shipping pushes the total to $15.02 and `maxSpend` was `1500`, the card charge is declined. No buffer.

**Recommendation:** Pad by 20–30% for physical products. Product at $14.99 → send `maxSpend: 2200` ($22.00).

---

## Shipping Address

**Optional in request, but required for physical product checkouts.**

### Auto-population from user profile

If omitted, the server populates from the user's profile (Better Auth record) when:
- User has `name` on profile
- User has address with `line1`, `city`, `state`, `postalCode`
- `country` defaults to `'US'` if missing
- `line2` and `phone` included if present

### Failure mode when missing

If neither request nor profile has a shipping address and the product needs delivery, the job fails during checkout (not at creation). Error: `"Missing required secret refs: SHIPPING_NAME, SHIPPING_LINE1, ... Ensure card details and shipping address are registered before calling fillShopifyCheckout."` The agent does not invent an address.

### Field requirements

| Field        | Schema Required | Practical Requirement |
|--------------|----------------|-----------------------|
| `name`       | Yes (min 1)    | Required              |
| `line1`      | Yes (min 1)    | Required              |
| `line2`      | No             | Optional              |
| `city`       | Yes (min 1)    | Required              |
| `state`      | Yes (min 1)    | Required              |
| `postalCode` | Yes (min 1)    | Required              |
| `country`    | Yes (min 1)    | Required              |
| `phone`      | No             | Practically required — many checkouts fail without it |
| `email`      | No (valid if given) | Practically required — many checkouts fail without it |

**Advice:** Always include `phone` and `email`. Many e-commerce checkouts require both; if missing, the agent skips those fields, causing vendor-side checkout validation failures.

---

## Payment Method

**Optional.** Discriminated union:

```typescript
{ type: 'brex', cardId: 'card_abc123' }
// or
{ type: 'wex' }
```

- **If omitted:** Falls back to `CARD_ID` env var on the server.
- **If no payment method available at all:** Agent cannot proceed — `createCardProgram` call requires a `cardId`. Job errors out.
- **Security:** Agent never sees actual card numbers. Placeholder refs (`{{CARD_NUMBER}}`, `{{CARD_EXPIRY}}`, `{{CARD_CVC}}`) are resolved only at browser form fill time. Never logged, stored, or in LLM context.

---

## Agent Execution — Timing and Failures

### Timing

| Flow Type                          | Duration     |
|------------------------------------|-------------|
| Simple SaaS signup                 | ~2–5 min    |
| E-commerce checkout (physical)     | ~5–10 min   |
| Complex (email/SMS verification)   | ~5–15 min   |
| **Hard timeout (pg-boss queue)**   | **10 min**  |

One retry allowed with 30-second delay after timeout.

### Structured failure modes

| Failure                  | Error Type              | Message Example                                                       |
|--------------------------|-------------------------|-----------------------------------------------------------------------|
| Out of stock             | `ShopifyAddToCartError` | `"All variants are sold out"`                                         |
| Price exceeds budget     | `ShopifyAddToCartError` | `"All available variants exceed budget of X cents"`                   |
| Card declined            | Card issuer decline     | Charge fails at payment processor                                     |
| CAPTCHA / bot detection  | Page indicators         | `"Cloudflare challenge detected"`, `"reCAPTCHA detected"`             |
| Missing shipping address | `ShopifyCheckoutError`  | `"Missing required secret refs: SHIPPING_NAME, SHIPPING_LINE1, ..."` |
| Element not found        | `ElementNotFoundError`  | `"Element not found: selector 'X' did not match"`                     |
| Timeout                  | `TimeoutError`          | `"Timeout after Xms waiting for: Y"`                                  |
| Browser crash            | `BrowserCrashError`     | Session recovery attempted, then fail                                 |

Errors are formatted via `formatEffectError()` — human-readable but somewhat technical (references CSS selectors). For end-user display, map common patterns to friendlier messages.

---

## Job Result — What Comes Back on Success

```typescript
{
  success: true,
  productObtained?: string,
  orderNumber?: string,
  cardUsed?: string,
  credentials?: string,
  credentialIds?: string[],
  reportedData?: {
    orderNumber?: string,
    total?: string,
    items?: string[],
    shippingMethod?: string,
    trackingNumber?: string,
    deliveryEstimate?: string,
    email?: string,
    // ... any other data the agent extracted
  },
  skillsUsed: string[]
}
```

`reportedData` is populated by the agent's `reportData` tool from the confirmation page. Whether `trackingNumber` or `deliveryEstimate` appears depends on the vendor's confirmation page content. Many vendors only show order numbers; tracking info comes via email later.

### SSE Events During Execution

| Event                      | Data                           |
|----------------------------|--------------------------------|
| `job.started`              | vendor, product, buyType       |
| `card.issued`              | last4, limit                   |
| `page.navigated`           | URL being visited              |
| `form.submitted`           | form submission URL            |
| `payment.completed`        | checkout succeeded             |
| `credentials.extracted`    | if applicable                  |
| `job.completed`            | step count, skills used        |

---

## Ideal Physical Product Request

```json
{
  "url": "https://example.com/products/blue-widget",
  "maxSpend": 3000,
  "shippingAddress": {
    "name": "Jane Smith",
    "line1": "220 W 19th St",
    "line2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10011",
    "country": "US",
    "phone": "+12125551234",
    "email": "jane@example.com"
  },
  "paymentMethod": {
    "type": "brex",
    "cardId": "card_abc123"
  }
}
```

---

## Gotchas — Common Silent/Unexpected Failures

1. **`maxSpend` too tight** — Product within budget but tax + shipping pushes total over. Card declined. Pad 20–30%.
2. **Missing `phone` / `email`** — Optional in schema but many checkouts need them. Agent can't fill what it doesn't have.
3. **No shipping address anywhere** — Missing from request AND user profile → fails partway through checkout (not at creation). No fast-fail.
4. **Vague indirect buy `product`** — `"plan"` too vague; `"Pro plan monthly"` better. Specificity matters for agent search.
5. **Bot-protected vendors** — Cloudflare challenges, CAPTCHAs detected but not solved. Jobs fail.
6. **10-minute timeout** — Complex e-commerce with slow pages can exceed. One auto-retry at 30s delay.
7. **No payment method fallback** — Omit `paymentMethod` with no `CARD_ID` env → job fails. Always pass explicitly.

---

## Action Items for Our Integration

1. **Update `jobResultSchema`** — Add `orderNumber`, `credentialIds`, `reportedData` fields.
2. **Update tool description** — Warn LLM to pad `maxSpend` by 20–30% for physical products.
3. **Nudge phone/email extraction** — Tool description should strongly encourage extracting these.
4. **Client-side shipping validation** — Fail fast if no shipping address is available before submitting.
5. **Fail fast on missing payment** — Check before calling `createJob` that a payment method is resolved.
6. **Map error patterns** — Create user-friendly messages for common structured errors.

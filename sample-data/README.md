# Sample Data — Customer Intelligence Copilot

Place synthetic CSV/JSON exports here. The MCP ingestion tools read these files and normalize into `feedback_items`.

## Normalized schema (all sources)

| Field         | Type     | Required | Notes                                      |
|---------------|----------|----------|--------------------------------------------|
| external_id   | string   | yes      | Source-system ID (upsert key with `source`) |
| source        | enum     | yes      | `playstore` \| `call` \| `ticket` \| `review` |
| text          | string   | yes      | Primary feedback content                   |
| rating        | number   | no       | 0–5 where applicable                       |
| timestamp     | ISO 8601 | yes      | When feedback was created                  |
| customer_id   | string   | no       | Email, user ID, or company name            |
| metadata      | object   | no       | Source-specific fields (status, tags, etc.) |

## Expected file formats

### 1. `support-tickets.csv` (Zendesk/Freshdesk style)

```csv
id,subject,description,status,priority,tags,customer_email,created_at
TKT-1001,Billing issue,...,open,high,"billing,sso",user@co.com,2025-05-12T14:22:00Z
```

**Tool:** `import_support_tickets`

### 2. `playstore-reviews.csv` (Play Console export style)

```csv
review_id,rating,content,user_id,review_date,app_version
RVW-001,2,"App keeps crashing",user_abc,2025-05-10T10:00:00Z,3.2.1
```

**Tool:** `import_playstore_reviews`

### 3. `call-transcripts.csv` (Gong/Twilio style)

```csv
call_id,transcript,summary,customer_email,call_date,duration_seconds,agent,sentiment
CALL-001,"Rep: How can I help?...","Customer frustrated with onboarding",lead@co.com,2025-05-11T15:00:00Z,1240,jordan.p,negative
```

**Tool:** `import_call_transcripts`

### 4. `online-reviews.csv` (G2/Trustpilot style)

```csv
review_id,title,content,rating,reviewer,review_date,platform,verified
REV-001,"Great product","Love the integrations",5,Jane D.,2025-05-09T12:00:00Z,G2,true
```

**Tool:** `import_online_reviews`

## Target volume

~50–100 records per source for a single fictional SaaS product (suggested name: **FlowStack** — workflow automation platform).

## Status

A 5-row `support-tickets.csv` stub is included for smoke testing. **Please generate the full synthetic datasets** (~50–100 rows each) once you confirm the schema above looks right.

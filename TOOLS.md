# Tool Reference

This MCP server exposes **8 tools** under the `gb_dp_` prefix.

All responses include a top-level `_meta` block with:
- `disclaimer` — not legal/regulatory advice notice
- `copyright` — ICO Open Government Licence attribution
- `source_url` — canonical ICO URL
- `data_age` — freshness reminder

---

## gb_dp_search_decisions

Full-text search across ICO enforcement decisions (monetary penalty notices, enforcement notices, undertakings, reprimands).

**Input**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search terms (e.g., `'consent cookies'`, `'British Airways'`) |
| `type` | enum | no | Filter: `monetary_penalty`, `enforcement_notice`, `undertaking`, `reprimand` |
| `topic` | string | no | Filter by topic ID (see COVERAGE.md) |
| `limit` | number | no | Max results (1–100, default 20) |

**Output** — `{ results: Decision[], count: number }`

Each `Decision` has: `id`, `reference`, `title`, `date`, `type`, `entity_name`, `fine_amount`, `summary`, `full_text`, `topics`, `gdpr_articles`, `status`.

---

## gb_dp_get_decision

Get a specific ICO decision by reference number.

**Input**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reference` | string | yes | ICO decision reference (e.g., `'ICO-MPN-2020-001'`) |

**Output** — Full `Decision` object, or error if not found.

---

## gb_dp_search_guidelines

Search ICO guidance documents: guides, codes of practice, recommendations, and opinions.

**Input**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search terms (e.g., `'DPIA'`, `'children age appropriate'`) |
| `type` | enum | no | Filter: `guide`, `code_of_practice`, `recommendation`, `opinion` |
| `topic` | string | no | Filter by topic ID (see COVERAGE.md) |
| `limit` | number | no | Max results (1–100, default 20) |

**Output** — `{ results: Guideline[], count: number }`

Each `Guideline` has: `id`, `reference`, `title`, `date`, `type`, `summary`, `full_text`, `topics`, `language`.

---

## gb_dp_get_guideline

Get a specific ICO guidance document by its database ID.

**Input**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | yes | Guideline database ID (from `gb_dp_search_guidelines` results) |

**Output** — Full `Guideline` object, or error if not found.

---

## gb_dp_list_topics

List all covered data protection topics with English names and IDs.

**Input** — none

**Output** — `{ topics: Topic[], count: number }`

Each `Topic` has: `id`, `name_en`, `description`.

---

## gb_dp_list_sources

List all data sources used by this server with URLs and descriptions.

**Input** — none

**Output** — `{ sources: Source[] }`

Each `Source` has: `name`, `url`, `description`.

Sources include: ICO, UK GDPR, Data Protection Act 2018, PECR, ICO Guidance Collection.

---

## gb_dp_about

Return metadata about this MCP server.

**Input** — none

**Output** — `{ name, version, description, data_source, coverage, tools }`

---

## gb_dp_check_data_freshness

Check when the ICO database was last updated.

**Input** — none

**Output** — `{ db_path, db_exists, last_updated, check_timestamp }`

| Field | Description |
|-------|-------------|
| `db_path` | Resolved path of the SQLite database file |
| `db_exists` | Whether the database file exists |
| `last_updated` | ISO 8601 timestamp of last file modification (`null` if not found) |
| `check_timestamp` | ISO 8601 timestamp of this freshness check |

# Data Coverage

This document describes what the British Data Protection MCP database covers, known gaps, and the topic taxonomy used for filtering.

## Corpus Overview

| Category | Description | Status |
|----------|-------------|--------|
| Monetary Penalty Notices (MPNs) | ICO fines issued under UK GDPR / DPA 2018 | Partial — key decisions ingested |
| Enforcement Notices | ICO formal enforcement actions requiring compliance | Partial |
| Undertakings | Voluntary commitments accepted by ICO in lieu of formal action | Partial |
| Reprimands | ICO reprimand decisions for public bodies | Partial |
| Guides | ICO guidance for organisations on UK GDPR compliance | Partial |
| Codes of Practice | Statutory codes (Children's Code, Data Sharing Code, Direct Marketing Code) | Partial |
| Recommendations | ICO recommendations and opinions | Partial |

> **Note:** The SQLite database (`data/ico.db`) must be populated before the server returns results. Run `npm run seed` for sample data or `npm run ingest` for full ingestion from ICO sources.

## Decision Types

| Type ID | Label |
|---------|-------|
| `monetary_penalty` | Monetary Penalty Notice (MPN) |
| `enforcement_notice` | Enforcement Notice |
| `undertaking` | Undertaking |
| `reprimand` | Reprimand |

## Guidance Types

| Type ID | Label |
|---------|-------|
| `guide` | Practical guide |
| `code_of_practice` | Statutory or regulatory code |
| `recommendation` | ICO recommendation |
| `opinion` | ICO opinion or position statement |

## Topic Taxonomy

The following topic IDs are used to tag and filter decisions and guidelines:

| Topic ID | Description |
|----------|-------------|
| `consent` | Lawful basis of consent under UK GDPR Art. 6(1)(a) |
| `children` | Children's data protection, Age Appropriate Design Code |
| `direct_marketing` | Marketing by post, email, telephone; PECR |
| `data_sharing` | Data sharing between controllers; Data Sharing Code |
| `international_transfers` | Transfers outside UK; adequacy, SCCs, BCRs |
| `subject_access` | Subject Access Requests (SARs); Art. 15 UK GDPR |
| `cookies` | Cookie consent; PECR Regulation 6 |
| `breach_notification` | Personal data breach notification; Art. 33–34 UK GDPR |
| `legitimate_interest` | Legitimate interest assessment; Art. 6(1)(f) |
| `dpia` | Data Protection Impact Assessment; Art. 35 UK GDPR |
| `accountability` | Accountability and governance; Art. 5(2), Art. 24 |
| `security` | Technical and organisational security measures; Art. 32 |

## Known Gaps

- **Pre-2018 decisions**: ICO decisions predating UK GDPR / DPA 2018 may use different legal basis references and are not fully indexed.
- **Unpublished decisions**: Decisions not publicly released by the ICO are not included.
- **Tribunal appeals**: First-tier and Upper Tribunal appeal decisions against ICO are not in the current corpus.
- **Guidance revisions**: Only the current published version of each guidance document is indexed; historical versions are not tracked.
- **PECR-only decisions**: Some older marketing enforcement actions under PECR alone may be absent.

## Sources

All data is sourced from official ICO publications:

- ICO Decision Register: https://ico.org.uk/action-weve-taken/enforcement/
- ICO Guidance Collection: https://ico.org.uk/for-organisations/
- ICO Reprimands: https://ico.org.uk/action-weve-taken/reprimands/

See also `data/coverage.json` for machine-readable coverage metadata.

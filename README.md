# British Data Protection MCP

**British data protection data for AI compliance tools.**

[![npm version](https://badge.fury.io/js/%40ansvar%2Fbritish-data-protection-mcp.svg)](https://www.npmjs.com/package/@ansvar/british-data-protection-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/Ansvar-Systems/british-data-protection-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/british-data-protection-mcp/actions/workflows/ci.yml)

Query British data protection data -- regulations, decisions, and requirements from ICO (Information Commissioner's Office) -- directly from Claude, Cursor, or any MCP-compatible client.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://mcp.ansvar.eu/british-data-protection/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add british-data-protection-mcp --transport http https://mcp.ansvar.eu/british-data-protection/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "british-data-protection-mcp": {
      "type": "url",
      "url": "https://mcp.ansvar.eu/british-data-protection/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "british-data-protection-mcp": {
      "type": "http",
      "url": "https://mcp.ansvar.eu/british-data-protection/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/british-data-protection-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "british-data-protection-mcp": {
      "command": "npx",
      "args": ["-y", "@ansvar/british-data-protection-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "british-data-protection-mcp": {
      "command": "npx",
      "args": ["-y", "@ansvar/british-data-protection-mcp"]
    }
  }
}
```

---

## Available Tools (8)

| Tool | Description |
|------|-------------|
| `gb_dp_search_decisions` | Full-text search across ICO enforcement decisions (monetary penalty notices, enforcement notices, undertakings, reprimands). |
| `gb_dp_get_decision` | Get a specific ICO decision by reference number (e.g., `ICO-MPN-2020-001`). |
| `gb_dp_search_guidelines` | Search ICO guidance documents: guides, codes of practice, and recommendations. Covers UK GDPR, DPIA, Children's Code, and more. |
| `gb_dp_get_guideline` | Get a specific ICO guidance document by its database ID. |
| `gb_dp_list_topics` | List all covered data protection topics with English names. Use topic IDs to filter decisions and guidelines. |
| `gb_dp_list_sources` | List all data sources used by this MCP server, with URLs and descriptions. |
| `gb_dp_about` | Return metadata about this MCP server: version, data source, coverage, and tool list. |
| `gb_dp_check_data_freshness` | Check when the ICO database was last updated. Returns last-modified timestamp and whether the database file exists. |

All tools return structured data with source references and timestamps.

---

## Data Sources and Freshness

All content is sourced from official British regulatory publications:

- **ICO (Information Commissioner's Office)** -- Official regulatory authority

### Data Currency

- Database updates are periodic and may lag official publications
- Freshness checks run via GitHub Actions workflows
- Last-updated timestamps in tool responses indicate data age

See `data/coverage.json` for full provenance metadata and `COVERAGE.md` for human-readable coverage notes.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Not Regulatory Advice

> **THIS TOOL IS NOT REGULATORY OR LEGAL ADVICE**
>
> Regulatory data is sourced from official publications by ICO (Information Commissioner's Office). However:
> - This is a **research tool**, not a substitute for professional regulatory counsel
> - **Verify all references** against primary sources before making compliance decisions
> - **Coverage may be incomplete** -- do not rely solely on this for regulatory research

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for details.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/british-data-protection-mcp
cd british-data-protection-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run seed    # Populate SQLite database with sample ICO data
npm run ingest  # Full ingestion from ICO sources (requires network)
```

---

## Related Projects

This server is part of **Ansvar's MCP fleet** -- 276 MCP servers covering law, regulation, and compliance across 119 jurisdictions.

### Law MCPs

Full national legislation for 108 countries. Example: [@ansvar/swedish-law-mcp](https://github.com/Ansvar-Systems/swedish-law-mcp) -- 2,415 Swedish statutes with EU cross-references.

### Sector Regulator MCPs

National regulatory authority data for 29 EU/EFTA countries across financial regulation, data protection, cybersecurity, and competition. This MCP is one of 116 sector regulator servers.

### Domain MCPs

Specialized compliance domains: [EU Regulations](https://github.com/Ansvar-Systems/EU_compliance_MCP), [Security Frameworks](https://github.com/Ansvar-Systems/security-frameworks-mcp), [Automotive Cybersecurity](https://github.com/Ansvar-Systems/Automotive-MCP), [OT/ICS Security](https://github.com/Ansvar-Systems/ot-security-mcp), [Sanctions](https://github.com/Ansvar-Systems/Sanctions-MCP), and more.

Browse the full fleet at [mcp.ansvar.eu](https://mcp.ansvar.eu).

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

Regulatory data sourced from official government publications under the Open Government Licence v3.0. See `data/coverage.json` for per-source licensing details.

---

## About Ansvar Systems

We build AI-powered compliance and legal research tools for the European market. Our MCP fleet provides structured, verified regulatory data to AI assistants -- so compliance professionals can work with accurate sources instead of guessing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>

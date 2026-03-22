/**
 * Seed the ICO database with sample decisions and guidelines for testing.
 *
 * Includes real ICO enforcement decisions (British Airways, Marriott, Clearview AI, TikTok)
 * and representative guidance documents so MCP tools can be tested without
 * running a full data ingestion pipeline.
 *
 * Usage:
 *   npx tsx scripts/seed-sample.ts
 *   npx tsx scripts/seed-sample.ts --force   # drop and recreate
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";
const DB_PATH = process.env["ICO_DB_PATH"] ?? "data/ico.db";
const force = process.argv.includes("--force");
// --- Bootstrap database ------------------------------------------------------
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
}
if (force && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log(`Deleted existing database at ${DB_PATH}`);
}
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);
console.log(`Database initialised at ${DB_PATH}`);
const topics = [
    {
        id: "consent",
        name_en: "Consent",
        description: "Lawfulness of processing based on consent and conditions for valid consent under UK GDPR Article 6 and 7.",
    },
    {
        id: "children",
        name_en: "Children's data",
        description: "Protection of children's personal data, including the Age Appropriate Design Code (Children's Code).",
    },
    {
        id: "direct_marketing",
        name_en: "Direct marketing",
        description: "Privacy requirements for direct marketing including email, SMS, and phone marketing under PECR and UK GDPR.",
    },
    {
        id: "data_sharing",
        name_en: "Data sharing",
        description: "Data sharing between organisations, data sharing agreements, and lawful bases for disclosure.",
    },
    {
        id: "international_transfers",
        name_en: "International transfers",
        description: "Transfers of personal data to countries outside the UK, adequacy decisions, and appropriate safeguards.",
    },
    {
        id: "subject_access",
        name_en: "Subject access",
        description: "Right of access by data subjects (Subject Access Requests / SARs) under UK GDPR Article 15.",
    },
    {
        id: "cookies",
        name_en: "Cookies and trackers",
        description: "Use of cookies and similar tracking technologies under the Privacy and Electronic Communications Regulations (PECR).",
    },
    {
        id: "breach_notification",
        name_en: "Data breach notification",
        description: "Notification requirements for personal data breaches to the ICO (72 hours) and affected individuals.",
    },
    {
        id: "legitimate_interest",
        name_en: "Legitimate interests",
        description: "Processing under the legitimate interests lawful basis (UK GDPR Article 6(1)(f)) and the three-part test.",
    },
];
const insertTopic = db.prepare("INSERT OR IGNORE INTO topics (id, name_en, description) VALUES (?, ?, ?)");
for (const t of topics) {
    insertTopic.run(t.id, t.name_en, t.description);
}
console.log(`Inserted ${topics.length} topics`);
const decisions = [
    // British Airways
    {
        reference: "ICO-MPN-2020-BA",
        title: "Monetary Penalty Notice — British Airways (data breach)",
        date: "2020-10-16",
        type: "monetary_penalty",
        entity_name: "British Airways",
        fine_amount: 20_000_000,
        summary: "The ICO fined British Airways GBP 20 million after a cyberattack in 2018 compromised the personal and financial details of approximately 400,000 customers. The attacker harvested customer data including names, addresses, payment card numbers, and CVV codes. The ICO found BA had failed to implement appropriate security measures.",
        full_text: "The Information Commissioner's Office issued a monetary penalty of GBP 20,000,000 to British Airways plc. Between June and September 2018, British Airways suffered a cyberattack in which an attacker used customer-facing systems to divert traffic to a fraudulent website and harvest customer data. The breach affected approximately 400,000 customers and compromised: names, addresses, payment card numbers, CVV codes, and usernames and passwords. The ICO investigation found that British Airways had poor security arrangements: (1) Inadequate monitoring — BA had access to information that could have alerted the company to the attack earlier; (2) Lack of technical controls — multi-factor authentication was not enabled, and access was not limited to those who needed it; (3) Failure to test security controls — there was no adequate programme of testing and review to identify and fix vulnerabilities; (4) Failure to keep software up to date — outdated software was in use on the network. The ICO found that British Airways had failed to process personal data in a manner that ensured appropriate security under Article 5(1)(f) and Article 32 of the UK GDPR. The original proposed fine was GBP 183.39 million. It was reduced to GBP 20 million taking into account representations by BA and the impact of COVID-19.",
        topics: JSON.stringify(["breach_notification"]),
        gdpr_articles: JSON.stringify(["5", "32"]),
        status: "final",
    },
    // Marriott International
    {
        reference: "ICO-MPN-2020-MHR",
        title: "Monetary Penalty Notice — Marriott International (Starwood data breach)",
        date: "2020-10-30",
        type: "monetary_penalty",
        entity_name: "Marriott International Inc",
        fine_amount: 18_400_000,
        summary: "The ICO fined Marriott International GBP 18.4 million for a data breach originating from the 2014 compromise of the Starwood Hotels guest reservation database. The breach was not discovered until 2018, exposing personal details of approximately 339 million guest records globally, including 7 million UK residents.",
        full_text: "The Information Commissioner's Office issued a monetary penalty of GBP 18,400,000 to Marriott International Inc. In 2014, an attacker installed malware in the Starwood Hotels and Resorts systems enabling remote access and exfiltration of data. Marriott completed the acquisition of Starwood in 2016 but did not discover the breach until November 2018. The breach exposed approximately 339 million guest records globally (around 7 million in the UK), including: names, addresses, phone numbers, email addresses, dates of birth, gender, loyalty programme details, arrival and departure information, encrypted payment card numbers (for some), and passport numbers (for around 5.25 million). The ICO found Marriott had failed to: (1) Conduct adequate due diligence when acquiring Starwood; (2) Implement appropriate technical and organisational measures to ensure security; (3) Identify and fix the security weakness for a period of approximately 4 years. The original proposed fine was GBP 99.2 million. It was reduced to GBP 18.4 million taking into account representations by Marriott, remediation taken, and COVID-19 impact.",
        topics: JSON.stringify(["breach_notification", "international_transfers"]),
        gdpr_articles: JSON.stringify(["5", "32"]),
        status: "final",
    },
    // Clearview AI
    {
        reference: "ICO-MPN-2022-CV",
        title: "Monetary Penalty Notice — Clearview AI Inc (unlawful biometric data processing)",
        date: "2022-05-23",
        type: "monetary_penalty",
        entity_name: "Clearview AI Inc",
        fine_amount: 7_552_800,
        summary: "The ICO fined Clearview AI GBP 7.5 million for processing personal data of UK residents without a lawful basis, failing to be transparent, having no process to prevent data being retained indefinitely, and asking for additional personal information when responding to access requests.",
        full_text: "The Information Commissioner's Office issued a monetary penalty of GBP 7,552,800 to Clearview AI Inc. Clearview AI operates a facial recognition database compiled from billions of images scraped from publicly available internet sources. It offers a facial recognition service allowing customers (primarily law enforcement) to upload a photo and search the database for matching images and links to web pages. The ICO investigation found that Clearview AI had: (1) Failed to use personal data of UK residents in a way that is fair and transparent — people were unaware their images were being collected; (2) Failed to have a lawful reason to collect personal data — no valid lawful basis under the UK GDPR or DPA 2018 for collecting and retaining data of UK residents; (3) Collected and kept sensitive biometric data — images and facial recognition templates constitute biometric data, a special category; (4) Failed to have a process to stop data being retained indefinitely; (5) Failed to meet the standard required for biometric data — no explicit consent and no other applicable exception; (6) Asked for additional personal information when responding to subject access requests. The ICO ordered Clearview AI to delete the data of UK residents from its database.",
        topics: JSON.stringify(["consent", "international_transfers", "subject_access"]),
        gdpr_articles: JSON.stringify(["5", "6", "9", "15"]),
        status: "final",
    },
    // TikTok
    {
        reference: "ICO-MPN-2023-TT",
        title: "Monetary Penalty Notice — TikTok Information Technologies UK Limited (children's data)",
        date: "2023-04-04",
        type: "monetary_penalty",
        entity_name: "TikTok Information Technologies UK Limited",
        fine_amount: 12_700_000,
        summary: "The ICO fined TikTok GBP 12.7 million for allowing approximately 1.4 million children under 13 to use the platform without parental consent, and for processing personal data of children in ways they would not have expected, contrary to the Children's Code (Age Appropriate Design Code).",
        full_text: "The Information Commissioner's Office issued a monetary penalty of GBP 12,700,000 to TikTok Information Technologies UK Limited. The ICO investigation found that between May 2018 and July 2020, TikTok processed personal data of children under 13 without parental consent. Approximately 1.4 million UK children under 13 were using TikTok in 2020, in breach of TikTok's own policies. The ICO found TikTok had: (1) Failed to use children's data in accordance with its own privacy policy — the privacy notices were not age-appropriate; (2) Allowed children under 13 to use the platform without sufficient checks; (3) Failed to meet the requirements of the ICO's Children's Code (Age Appropriate Design Code); (4) Used default settings that were not set to high privacy for children; (5) Allowed by default the sharing of videos created by users — accounts for users under 16 should have been private by default. The ICO's Children's Code sets out 15 standards that online services likely to be accessed by children must meet. These include providing high privacy by default, not using personal data in ways that are detrimental to children, and providing suitable parental controls.",
        topics: JSON.stringify(["children", "consent"]),
        gdpr_articles: JSON.stringify(["5", "6", "8"]),
        status: "final",
    },
    // Interserve Group
    {
        reference: "ICO-MPN-2022-IG",
        title: "Monetary Penalty Notice — Interserve Group Limited (phishing attack security failure)",
        date: "2022-10-24",
        type: "monetary_penalty",
        entity_name: "Interserve Group Limited",
        fine_amount: 4_400_000,
        summary: "The ICO fined Interserve GBP 4.4 million after a phishing attack compromised personal data of approximately 113,000 current and former employees. Interserve failed to follow up on a suspicious email alert, used outdated software, and had inadequate staff training on phishing.",
        full_text: "The Information Commissioner's Office issued a monetary penalty of GBP 4,400,000 to Interserve Group Limited. In 2020, a phishing email led to malware being installed on Interserve's systems. The attacker used the access to uninstall the company's anti-virus software, compromise 283 systems, and encrypt the data of approximately 113,000 current and former employees. Data compromised included: names, addresses, national insurance numbers, bank account details, and in some cases special category data such as ethnic origin, religion, and health information. The ICO found that Interserve had: (1) Failed to follow up on an initial alert about suspicious activity from its anti-virus software; (2) Used outdated software and operating systems, including systems that were no longer supported; (3) Failed to provide adequate staff training to recognise phishing emails; (4) Failed to update its risk assessment; (5) Used poor encryption for the sensitive data it held. Interserve's failure to keep personal data secure was a breach of Article 5(1)(f) and Article 32 of the UK GDPR.",
        topics: JSON.stringify(["breach_notification"]),
        gdpr_articles: JSON.stringify(["5", "32"]),
        status: "final",
    },
];
const insertDecision = db.prepare(`
  INSERT OR IGNORE INTO decisions
    (reference, title, date, type, entity_name, fine_amount, summary, full_text, topics, gdpr_articles, status)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertDecisionsAll = db.transaction(() => {
    for (const d of decisions) {
        insertDecision.run(d.reference, d.title, d.date, d.type, d.entity_name, d.fine_amount, d.summary, d.full_text, d.topics, d.gdpr_articles, d.status);
    }
});
insertDecisionsAll();
console.log(`Inserted ${decisions.length} decisions`);
const guidelines = [
    {
        reference: "ICO-GUIDE-UKGDPR-2021",
        title: "Guide to the UK GDPR",
        date: "2021-01-01",
        type: "guide",
        summary: "The ICO's comprehensive guide to the UK General Data Protection Regulation (UK GDPR). Covers principles, lawful bases, special category data, rights of individuals, accountability, and security. The UK GDPR is the retained EU law version of the GDPR as it applied in the UK from 1 January 2021.",
        full_text: "The UK GDPR is the version of the EU General Data Protection Regulation as it applies in the UK. It is supplemented by the Data Protection Act 2018 (DPA 2018). The UK GDPR sets out six principles for processing personal data: (1) Lawfulness, fairness and transparency — processing must be lawful, fair and transparent; (2) Purpose limitation — data must be collected for specified, explicit and legitimate purposes; (3) Data minimisation — data must be adequate, relevant and limited to what is necessary; (4) Accuracy — data must be accurate and kept up to date; (5) Storage limitation — data must not be kept for longer than necessary; (6) Integrity and confidentiality — data must be processed securely. Lawful bases for processing: The six lawful bases are: consent, contract, legal obligation, vital interests, public task, and legitimate interests. Organisations must identify a lawful basis before processing. Special category data — including health, biometric, race, and political opinions — has additional restrictions and requires a separate condition. Individual rights: The UK GDPR gives individuals the right to: access (SARs), rectification, erasure ('right to be forgotten'), restriction of processing, data portability, object to processing, and rights relating to automated decision-making. International transfers: Since the UK left the EU, transfers between the UK and EEA are not restricted. Transfers to other countries require adequacy regulations, standard contractual clauses, or binding corporate rules.",
        topics: JSON.stringify(["consent", "international_transfers", "subject_access"]),
        language: "en",
    },
    {
        reference: "ICO-CHILDRENS-CODE-2020",
        title: "Age Appropriate Design Code (Children's Code)",
        date: "2020-09-02",
        type: "code_of_practice",
        summary: "The ICO's Age Appropriate Design Code (Children's Code) sets out 15 standards that online services likely to be accessed by children must meet. It came into force in September 2020, with a 12-month transition period ending September 2021.",
        full_text: "The Age Appropriate Design Code (Children's Code) is a statutory code of practice issued by the ICO. It applies to online services including apps, connected toys, social media platforms, search engines, gaming platforms, and streaming services that are likely to be accessed by children. The 15 standards of the Children's Code: (1) Best interests of the child — the best interests of the child should be a primary consideration; (2) Data protection impact assessments — conduct a DPIA for all new and existing online services; (3) Age appropriate application — take a risk-based approach to determine the age of users; (4) Transparency — provide privacy information in a child-friendly way; (5) Detrimental use of data — do not use children's data in ways that are detrimental to their wellbeing; (6) Policies and community standards — uphold published policies and community standards; (7) Default settings — default settings should offer high privacy protection; (8) Data minimisation — collect only minimum data necessary; (9) Data sharing — do not disclose children's data unless necessary; (10) Geolocation — switch geolocation services off by default; (11) Parental controls — do not use parental controls to monitor children covertly; (12) Profiling — switch off profiling by default; (13) Nudge techniques — do not use techniques designed to encourage children to provide more personal data; (14) Connected toys — ensure connected toys meet the code; (15) Online tools — provide tools to help children protect their privacy. Non-compliance can result in monetary penalties of up to GBP 17.5 million or 4% of global annual turnover.",
        topics: JSON.stringify(["children", "consent"]),
        language: "en",
    },
    {
        reference: "ICO-DIRECT-MARKETING-2022",
        title: "Direct Marketing Guidance",
        date: "2022-09-01",
        type: "guide",
        summary: "The ICO's guidance on direct marketing covers the requirements under the Privacy and Electronic Communications Regulations (PECR) and UK GDPR for sending marketing by email, SMS, phone, and post. It covers consent, soft opt-in, and the right to object.",
        full_text: "Direct marketing is defined as the communication of advertising or marketing material directed to particular individuals. The ICO's direct marketing guidance covers the rules under PECR and the UK GDPR. Email and SMS marketing: You must have prior consent to send marketing emails or SMS messages to individuals. The consent must be specific, informed, and freely given. There is a 'soft opt-in' exception — you can email existing customers without consent if they purchased a similar product or service, you gave them the opportunity to opt out at the time, and they did not opt out. Phone calls (live): You must not call someone who has registered with the Telephone Preference Service (TPS) or who has specifically told you they do not want calls. Automated calls: You need explicit consent for automated marketing calls. Corporate subscribers have different rights from individual subscribers. Buying lists: If you buy marketing lists, you must ensure the individuals have consented to receive marketing from companies in your sector. Lawful basis under UK GDPR: For postal marketing, you need a lawful basis — usually legitimate interests or consent. If you rely on legitimate interests, you must carry out a Legitimate Interests Assessment (LIA). Right to object: Individuals have an absolute right to object to direct marketing. You must stop as soon as you receive an objection.",
        topics: JSON.stringify(["direct_marketing", "consent", "legitimate_interest"]),
        language: "en",
    },
    {
        reference: "ICO-DATA-SHARING-2020",
        title: "Data Sharing Code of Practice",
        date: "2020-12-10",
        type: "code_of_practice",
        summary: "The ICO's statutory Data Sharing Code of Practice provides practical guidance on sharing personal data, including how to identify a lawful basis, carry out a data sharing impact assessment, use data sharing agreements, and meet transparency requirements.",
        full_text: "Data sharing is the disclosure of data from one or more organisations to a third party organisation or organisations, or the sharing of data between different parts of the same organisation. The ICO's Data Sharing Code of Practice provides guidance on how to share data lawfully and responsibly. When can you share data? You must have a lawful basis for sharing personal data. The lawful bases are the same as for other processing: consent, contract, legal obligation, vital interests, public task, or legitimate interests. For special category data, you need both a lawful basis and a condition from Article 9 of the UK GDPR. Data Sharing Impact Assessments (DSIA): Before setting up systematic data sharing, you should carry out a Data Sharing Impact Assessment to identify the risks and benefits. Consider: whether sharing is necessary for the purpose, the risks to individuals, whether the sharing is proportionate, and whether the benefits outweigh the risks. Data Sharing Agreements: For regular or systematic data sharing, you should have a data sharing agreement in place. The agreement should specify: the purpose of the sharing, the lawful basis, the types of data, the organisations involved, individual rights, security measures, and retention periods. Transparency: You must be transparent about data sharing. Privacy notices must explain who data is shared with and why.",
        topics: JSON.stringify(["data_sharing", "legitimate_interest"]),
        language: "en",
    },
    {
        reference: "ICO-DPIA-2018",
        title: "Data Protection Impact Assessments (DPIAs)",
        date: "2018-05-25",
        type: "guide",
        summary: "The ICO's guidance on when and how to carry out a Data Protection Impact Assessment (DPIA) under UK GDPR Article 35. Covers mandatory DPIA scenarios, the screening checklist, the three-step process, and when to consult the ICO.",
        full_text: "A Data Protection Impact Assessment (DPIA) is a process to help identify and minimise the data protection risks of a project. DPIAs are mandatory when processing is likely to result in high risk to individuals. When is a DPIA required? A DPIA is required when processing: involves systematic and extensive automated profiling with significant effects; involves large-scale processing of special category data or criminal offence data; involves systematic monitoring of publicly accessible areas on a large scale. The ICO has published a list of processing operations that require a DPIA. You should also do a DPIA for any other major project which involves the use of personal data. The DPIA screening checklist: Consider whether processing involves novel technologies; profiling; special category data; data about vulnerable individuals; large amounts of data; data matching; invisible processing; tracking location or behaviour; targeting children; or risk of harm to individuals. The three-step process: (1) Describe the nature, scope, context, and purposes of the processing; (2) Consider necessity and proportionality — assess whether the processing is necessary for the purpose, the least intrusive means, and whether the risks are proportionate to the benefit; (3) Identify and assess risks — for each risk, assess the likelihood and severity, and identify measures to reduce the risk. If you cannot reduce the risks sufficiently, you must consult the ICO before starting the processing. Documenting the DPIA: The DPIA must be documented and reviewed as part of your accountability obligations.",
        topics: JSON.stringify(["subject_access", "legitimate_interest"]),
        language: "en",
    },
];
const insertGuideline = db.prepare(`
  INSERT INTO guidelines (reference, title, date, type, summary, full_text, topics, language)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertGuidelinesAll = db.transaction(() => {
    for (const g of guidelines) {
        insertGuideline.run(g.reference, g.title, g.date, g.type, g.summary, g.full_text, g.topics, g.language);
    }
});
insertGuidelinesAll();
console.log(`Inserted ${guidelines.length} guidelines`);
// --- Summary -----------------------------------------------------------------
const decisionCount = db.prepare("SELECT count(*) as cnt FROM decisions").get().cnt;
const guidelineCount = db.prepare("SELECT count(*) as cnt FROM guidelines").get().cnt;
const topicCount = db.prepare("SELECT count(*) as cnt FROM topics").get().cnt;
const decisionFtsCount = db.prepare("SELECT count(*) as cnt FROM decisions_fts").get().cnt;
const guidelineFtsCount = db.prepare("SELECT count(*) as cnt FROM guidelines_fts").get().cnt;
console.log(`\nDatabase summary:`);
console.log(`  Topics:         ${topicCount}`);
console.log(`  Decisions:      ${decisionCount} (FTS entries: ${decisionFtsCount})`);
console.log(`  Guidelines:     ${guidelineCount} (FTS entries: ${guidelineFtsCount})`);
console.log(`\nDone. Database ready at ${DB_PATH}`);
db.close();

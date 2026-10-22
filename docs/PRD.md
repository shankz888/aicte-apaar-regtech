# Product Requirements Document (PRD)

## AICTE APAAR ID-Based Student Data Management & Verification Platform

**Document Version:** 1.0.0

**Target Event:** Smart India Hackathon 2026 (Problem Statement SIH26263 — PS 3)

**Classification:** Enterprise RegTech / Academic Data Governance Specification

---

## 1. Executive Summary & Core Mission

A centralized regulatory compliance and student-record verification engine designed for the **All India Council for Technical Education (AICTE)**.

The platform enables AICTE-approved institutions to ingest student batch records, cross-validate enrolments against approved program intakes and concurrent timelines, detect cross-institutional duplicate enrolments, and provide third parties with purpose-bound, privacy-preserving academic verifications via expiring cryptographic tokens.

```
+--------------------------------------------------------------------------------------------------+
|                                    CORE BOUNDARY DIRECTIVE                                       |
|  RegTech Verification Engine ONLY. Explicitly out of scope: attendance tracking, gradebook/LMS, |
|  fee processing, timetabling, examinations, or internal campus enterprise resource planning.     |
+--------------------------------------------------------------------------------------------------+

```

---

## 2. Goals, Non-Goals & Core Personas

### 2.1 Strategic Goals

* **Deterministic Batch Ingestion:** Stream parse and validate institutional CSV payloads up to 10,000 rows within 10 seconds.
* **Explainable Rule Execution:** Deliver row-level, reproducible rule-firing logs with clear remediation instructions.
* **Zero-Knowledge / Minimal-Disclosure Verification:** Enable external verifiers (employers/background screeners) to validate genuine academic standing without exposing raw identifiers, dates of birth, or home addresses.
* **Data Minimization:** Strictly no collection or processing of Indian national Aadhaar numbers. APAAR ID checks are mocked or interfaced via an isolated API boundary adapter.

### 2.2 Non-Goals (Explicit Exclusions)

* No student fee processing, credit transfer evaluations, or attendance tracking.
* No direct live queries to national identity registries without official signed MOUs; all hackathon demos must utilize labelled synthetic mocks.
* No permanent public ledger or blockchain deployments.

### 2.3 User Matrix & Authorization Levels

```
+----------------------+--------------------+-----------------------------------------------------+
| Role                 | Scope              | Entitlements                                        |
+----------------------+--------------------+-----------------------------------------------------+
| AICTE Central Admin  | National Aggregate | Rule config, cross-org analytics, dispute review,    |
|                      |                    | manual review escalations, system-wide audit logs.   |
| Institution Admin    | Single Institution | Upload batches, manage campus staff, view campus     |
|                      |                    | analytics, download annotated validation reports.   |
| Institution Operator | Single Institution | Upload CSVs, execute line-item corrections,         |
|                      |                    | download annotated error manifests.                 |
| External Verifier    | Single Request     | Submit student token verification, inspect bounded   |
|                      |                    | verification assertions; strictly no search access. |
+----------------------+--------------------+-----------------------------------------------------+

```

---

## 3. Normalized Relational Data Architecture

```
                  +-------------------------+
                  |       Institution       |
                  +-------------------------+
                               | 1
                               |
                               | N
                  +-------------------------+
                  |     ApprovedIntake      |
                  +-------------------------+
                               | 1
                               |
                               | N
+-------------------+ 1     N +-------------------+ N     1 +-------------------+
|      Student      |---------|  AdmissionRecord  |---------|    Programme      |
+-------------------+         +-------------------+         +-------------------+
        | 1                            | 1
        |                              |
        | N                            | N
+-------------------+         +-------------------+
| StudentIdentifier |         |  EnrolmentPeriod  |
+-------------------+         +-------------------+
                                       |
                                       +-------------------+
                                       |                   |
                                       | N                 | N
                              +-----------------+ +-----------------+
                              | SubmissionBatch | | ValidationResult|
                              +-----------------+ +-----------------+

```

### 3.1 Primary Schema Definitions

#### `institutions`

* `id`: UUID (PK)
* `aicte_permanent_id`: VARCHAR(32) (Unique, Indexed)
* `legal_name`: VARCHAR(255)
* `state`: VARCHAR(64)
* `status`: ENUM (`active`, `probation`, `suspended`)
* `created_at`: TIMESTAMPTZ

#### `approved_intakes`

* `id`: UUID (PK)
* `institution_id`: UUID (FK -> institutions.id)
* `programme_id`: UUID (FK -> programmes.id)
* `academic_year`: VARCHAR(9) (e.g., `'2025-2026'`)
* `approved_capacity`: INT
* `supernumerary_nri_cap`: INT
* `supernumerary_fn_cap`: INT
* `lateral_entry_cap`: INT
* `status`: ENUM (`active`, `frozen`)
* *Constraint:* UNIQUE(`institution_id`, `programme_id`, `academic_year`)

#### `students`

* `id`: UUID (PK)
* `apaar_id`: VARCHAR(12) (Unique, Nullable, Masked at rest, Indexed)
* `apaar_status`: ENUM (`verified`, `pending_apaar`, `failed_verification`, `unavailable`)
* `full_name`: VARCHAR(255)
* `gender`: ENUM (`male`, `female`, `transgender`, `prefer_not_to_say`)
* `created_at`: TIMESTAMPTZ

#### `admission_records`

* `id`: UUID (PK)
* `student_id`: UUID (FK -> students.id)
* `institution_id`: UUID (FK -> institutions.id)
* `programme_id`: UUID (FK -> programmes.id)
* `academic_year`: VARCHAR(9)
* `admission_category`: ENUM (`general`, `ews`, `sc_st_obc`, `nri`, `foreign_national`, `lateral_entry`)
* `enrolment_status`: ENUM (`active`, `transferred`, `withdrawn`, `graduated`, `cancelled`)
* `start_date`: DATE
* `end_date`: DATE (Nullable)
* `is_verified_active`: BOOLEAN (Default: FALSE)

#### `submission_batches`

* `id`: UUID (PK)
* `institution_id`: UUID (FK -> institutions.id)
* `uploaded_by`: UUID (FK -> users.id)
* `original_filename`: VARCHAR(255)
* `file_sha256`: CHAR(64)
* `total_rows`: INT
* `accepted_rows`: INT
* `flagged_rows`: INT
* `rejected_rows`: INT
* `status`: ENUM (`queued`, `parsing`, `validating`, `completed`, `failed`)
* `created_at`: TIMESTAMPTZ

#### `validation_results`

* `id`: UUID (PK)
* `batch_id`: UUID (FK -> submission_batches.id, Indexed)
* `row_index`: INT
* `rule_code`: VARCHAR(32) (Indexed)
* `severity`: ENUM (`blocking`, `warning`, `info`)
* `status`: ENUM (`accepted`, `flagged`, `rejected`)
* `rule_description`: TEXT
* `evidence_payload`: JSONB (Stores mismatched parameters, capacity deltas, conflicting IDs)
* `remediation_hint`: TEXT

#### `verification_tokens`

* `id`: UUID (PK)
* `student_id`: UUID (FK -> students.id)
* `token_hash`: CHAR(64) (SHA-256 hash of plaintext token)
* `requester_org`: VARCHAR(255)
* `purpose`: VARCHAR(255)
* `permitted_fields`: JSONB (Array of field keys: `['full_name', 'programme', 'academic_year', 'enrolment_status']`)
* `expires_at`: TIMESTAMPTZ
* `revoked`: BOOLEAN (Default: FALSE)

---

## 4. Regulatory Validation Engine (Deterministic Matrix)

```
[CSV Stream] ──> Layer 1: Schema Checks ──> Layer 2: APAAR Boundary ──> Layer 3: Regulatory Rules ──> [Partition & Report]

```

### 4.1 Execution Rules Catalog

```
+------------+--------------------+-----------+-----------------------------------+------------------------------------------+
| Rule Code  | Category           | Severity  | Trigger Condition                 | Explanatory Remediation Action           |
+------------+--------------------+-----------+-----------------------------------+------------------------------------------+
| SCH-001    | Syntax & Structure | Blocking  | Missing mandatory header or       | Align CSV against template v1.2 headers; |
|            |                    |           | unescaped comma split.            | re-save file as UTF-8 without BOM.       |
| SCH-002    | Syntax & Structure | Blocking  | Invalid academic year format      | Ensure academic_year matches format      |
|            |                    |           | (regex failed: ^\d{4}-\d{4}$).    | 'YYYY-YYYY' (e.g., 2025-2026).           |
| APR-001    | APAAR Verification | Warning   | APAAR identifier missing or null. | Flag row as 'pending_apaar'. APAAR is    |
|            |                    |           |                                   | voluntary; institutional intake proceeds.|
| APR-002    | APAAR Verification | Blocking  | Checksum failed against mock      | Verify APAAR string with student record. |
|            |                    |           | registry verification endpoint.   | Resubmit with corrected 12-digit format. |
| DUP-001    | Duplicate Enrolment| Blocking  | Same student identifier appears   | Remove redundant row inside current batch|
|            |                    |           | multiple times in current batch.  | payload prior to resubmission.           |
| DUP-002    | Cross-Institution  | Blocking  | APAAR ID matched to concurrent    | Verify transfer certificate. Submit NOC/ |
|            | Timeline Clash     |           | active enrolment at other college | clearance certificate to resolve dispute.|
| CAP-001    | Intake Quota       | Blocking  | Total regular admissions exceeds  | Aggregate capacity breached. File AICTE  |
|            |                    |           | approved_intake.approved_capacity | variation request or adjust admissions.  |
| CAP-002    | Supernumerary NRI  | Blocking  | NRI admissions count exceeds      | Cap breached (>15% sanctioned quota).    |
|            |                    |           | sanctioned NRI supernumerary cap. | Audit applicant category allocations.    |
| TIM-001    | Enrolment Timeline | Warning   | Progression date precedes prior   | Check lateral entry / transfer dates.    |
|            | Discrepancy        |           | degree completion timestamp.      | Upload clarifying academic evidence.     |
+------------+--------------------+-----------+-----------------------------------+------------------------------------------+

```

### 4.2 Outcome Categorization Pipeline

* **ACCEPTED:** All checks pass. Record is promoted directly into the validated centralized repository.
* **FLAGGED (Warning):** Non-fatal anomalies detected (e.g., `APR-001` Voluntary APAAR absence, non-blocking sequence warning). Record enters review queue; does not stall entire batch.
* **REJECTED (Blocking):** Severe compliance violation (e.g., `CAP-001` Approved Intake Overrun, `DUP-002` Overlapping Active Full-Time Enrolment). Record is barred from entering the central repository.

---

## 5. Screen-by-Screen UX Specifications

### 5.1 Design System Constants

* **Typography:** `Inter`, System UI font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`).
* **Color Palette:**
* Deep Navy (Nav/Surface Accent): `#0F172A`
* Slate Neutral (Borders & Muted Text): `#64748B` / `#E2E8F0`
* App Canvas (Background): `#F8FAFC`
* Primary Action Blue: `#1D4ED8` (Hover: `#1E40AF`)
* Semantic Green (Pass/Accepted): `#15803D` (Surface: `#F0FDF4`)
* Semantic Amber (Warning/Flagged): `#B45309` (Surface: `#FFFBEB`)
* Semantic Red (Blocking/Rejected): `#B91C1C` (Surface: `#FEF2F2`)



---

### 5.2 Screen Details

#### Screen S-01: Global Authentication & Gateway (`/login`)

* **Visual Structure:** Split container. Left: Platform governance metadata (AICTE RegTech Portal branding, version, helpline links). Right: High-contrast white card containing the login form.
* **Form Fields:** `Email Address`, `Password`, `Role Selector (AICTE Admin | Institution | External Verifier)`.
* **States:**
* *Default:* Clean inputs with clear focus indicators.
* *Error:* Red highlight on inputs; alert box stating `"Invalid credentials or role mismatch."`
* *Rate-Limited:* Submit button disabled with counter: `"Too many failed attempts. Locked for 300s."`



#### Screen S-02: Institutional Submission Workspace (`/institution/submit`)

* **Visual Structure:** 3-stage visual progress header: `(1) Upload & Format Check -> (2) Automated Validation -> (3) Review & Remediation`.
* **Key Components:**
* Standard File Ingestion Zone: Drag-and-drop box specifying `"Accepts RFC-4180 CSV, max 10MB (approx. 15,000 rows)"`.
* Template Download Utility: Text link: `"Download AICTE Compliant CSV Template (v2026.1)"`.
* Schema Pre-Check Table: Renders first 5 rows instantly on client side before network upload, validating column headers against schema.


* **States:**
* *Empty:* Upload dropzone idle.
* *Processing:* Indeterminate linear loader with phase text: `"Running duplicate & timeline checks (Row 4,120/8,500)..."`.
* *Schema Failed:* Dismissable red callout listing missing/misspelled column headers with expected vs. actual values.



#### Screen S-03: Batch Results & Line-Item Remediation Console (`/institution/batches/[id]`)

* **Visual Structure:**
* *Top Summary Strip:* 4 KPI summary blocks: `Total Submitted`, `Accepted (Green)`, `Flagged Warnings (Amber)`, `Rejected / Blocking (Red)`.
* *Action Bar:* Filter tabs (`All`, `Blocking Errors Only`, `Warnings`), Search by Student ID/Name, and a primary button: `"Download Annotated Correction CSV"`.
* *Inspection Grid:* Virtualized table displaying: `Row #`, `Student Identifiers`, `Programme`, `Admission Category`, `Validation Status Badge`, `Fired Rule`, `Actionable Reason`.
* *Slide-over Drawer:* Clicking any row slides out the Record Remediation Panel displaying full JSON evidence (e.g., `"Capacity cap 120 exceeded: Found 124 records"`), alongside remediation instructions.



#### Screen S-04: AICTE Central Compliance Dashboard (`/admin/overview`)

* **Visual Structure:** Multi-tier analytics matrix designed for high data density.
* **Key Modules:**
* *National Intake Capacity vs Actual Enrolments:* Grouped bar breakdown by state and programme type.
* *Exception Stream:* Real-time data feed showing batches with >5% rejection rates.
* *Duplicate Dispute Queue:* Table highlighting cross-institutional conflicts (`DUP-002`) requiring regulatory mediation between Institution A and Institution B.



#### Screen S-05: Purpose-Bound External Verifier Gateway (`/verify/[token]`)

* **Visual Structure:** Centered minimal verification view (No administrative navigation links, completely isolated layout).
* **Core Card Elements:**
* Identity Status Badge: Large green pill: `"VERIFIED AICTE ENROLMENT"` or red pill: `"UNABLE TO VERIFY"`.
* Permitted Disclosure Grid: Displays only: `Student Full Name`, `Enrolled Institution`, `Programme Name`, `Enrolment Year`, `Status (Active / Completed)`.
* Cryptographic Assertion Box: Displays `Verification Hash (HMAC-SHA256)`, `Timestamp Issued`, `Token Expiration Countdown`.
* *Redaction Safety:* Date of birth, home address, and APAAR identifiers are strictly omitted from the DOM.


* **States:**
* *Expired / Revoked:* Grey card displaying `"This verification link expired on [Date] or was revoked by the student/institution."`



---

## 6. Zero-Knowledge External Verification Protocol

```
+--------------------------------------------------------------------------------------------------+
|                                    VERIFICATION FLOW                                             |
|                                                                                                  |
| [Verifier Portal]                                                                                |
|        |                                                                                         |
|        | 1. Submit Student Identity Keys                                                         |
|        v                                                                                         |
| [API Gateway] ──> 2. Validate Active Consent ──> 3. Issue Token (HMAC-SHA256, TTL: 72 hrs)      |
|                                                              |                                   |
|                                                              v                                   |
|                                               [Minimal Assertion View]                           |
|                                               - Institution Name                                 |
|                                               - Programme & Year                                 |
|                                               - Enrolment Status                                 |
|                                               (NO PII, NO APAAR ID, NO DOB)                      |
+--------------------------------------------------------------------------------------------------+

```

### Protocol Mechanics

1. **Request & Consent Check:** The requester provides student identity keys and verified consent reference ID.
2. **Ephemeral Token Generation:** The backend issues a single-use or time-bounded cryptographic token (HMAC-SHA256, TTL: 72 hours).
3. **Information Barrier:** The public verification endpoint serves strictly boolean assertions and non-sensitive metadata (Enrolment Status, Institution, Course). Identifier strings (APAAR, internal database IDs) are never returned in the JSON response payload.

---

## 7. Recommended Technology Stack & Architecture

```
+--------------------------------------------------------------------------------------------------+
|                                      SYSTEM TOPOLOGY                                             |
|                                                                                                  |
|  [Next.js 14 Client]  ──(REST/JSON)──>  [FastAPI Modular Monolith]  ──>  [PostgreSQL 16 DB]      |
|  - Tailwind CSS                         - Pydantic v2 Validations         - Row-Level Security   |
|  - shadcn/ui Data Tables                - Celery Worker (CSV Streaming)   - Partitioned Batches  |
|  - TanStack Virtual                     - Mock APAAR Service Adapter      - Immutable Audit Log  |
+--------------------------------------------------------------------------------------------------+

```

* **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table (with row virtualization for 10k+ rows).
* **Backend:** FastAPI (Python 3.12) organized as a modular monolith. High-performance CSV parsing via Polars / Streaming Pandas.
* **Database:** PostgreSQL 16 with optimized composite B-tree indexes for cross-institution duplicate searches and intake checks.
* **Security:** Argon2id password hashing, HTTP-only SameSite cookies, JWT bearer auth with role claims, DefusedCSV against CSV macro injection.

---

## 8. Synthetic Fault-Injection Benchmark Suite

To facilitate repeatable testing and evaluative demos without real student records, the system includes a pre-packaged synthetic testing engine:

```
+----------------------+--------------------+---------------------+---------------------------------+
| Test Scenario        | Injected Anomalies | Expected Detections | Primary Metric Evaluated        |
+----------------------+--------------------+---------------------+---------------------------------+
| Batch ST-01 (Clean)  | 0 faults / 2,000   | 0 Rejected,         | False Positive Rate (<0.01%)    |
|                      | records            | 2,000 Accepted      |                                 |
| Batch ST-02 (Intake) | Sanctioned: 120    | 15 Rows Rejected    | Exact boundary cap detection    |
|                      | Injected: 135 rows | with code CAP-001   | (Precision: 100%, Recall: 100%) |
| Batch ST-03 (Clash)  | 10 Active overlap  | 10 Rows Rejected    | Cross-tenant conflict detection |
|                      | IDs in Inst B      | with code DUP-002   | without cross-tenant data leak  |
| Batch ST-04 (Format) | 50 Malformed dates | 50 Rows Blocked     | Line-item error isolation;      |
|                      | and bad headers    | with code SCH-002   | non-failing rows still process  |
+----------------------+--------------------+---------------------+---------------------------------+

```

---

## 9. Hackathon Implementation Roadmap (48-Hour Scope)

```
[Phase 1: Hours 0-12]   Data Model Setup + FastAPI Ingestion + CSV Parsing Pipeline
[Phase 2: Hours 13-24]  Core Validation Engine (CAP-001, DUP-001/002) + Remediation Export
[Phase 3: Hours 25-36]  Next.js Console + Virtualized Error Table + Mock APAAR Adapter
[Phase 4: Hours 37-48]  Verifier Gateway + Synthetic Benchmark Screen + Polish & Hardening

```

* **P0 Deliverables (Hackathon Core):**
* Working Institution CSV upload with immediate line-by-line validation.
* Core validation rules: Duplicate detection (`DUP-001`, `DUP-002`) and approved capacity check (`CAP-001`).
* Annotated CSV export containing row-level error reports.
* Interactive demonstration using the synthetic test benchmark datasets.


* **P1 Deliverables (Evaluation Differentiators):**
* Privacy-preserving external verification screen (`/verify/[token]`).
* AICTE Central Overview with aggregate capacity reconciliation.
* Comprehensive audit trail showing rule change history and administrative actions.


* **P2 Deliverables (Post-Hackathon / Production):**
* Production DigiLocker / APAAR OAuth2 gateway integrations.
* Asynchronous Kafka batch distribution for multi-million record processing.



---

## 10. Hackathon Demonstration Script (Step-by-Step)

1. **Step 1: The Ingestion Flow:** Log in as `Principal @ Apex Institute of Tech`. Navigate to `/institution/submit` and drag-and-drop `synthetic_batch_overintake_135.csv` (Intake capacity: 120).
2. **Step 2: Transparent Error Explanations:** System parses 135 rows in under 2 seconds. Rows 1–120 pass (`ACCEPTED`); rows 121–135 flag red (`CAP-001: Sanctioned Intake Capacity Exceeded`). Inspect the slide-over drawer to view the capacity delta and regulatory rule context.
3. **Step 3: The Remediation Loop:** Click `"Download Annotated Error CSV"`. Open the file to demonstrate that original data columns are preserved alongside appended regulatory diagnostic columns (`AICTE_STATUS`, `ERROR_CODE`, `REMEDIATION_TEXT`).
4. **Step 4: Cross-Institutional Conflict Handling:** Upload `synthetic_batch_concurrent_transfer.csv`. The system blocks an active student entry, citing `DUP-002: Concurrent Full-time Enrolment Active at Institute ID #AICTE-TN-042`. Show that the conflicting institution's private student identity details remain hidden.
5. **Step 5: External Verification:** Log in as an external employer. Access the verification link with token `chk_demo8723`. View the verified academic status assertion, noting that APAAR IDs and personal identifying details are completely redacted from the response payload.
6. **Step 6: Synthetic Benchmark Report:** Switch to the AICTE Central Admin view. Navigate to `/admin/benchmark` to review the automated test matrix confirming 100% precision and recall across all injected test datasets.
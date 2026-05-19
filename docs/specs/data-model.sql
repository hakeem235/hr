-- =============================================================================
-- HR Platform — Core Data Model
-- PostgreSQL 15+
-- =============================================================================
-- Principles (see CLAUDE.md §4):
--   1. /services/people owns the employee master. Other services reference
--      employee_id but never duplicate person/employment columns.
--   2. Everything that changes over time is effective-dated. Changes are
--      INSERTs with a new effective range, never destructive UPDATEs. This
--      gives audit trail and as-of queries for free.
--   3. Person 1:N Employee (rehire) 1:N Position (history) 1:N Compensation.
--   4. Money is stored as integer minor units (halalas) — never floats.
--   5. Every table is filterable by entity_id for multi-entity orgs.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- for exclusion constraints on ranges

-- -----------------------------------------------------------------------------
-- Reference / org structure
-- -----------------------------------------------------------------------------
CREATE TABLE entity (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legal_name    TEXT NOT NULL,
    country       CHAR(2) NOT NULL DEFAULT 'SA',
    -- working calendar drives SLA business-hours math (CLAUDE.md §5)
    work_week     INT[] NOT NULL DEFAULT '{0,1,2,3,4}',  -- 0=Sun … KSA Sun–Thu
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE department (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id     UUID NOT NULL REFERENCES entity(id),
    name          TEXT NOT NULL,
    parent_id     UUID REFERENCES department(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holiday_calendar (
    entity_id     UUID NOT NULL REFERENCES entity(id),
    holiday_date  DATE NOT NULL,
    name          TEXT NOT NULL,
    is_religious  BOOLEAN NOT NULL DEFAULT false,  -- Ramadan/Eid/Hajj clusters
    PRIMARY KEY (entity_id, holiday_date)
);

-- -----------------------------------------------------------------------------
-- Person — immutable identity. One row per human, ever.
-- -----------------------------------------------------------------------------
CREATE TABLE person (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name_en  TEXT NOT NULL,
    full_name_ar  TEXT,
    nationality   CHAR(2) NOT NULL,
    date_of_birth DATE NOT NULL,
    national_id   TEXT,                 -- iqama / national ID, encrypted at rest
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Employee — an employment relationship. Person 1:N Employee (handles rehire).
-- -----------------------------------------------------------------------------
CREATE TYPE employment_status AS ENUM
    ('pre_hire','active','on_leave','suspended','terminated');

CREATE TABLE employee (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id     UUID NOT NULL REFERENCES person(id),
    entity_id     UUID NOT NULL REFERENCES entity(id),
    employee_no   TEXT NOT NULL,
    status        employment_status NOT NULL DEFAULT 'pre_hire',
    hire_date     DATE NOT NULL,
    exit_date     DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, employee_no)
);
CREATE INDEX idx_employee_entity ON employee(entity_id);
CREATE INDEX idx_employee_person ON employee(person_id);

-- -----------------------------------------------------------------------------
-- Position — role/grade/dept over time. Effective-dated history.
-- -----------------------------------------------------------------------------
CREATE TABLE position (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id   UUID NOT NULL REFERENCES employee(id),
    title         TEXT NOT NULL,
    grade         TEXT NOT NULL,
    department_id UUID NOT NULL REFERENCES department(id),
    reports_to    UUID REFERENCES employee(id),
    effective     DATERANGE NOT NULL,            -- [start, end)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- one employee cannot hold two positions in the same period
    EXCLUDE USING gist (employee_id WITH =, effective WITH &&)
);
CREATE INDEX idx_position_employee ON position(employee_id);
CREATE INDEX idx_position_reports_to ON position(reports_to);

-- -----------------------------------------------------------------------------
-- Compensation — salary components over time. Minor units (halalas).
-- -----------------------------------------------------------------------------
CREATE TABLE compensation (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employee(id),
    basic_minor     BIGINT NOT NULL,             -- e.g. 900000 = SAR 9,000.00
    housing_minor   BIGINT NOT NULL DEFAULT 0,
    transport_minor BIGINT NOT NULL DEFAULT 0,
    other_minor     BIGINT NOT NULL DEFAULT 0,
    currency        CHAR(3) NOT NULL DEFAULT 'SAR',
    effective       DATERANGE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    EXCLUDE USING gist (employee_id WITH =, effective WITH &&)
);
CREATE INDEX idx_comp_employee ON compensation(employee_id);

-- -----------------------------------------------------------------------------
-- Leave types, balances, requests
-- -----------------------------------------------------------------------------
CREATE TABLE leave_type (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id       UUID NOT NULL REFERENCES entity(id),
    code            TEXT NOT NULL,               -- annual | sick | casual | hajj …
    name_en         TEXT NOT NULL,
    name_ar         TEXT NOT NULL,
    accrual_rule    JSONB NOT NULL,              -- config-driven, not code
    requires_doc    BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (entity_id, code)
);

CREATE TABLE leave_balance (
    employee_id     UUID NOT NULL REFERENCES employee(id),
    leave_type_id   UUID NOT NULL REFERENCES leave_type(id),
    year            INT NOT NULL,
    accrued_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
    used_days       NUMERIC(6,2) NOT NULL DEFAULT 0,
    carried_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (employee_id, leave_type_id, year)
);

CREATE TYPE leave_status AS ENUM
    ('draft','pending_approval','approved','declined','cancelled',
     'scheduled','taken');

CREATE TABLE leave_request (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id            UUID NOT NULL REFERENCES entity(id),
    employee_id          UUID NOT NULL REFERENCES employee(id),
    leave_type_id        UUID NOT NULL REFERENCES leave_type(id),
    start_date           DATE NOT NULL,
    end_date             DATE NOT NULL,
    working_days         NUMERIC(6,2) NOT NULL,  -- computed server-side
    reason               TEXT,
    status               leave_status NOT NULL DEFAULT 'pending_approval',
    workflow_instance_id UUID,                   -- owned by workflow-engine
    idempotency_key      TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    UNIQUE (employee_id, idempotency_key)
);
CREATE INDEX idx_leave_req_employee ON leave_request(employee_id);
CREATE INDEX idx_leave_req_status ON leave_request(entity_id, status);

-- -----------------------------------------------------------------------------
-- Documents (offers, contracts, letters, IDs) — typed + versioned
-- -----------------------------------------------------------------------------
CREATE TABLE document (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id     UUID NOT NULL REFERENCES entity(id),
    employee_id   UUID REFERENCES employee(id),
    doc_type      TEXT NOT NULL,                 -- offer|contract|letter|id|cert
    title         TEXT NOT NULL,
    storage_key   TEXT NOT NULL,                 -- object-store reference
    version       INT NOT NULL DEFAULT 1,
    expires_on    DATE,                          -- iqama/passport/contract expiry
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_employee ON document(employee_id);
CREATE INDEX idx_document_expiry ON document(entity_id, expires_on)
    WHERE expires_on IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Generic approval projection (see workflow-engine.md). The leave_request
-- status is a PROJECTION of this; the engine owns the transitions.
-- -----------------------------------------------------------------------------
CREATE TABLE approval_step (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_instance_id UUID NOT NULL,
    step_key             TEXT NOT NULL,
    actor_employee_id    UUID REFERENCES employee(id),
    state                TEXT NOT NULL,          -- pending|active|done|skipped|failed|escalated
    decision             TEXT,                   -- approved|declined
    note                 TEXT,
    sla_due_at           TIMESTAMPTZ,
    activated_at         TIMESTAMPTZ,
    decided_at           TIMESTAMPTZ
);
CREATE INDEX idx_approval_instance ON approval_step(workflow_instance_id);
CREATE INDEX idx_approval_actor ON approval_step(actor_employee_id, state);

-- -----------------------------------------------------------------------------
-- Outbox — guarantees event publication (CLAUDE.md §4). Write the domain
-- change and the event row in ONE transaction; a relay publishes the outbox.
-- -----------------------------------------------------------------------------
CREATE TABLE event_outbox (
    id             BIGSERIAL PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id   UUID NOT NULL,
    event_type     TEXT NOT NULL,
    correlation_id UUID NOT NULL,
    payload        JSONB NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished ON event_outbox(id)
    WHERE published_at IS NULL;

-- -----------------------------------------------------------------------------
-- Immutable audit log — append-only. Separate concern from event_outbox.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    entity_id     UUID NOT NULL,
    actor_id      UUID,                          -- who did it (null = system)
    action        TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    target_id     UUID NOT NULL,
    metadata      JSONB,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);

-- =============================================================================
-- Notes
-- =============================================================================
-- * As-of query example (compensation effective on a date):
--     SELECT * FROM compensation
--     WHERE employee_id = $1 AND effective @> $2::date;
-- * National IDs and storage keys must be encrypted at rest (app-layer or
--   pgcrypto) — out of scope for this DDL but required before production.
-- * No ON DELETE CASCADE anywhere by design: deletions are soft (status
--   changes), per CLAUDE.md §12.

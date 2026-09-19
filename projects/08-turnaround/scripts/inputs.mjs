import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dollarsToCents } from "../model.mjs";

export const PROJECT = "projects/08-turnaround";
export const readText = name => readFileSync(`${PROJECT}/${name}`, "utf8");
export const readJSON = name => JSON.parse(readText(name));
export const sha256 = value => createHash("sha256").update(value).digest("hex");

export function parseCsv(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  const header = lines.shift().split(",");
  if (header.some(key => !key) || new Set(header).size !== header.length) throw new Error("Invalid CSV header");
  return lines.map(line => {
    if (line.includes('"')) throw new Error("Only the reviewed unquoted seed CSV format is supported");
    const fields = line.split(",");
    if (fields.length !== header.length) throw new Error(`CSV width mismatch: ${line}`);
    return Object.fromEntries(header.map((key, index) => [key, fields[index]]));
  });
}

export function verifyCopiedData() {
  const attribution = readJSON("data/attribution.json");
  for (const file of attribution.copiedData) {
    const actual = sha256(readFileSync(`${PROJECT}/${file.local}`));
    if (actual !== file.sha256) throw new Error(`Copied data hash mismatch: ${file.local}`);
  }
  return attribution.copiedData.length;
}

export function loadInputs() {
  verifyCopiedData();
  const source = name => parseCsv(readText(`data/reference/${name}.csv`));
  const seedCase = readJSON("data/reference/recovery.json");
  const provenance = readJSON("data/attribution.json");
  return {
    schema: "turnaround-frozen-inputs/1",
    classification: "Synthetic seed facts plus explicitly separated added assumptions",
    case: {
      id: seedCase.case_id,
      business: seedCase.fictional_business,
      asOf: seedCase.as_of,
      months: seedCase.months,
      openingCashCents: dollarsToCents(seedCase.opening_cash_usd),
      cashFloorCents: dollarsToCents(seedCase.cash_floor_usd),
      daysPerMonth: seedCase.modeled_days_per_month,
      sprintWorkingDays: seedCase.timebox_working_days,
      engineeringCapacityMinutes: seedCase.engineering_capacity_minutes,
      supportCapacityMinutes: seedCase.support_capacity_minutes,
      accountingAssumption: seedCase.accounting_fixture_assumption,
      payableTreatment: seedCase.payables_treatment,
      approvedExternalEffects: seedCase.approved_external_effects,
      realizedRecoveryResults: seedCase.realized_recovery_results
    },
    ledger: source("cash-ledger").map(row => ({
      id: row.transaction_id, date: row.posted_on, category: row.category,
      direction: row.direction, amountCents: dollarsToCents(row.amount_usd)
    })),
    subscriptions: source("subscriptions").map(row => ({
      id: `${row.month}-${row.plan}`, month: row.month, plan: row.plan,
      accounts: Number(row.active_accounts), priceCents: dollarsToCents(row.monthly_price_usd)
    })),
    payables: source("payables").map(row => ({
      id: row.payable_id, dueOn: row.due_on, amountCents: dollarsToCents(row.amount_usd),
      basis: row.basis, treatment: row.forecast_treatment
    })),
    rates: source("scenarios").map(row => ({
      id: row.scenario_id,
      receiptsCents: dollarsToCents(row.subscription_receipts_usd),
      payrollCents: dollarsToCents(row.payroll_usd),
      contractorsCents: dollarsToCents(row.contractors_usd),
      hostingCents: dollarsToCents(row.hosting_usd),
      refundsCents: dollarsToCents(row.refunds_usd),
      precondition: row.precondition
    })),
    tickets: source("support-backlog").map(row => ({
      id: row.ticket_id, openedOn: row.opened_on, priority: row.priority, state: row.state,
      minutes: Number(row.estimated_minutes), affectedAccounts: Number(row.affected_accounts),
      blockedBy: row.blocked_by, issue: row.issue
    })),
    sprint: source("recovery-sprint").map(row => ({
      id: row.work_id, owner: row.owner, bucket: row.budget_bucket,
      minutes: Number(row.estimate_minutes), dependsOn: row.depends_on,
      entryGate: row.entry_gate, exitEvidence: row.exit_evidence
    })),
    approvalGates: readJSON("data/reference/approval-gates.json"),
    model: readJSON("data/assumptions.json"),
    provenance: {
      attribution: "projects/08-turnaround/data/attribution.json",
      copiedData: provenance.copiedData,
      modelAssumptionsSha256: sha256(readText("data/assumptions.json")),
      scenarioSpecificationSha256: sha256(readText("data/scenarios.json"))
    }
  };
}

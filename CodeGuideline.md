# Code Guideline

## Project Structure Overview

```
project-root/
  ├── i18n.config.json       # i18n manifest for supported locales and language metadata
  ├── public/
  │   └── locales/           # public/locales/{code}.json translation files
  ├── src/
  │   ├── components/        # All reusable UI components
  │   │   └── ui/            # Prebuilt and custom UI components, grouped by function
  │   ├── hooks/             # Custom React hooks
  │   ├── i18n/              # i18n runtime: config.ts (entry) + util.ts (helpers)
  │   ├── lib/               # Utility functions and libraries
  │   ├── pages/             # Application pages (each page in its own subdirectory)
  │   ├── App.tsx            # Main app component, sets up route providers
  │   ├── router.tsx         # Router config, sets up routing
  │   ├── main.tsx           # Entry point for the React app
  │   └── index.css          # Global styles
  ├── package.json           # Project metadata and scripts
  ├── tailwind.config.ts     # Tailwind CSS configuration
  └── ...                    # Other config and lock files
```

> Backend-handoff temporary files (`scripts/`, `i18n.scan.json`, `reports/i18n/`, `docs/i18n-*.md`) are kept in the repo only until backend integration of i18n statistics/scan/auto-translate is complete. They are owned by the backend long-term and will be removed once integration lands. Treat them as read-only handoff copies — do not extend them.

## Directory Responsibilities

- **src/financial-engine/cash-equivalence.ts**: Optional same-cut, single-currency closure comparison against independently declared reference totals; validates the reference equations and bank control without mutating operational data.
- **src/components/treasury/CashEquivalence.tsx**: Shared session-only reference form in CashPosition, with explicit scope confirmation, visible differences and authorized CSV export. No database migration or recurring CAJA input.

- **supabase/migrations/20261012010000000_planning_operations.sql**: Evidence-backed partial redemptions, shared bank allocation limits, explicit manual bank accounts and forward preservation of operations.
- **supabase/migrations/20261012020000000_october_plan_review.sql**: Private October reference catalog and atomic, explicit adoption preserving identities, edits, cancellations and source evidence.
- **src/services/planReviewService.ts**, **src/pages/planning/PlanReview.tsx**, **src/pages/planning/PlanReviewRows.tsx**: Reviewed transition of commitments, placements, redemptions and collection accounts into native planning; no recurring workbook dependency.
- **src/pages/planning/Placements.tsx**: Native planned investment outflows, editable alongside commitments, with bank execution evidence and pending liquidity.
- **tests/planning-operations.test.ts**: Placement liquidity, partial rescue allocation, shared posting limits, carry and read-only reference adoption cases, delivered without execution.
- **supabase/migrations/20261012000000000_cash_position.sql**: Batch-scoped projection policy; activates cutoff-day planning for the current and subsequent ERP loads while preserving older batches and saved forecasts.
- **src/components/treasury/CashPosition.tsx**: Shared cutoff cash bridge, with separate real cash, pending income/expense and projected closing, and source drill-downs in Resumen and Flujo.
- **tests/cash-position.test.ts**: Cutoff-day planning, partial execution, receiving accounts, daily aggregation and saved-policy regression cases; this patch delivers the cases without executing them.
- **supabase/migrations/20260928000000000_initial_business_plan.sql**: Reviewed SONACOL planning bootstrap with preserved source evidence, duplicate/conflict control, and partial execution against bank postings; original ERP rows and earlier snapshots remain unchanged.
- **src/services/initialPlanService.ts**: Explicit bank allocation service for manual commitments, placements and redemptions. The former September-only `InitialPlan.tsx` was replaced by the reviewed October transition.
- **src/pages/projections/ManualExecutionDialog.tsx**: Explicit allocation and reversal of a bank posting against a planned commitment, with remaining-amount and concurrency controls.
- **src/financial-engine/bank-activity.ts**: Registered ERP income/expense and daily bank cash, excluding openings from period flows and keeping past postings out of forecasts.
- **src/components/treasury/BankActivity.tsx**: Shared registered-cash summary and daily/source drill-down in Resumen and Flujo de caja, using their selected snapshot, bank and currency.
- **tests/cashflow-activity.test.ts**, **tests/browser/cashflow-activity.spec.ts**: Actual expenses versus future commitments, exact daily/weekly/monthly balances, minimum-date and empty-flow regressions.
- **tests/erp-bank-balances.test.ts**, **tests/browser/erp-bank-balances.spec.ts**: Separate bank opening accounts, Cargo/Abono signs, reported closing controls, installed database upgrade and shared cash totals through the browser and financial consumers.
- **src/import-engine/erp-bank-balances.ts**: Reads SALDOS BANCOS opening accounts and optional reported closing balances, preserving cells and keeping openings out of period income.
- **src/financial-engine/bank-control.ts**: Signed ERP bank validation and per-account opening + Cargo − Abono controls; missing reported balances remain unknown.
- **src/components/treasury/BankControlTable.tsx**: Per-account balances, period income/expense and explicit missing/differing closing references in import preview and Banks.
- **supabase/migrations/20260927000000000_erp_bank_balances.sql**: Independent SQL bank controls, separate opening/movement sources, account coverage and optional reported balance reconciliation; no historical rewrite.
- **supabase/migrations/20260926050000000_erp_report_sheet_names.sql**: Accepts original ERP worksheet names independently of report roles, preserving provenance, unique report mapping and existing financial validation.
- **supabase/migrations/20260926040000000_erp_native_operations.sql**: Versioned SONACOL operating rules initialized from ERP alone, editable classifications and explicit activation for existing installations; preserves prior configuration and historical snapshots.
- **tests/erp-native-operations.test.ts**: Acceptance from an empty database using only ERP, native rules, customer bank configuration, manual payments, rescues, daily balances, reimports and frozen history.
- **supabase/migrations/20260926030000000_caja_business_migration.sql**: Durable legacy evidence, atomic reviewed bindings (including MANUAL links) and optimistic preview/adoption of collection formulas.
- **src/pages/planning/DecisionEvidence.tsx**: CAJA source and ERP target side-by-side for reviewing a correspondence; evidence survives removal of its original batch.
- **src/pages/planning/CollectionPolicyDialog.tsx**: Review and adopt customer collection policies while retaining explicit dates and prior user edits.
- **src/financial-engine/migration-comparison.ts**: Same-cut and same-currency daily reconciliation using the existing treasury engine, with cash coverage checks and event differences traced through reviewed bindings.
- **src/pages/changes/index.tsx**, **src/pages/changes/MigrationComparison.tsx**: Snapshot differences and optional historical CAJA migration checks, separated from daily operation.
- **src/pages/planning/OperatingRules.tsx**: Native operating configuration, real missing bank/classification inputs and links to manual commitments, daily forecasts and reports; does not require CAJA.
- **tests/caja-migration.test.ts**, **tests/helpers/caja-migration.ts**: Anonymous CAJA-to-ERP fixtures and installed-version upgrade, binding/link, policy, deletion, reimport and daily comparison acceptance checks.
- **tests/browser/caja-migration.spec.ts**: Production-build acceptance for reviewing ambiguous matches, applying formula policy and comparing daily results on desktop/mobile.
- **src/import-engine/erp-profile.ts**: Versioned raw ERP headers and report detection by complete schema, independently of physical worksheet names.
- **src/import-engine/erp.ts**: ERP cells, openings, movements, invoices and investment ledger validation; preserves original coordinates and repeated lines. Business planning is separate from this reader.
- **tests/helpers/erp-workbook.ts**: Anonymous raw ERP workbook fixtures. `erp-import.test.ts` checks parsing and `erp-database.test.ts` checks atomic persistence and preserved manual work against PostgreSQL.
- **src/pages/importations/ErpImportContext.tsx**: Declared company, local currency, cutoff and separate bank/investment reporting periods for raw ERP imports.
- **supabase/migrations/20260926000000000_erp_raw_import.sql**: Guarded ERP contract, stable identities, multi-sheet coordinates and atomic daily refresh with MANUAL preservation.
- **supabase/migrations/20260926010000000_business_planning.sql**: Versioned business decisions, invoice adjustments, classification/collection rules, investment positions and partial redemptions. The snapshot RPC composes these layers while keeping raw ERP rows immutable.
- **supabase/migrations/20260926020000000_erp_investment_opening.sql**: Additive support for investment reports without OB; verifies each cumulative balance and derives opening capital from the first real posting without fabricating source rows.
- **src/services/planningService.ts**: Guarded business-decision loading and versioned writes.
- **src/pages/planning/index.tsx**: Planning workspace: positions, reservations, collections, rules and unresolved decisions.
- **src/pages/planning/DecisionDialog.tsx**: Edits operational adjustments, partial redemptions and explicit business rules, separately from imported facts.
- **tests/business-planning.test.ts**: Real PostgreSQL tests for immutable ERP, rule precedence, partial reservations, optimistic concurrency, daily carry and historical calculations.
- **tests/browser/erp-planning.spec.ts**: Browser acceptance of raw ERP import, operational due-date adjustment, partial rescue and mobile presentation using an isolated database.
- **src/components/treasury/ErpCoverageNotice.tsx**: Shared coverage and unresolved planning notice for financial screens using raw ERP data.

- **public/**: Static files served directly. Place images, icons, and robots.txt here.
- **public/locales/**: Translation files, one per language (`{code}.json`). Flat dotted keys (e.g. `home.hero.title`); the `fallbackLng` file is the structural source of truth.
- **i18n.config.json**: The lightweight i18n manifest for fallback language, language labels, browser detection aliases, and document direction. Single source of truth for the language list.
- **src/components/**: All UI components.  
  - **ui/**: Contains atomic and composite UI components.  
  - *Group related components into subdirectories if they share a domain or feature (e.g., `form/`, `charts/`).*
- **src/hooks/**: Custom React hooks. Each file should export a single hook focused on one responsibility.
- **src/i18n/**: Two files only.
  - `config.ts` is the runtime entry: imports the manifest via `util.ts`, initializes i18next (HTTP backend, language detector, react binding), syncs `<html lang/dir>`, and re-exports the helpers. Importing this file for its side effect boots i18next.
  - `util.ts` holds pure helpers parsed from the manifest: `fallbackLng`, `supportedLngs`, `languageOptions`, `normalizeLanguage`, `getLanguageDirection`, plus types.
  - Components use the official `useTranslation()` from `react-i18next` directly; there is no project-specific `useT` wrapper.
- **src/lib/**: Utility functions and libraries that are not React components or hooks.
- **src/pages/**: All route-level pages.  
  - *Each page should have its own subdirectory if it contains more than a single file or has related logic/components.*
- **src/App.tsx**: Sets up global providers.
- **src/router.tsx**: Sets up routing.
- **src/main.tsx**: Application entry point.

**Important:**
Whenever a new module (such as a component, hook, or utility) or a new page is added or removed, this document **must be updated immediately** to reflect the changes. Keeping this documentation up to date ensures that all collaborators have a clear understanding of the current project structure and its intended organization.

## How to Add New Code

### 1. Adding a New Page

- **Create a subdirectory under `src/pages/` for each new page.**
  - Example: For a "Dashboard" page, create `src/pages/dashboard/`.
- **Place the main page component as `index.tsx` inside the subdirectory.**
- **Add any page-specific components or logic in the same subdirectory.**
- **Register the new route in `src/router.tsx and generate a semantic name.**
  - Example:
    ```tsx
    import Dashboard from "./pages/dashboard";
    // ...
    {
      path: "/dashboard",
      name: 'dashboard',
      element: <Dashboard />
    }
    ```

### 2. Adding a New Component

- **If you are adding a group of related components, create a subdirectory (e.g., `form/`, `charts/`).**
- **If the component is only used by a specific page, place it in that page's subdirectory under `src/pages/`.**
- **Each component should be focused on a single responsibility.**
- **Small files (< 100 lines) are encouraged for a single component.**

### 3. Adding a New Hook

- **Create a new file in `src/hooks/` named after the hook (e.g., `use-feature.ts`).**
- **Each file should export only one hook.**
- **Hooks should be as small and focused as possible.**

### 4. Adding Utilities

- **Add utility functions to `src/lib/`.**
- **Group related utilities in the same file or subdirectory if needed.**

### 5. Adding or Updating Languages

- **Language metadata must go through `i18n.config.json`.**
- **Do not hardcode supported languages, labels, browser detection aliases, or RTL direction lists in `src/i18n/*.ts`.**
- **Locale content lives in `public/locales/{code}.json`** as flat dotted-key JSON; the `fallbackLng` file owns the canonical key set.
- **Runtime code reads the manifest only through `src/i18n/util.ts`.** Adding or removing a language means editing `i18n.config.json` plus the matching `public/locales/{code}.json`; nothing in `src/i18n/` needs to change.
- **Translations are read with the official `useTranslation()` from `react-i18next`.** No custom hook, no cast at call sites.

## Coding Best Practices

- **One module, one responsibility:**  
  Each file (component, hook, utility) should do one thing only.
- **High cohesion, low coupling:**  
  Keep related logic together and avoid unnecessary dependencies between modules.
- **Naming conventions:**  
  - Use `PascalCase` for components and page directories.
  - Use `camelCase` for hooks and utility functions.
  - Name page subdirectories and files after their route or feature.
- **Component structure:**  
  - Keep components small and focused.
  - Extract subcomponents if a component grows too large.
- **Page structure:**  
  - Place all logic, hooks, and components specific to a page in its subdirectory.
  - Only share code via `components/`, `hooks/`, or `lib/` if it is truly reusable.
- **Documentation:**  
  - Add comments for complex logic.
  - Document the purpose of each module at the top of the file if not obvious.

## ERP refresh review (patch 3)

- `src/pages/importations/ErpRefreshReview.tsx` presents incoming account coverage and execution conflicts without matching by amounts.
- `20261013000000000_erp_refresh_review.sql` wraps the existing comparison/import RPCs, enforcing the same review under the import transaction lock. The helper is private; no new public data endpoint or dependencies.

## Example: Adding a New "Profile" Page

1. **Create a directory:**  
   `src/pages/profile/`
2. **Add the main page component:**  
   `src/pages/profile/index.tsx`
3. **Add page-specific components:**  
   `src/pages/profile/ProfileHeader.tsx`, `src/pages/profile/ProfileDetails.tsx`
4. **Register the route in `App.tsx`:**
   ```tsx
   import Profile from "./pages/profile";
   // ...
   <Route path="/profile" element={<Profile />} />
   ```
5. **If you need a reusable button, add it to `src/components/ui/button.tsx`.**

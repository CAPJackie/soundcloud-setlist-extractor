# /modernize — React 19 & Next.js Modernization

Apply React 19 and Next.js best practices to the target file(s) or area provided as `$ARGUMENTS`.

If no argument is given, print a prioritized modernization checklist for this codebase.

---

## Context: This Codebase

- **Next.js 16 App Router** with heavy Server Components
- **React 19.2.4** — new APIs available: `use()`, `useActionState`, `useFormStatus`, `useOptimistic`, ref-as-prop
- **Stack:** React Hook Form + Zod, Server Actions wrapped in `tryResult()`, shadcn/ui (Radix), Tailwind, Sonner toasts
- Server actions live in `src/lib/server-actions/`; queries in `src/lib/api/`

---

## Modernization Checklist (Priority Order)

### HIGH — Quick wins, low risk

#### 1. Remove `forwardRef` from app components
React 19 passes `ref` as a regular prop. Remove the `React.forwardRef()` wrapper.

> **IMPORTANT: Never touch `src/components/shadcn/` — those files are off-limits.**

**Before:**
```tsx
const MyComp = React.forwardRef<HTMLDivElement, Props>(
  ({ className, ...props }, ref) => <div ref={ref} {...props} />
)
MyComp.displayName = 'MyComp'
```
**After:**
```tsx
function MyComp({ className, ref, ...props }: Props & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} {...props} />
}
```
Files: any non-shadcn component using `React.forwardRef` (check `src/app/`, `src/components/` excluding `shadcn/`).

#### 2. Fix `createRef` → `useRef` bug
`src/components/shared/fee-splits/payments/edit-payments.tsx` uses `createRef` inside a component (creates new ref every render). Replace with `useRef`.

#### 3. Replace `useContext(X)` with `use(X)`
React 19 allows `use(Context)` anywhere — including inside conditionals and loops.

**Before:** `const ctx = useContext(MyContext)`  
**After:** `const ctx = use(MyContext)`

Start with read-only contexts in `src/lib/context.ts`. Files with `useContext`: ~68 occurrences.

---

### MEDIUM — Meaningful refactors

#### 4. Replace `useState` + `useTransition` with `useActionState`
Pattern found in 13+ delete/action dialogs:

**Before:**
```tsx
const [isPending, startTransition] = useTransition()
const [open, setOpen] = useState(false)

function handleDelete() {
  startTransition(async () => {
    const result = await deleteAction(id)
    if (result.success) setOpen(false)
  })
}
```
**After:**
```tsx
const [state, dispatch, isPending] = useActionState(async (prev, id) => {
  return await deleteAction(id)
}, null)
// Close dialog on success via useEffect watching state
```
Files: `delete-*.tsx` components throughout `src/app/admin/` and `src/app/loans/`.

#### 5. Remove unnecessary `useCallback` / `useMemo`
React 19 compiler (when enabled) handles memoization automatically. Remove wrappers where the dep array is stable or the function is trivial.

Key files:
- `src/app/admin/closer-plan-assignments/closer-plan-assignments.tsx`
- `src/app/admin/originator-plan-assignments/originator-plan-assignments.tsx`
- `src/app/dashboard/dashboard-table/dashboard-table.tsx`
- `src/components/shared/fee-splits/components/fee-splits-table-generic.tsx`

#### 6. Enable React Compiler (optional, but high value)
Add to `next.config.ts`:
```ts
experimental: {
  reactCompiler: true,
}
```
Install: `npm install --save-dev babel-plugin-react-compiler`
This auto-memoizes components and removes the need for manual useCallback/useMemo.

---

### LOW — Architectural improvements

#### 7. `useOptimistic` for instant UI feedback
In delete/update operations, show the change immediately while the server action is in flight.

```tsx
const [optimisticItems, deleteOptimistic] = useOptimistic(
  items,
  (state, idToDelete) => state.filter(item => item.id !== idToDelete)
)
```

#### 8. Native form `action=` prop with Server Actions
For simple forms without complex validation, pass the Server Action directly to `<form action={serverAction}>` and use `useFormStatus` in the submit button.

**Only viable where react-hook-form validation isn't needed** (e.g., single-field search forms).

#### 9. Next.js `after()` for post-response work
Use `after()` from `next/server` for analytics, logging, or cache warming after response is sent — doesn't block the user.

```ts
import { after } from 'next/server'
after(() => trackEvent('loan_updated', { loanId }))
```

#### 10. Partial Prerendering (PPR) 
For pages with both static shell + dynamic content, enable PPR in `next.config.ts`:
```ts
experimental: { ppr: 'incremental' }
```
Then mark dynamic segments: `export const experimental_ppr = true`

---

## Hard Rules

- **NEVER read, modify, or analyze files under `src/components/shadcn/`** — treat that directory as a black box.
- Only touch files in `src/app/`, `src/lib/`, and `src/components/` (excluding `shadcn/`).

---

## Instructions for Claude

When `$ARGUMENTS` specifies a file or component:
1. Read the file first
2. Identify which checklist items apply
3. Apply changes one at a time, explaining each
4. Run `npm run lint` after changes to verify no type errors
5. Do NOT change logic — only modernize patterns

When `$ARGUMENTS` is a category (e.g., "forwardRef", "useActionState", "useContext"):
- Find all files matching that pattern via Grep
- Apply the modernization systematically across all affected files
- Verify with `npm run lint` when done

When no argument is given:
- Print this checklist with current status for each item
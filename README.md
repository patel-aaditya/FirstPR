# FirstPR

FirstPR helps aspiring open-source contributors find a realistic first pull request. Enter a GitHub repository and your background; it returns a plain-language architecture map and ranks real open issues that fit your skills.

## What it does

- Reads a bounded repository tree, README, contributing guide, language breakdown, entry-point files, and open issues from GitHub.
- Locally filters all open issues for `good first issue` and `help wanted` labels, case-insensitively, while excluding pull requests.
- Falls back to the 10 most recently updated open issues (clearly labeled as a fallback) when a repo has no beginner-friendly labels.
- Uses two structured Groq analyses: first to explain the codebase, then to rank real issues for the contributor's stated skills and experience.
- Each recommendation includes concrete files to start with and short first steps — never invented, only what's actually in the repo.
- Keeps the MVP stateless: no sign-in, saved history, or user data storage.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- GitHub REST API
- Groq Responses API (`openai/gpt-oss-120b`) with schema-constrained structured outputs
- Vercel deployment target

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and set:
   ```env
   GROQ_API_KEY=your_groq_key
   GROQ_MODEL=openai/gpt-oss-120b
   GITHUB_TOKEN=your_github_personal_access_token
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Visit `http://localhost:3000`.

## Quality checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Contributing

1. Pick an issue labeled `good first issue` or `help wanted`.
2. Create a branch with a short, descriptive name.
3. Run the quality checks above before opening a pull request.

## Codex & GPT-5.6 collaboration

FirstPR was built through Codex CLI, powered by GPT-5.6, in an interactive, conversational loop — not one-shot generation. The workflow was: plan the product and architecture first, hand Codex a structured build brief (tech stack, both LLM call specs with exact JSON schemas and tone rules, and an hour-by-hour build order), then iterate with Codex on real bugs surfaced through actual testing.

**Where Codex/GPT-5.6 accelerated the build:**
- Scaffolded the entire Next.js app structure, GitHub ingestion layer, and the two-call analysis pipeline from the written brief
- Diagnosed and fixed a real, non-obvious bug: GitHub's REST API treats comma-separated labels as AND logic, not OR — a query for `good first issue,help wanted` was silently requiring both labels simultaneously, returning zero results on repos that had either label individually. Codex rewrote the fetch to pull all open issues and filter client-side instead.
- Added the empty-state fallback (ranking the 10 most recently updated issues, clearly badged as a fallback) once testing revealed some healthy, active repos simply don't use beginner labels at all
- Extended the architecture call to read real entry-point files (`package.json`, `main.py`, `src/index.ts`, etc.) instead of relying on the README alone, materially improving the quality of the codebase explanation
- Iterated on a UI polish pass — paragraph structure, spacing, type hierarchy — for a cleaner on-camera demo
- Diagnosed and fixed a Groq rate-limit issue late in the build: the entry-file and issue-context additions had pushed both LLM calls over Groq's free-tier 8K TPM cap, which Codex resolved by trimming per-file/per-issue truncation limits and reducing the entry-file fetch to the most relevant few
- ChatGPT helped craft and refine the prompting strategy used for both structured Groq analyses, and also reviewed prompt clarity, constraint coverage, and output-shape consistency to reduce hallucinations and improve ranking quality.


**Product and design decisions that were mine:**
- FirstPR stays focused on one contributor's immediate next step, not a general-purpose repo explorer
- Every recommendation must be grounded in real repository data — the architecture summary and issue rankings are explicitly instructed to never invent a file, module, or issue
- The two-call structure (architecture first, then issue ranking fed by that architecture) rather than one combined prompt, for more coherent and less hallucination-prone output
- The issue reasoning tone: lead with the concrete technical fact (module, scope, skill match), close with one short, earned encouraging line — never encouragement-first filler
- Deliberately scoped out of the MVP: authentication, persistent history, caching, and rate limiting — all real ideas, but cut to keep the demo focused and reliable under a tight build window
- The runtime analysis calls run on Groq rather than the OpenAI API directly, a deliberate build-time call given limited model credits, made and implemented together with Codex mid-build

Codex session ID for hackathon feedback: `019f84ba-54f1-7151-a5aa-53ac57ebc1cc`

# FirstPR

FirstPR helps aspiring open-source contributors find a realistic first pull request. Enter a GitHub repository and your background; it returns a plain-language architecture map and ranks real open issues that fit your skills.

## What it does

- Reads a bounded repository tree, README, contributing guide, language breakdown, and open issues from GitHub.
- Locally filters all open issues for `good first issue` and `help wanted` labels, case-insensitively, while excluding pull requests.
- Uses two structured Groq analyses: first to explain the codebase, then to rank the real issues for the contributor profile.
- Keeps the MVP stateless: no sign-in, saved history, or user data storage.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- GitHub REST API
- Groq Responses API with `openai/gpt-oss-120b` structured outputs
- Vercel deployment target

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set these variables:

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

## Deploy to Vercel

Import the GitHub repository into Vercel, then add `GROQ_API_KEY`, `GROQ_MODEL`, and `GITHUB_TOKEN` in **Project Settings → Environment Variables**. Do not commit `.env.local`.

## Codex collaboration

Codex accelerated the implementation work: scaffolding the Next.js app, shaping the GitHub ingestion boundary, integrating Groq structured outputs, adding robust response handling, and iterating on the presentation polish.

The product decisions were mine: FirstPR stays focused on one contributor’s immediate next step; it ranks only real repository issues; the architecture explanation must avoid inventing details; and the interface uses a plain-English, editorial presentation rather than a dense engineering dashboard. I also chose to keep authentication, persistent history, caching, and the optional module-map visualization out of the MVP so the demo stays focused.

Codex session ID for hackathon feedback: `019f84ba-54f1-7151-a5aa-53ac57ebc1cc`.

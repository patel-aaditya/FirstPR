import { NextResponse } from "next/server";

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: { name: string }[];
  pull_request?: unknown;
};

type RankedIssue = {
  issue_number: number;
  title: string;
  url: string;
  fit_score: "high" | "medium";
  estimated_difficulty: string;
  why_this_fits: string;
  files_to_start_with: string[];
  first_steps: string[];
};

type RankedIssuesResponse = {
  recommended_issues: RankedIssue[];
};

type UserFacingErrorOptions = {
  status?: number;
  cause?: unknown;
};

class UserFacingError extends Error {
  status: number;
  cause?: unknown;

  constructor(message: string, options: UserFacingErrorOptions = {}) {
    super(message);
    this.name = "UserFacingError";
    this.status = options.status ?? 500;
    this.cause = options.cause;
  }
}

const githubBase = "https://api.github.com";
const targetLabels = new Set(["good first issue", "help wanted"]);
const entryFileCandidates = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "requirements.txt",
  "main.py",
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/main.tsx",
  "src/app.ts",
  "src/server.ts",
] as const;
const maxEntryFilesForArchitecture = 4;
const entryFileClipLength = 600;

function clip(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n[truncated]` : value;
}

function parseRepo(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    const normalizedRepo = repo?.replace(/\.git$/, "");
    const segmentPattern = /^[A-Za-z0-9_.-]+$/;
    if (!owner || !normalizedRepo || !segmentPattern.test(owner) || !segmentPattern.test(normalizedRepo)) return null;
    return { owner, repo: normalizedRepo };
  } catch {
    return null;
  }
}

function mapGitHubError(path: string, status: number, details?: unknown) {
  if (status === 404) return new UserFacingError("Repository not found.", { status: 404, cause: { path, status, details } });
  if (status === 401) return new UserFacingError("Invalid GitHub token.", { status: 502, cause: { path, status, details } });
  if (status === 403) return new UserFacingError("GitHub API rate limit reached.", { status: 429, cause: { path, status, details } });
  return new UserFacingError(`GitHub request failed (${status}).`, { status: 502, cause: { path, status, details } });
}

async function github<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new UserFacingError("Invalid GitHub token.", { status: 500, cause: "Missing GITHUB_TOKEN" });
  if (!path.startsWith("/repos/")) throw new UserFacingError("GitHub request failed.", { status: 500, cause: { path, reason: "unsafe path" } });

  const requestUrl = new URL(path, githubBase);
  if (requestUrl.origin !== githubBase) {
    throw new UserFacingError("GitHub request failed.", { status: 500, cause: { path, reason: "origin mismatch" } });
  }

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer ".concat(token),
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = await response.text();
    }
    throw mapGitHubError(path, response.status, details);
  }

  return (await response.json()) as T;
}

async function content(owner: string, repo: string, path: string) {
  const file = (await github<{ content?: string; encoding?: string }>(`/repos/${owner}/${repo}/contents/${path}`));
  return file.encoding === "base64" && file.content ? Buffer.from(file.content, "base64").toString("utf8") : "";
}

async function collectIssues(owner: string, repo: string) {
  const matching: GitHubIssue[] = [];
  const fallback: GitHubIssue[] = [];

  for (let page = 1; ; page += 1) {
    const pageIssues = await github<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=100&page=${page}`);

    for (const issue of pageIssues) {
      if (issue.pull_request) continue;

      if (fallback.length < 10) fallback.push(issue);

      const hasTargetLabel = issue.labels.some((label) => targetLabels.has(label.name.toLowerCase()));
      if (hasTargetLabel) {
        matching.push(issue);
        if (matching.length === 20) {
          return { issues: matching, usedFallback: false };
        }
      }
    }

    if (pageIssues.length < 100) break;
  }

  if (matching.length === 0) return { issues: fallback, usedFallback: true };
  return { issues: matching, usedFallback: false };
}

async function groq<T>(name: string, schema: object, developer: string, data: object): Promise<T> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new UserFacingError("Invalid Groq API key.", { status: 500, cause: "Missing GROQ_API_KEY" });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer ".concat(key), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
        instructions: developer,
        input: JSON.stringify(data),
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
      signal: controller.signal,
    });

    const output = (await response.json()) as {
      output_text?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      error?: { message?: string };
    };

    if (!response.ok) {
      if (response.status === 401) throw new UserFacingError("Invalid Groq API key.", { status: 502, cause: output.error ?? output });
      if (response.status === 429) throw new UserFacingError("Groq rate limit exceeded.", { status: 429, cause: output.error ?? output });
      throw new UserFacingError(`Groq analysis failed (${response.status}).`, { status: 502, cause: output.error ?? output });
    }

    const structuredText =
      output.output_text ??
      output.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;

    if (!structuredText) {
      throw new UserFacingError("Groq returned a completed response without output text.", { status: 502, cause: output });
    }

    try {
      return JSON.parse(structuredText) as T;
    } catch (error) {
      throw new UserFacingError("AI returned malformed output.", { status: 502, cause: { error, structuredText: clip(structuredText, 500) } });
    }
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new UserFacingError("Analysis timed out.", { status: 504, cause: error });
    }
    throw new UserFacingError("Groq analysis failed.", { status: 502, cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

const architectureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "modules"],
  properties: {
    overview: { type: "string" },
    modules: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "path", "purpose"],
        properties: {
          name: { type: "string" },
          path: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
  },
};

const rankingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recommended_issues"],
  properties: {
    recommended_issues: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "issue_number",
          "title",
          "url",
          "fit_score",
          "estimated_difficulty",
          "why_this_fits",
          "files_to_start_with",
          "first_steps",
        ],
        properties: {
          issue_number: { type: "integer" },
          title: { type: "string" },
          url: { type: "string" },
          fit_score: { type: "string", enum: ["high", "medium"] },
          estimated_difficulty: { type: "string" },
          why_this_fits: { type: "string" },
          files_to_start_with: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
          first_steps: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" },
          },
        },
      },
    },
  },
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, string>;
    const parsed = parseRepo(body.repoUrl ?? "");

    if (!parsed || !body.skills?.trim() || !body.experience || !body.interest?.trim()) {
      return NextResponse.json({ error: "Enter a GitHub repository URL and complete every field." }, { status: 400 });
    }

    const { owner, repo } = parsed;
    const repositoryPromise = github<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    const issueCollectionPromise = collectIssues(owner, repo);
    const [repository, issueCollection] = await Promise.all([repositoryPromise, issueCollectionPromise]);

    const [treeData, readme, contributing, languages] = await Promise.all([
      github<{ tree: { path: string; type: string }[]; truncated?: boolean }>(
        `/repos/${owner}/${repo}/git/trees/${repository.default_branch}?recursive=1`,
      ),
      content(owner, repo, "README.md").catch(() => ""),
      content(owner, repo, "CONTRIBUTING.md").catch(() => ""),
      github<Record<string, number>>(`/repos/${owner}/${repo}/languages`),
    ]);

    if (treeData.truncated) {
      throw new UserFacingError("Repository is too large to analyze.", {
        status: 413,
        cause: { owner, repo, reason: "git tree response truncated" },
      });
    }

    const allTreePaths = treeData.tree.filter((entry) => entry.type !== "commit").map((entry) => entry.path);
    const allTreePathSet = new Set(allTreePaths);

    const tree = allTreePaths.filter((path) => path.split("/").length <= 3).slice(0, 160);

    const existingEntryFiles = entryFileCandidates
      .filter((path) => allTreePathSet.has(path))
      .slice(0, maxEntryFilesForArchitecture);
    const entryFiles = (
      await Promise.all(
        existingEntryFiles.map(async (path) => ({
          path,
          content: clip(await content(owner, repo, path), entryFileClipLength),
        })),
      )
    ).filter((file) => file.content.trim().length > 0);

    const issues = issueCollection.issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: clip(issue.body ?? "", 600),
      labels: issue.labels.map((label) => label.name),
      url: issue.html_url,
    }));
    const issuesForRanking = issues.slice(0, 10);

    const architecture = await groq<{ overview: string; modules: { name: string; path: string; purpose: string }[] }>(
      "architecture_summary",
      architectureSchema,
      "Explain the codebase in plain newcomer-friendly language. Infer architecture primarily from entry_files, then validate with file_tree, README, CONTRIBUTING, and language data. Use only supplied evidence, explicitly note uncertainty, and never invent files or details. Return 4–6 modules where possible.",
      {
        file_tree: tree,
        languages,
        readme: clip(readme, 3500),
        contributing: clip(contributing, 1600),
        entry_files: entryFiles,
      },
    );

    const recommendations: RankedIssuesResponse =
      issuesForRanking.length > 0
        ? await groq<RankedIssuesResponse>(
            "issue_ranking",
            rankingSchema,
            "Rank up to four best-fit issues only from the provided list. Never invent an issue, number, title, URL, module, file, or implementation detail. Ground each reason in issue text and architecture summary. Include files_to_start_with using ONLY provided existing file paths; if uncertain, return an empty list. Include first_steps as 1-3 concrete bullets that start with action verbs such as Read, Run, or Edit.",
            {
              architecture,
              issues: issuesForRanking,
              existing_files: tree,
              fallback_recommendation: issueCollection.usedFallback,
              user: {
                skills: body.skills,
                experience: body.experience,
                interest: body.interest,
              },
            },
          )
        : { recommended_issues: [] };

    const sanitizedRecommendations = recommendations.recommended_issues.map((item) => ({
      ...item,
      files_to_start_with: item.files_to_start_with.filter((path) => allTreePathSet.has(path)),
      first_steps: item.first_steps
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, 3),
    }));

    return NextResponse.json({
      architecture,
      recommendations: { recommended_issues: sanitizedRecommendations },
      fallbackRecommendation: issueCollection.usedFallback,
    });
  } catch (error) {
    if (error instanceof UserFacingError) {
      console.error("Analyze API failed with user-facing error", { message: error.message, status: error.status, cause: error.cause });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Analyze API failed with unexpected error", error);
    return NextResponse.json({ error: "Analysis failed." }, { status: 500 });
  }
}

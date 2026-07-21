"use client";

import { FormEvent, useState } from "react";

type Result = {
  architecture: { overview: string; modules: { name: string; path: string; purpose: string }[] };
  recommendations: {
    recommended_issues: {
      issue_number: number;
      title: string;
      url: string;
      fit_score: "high" | "medium";
      estimated_difficulty: string;
      why_this_fits: string;
      files_to_start_with: string[];
      first_steps: string[];
    }[];
  };
  fallbackRecommendation?: boolean;
};

function splitOverview(overview: string) {
  const sentences = overview.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [overview];
  if (sentences.length > 1) {
    const midpoint = Math.ceil(sentences.length / 2);
    return [sentences.slice(0, midpoint).join(" "), sentences.slice(midpoint).join(" ")];
  }
  const words = overview.trim().split(/\s+/);
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")].filter(Boolean);
}

export function FirstPrForm() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setExpandedIssue(null);
    setLoading(true);

    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Analysis could not be completed.");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topline">
        <span className="mark">
          <i /> FIRSTPR
        </span>
        <span>OPEN SOURCE, MADE LEGIBLE</span>
      </header>

      <section className="hero">
        <div className="eyebrow">Your route into open source</div>
        <h1>
          Find the PR
          <br />
          you can finish.
        </h1>
        <p>Paste a repository. Tell us what you know. Get a plain-English map and real open issues that fit your next move.</p>
      </section>

      <form className={`panel ${loading ? "busy" : ""}`} onSubmit={submit}>
        <fieldset className="fields" disabled={loading}>
          <div className="form-grid">
            <div className="field wide">
              <label htmlFor="repoUrl">GitHub repository URL</label>
              <input id="repoUrl" name="repoUrl" required placeholder="https://github.com/owner/repository" type="url" />
            </div>
            <div className="field">
              <label htmlFor="skills">Languages & skills</label>
              <input id="skills" name="skills" required placeholder="e.g. TypeScript, React, Python" />
            </div>
            <div className="field">
              <label htmlFor="experience">Experience level</label>
              <select id="experience" name="experience" defaultValue="beginner">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="field wide">
              <label htmlFor="interest">Area of interest</label>
              <input id="interest" name="interest" required placeholder="e.g. frontend, backend, ML, infrastructure" />
            </div>
          </div>
          <button className="submit" disabled={loading}>
            {loading ? "Mapping repository…" : "Find my first PR →"}
          </button>
        </fieldset>

        {loading && (
          <div className="status status-loading" aria-live="polite">
            <span className="pulse-dot" />
            Reading repository signals and ranking matching issues.
          </div>
        )}
        {error && <p className="status error">{error}</p>}
      </form>

      {loading && (
        <section className="results skeleton" aria-hidden="true">
          <div>
            <div className="section-head">
              <h2>The lay of the land</h2>
              <span>ARCHITECTURE MAP</span>
            </div>
            <div className="overview">
              <div className="skeleton-line" />
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
            </div>
            <div className="modules">
              <article className="module skeleton-block" />
              <article className="module skeleton-block" />
              <article className="module skeleton-block" />
            </div>
          </div>
          <div>
            <div className="section-head">
              <h2>Start here</h2>
              <span>RANKED REAL ISSUES</span>
            </div>
            <div className="issues">
              <article className="issue skeleton-issue" />
              <article className="issue skeleton-issue" />
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className="results results-enter">
          <div>
            <div className="section-head">
              <h2>The lay of the land</h2>
              <span>ARCHITECTURE MAP</span>
            </div>
            <div className="overview">
              {splitOverview(result.architecture.overview).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <div className="modules">
              {result.architecture.modules.map((module) => (
                <article className="module" key={module.path}>
                  <span className="path">{module.path}</span>
                  <h3>{module.name}</h3>
                  <p>{module.purpose}</p>
                </article>
              ))}
            </div>
          </div>
          <div>
            <div className="section-head">
              <h2>Start here</h2>
              <span>RANKED REAL ISSUES</span>
            </div>
            <div className="issues">
              {result.recommendations.recommended_issues.length ? (
                result.recommendations.recommended_issues.map((issue) => {
                  const expanded = expandedIssue === issue.issue_number;
                  return (
                    <article className="issue" key={issue.issue_number}>
                      <div className="issue-num">#{issue.issue_number}</div>
                      <h3>{issue.title}</h3>
                      <div className="badges">
                        <span className="badge">{issue.fit_score} fit</span>
                        <span className="badge">{issue.estimated_difficulty}</span>
                        {result.fallbackRecommendation && <span className="badge fallback">Fallback recommendation</span>}
                      </div>
                      <button
                        className="reason-toggle"
                        type="button"
                        onClick={() => setExpandedIssue(expanded ? null : issue.issue_number)}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Hide reasoning ↑" : "Why this fits ↓"}
                      </button>
                      {expanded && (
                        <div className="issue-details">
                          <p>{issue.why_this_fits}</p>
                          <div>
                            <h4>Files to start with:</h4>
                            {issue.files_to_start_with.length ? (
                              <ul>
                                {issue.files_to_start_with.map((path) => (
                                  <li key={path}>{path}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="subtle">No specific files identified yet.</p>
                            )}
                          </div>
                          <div>
                            <h4>First steps:</h4>
                            <ul>
                              {issue.first_steps.map((step, index) => (
                                <li key={`${issue.issue_number}-${index}`}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      <a href={issue.url} target="_blank" rel="noreferrer">
                        Open issue ↗
                      </a>
                    </article>
                  );
                })
              ) : (
                <div className="empty empty-soft">
                  No open issues were available for ranking right now. Try again shortly or choose another repository.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

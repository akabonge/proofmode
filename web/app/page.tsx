export default function Home() {
  return (
    <main>
      <div className="shell">
        <div className="topnav">
          <div><strong>ProofMode</strong></div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn secondary" href="/login">Log in</a>
            <a className="btn" href="/signup">Get started</a>
          </div>
        </div>

        <section className="hero">
          <div className="card stack">
            <span className="badge">Standalone web app</span>
            <h1>Prove how your writing happened.</h1>
            <p>
              ProofMode is not another writing app. It is a proof-of-process companion for essays and academic writing in the AI era.
              Keep using Google Docs or Word, capture lightweight checkpoints over time, and export a clean, instructor-ready proof.
            </p>

            <div className="metric-grid spaced-lg">
              <div className="metric-card">
                <div className="metric-label">1. Start once</div>
                <div className="muted small">
                  Add the assignment prompt, title, and due date.
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">2. Capture checkpoints</div>
                <div className="muted small">
                  Paste the current draft after real writing sessions over days or weeks.
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">3. Show revision</div>
                <div className="muted small">
                  Build a timeline of change, writing days, and revision depth.
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">4. Export proof</div>
                <div className="muted small">
                  Generate a PDF that helps instructors evaluate process with less guesswork.
                </div>
              </div>
            </div>

            <div className="toolbar spaced-lg">
              <a className="btn" href="/signup">Create your first proof</a>
              <a className="btn secondary" href="/login">I already have an account</a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
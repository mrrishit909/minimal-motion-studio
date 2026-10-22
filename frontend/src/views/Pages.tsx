import { Icon } from "../components/Icon";
import type { AppConfig } from "../config";
import type { SiteData } from "../data/site";
import { routeHref } from "../routing";

export function RequestView({ config, site }: { config: AppConfig; site: SiteData | null }) {
  const aiRuns = site ? site.index.filter((r) => r.status === "completed" && (r.headline ?? "").startsWith("AI-proposed brief:")).length : 0;
  return (
    <div className="mm-page">
      <div className="mm-section-head">
        <h1 className="mm-h1" tabIndex={-1} data-section-heading>Three ways to make a site</h1>
        <p className="mm-lead">Each one is labelled with exactly who can use it and whether AI is involved.</p>
      </div>
      <ol className="mm-ways">
        <li>
          <h2 className="mm-h3">In this browser, for anyone</h2>
          <p>Shape a brief in the studio, preview it at three widths and download the source package. The templates are deterministic: the same brief always gives the same files. Nothing leaves your browser and no AI is involved.</p>
          <a className="mm-btn mm-btn-primary" href={routeHref({ view: "studio", step: "brief" })}>Open the studio</a>
        </li>
        <li>
          <h2 className="mm-h3">A published generation run, by GitHub issue</h2>
          <p>Paste a brief into the issue form. A GitHub Actions run validates it, composes and builds the package on its own, reviews the page with axe at 390, 768 and 1440 px and publishes everything to the history. The owner's requests start automatically; anyone else's wait for the owner's approval. No AI is involved.</p>
          <div className="mm-toolbar">
            <a className="mm-btn" href={`${config.repoUrl}/issues/new?template=run-request.yml`}><Icon name="github" /> Open the request form</a>
            <a className="mm-btn" href={`${config.repoUrl}/issues?q=label%3Atype%3Arun`}>See existing requests</a>
          </div>
        </li>
        <li>
          <h2 className="mm-h3">AI-proposed briefs, owner only</h2>
          <p>
            The repository owner can start a GitHub workflow that asks a model to propose a brief. The model returns data only, never code; a separate job
            without secrets validates it against the schema and builds it before the ordinary run publishes it. This is not available from this site or
            to visitors, and it only runs when the owner has configured an inference credential.
          </p>
          <p className="mm-hint">{aiRuns === 0 ? "No AI-proposed generations have been published." : `${aiRuns} AI-proposed generation${aiRuns === 1 ? " has" : "s have"} been published; the history labels each one.`}</p>
        </li>
      </ol>
      <p className="mm-hint">Limits keep the project inside GitHub's free tier: at most 40 runs a month, 5 open requests, 2 MB of results per run.</p>
    </div>
  );
}

export function AboutView({ config }: { config: AppConfig }) {
  const rows: [string, string, string][] = [
    ["Brief, palette, type, space, components, motion, preview, export", "Live in your browser", "Deterministic templates; the stage shows the exact page the package builds."],
    ["Generation history", "Cached", "A static snapshot of the state branch, rebuilt after each run; its time is in the footer."],
    ["Published generation runs", "Owner-authorized", "Through GitHub Issues and Actions; others' requests need the owner's approval."],
    ["AI-proposed briefs", "Owner only", "A GitHub workflow; never offered to visitors; needs an inference credential the owner configures."],
    ["Uploading images or fonts", "Not supported", "Exports use system font stacks and original SVG; nothing is uploaded."],
  ];
  return (
    <div className="mm-page">
      <div className="mm-section-head">
        <h1 className="mm-h1" tabIndex={-1} data-section-heading>How the studio works</h1>
        <p className="mm-lead">
          A brief is validated against one JSON schema, then composed into a small source package: an HTML page, a stylesheet that reads every value
          from design tokens, a motion script on the Web Animations API, the tokens themselves, and a dependency-free build script.
        </p>
      </div>
      <ul className="mm-prose-list">
        <li>Colours are derived in OKLCH from four seeds; any role that misses its contrast minimum on the background it actually sits on is moved in lightness only, and the change is listed.</li>
        <li>The build regenerates the tokens CSS from tokens.json, re-checks every pairing, inlines the page into one file with a content security policy that allows only its own hashed style and script, and fails loudly if anything is off.</li>
        <li>Every brief string is escaped as text. Previews run in a sandboxed frame with an opaque origin, so a page cannot reach the studio.</li>
        <li>The exported page moves only on entry, on first sight of a section and when a question opens; it never moves for visitors who ask for reduced motion, and everything is visible without JavaScript.</li>
      </ul>
      <div className="mm-table-wrap" tabIndex={0} role="region" aria-label="Capability status">
        <table className="mm-table">
          <thead><tr><th scope="col">Capability</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
          <tbody>{rows.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mm-hint">Limitations: three templates, seven system font voices and four motion presets; no image uploads; system fonts render differently across devices. Source, workflows and documentation: <a href={config.repoUrl}>{config.repoUrl.replace("https://", "")}</a>.</p>
    </div>
  );
}

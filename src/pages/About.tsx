import { Calculator, BookOpen, FolderOpen, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../components/shadcn/card';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import { GROUP_COLORS } from '../tools/registry';

export const ABOUT_DESCRIPTION =
  'About PCB Planner: free PCB design calculators, a 2D field solver, stackup tools and practical guides. Compare designs and save your work without an account.';

export default function About() {
  useDocumentMeta(`About ${APP_NAME}`, ABOUT_DESCRIPTION);
  return (
    <article className="document-page about-page">
      <Card className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">About</div>
        <div className="prose-doc about-copy px-5 py-5">
          <header className="about-intro">
            <p className="about-kicker">Free to use. Runs in your browser. No account.</p>
            <h1>About {APP_NAME}</h1>
            <p className="about-lead">
              PCB calculations, stackup planning and practical engineering guides in one workspace.
              Explore design choices, understand the assumptions behind a result and keep a record of your work.
            </p>
          </header>

          <nav className="about-features" aria-label="Explore PCB Planner">
            <Link to="/tools" className="about-feature">
              <Calculator size={21} color={GROUP_COLORS['Signal integrity']} aria-hidden="true" />
              <strong>Calculate</strong>
              <span>Impedance, routing, power, thermal design and electronics.</span>
              <span className="about-feature-link">Browse tools <ArrowRight size={13} aria-hidden="true" /></span>
            </Link>
            <Link to="/guides" className="about-feature">
              <BookOpen size={21} color={GROUP_COLORS.Electronics} aria-hidden="true" />
              <strong>Understand</strong>
              <span>Worked examples, explanations and links to the sources.</span>
              <span className="about-feature-link">Read the guides <ArrowRight size={13} aria-hidden="true" /></span>
            </Link>
            <Link to="/projects" className="about-feature">
              <FolderOpen size={21} color={GROUP_COLORS.Stackup} aria-hidden="true" />
              <strong>Keep your work</strong>
              <span>Save calculation inputs and export projects with custom stackups.</span>
              <span className="about-feature-link">Open projects <ArrowRight size={13} aria-hidden="true" /></span>
            </Link>
          </nav>

          <section aria-labelledby="about-workflow">
            <h2 id="about-workflow">From a calculation to a design decision</h2>
            <ul className="about-workflows">
              <li><strong>Compare alternatives.</strong> Save a design as A, change the inputs and compare
                the differences in supported impedance, crosstalk and thermal calculators.</li>
              <li><strong>Recover an edit.</strong> Undo and redo revisit recent input changes, including
                a reset. Typing in a field stays together as one design change. Undo history clears on reload.</li>
              <li><strong>Document the result.</strong> Create a report with inputs, results and diagrams,
                plus notes and a comparison where available. Save HTML or use Print / Save PDF.</li>
              <li><strong>Find your way back.</strong> Star frequently used tools, search across tools
                and guides, and jump directly to sections within a guide.</li>
            </ul>
          </section>

          <section aria-labelledby="about-methods">
            <h2 id="about-methods">How the numbers are produced</h2>
            <p>
              The <Link to="/impedance">impedance calculator</Link> uses a 2D electrostatic field solver
              for supported transmission-line cross-sections, including edge-coupled and balanced
              broadside differential pairs. Individual dielectric plies, solder mask and trapezoidal
              copper can be included. Crosstalk and trace-loss estimates build on the field solution,
              with loss models for dielectric behaviour, conductor loss and copper roughness.
            </p>
            <p>
              The <Link to="/stackup">stackup manager</Link> supports rigid, flex and rigid-flex
              constructions, including linked regions, coverlay and adhesive layers.
              The <Link to="/stackup-advisor">stackup advisor</Link> evaluates candidate constructions
              and trace geometries against your requirements. Rigid-flex regions are evaluated separately;
              the region results do not model the complete transition between them.
            </p>
            <p>
              Other calculators use published equations, standards and manufacturer data appropriate
              to the problem. Each tool explains its approach under <i>Method, formulas and references</i>.
              Material entries include their source, measurement method and frequency where available,
              so you can judge whether the data fits your application.
            </p>
          </section>

          <section aria-labelledby="about-data">
            <h2 id="about-data">Your work stays in your browser</h2>
            <p>
              Calculations run locally, without an account or a server-side calculation service.
              Favorites, saved projects and custom stackups use browser storage. They remain after
              closing and reopening the browser while its site data is kept, and do not automatically
              sync to another device. Export projects and stackups to keep a backup or move them elsewhere.
            </p>
            <p>
              Calculator links carry the input settings for that calculation. They do not attach
              an uploaded Touchstone file or export your stackup library. Uploaded measurement files
              are processed locally; share the relevant file separately when someone else needs it.
              Current calculator inputs and saved A/B baselines are also kept for the browser tab's session.
            </p>
          </section>

          <section aria-labelledby="about-analytics">
            <h2 id="about-analytics">Analytics are your choice</h2>
          <p>
            With your permission, Google Analytics and Vercel Web Analytics
            measure site visits and pages viewed. Google may receive your IP
            address, browser information and the page you visit, and may use
            cookies for measurement. Vercel Web Analytics collects aggregated
            traffic data without cookies. The app's page-view events omit
            calculator input query values. We do not use Analytics for
            advertising. Your choice is saved in this browser and you can change
            or withdraw it from Help &gt; Analytics preferences. See{' '}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
            >
              how Google uses information from sites using its services
            </a>{' '}
            and{' '}
            <a
              href="https://vercel.com/docs/analytics/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel's Web Analytics privacy information
            </a>
            .
          </p>
          </section>

          <section aria-labelledby="about-limits">
            <h2 id="about-limits">Accuracy and assumptions</h2>
            <p>
              Automated tests cover the calculations, data handling and interface behaviour,
              including comparisons against published reference results.
              A result still depends on its inputs and the model's assumptions.
              Confirm controlled-impedance geometry and finished stackups with your fabricator,
              and validate clearance, creepage and thermal requirements for the actual product.
              The calculations support engineering decisions; they do not replace measurements,
              fabrication review or qualification testing.
            </p>
          </section>

          <section className="about-creator" aria-labelledby="about-creator">
            <h2 id="about-creator">Built by a hardware engineer</h2>
            <p>
              {APP_NAME} is created by a hardware design engineer with a background in physics
              and experience in automotive electronics, home appliances and industrial sensors.
              The aim is to make practical PCB calculations easier to use, explain and revisit.
            </p>
          </section>
        </div>
      </Card>
    </article>
  );
}

import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import { PRESETS } from '../lib/stackups';
import { TOOLS } from '../tools/registry';

export const ABOUT_DESCRIPTION =
  'How pcbplanner produces its numbers: a 2D electrostatic field solver for impedance and loss, manufacturer datasheets and published standards for every table, and everything running in your browser with no account and no database.';

export default function About() {
  useDocumentMeta(`About ${APP_NAME}`, ABOUT_DESCRIPTION);
  return (
    <div className="p-3">
      <div className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">About</div>
        <div className="prose-doc px-5 py-4">
          <h1 className="text-[18px] font-semibold">About {APP_NAME}</h1>
          <p>
            {APP_NAME} is PCB design software that runs entirely in your browser: {TOOLS.length} calculators covering impedance, stackups, trace loss, crosstalk, vias, thermal design,
            power integrity and the rest of the numbers a board needs settled before it goes to fabrication.
          </p>

          <h2>How the numbers are produced</h2>
          <p>
            The impedance, crosstalk, differential-via and trace-loss tools solve the actual cross-section with a 2D electrostatic field solver, rather than closed-form approximations
            that assume a shape your board does not have. Every prepreg and core ply keeps its own Dk, solder mask and trapezoidal etching are modelled, and conductor loss comes from
            the incremental-inductance rule with a copper-roughness model on top. The stackup advisor uses the same solver to design every trace on {PRESETS.length} fabricator stackups
            and rank the ones that meet your requirements.
          </p>
          <p>
            Each tool documents its method under <i>Method, formulas and references</i>, including the equations it uses and their limits. Where a number comes from a table rather than
            a formula, the table names its source.
          </p>

          <h2>Where the data comes from</h2>
          <p>
            Laminate Dk and Df are taken from manufacturer datasheets — Isola, Panasonic, Rogers, Shengyi, Nan Ya, TUC and others — with the measurement method and frequency recorded
            alongside each value. The rule-based tools follow published standards: IPC-2221 and IPC-2152 for conductor spacing and trace width, IPC-7251 and IPC-7351 for land patterns,
            IEC 60664-1 for creepage and clearance, JEDEC for memory, and the PCI-SIG, USB-IF, SATA-IO and chip-vendor documents behind the interface routing rules. Nothing here is a
            number someone remembered.
          </p>

          <h2>Saved work and analytics</h2>
          <p>
            There is no account, no server-side calculation and no pcbplanner database. Every tool keeps its inputs in the page address, so any result is a link you can share or bookmark.
            Projects and custom stackups are stored in your browser and can be exported to a file you keep.
          </p>
          <p>
            With your permission, Google Analytics and Vercel Web Analytics measure site visits and pages viewed. Google may receive your IP address, browser information and the page you visit,
            and may use cookies for measurement. Vercel Web Analytics collects aggregated traffic data without cookies. The app's page-view events omit calculator input query values.
            We do not use Analytics for advertising. Your choice is saved in this browser and you can change or withdraw it from Help &gt; Analytics preferences.
            See <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses information from sites using its services</a> and{' '}
            <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel's Web Analytics privacy information</a>.
          </p>

          <h2>Accuracy and limits</h2>
          <p>
            The solvers and data tables are covered by more than 350 automated checks, including comparisons against published reference results. That makes the tools reliable for
            design work, but they remain models: confirm controlled-impedance geometry with your fabricator, who adjusts widths to their own process, and treat clearance, creepage and
            thermal results as design guidance rather than a substitute for qualification and compliance testing.
          </p>
        </div>
      </div>
    </div>
  );
}

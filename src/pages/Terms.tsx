import { Link } from 'react-router-dom';
import { Card } from '../components/shadcn/card';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME, LEGAL_UPDATED, OPERATOR } from '../config';
import ContactEmail from '../components/ContactEmail';

export const TERMS_DESCRIPTION = 'Terms of use of PCB Planner: results are engineering estimates provided as is, to be verified before use; trademarks and open-source licences.';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Terms() {
  useDocumentMeta('Terms of Use', TERMS_DESCRIPTION);
  return (
    <article className="document-page about-page">
      <Card className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Terms</div>
        <div className="prose-doc about-copy px-5 py-5">
          <h1>Terms of use</h1>
          <p className="text-faint">Last updated {date(LEGAL_UPDATED)}</p>

          <h2>The service</h2>
          <p>
            {APP_NAME} (www.pcbplanner.com) is a set of engineering calculators and guides operated by {OPERATOR.name}, {OPERATOR.country}. It is provided free of
            charge, without an account. Contact: <ContactEmail />.
          </p>

          <h2>Results are estimates</h2>
          <p>
            Every result is an engineering estimate. It depends on the values you enter and on the models, standards and data each tool describes under{' '}
            <i>Method, formulas and references</i>. Verify results against the applicable standards, the component datasheets and your fabricator before you rely
            on them, and confirm critical designs by measurement or testing.
          </p>
          <p>
            Safety-related values, such as creepage, clearance, conductor spacing, fusing current and temperature rise, are base values from the cited standards and
            models. They are not a certification, and the safety standard for your end product governs and may require more.
          </p>

          <h2>No warranty, limited liability</h2>
          <p>
            {APP_NAME} is provided "as is" and "as available", without warranty of any kind, including accuracy, completeness or fitness for a particular purpose.
            To the extent permitted by law, the operator is not liable for any loss or damage arising from the use of the site or its results, including designs,
            products or decisions based on them. Nothing in these terms limits liability that cannot be limited under applicable law, such as liability for intent
            or gross negligence.
          </p>

          <h2>Content, sources and trademarks</h2>
          <p>
            Calculations cite the standards, datasheets and publications they are based on; those documents remain the property of their publishers. Product,
            material, company and interface names mentioned on this site (for example laminate names, USB, PCI Express, HDMI and DisplayPort) are trademarks of their
            respective owners and are used only to identify the products and specifications discussed. {APP_NAME} is independent and not affiliated with or endorsed
            by them.
          </p>
          <p>
            You may link to any page and share results, reports and images made with the site. The site's code uses open-source software, listed with its licences
            in the <a href="/third-party-notices.txt">third-party notices</a>.
          </p>

          <h2>Privacy</h2>
          <p>
            How data is handled is described in the <Link to="/privacy">privacy policy</Link>.
          </p>
        </div>
      </Card>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { Card } from '../components/shadcn/card';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME, LEGAL_UPDATED, OPERATOR } from '../config';
import { ANALYTICS_ID } from '../lib/analytics';
import ContactEmail from '../components/ContactEmail';

export const PRIVACY_DESCRIPTION = 'How PCB Planner handles data: no account, calculations in your browser, cookie-free page counts, and Google Analytics only with your consent.';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Privacy() {
  useDocumentMeta('Privacy Policy', PRIVACY_DESCRIPTION);
  const mail = <ContactEmail />;
  return (
    <article className="document-page about-page">
      <Card className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Privacy</div>
        <div className="prose-doc about-copy px-5 py-5">
          <h1>Privacy policy</h1>
          <p className="text-faint">Last updated {date(LEGAL_UPDATED)}</p>

          <h2>Who is responsible</h2>
          <p>
            {APP_NAME} (www.pcbplanner.com) is operated by {OPERATOR.name}, {OPERATOR.country}, who is the controller under the EU General Data Protection
            Regulation (GDPR). Contact: {mail}.
          </p>

          <h2>In short</h2>
          <ul>
            <li>There are no accounts, forms, comments or payments. You can use every tool without giving any personal data.</li>
            <li>Calculations run in your browser. Files you open, such as Gerber, ZIP, Touchstone and stackup files, are read locally and never uploaded.</li>
            <li>Analytics run only if you accept them, and you can withdraw that at any time under Help › Analytics preferences.</li>
            <li>No data is sold, used for advertising or used for automated decisions about you.</li>
          </ul>

          <h2>Hosting</h2>
          <p>
            The site is hosted by Vercel Inc. (USA). Like any web server, Vercel processes your IP address, browser user agent, the page requested and the time of the
            request to deliver the site and protect it against abuse. The legal basis is our legitimate interest in running a secure website (Art. 6(1)(f) GDPR). These
            server logs are kept by Vercel for a limited period under its own retention rules and are not used to identify you.
          </p>

          <h2>Analytics</h2>
          <p>
            <b>Cookie-free page counts.</b> Vercel Web Analytics (Vercel Inc., USA) counts page views without cookies and without storing or reading anything on
            your device, recording the page, the referring website, the country, browser and device type. It is used to see which pages are read. The legal basis
            is our legitimate interest in running and improving the site (Art. 6(1)(f) GDPR); you can object at any time by writing to the address below.
          </p>
          <p>
            <b>Google Analytics, only with your consent.</b> When you first visit, a banner asks whether we may also use Google Analytics. It is not loaded and
            sets no cookie unless you accept.
          </p>
          <ul>
            <li>
              <b>Google Analytics 4</b> (Google Ireland Limited; Google LLC, USA) counts page views and records the page, the referring website (its domain only),
              your approximate location, browser and device type. It sets two cookies, <code>_ga</code> and <code>_ga_{ANALYTICS_ID.replace(/^G-/, '')}</code>, which
              store a random identifier for up to two years (browsers may shorten this). Advertising features, Google Signals and ad personalisation are switched off.
              Event data is kept for two months.
            </li>
          </ul>
          <p>
            Calculator inputs are not sent by either service: page views contain the page path only. The legal basis for Google Analytics is your consent (Art. 6(1)(a)
            GDPR and the rules on device storage in the ePrivacy Directive). Withdrawing consent stops further Google Analytics measurement and deletes its cookies; it
            does not affect measurement made before. Your choice is stored in your browser and asked again after twelve months.
          </p>

          <h2>Storage in your browser</h2>
          <p>
            The site stores the following in your browser so that the tools work as you expect. This is necessary for the features you use and needs no consent. It
            stays on your device and is not sent to us.
          </p>
          <ul>
            <li><b>Local storage:</b> favourite tools, custom stackups, the width of the properties panel, and your analytics choice.</li>
            <li><b>Session storage</b> (cleared when the tab closes): theme and units, open tabs and panels, calculator inputs, A/B comparison baselines, search text and stackup drafts.</li>
            <li><b>Offline cache:</b> a service worker stores the site's code so the calculators keep working without a network connection.</li>
          </ul>
          <p>Gerber layers and comparison data are kept only in the current tab's memory, including when switching tools. They are cleared on reload or with the viewer's Clear controls; file contents and filenames are not sent to analytics.</p>
          <p>You can delete all of this at any time by clearing this site's data in your browser settings.</p>

          <h2>Transfers outside the EU</h2>
          <p>
            Google and Vercel may process data in the United States. These transfers rely on the EU-US Data Privacy Framework or on the European Commission's Standard
            Contractual Clauses, as described in their privacy terms:{' '}
            <a href="https://business.safety.google/privacy/" target="_blank" rel="noopener noreferrer">Google</a>,{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel</a>.
          </p>

          <h2>Your rights</h2>
          <p>
            Under the GDPR you can ask for access to, correction or deletion of your personal data, restrict or object to its processing, receive it in a portable form,
            and withdraw your consent at any time. Because analytics data is pseudonymous and the site has no accounts, we may not be able to link it to you. Write to{' '}
            {mail}. You also have the right to lodge a complaint with a supervisory authority; in Romania this is the ANSPDCP (
            <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer">www.dataprotection.ro</a>).
          </p>

          <h2>Changes</h2>
          <p>
            If the services or purposes described here change, this page is updated and the analytics question is asked again. See also the{' '}
            <Link to="/terms">terms of use</Link>.
          </p>
        </div>
      </Card>
    </article>
  );
}

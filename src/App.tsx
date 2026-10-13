import { lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GUIDES } from './guides/registry';
import { SettingsProvider } from './state/settings';
import Home from './tools/Home';
import { TOOLS } from './tools/registry';
import { MATERIAL_PAGES, materialPath } from './data/materialPages';
import { MaterialPageRoute } from './pages/materialRoute';
import { INTERFACE_PAGES, interfacePagePath } from './data/interfacePages';
import { InterfacePageRoute } from './pages/interfaceRoute';

const GuidesIndex = lazy(() => import('./guides/GuidesIndex'));
const ToolsIndex = lazy(() => import('./tools/ToolsIndex'));
const About = lazy(() => import('./pages/About'));
const Schematic = lazy(() => import('./pages/Schematic'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            {TOOLS.map((t) => (
              <Route key={t.path} path={t.path} element={<t.component />} />
            ))}
            <Route path="/tools" element={<ToolsIndex />} />
            <Route path="/schematic" element={<Schematic />} />
            <Route path="/guides" element={<GuidesIndex />} />
            <Route path="/about" element={<About />} />
            {GUIDES.map((g) => (
              <Route key={g.path} path={g.path} element={<g.component />} />
            ))}
            {MATERIAL_PAGES.map((m) => (
              <Route key={m.slug} path={materialPath(m.slug)} element={<MaterialPageRoute />} />
            ))}
            {INTERFACE_PAGES.map((p) => (
              <Route key={p.slug} path={interfacePagePath(p.slug)} element={<InterfacePageRoute />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}

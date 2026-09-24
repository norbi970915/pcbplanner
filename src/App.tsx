import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GUIDES } from './guides/registry';
import { SettingsProvider } from './state/settings';
import Home from './tools/Home';
import { TOOLS } from './tools/registry';

const GuidesIndex = lazy(() => import('./guides/GuidesIndex'));
const ToolsIndex = lazy(() => import('./tools/ToolsIndex'));
const About = lazy(() => import('./pages/About'));

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
            <Route path="/guides" element={<GuidesIndex />} />
            <Route path="/about" element={<About />} />
            {GUIDES.map((g) => (
              <Route key={g.path} path={g.path} element={<g.component />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Compass, FolderOpen, X } from 'lucide-react';
import { Button } from './shadcn/button';
import { CategoryIcon } from './CategoryIcon';
import { GUIDED_CATEGORIES, WORKSPACE_TOPICS } from '../data/guidance';
import { GROUP_COLORS, toolByPath } from '../tools/registry';
import { GUIDES } from '../guides/registry';
import '../styles/guided-help.css';

export default function GuidedHelp({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('tools');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const navigating = useRef(false);
  const focusStep = useRef(false);
  const location = useLocation();
  const category = GUIDED_CATEGORIES.find(item => item.id === categoryId);
  const task = category?.tasks.find(item => item.id === taskId);
  const tool = task && toolByPath(task.tool);
  const guide = task?.guide ? GUIDES.find(item => item.path === task.guide) : undefined;
  const topic = WORKSPACE_TOPICS.find(item => item.id === topicId);
  const title = mode === 'workspace' ? topic?.title ?? 'How would you like to use the workspace?' : task?.label ?? (category ? 'What do you need to do?' : 'What are you working on?');
  useEffect(() => {
    if (focusStep.current) heading.current?.focus({ preventScroll: true });
    focusStep.current = false;
    body.current?.scrollTo({ top: 0 });
  }, [mode, categoryId, taskId, topicId]);
  const reset = (next: string) => { focusStep.current = false; setMode(next); setCategoryId(null); setTaskId(null); setTopicId(null); };
  const closeForNavigation = () => { navigating.current = true; onClose(); };
  // Returning to the current tool must preserve unsaved URL inputs.
  const destination = (path: string) => {
    const [pathname, query = ''] = path.split('?');
    if (pathname !== location.pathname) return path;
    const params = new URLSearchParams(location.search);
    for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
    return pathname + (params.size ? '?' + params.toString() : '') + location.hash;
  };
  return <Dialog.Root defaultOpen onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="workspace-dialog-overlay guidance-overlay" />
      <Dialog.Content className="guidance-panel" onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!navigating.current) {
            const fallback = [...document.querySelectorAll<HTMLElement>('.guidance-trigger, .menu-trigger')].find(el => el.getClientRects().length > 0);
            const target = opener?.isConnected && opener !== document.body ? opener : fallback;
            target?.focus({ preventScroll: true });
          } else {
            const main = document.getElementById('tool-panel');
            main?.setAttribute('tabindex', '-1');
            main?.focus({ preventScroll: true });
          }
        }}>
        <header className="guidance-header">
          <div className="guidance-heading"><Compass size={21} aria-hidden="true" /><div>
            <Dialog.Title>Help me choose</Dialog.Title>
            <Dialog.Description>A starting point for your next design task.</Dialog.Description>
          </div></div>
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close guidance"><X size={18} /></Button></Dialog.Close>
        </header>
        <Tabs.Root value={mode} onValueChange={reset} className="guidance-tabs">
          <Tabs.List aria-label="Guidance type" className="guidance-tab-list">
            <Tabs.Trigger value="tools"><Compass size={15} aria-hidden="true" />Find a tool</Tabs.Trigger>
            <Tabs.Trigger value="workspace"><FolderOpen size={15} aria-hidden="true" />Use the workspace</Tabs.Trigger>
          </Tabs.List>
          <div className="guidance-body" ref={body}>
            {(category || topic) && <div className="guidance-back-row"><Button variant="ghost" size="sm" onClick={() => {
              focusStep.current = true;
              if (mode === 'workspace') setTopicId(null);
              else if (task) setTaskId(null);
              else setCategoryId(null);
            }}><ArrowLeft size={14} aria-hidden="true" />{mode === 'workspace' ? 'Workspace topics' : task ? category?.title : 'All tasks'}</Button></div>}
            <h2 ref={heading} tabIndex={-1} className="guidance-step-title">{title}</h2>
            <Tabs.Content value="tools" className="guidance-content">
              {!category && <>
                <p className="guidance-intro">Choose a task. We’ll point you to a tool and what you need to get started.</p>
                <div className="guidance-category-grid">{GUIDED_CATEGORIES.map(item => <button type="button" className="guidance-choice guidance-category" key={item.id} onClick={() => { focusStep.current = true; setCategoryId(item.id); }}>
                  <CategoryIcon group={item.group} color={GROUP_COLORS[item.group]} size={22} />
                  <span><strong>{item.title}</strong><span>{item.description}</span></span><ChevronRight size={15} aria-hidden="true" />
                </button>)}</div>
                <p className="guidance-aside">Already know the name? Use Search in the top bar to find any tool or guide.</p>
              </>}
              {category && !task && <>
                <p className="guidance-intro">{category.title}</p>
                <div className="guidance-choice-list">{category.tasks.map(item => <button type="button" className="guidance-choice" key={item.id} onClick={() => { focusStep.current = true; setTaskId(item.id); }}>
                  <span>{item.label}</span><ChevronRight size={16} aria-hidden="true" />
                </button>)}</div>
              </>}
              {task && tool && <>
                <div className="guidance-recommendation" style={{ borderTopColor: GROUP_COLORS[tool.group] }}>
                  <div className="guidance-result-label"><Check size={14} aria-hidden="true" />Recommended starting point</div>
                  <div className="guidance-tool-title"><CategoryIcon group={tool.group} color={GROUP_COLORS[tool.group]} size={24} /><h3>{tool.title}</h3></div>
                  <p>{task.why}</p>
                  <Button asChild size="sm"><Link to={destination(task.to ?? tool.path)} onClick={closeForNavigation}>Open {tool.nav}<ArrowRight size={14} aria-hidden="true" /></Link></Button>
                </div>
                <section className="guidance-prepare"><h3>Have these ready</h3><ul>{task.prepare.map(item => <li key={item}>{item}</li>)}</ul></section>
                {guide && <Link className="guidance-guide" to={guide.path} onClick={closeForNavigation}><BookOpen size={19} aria-hidden="true" /><span><small>Read the guide</small><strong>{guide.seoTitle}</strong></span><ArrowRight size={16} aria-hidden="true" /></Link>}
                <p className="guidance-aside">You can open this panel again from any page.</p>
              </>}
            </Tabs.Content>
            <Tabs.Content value="workspace" className="guidance-content">
              {!topic && <>
                <p className="guidance-intro">Keep your calculations organised and return to them later.</p>
                <div className="guidance-choice-list">{WORKSPACE_TOPICS.map(item => <button type="button" className="guidance-choice" key={item.id} onClick={() => { focusStep.current = true; setTopicId(item.id); }}>
                  <span><strong>{item.title}</strong><span>{item.description}</span></span><ChevronRight size={16} aria-hidden="true" />
                </button>)}</div>
              </>}
              {topic && <>
                <ol className="guidance-steps">{topic.steps.map(item => <li key={item}>{item}</li>)}</ol>
                <p className="guidance-workspace-note">{topic.note}</p>
                {topic.action && <Button asChild size="sm"><Link to={destination(topic.action.to)} onClick={closeForNavigation}>{topic.action.label}<ArrowRight size={14} aria-hidden="true" /></Link></Button>}
              </>}
            </Tabs.Content>
          </div>
        </Tabs.Root>
        <footer className="guidance-footer"><span>Tools, guides and workspace help</span><Button asChild variant="link" size="sm"><Link to="/tools" onClick={closeForNavigation}>Browse all tools<ArrowRight size={13} aria-hidden="true" /></Link></Button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

'use client';

import { useState } from 'react';
import { notFound } from 'next/navigation';
import {
  Plus, Search, Check, Download, Copy, Info, TriangleAlert, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input, TextArea } from '@/components/ui/Field';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { OptionList } from '@/components/ui/OptionList';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { TooltipProvider, Tooltip } from '@/components/ui/Tooltip';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Popover } from '@/components/ui/Popover';
import { SettingPopover } from '@/components/ui/SettingPopover';
import { Meter } from '@/components/ui/Meter';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Highlight } from '@/components/ui/Highlight';
import { SourceIcon } from '@/components/ui/SourceIcon';
import styles from './page.module.css';

const SOURCES = ['reddit', 'google', 'hn', 'github', 'producthunt', 'appstore', 'play', 'youtube'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Gallery() {
  const toast = useToast();
  const [goal, setGoal] = useState<string>('problem');
  const [style, setStyle] = useState<string>('standard');
  const [multi, setMulti] = useState<string[]>(['pricing']);
  const [checked, setChecked] = useState(true);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [chips, setChips] = useState<string[]>(['late delivery', 'pricing']);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  return (
    <main id="main" className={styles.page}>
      <h1 tabIndex={-1} className={styles.pageTitle}>Component gallery</h1>
      <p className={styles.pageSub}>Every component in its main states. Development only.</p>

      <Section title="Theme">
        <div className={styles.rowWrap}>
          <Button variant="secondary" onClick={toggleTheme}>{dark ? 'Light theme' : 'Dark theme'}</Button>
        </div>
      </Section>

      <Section title="Button">
        <div className={styles.rowWrap}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" size="sm" leftIcon={<Plus size={18} aria-hidden="true" />}>Small</Button>
          <Button variant="secondary" size="lg" leftIcon={<Download size={18} aria-hidden="true" />}>Large</Button>
        </div>
      </Section>

      <Section title="IconButton">
        <div className={styles.rowWrap}>
          <Tooltip label="New research"><IconButton label="New research" icon={<Plus size={18} />} /></Tooltip>
          <Tooltip label="Search"><IconButton label="Search" icon={<Search size={18} />} variant="secondary" /></Tooltip>
          <IconButton label="Copy" icon={<Copy size={18} />} disabled />
        </div>
      </Section>

      <Section title="Field">
        <div className={styles.col480}>
          <Field label="Industry" optional htmlFor="g-ind">
            <Input id="g-ind" placeholder="For example: Food delivery" />
          </Field>
          <Field label="Search" error="We could not find that source.">
            <Input invalid placeholder="Type something" />
          </Field>
          <Field label="Describe what you want to research">
            <TextArea placeholder="A sentence or two" defaultValue="" />
          </Field>
        </div>
      </Section>

      <Section title="ToggleGroup">
        <div className={styles.stack12}>
          <ToggleGroup
            ariaLabel="Goal"
            options={[{ value: 'problem', label: 'Find problems' }, { value: 'validate', label: 'Test an idea' }, { value: 'launch', label: 'Review a launch' }]}
            value={goal}
            onValueChange={(v) => setGoal(v as string)}
          />
          <ToggleGroup
            ariaLabel="Focus"
            multiple
            options={['Features and gaps', 'Pricing', 'Ease of use'].map((label) => ({ value: label.toLowerCase().replace(/ /g, ''), label }))}
            value={multi}
            onValueChange={(v) => setMulti(v as string[])}
          />
        </div>
      </Section>

      <Section title="OptionList">
        <OptionList
          ariaLabel="Report style"
          value={style}
          onValueChange={(v) => setStyle(v)}
          options={[
            { value: 'standard', label: 'Standard report', description: 'The full picture, about 4 minutes of reading.', badge: 'Recommended' },
            { value: 'brief', label: 'Short brief', description: 'A 90-second summary with three recommendations.' },
            { value: 'indepth', label: 'In-depth report', description: 'Adds checks of your assumptions.' },
          ]}
        />
      </Section>

      <Section title="Checkbox and Badge">
        <div className={styles.col480}>
          <Checkbox checked={checked} onCheckedChange={setChecked} label="Add a side-by-side comparison" />
          <div className={styles.rowWrap}>
            <Badge tone="positive" icon={<Check size={14} aria-hidden="true" />}>Working</Badge>
            <Badge tone="negative" icon={<TriangleAlert size={14} aria-hidden="true" />}>Failing</Badge>
            <Badge tone="request">Request</Badge>
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="warn" icon={<TriangleAlert size={14} aria-hidden="true" />}>Unreliable</Badge>
          </div>
        </div>
      </Section>

      <Section title="Chip">
        <div className={styles.rowWrap}>
          {chips.map((c) => (
            <Chip key={c} onRemove={() => setChips((cs) => cs.filter((x) => x !== c))}>{c}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Disclosure">
        <Disclosure title="Show technical log" sub="Optional detail" open={discOpen} onOpenChange={setDiscOpen}>
          <p className={styles.logLine}>09:41:22  Pipeline started.</p>
        </Disclosure>
      </Section>

      <Section title="Popover and SettingPopover">
        <div className={styles.col480}>
          <SettingPopover icon={<Layers size={18} aria-hidden="true" />} label="Where to look" value="Reddit and Google searches">
            <p className={styles.pad8}>Panel content here.</p>
          </SettingPopover>
          <Popover trigger={<Button variant="secondary" size="sm">Open popover</Button>}>
            <p className={styles.pad8}>Popover content.</p>
          </Popover>
        </div>
      </Section>

      <Section title="Dialog and Drawer">
        <div className={styles.rowWrap}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Button variant="secondary" onClick={() => toast({ message: 'Report copied' })}>Show toast</Button>
          <Button variant="secondary" onClick={() => toast({ message: 'Removed from your list', action: { label: 'Undo', onClick: () => {} } })}>Toast with action</Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="Stop this research?"
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>Keep going</Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>Stop research</Button>
            </>
          }
        >
          You can start again any time. This one will not count against your limit.
        </Dialog>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="How was this made?">
          <p>Drawer body content.</p>
        </Drawer>
      </Section>

      <Section title="Menu">
        <Menu trigger={<Button variant="secondary">Export</Button>}>
          <MenuItem icon={<Copy size={16} aria-hidden="true" />} onSelect={() => toast({ message: 'Report copied' })}>Copy report</MenuItem>
          <MenuItem icon={<Download size={16} aria-hidden="true" />}>Download report (.md)</MenuItem>
        </Menu>
      </Section>

      <Section title="Meter and ProgressBar">
        <div className={styles.col480}>
          <div>
            <Meter total={5} left={4} />
            <p className={styles.meterNote}>4 of 5 researches left</p>
          </div>
          <div>
            <ProgressBar value={31} max={40} label="AI capacity today" />
            <p className={styles.meterNote}>31 of 40 used</p>
          </div>
        </div>
      </Section>

      <Section title="Spinner, Skeleton, Notice, EmptyState">
        <div className={styles.col480}>
          <div className={styles.rowWrap}>
            <Spinner />
            <Skeleton width={120} height={16} />
            <Skeleton width={200} height={40} />
          </div>
          <Notice tone="info" title="You are in basic mode">
            Add a free Google AI key to get smarter summaries.
          </Notice>
          <Notice tone="warn" title="AI capacity for today is used up">
            You can still run in basic mode, or try again after 6:00 am.
          </Notice>
          <EmptyState icon={<Info size={22} aria-hidden="true" />} heading="h2" title="Nothing here yet" body="Your finished research shows up here." action={<Button variant="primary">Start your first research</Button>} />
        </div>
      </Section>

      <Section title="Highlight and SourceIcon">
        <div className={styles.colAuto}>
          <p className={styles.wideNote}>
            <Highlight text="Third time this month my box arrived two days late. Support never answers." terms={['late', 'support']} />
          </p>
          <div className={styles.rowWrap}>
            {SOURCES.map((s) => <SourceIcon key={s} id={s} />)}
          </div>
        </div>
      </Section>
    </main>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <TooltipProvider>
      <ToastProvider>
        <Gallery />
      </ToastProvider>
    </TooltipProvider>
  );
}

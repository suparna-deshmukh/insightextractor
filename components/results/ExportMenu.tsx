'use client';
import { Archive, Copy, Database, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { copy } from '@/lib/copy';
import { copyText, downloadFile, evidenceCsv, fileNames, rawCsv, runJson } from '@/lib/client/exports';
import type { StoredRun } from '@/lib/client/types';

export function ExportMenu({ run }: { run: StoredRun }) {
  const toast = useToast();
  const result = run.result;
  const names = fileNames(result.topic);
  const rawExists = Boolean(result.rawCsv);

  const download = (name: string, content: string, mime: string) => {
    downloadFile(name, content, mime);
    toast({ message: copy.export.downloaded(name) });
  };

  return (
    <Menu
      align="end"
      trigger={
        <Button variant="secondary" size="md">
          {copy.export.button}
        </Button>
      }
    >
      {rawExists && (
        <MenuItem
          icon={<Database size={16} aria-hidden="true" />}
          onSelect={() => download(names.rawCsv, rawCsv(result), 'text/csv')}
        >
          {copy.export.csvRaw}
        </MenuItem>
      )}
      <MenuItem
        icon={<Copy size={16} aria-hidden="true" />}
        onSelect={() => {
          void copyText(result.report).then(() => toast({ message: copy.export.copied }));
        }}
      >
        {copy.export.copyReport}
      </MenuItem>
      <MenuItem icon={<FileText size={16} aria-hidden="true" />} onSelect={() => download(names.md, result.report, 'text/markdown')}>
        {copy.export.mdReport}
      </MenuItem>
      <MenuItem icon={<FileSpreadsheet size={16} aria-hidden="true" />} onSelect={() => download(names.csv, evidenceCsv(result), 'text/csv')}>
        {copy.export.csvPosts}
      </MenuItem>
      <MenuItem icon={<Archive size={16} aria-hidden="true" />} onSelect={() => download(names.json, runJson(run), 'application/json')}>
        {copy.export.json}
      </MenuItem>
    </Menu>
  );
}

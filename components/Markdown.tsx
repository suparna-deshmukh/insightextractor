import React from 'react';

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (t.startsWith('**')) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (mm) out.push(<a key={key} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>);
      else out.push(t);
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (t.startsWith('|') && lines[i + 1] && /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())) {
      const header = t.split('|').map((c) => c.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().split('|').map((c) => c.trim()).filter(Boolean));
        i++;
      }
      out.push(
        <table key={key++}>
          <thead><tr>{header.map((h, j) => <th key={j}>{inline(h, `th${key}${j}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${ri}${ci}`)}</td>)}</tr>)}</tbody>
        </table>
      );
      continue;
    }
    if (t.startsWith('### ')) { out.push(<h3 key={key++}>{inline(t.slice(4), `h3${key}`)}</h3>); i++; continue; }
    if (t.startsWith('## ')) { out.push(<h2 key={key++}>{inline(t.slice(3), `h2${key}`)}</h2>); i++; continue; }
    if (t.startsWith('# ')) { out.push(<h1 key={key++}>{inline(t.slice(2), `h1${key}`)}</h1>); i++; continue; }
    if (t === '---' || t === '***') { out.push(<hr key={key++} />); i++; continue; }
    if (t.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) { buf.push(lines[i].trim().slice(2)); i++; }
      out.push(<blockquote key={key++}>{inline(buf.join(' '), `bq${key}`)}</blockquote>);
      continue;
    }
    if (/^[-*] /.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i++; }
      out.push(<ul key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `li${key}${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\. /.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\. /, '')); i++; }
      out.push(<ol key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `oli${key}${j}`)}</li>)}</ol>);
      continue;
    }
    out.push(<p key={key++}>{inline(t, `p${key}`)}</p>);
    i++;
  }
  return <div className="md">{out}</div>;
}

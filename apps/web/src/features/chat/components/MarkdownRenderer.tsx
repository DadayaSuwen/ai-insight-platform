import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders Markdown content with GFM (GitHub Flavored Markdown) support.
 * Styled to match the enterprise theme variables.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-lg font-semibold mb-2 mt-3" style={{ color: 'var(--text-primary)' }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold mb-2 mt-3" style={{ color: 'var(--text-primary)' }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-1.5 mt-2" style={{ color: 'var(--text-secondary)' }}>
            {children}
          </h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {children}
          </p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-0.5" style={{ color: 'var(--text-primary)' }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-0.5" style={{ color: 'var(--text-primary)' }}>
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {children}
          </li>
        ),
        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code
              className={`block p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2 ${className}`}
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre
            className="overflow-x-auto rounded-lg mb-2"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            {children}
          </pre>
        ),
        // Table
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table
              className="w-full text-xs border-collapse"
              style={{ borderColor: 'var(--border)' }}
            >
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead style={{ background: 'var(--bg-tertiary)' }}>
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th
            className="px-3 py-2 text-left font-semibold"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            className="px-3 py-2"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          >
            {children}
          </td>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-transparent odd:bg-opacity-50" style={{ borderColor: 'var(--border)' }}>
            {children}
          </tr>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-4 pl-3 py-1 mb-2 italic text-sm"
            style={{ borderColor: 'var(--accent)', color: 'var(--text-secondary)' }}
          >
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => (
          <hr className="my-3 border-0" style={{ borderTop: '1px solid var(--border)' }} />
        ),
        // Strong / Em
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em style={{ color: 'var(--text-secondary)' }}>{children}</em>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            className="underline"
            style={{ color: 'var(--accent)' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

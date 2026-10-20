import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { desktop } from '@/lib/api/app';
import { toast } from 'sonner';
export function MarkdownPreview({ value }: { value: string }) {
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^https?:\/\//.test(href))
                  void desktop
                    .openUrl(href)
                    .catch((error: Error) => toast.error(error.message));
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {value}
      </Markdown>
    </article>
  );
}

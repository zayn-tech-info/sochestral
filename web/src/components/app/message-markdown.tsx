import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

export interface MessageMarkdownProps {
  content: string;
}

function MessageHeading({ children }: { children?: ReactNode }) {
  return <strong className="message-content-heading">{children}</strong>;
}

function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (href?.startsWith("/app/")) {
    return <Link href={href}>{children}</Link>;
  }
  return <a href={href}>{children}</a>;
}

export function MessageMarkdown({ content }: MessageMarkdownProps) {
  return (
    <div className="message-content">
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        components={{
          h1: MessageHeading,
          h2: MessageHeading,
          h3: MessageHeading,
          h4: MessageHeading,
          h5: MessageHeading,
          h6: MessageHeading,
          a: MessageLink,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

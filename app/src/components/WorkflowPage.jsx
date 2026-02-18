import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import Breadcrumb from './Breadcrumb';
import MarkdownRenderer from './MarkdownRenderer';
import MermaidDiagram from './MermaidDiagram';
import sourceFiles from '../data/source-files.json';

export default function WorkflowPage({ workflows }) {
  const { slug } = useParams();
  const workflow = workflows.find((w) => w.slug === slug);

  if (!workflow) {
    return <Navigate to="/" replace />;
  }

  return (
    <article className="workflow-page">
      <Breadcrumb
        items={[
          { label: 'Workflows', href: '/' },
          { label: workflow.frontmatter.title },
        ]}
      />

      <h1>{workflow.frontmatter.title}</h1>

      {workflow.frontmatter.description && (
        <p className="description">{workflow.frontmatter.description}</p>
      )}

      {workflow.sections.map((section, i) => {
        if (section.type === 'prose') {
          return <MarkdownRenderer key={i} content={section.content} />;
        }
        if (section.type === 'mermaid') {
          return (
            <MermaidDiagram
              key={i}
              id={`${slug}-${section.id}-${i}`}
              definition={section.definition}
              nodeFiles={section.nodeFiles}
              participantMap={section.participantMap}
              sourceFiles={sourceFiles}
            />
          );
        }
        return null;
      })}
    </article>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';

export default function WorkflowIndex({ workflows }) {
  return (
    <div>
      <h1 className="workflow-index-heading">Workflows</h1>
      <p className="workflow-index-subtitle">
        End-to-end documentation for each outreach workflow, from creation to
        delivery.
      </p>

      <div className="workflow-cards">
        {workflows.map((w) => (
          <Link
            key={w.slug}
            to={`/workflows/${w.slug}`}
            className="workflow-card"
          >
            <h2 className="workflow-card-title">{w.frontmatter.title}</h2>
            {w.frontmatter.description && (
              <p className="workflow-card-description">
                {w.frontmatter.description}
              </p>
            )}
            {w.frontmatter.tags.length > 0 && (
              <div className="workflow-card-tags">
                {w.frontmatter.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

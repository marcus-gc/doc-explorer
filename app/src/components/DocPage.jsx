import React from 'react';
import { useLocation, Navigate, Link } from 'react-router-dom';
import Breadcrumb from './Breadcrumb';
import MarkdownRenderer from './MarkdownRenderer';
import MermaidDiagram from './MermaidDiagram';
import sourceFiles from '../data/source-files.json';

function getFirstRoute(navTree) {
  if (navTree.length === 0) return '/';
  return navTree[0].route;
}

function buildBreadcrumbs(page, pages) {
  const crumbs = [];
  let current = page;

  while (current) {
    crumbs.unshift({
      label: current.title,
      href: current.route === page.route ? undefined : current.route,
    });
    current = current.parentRoute ? pages[current.parentRoute] : null;
  }

  return crumbs;
}

function getChildren(route, pages) {
  return Object.values(pages).filter((p) => p.parentRoute === route);
}

export default function DocPage({ pages, navTree }) {
  const location = useLocation();

  // Normalize: strip trailing slash (except root)
  let route = location.pathname;
  if (route.length > 1 && route.endsWith('/')) {
    route = route.slice(0, -1);
  }

  const page = pages[route];

  if (!page) {
    return <Navigate to={getFirstRoute(navTree)} replace />;
  }

  const breadcrumbs = buildBreadcrumbs(page, pages);
  const children = page.isIndex ? getChildren(route, pages) : [];
  const routeSlug = route.replace(/\//g, '-').replace(/^-/, '') || 'root';

  return (
    <article className="workflow-page">
      {breadcrumbs.length > 1 && <Breadcrumb items={breadcrumbs} />}

      <h1>{page.title}</h1>

      {page.description && (
        <p className="description">{page.description}</p>
      )}

      {page.sections.map((section, i) => {
        if (section.type === 'prose') {
          return <MarkdownRenderer key={i} content={section.content} currentRoute={route} />;
        }
        if (section.type === 'mermaid') {
          return (
            <MermaidDiagram
              key={i}
              id={`${routeSlug}-${section.id}-${i}`}
              definition={section.definition}
              nodeFiles={section.nodeFiles}
              participantMap={section.participantMap}
              sourceFiles={sourceFiles}
            />
          );
        }
        return null;
      })}

      {children.length > 0 && (
        <>
          <h2 className="child-pages-heading">In this section</h2>
          <div className="workflow-cards">
            {children
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((child) => (
                <Link
                  key={child.route}
                  to={child.route}
                  className="workflow-card"
                >
                  <h2 className="workflow-card-title">{child.title}</h2>
                  {child.description && (
                    <p className="workflow-card-description">
                      {child.description}
                    </p>
                  )}
                  {child.tags && child.tags.length > 0 && (
                    <div className="workflow-card-tags">
                      {child.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
          </div>
        </>
      )}
    </article>
  );
}

'use client';

/**
 * AiNetwork — SVG node graph showing the AI ecosystem.
 *
 * Central "AI CORE" node connected to: Teacher, Student, Parent, Industry, Finance, Executive.
 * Nodes glow and pulse; connections animate data flow via dashed stroke.
 * Subtle mouse parallax via CSS custom properties.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface NodeDef {
  id: string;
  label: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: number;
}

const NODES: NodeDef[] = [
  { id: 'core', label: 'AI', cx: 200, cy: 180, r: 28, color: 'var(--auth-node-blue)', delay: 0 },
  { id: 'teacher', label: 'Teacher', cx: 80, cy: 80, r: 18, color: 'var(--auth-node-green)', delay: 0.5 },
  { id: 'student', label: 'Student', cx: 320, cy: 80, r: 18, color: 'var(--auth-node-green)', delay: 1 },
  { id: 'parent', label: 'Parent', cx: 60, cy: 240, r: 16, color: 'var(--auth-node-violet)', delay: 1.5 },
  { id: 'industry', label: 'Industry', cx: 340, cy: 240, r: 16, color: 'var(--auth-node-violet)', delay: 2 },
  { id: 'finance', label: 'Finance', cx: 110, cy: 330, r: 15, color: 'var(--auth-node-amber)', delay: 2.5 },
  { id: 'exec', label: 'Executive', cx: 290, cy: 330, r: 15, color: 'var(--auth-node-amber)', delay: 3 },
];

const EDGES: [string, string][] = [
  ['core', 'teacher'],
  ['core', 'student'],
  ['core', 'parent'],
  ['core', 'industry'],
  ['core', 'finance'],
  ['core', 'exec'],
  ['teacher', 'parent'],
  ['student', 'industry'],
  ['parent', 'finance'],
  ['industry', 'exec'],
  ['finance', 'exec'],
];

function getNode(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function AiNetwork({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      el!.style.setProperty('--px', `${x * 8}px`);
      el!.style.setProperty('--py', `${y * 8}px`);
    }

    el.addEventListener('mousemove', handleMove, { passive: true });
    return () => el.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{ '--px': '0px', '--py': '0px' } as React.CSSProperties}
      aria-label="AI Ecosystem network visualization"
      role="img"
    >
      <svg
        viewBox="0 0 400 380"
        className="h-full w-full"
        style={{
          transform: 'translate(var(--px), var(--py))',
          transition: 'transform 0.3s ease-out',
        }}
      >
        <defs>
          {/* Core gradient — uses CSS vars */}
          <radialGradient id="core-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--auth-node-blue)" stopOpacity="0.9" />
            <stop offset="70%" stopColor="var(--auth-node-blue)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--auth-node-blue)" stopOpacity="0.3" />
          </radialGradient>
        </defs>

        {/* Edges */}
        {EDGES.map(([fromId, toId]) => {
          const from = getNode(fromId);
          const to = getNode(toId);
          return (
            <line
              key={`${fromId}-${toId}`}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="animate-dash-flow text-[var(--auth-border2)]"
              opacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const isCore = node.id === 'core';
          return (
            <g key={node.id} style={isCore ? { filter: 'drop-shadow(0 0 6px var(--auth-node-blue))' } : undefined}>
              {/* Pulse ring */}
              <circle
                cx={node.cx}
                cy={node.cy}
                r={node.r + 6}
                fill="none"
                stroke={node.color}
                strokeWidth="1"
                opacity={0.3}
                className="animate-pulse-glow"
                style={{ animationDelay: `${node.delay}s` }}
              />

              {/* Node circle */}
              <circle
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill={isCore ? 'url(#core-gradient)' : node.color}
                opacity={isCore ? 1 : 0.15}
                stroke={node.color}
                strokeWidth={isCore ? 2 : 1.5}
                className={isCore ? 'animate-breathe' : ''}
              />

              {/* Label */}
              <text
                x={node.cx}
                y={node.cy + (isCore ? 1 : 0)}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[var(--auth-text)] select-none"
                style={{ fontSize: isCore ? '12px' : '9px', fontWeight: isCore ? 700 : 500 }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

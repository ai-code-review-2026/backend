"use client"

import { useId } from "react"

interface CircuitLoaderProps {
  text?: string
  subText?: string
}

export function CircuitLoader({ text = "Loading...", subText }: CircuitLoaderProps) {
  const uniqueId = useId()

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div className="h-[500px] w-full max-w-[900px]">
        <svg
          viewBox="0 0 900 900"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          <defs>
            <linearGradient
              id={`traceGradient1-${uniqueId}`}
              x1={250}
              y1={120}
              x2={100}
              y2={200}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#00ccff" stopOpacity={1} />
              <stop offset="100%" stopColor="#00ccff" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient
              id={`traceGradient2-${uniqueId}`}
              x1={650}
              y1={120}
              x2={800}
              y2={300}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#00ccff" stopOpacity={1} />
              <stop offset="100%" stopColor="#00ccff" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient
              id={`traceGradient3-${uniqueId}`}
              x1={250}
              y1={380}
              x2={400}
              y2={400}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#00ccff" stopOpacity={1} />
              <stop offset="100%" stopColor="#00ccff" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient
              id={`traceGradient4-${uniqueId}`}
              x1={650}
              y1={120}
              x2={500}
              y2={100}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#00ccff" stopOpacity={1} />
              <stop offset="100%" stopColor="#00ccff" stopOpacity={0.5} />
            </linearGradient>
          </defs>

          {/* Grid */}
          <g id="grid">
            <g>
              {[0, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
                <line
                  key={`v-${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2="100%"
                  className="stroke-[#222] stroke-[0.5]"
                />
              ))}
            </g>
            <g>
              {[100, 200, 300, 400, 500, 600, 700, 800].map((y) => (
                <line
                  key={`h-${y}`}
                  x1={0}
                  y1={y}
                  x2="100%"
                  y2={y}
                  className="stroke-[#222] stroke-[0.5]"
                />
              ))}
            </g>
          </g>

          {/* Browser Window */}
          <g id="browser" transform="translate(0, 200)">
            {/* Frame */}
            <rect
              x={250}
              y={120}
              width={400}
              height={260}
              rx={8}
              ry={8}
              className="fill-[#111] stroke-[#666] stroke-1"
              style={{ filter: "drop-shadow(0 0 10px rgba(0, 0, 0, 0.9))" }}
            />
            {/* Top bar */}
            <rect
              x={250}
              y={120}
              width={400}
              height={30}
              rx={8}
              ry={8}
              className="fill-[#1a1a1a]"
            />
            {/* Loading text */}
            <text
              x={450}
              y={140}
              textAnchor="middle"
              className="fill-[#e4e4e4] text-sm"
              style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px" }}
            >
              {text}
            </text>

            {/* Skeleton elements */}
            <rect x={270} y={160} width={360} height={20} rx={4} ry={4} className="skeleton-pulse fill-[#2d2d2d]" />
            <rect x={270} y={190} width={200} height={15} rx={4} ry={4} className="skeleton-pulse fill-[#2d2d2d]" style={{ animationDelay: "0.2s" }} />
            <rect x={270} y={215} width={300} height={15} rx={4} ry={4} className="skeleton-pulse fill-[#2d2d2d]" style={{ animationDelay: "0.4s" }} />
            <rect x={270} y={240} width={360} height={90} rx={4} ry={4} className="skeleton-pulse fill-[#2d2d2d]" style={{ animationDelay: "0.6s" }} />
            <rect x={270} y={340} width={180} height={20} rx={4} ry={4} className="skeleton-pulse fill-[#2d2d2d]" style={{ animationDelay: "0.8s" }} />
          </g>

          {/* Animated traces */}
          <g id="traces" transform="translate(0, 200)">
            <path
              d="M100 300 H250 V120"
              className="trace-flow"
              style={{ stroke: `url(#traceGradient1-${uniqueId})` }}
            />
            <path
              d="M800 200 H650 V380"
              className="trace-flow"
              style={{ stroke: `url(#traceGradient2-${uniqueId})`, animationDelay: "1.25s" }}
            />
            <path
              d="M400 520 V380 H250"
              className="trace-flow"
              style={{ stroke: `url(#traceGradient3-${uniqueId})`, animationDelay: "2.5s" }}
            />
            <path
              d="M500 50 V120 H650"
              className="trace-flow"
              style={{ stroke: `url(#traceGradient4-${uniqueId})`, animationDelay: "3.75s" }}
            />
          </g>
        </svg>
      </div>

      <style jsx>{`
        .skeleton-pulse {
          animation: pulse 1.8s ease-in-out infinite;
        }

        @keyframes pulse {
          0% {
            fill: #2d2d2d;
          }
          50% {
            fill: #505050;
          }
          100% {
            fill: #2d2d2d;
          }
        }

        .trace-flow {
          stroke-width: 2;
          fill: none;
          stroke-dasharray: 120 600;
          stroke-dashoffset: 720;
          animation: flow 5s linear infinite;
          opacity: 0.95;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 8px #00ccff);
        }

        @keyframes flow {
          from {
            stroke-dashoffset: 720;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  )
}

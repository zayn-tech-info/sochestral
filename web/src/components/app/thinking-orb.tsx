"use client";

import { useId } from "react";
import { useReducedMotion } from "motion/react";

export function ThinkingOrb() {
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/:/g, "");

  return (
    <span
      className={`thinking-orb${reduceMotion ? " thinking-orb-static" : ""}`}
      aria-hidden="true"
      data-testid="thinking-orb"
    >
      <svg
        className="thinking-orb-svg"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={`${uid}-warm`}
            x1="8"
            y1="6"
            x2="56"
            y2="58"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#ff8ec8" />
            <stop offset="0.4" stopColor="#ff4d8d" />
            <stop offset="1" stopColor="#ff7a4d" />
          </linearGradient>
          <linearGradient
            id={`${uid}-coral`}
            x1="56"
            y1="8"
            x2="8"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#ff9a62" />
            <stop offset="1" stopColor="#ff4dce" />
          </linearGradient>
          <linearGradient
            id={`${uid}-cool`}
            x1="10"
            y1="54"
            x2="54"
            y2="10"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#7af0ff" />
            <stop offset="1" stopColor="#6b8cff" />
          </linearGradient>
          <filter
            id={`${uid}-glow`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="1.35" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${uid}-glow)`}>
          <g className="thinking-orb-ribbon thinking-orb-ribbon-a">
            <ellipse
              cx="32"
              cy="32"
              rx="20"
              ry="8.4"
              stroke={`url(#${uid}-warm)`}
              strokeWidth="2.35"
            />
          </g>
          <g className="thinking-orb-ribbon thinking-orb-ribbon-b">
            <ellipse
              cx="32"
              cy="32"
              rx="19.2"
              ry="9.4"
              stroke={`url(#${uid}-coral)`}
              strokeWidth="2.1"
            />
          </g>
          <g className="thinking-orb-ribbon thinking-orb-ribbon-c">
            <ellipse
              cx="32"
              cy="32"
              rx="18.6"
              ry="8"
              stroke={`url(#${uid}-cool)`}
              strokeWidth="2.05"
            />
          </g>
          <g className="thinking-orb-ribbon thinking-orb-ribbon-d">
            <ellipse
              cx="32"
              cy="32"
              rx="17.2"
              ry="10.2"
              stroke="rgba(255,255,255,0.78)"
              strokeWidth="1.05"
            />
          </g>
          <g className="thinking-orb-ribbon thinking-orb-ribbon-e">
            <ellipse
              cx="32"
              cy="32"
              rx="20.6"
              ry="7.1"
              stroke="rgba(255,122,184,0.58)"
              strokeWidth="1.35"
            />
          </g>
        </g>
      </svg>
    </span>
  );
}

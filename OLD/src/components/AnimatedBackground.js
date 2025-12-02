import React from 'react';
import { Box } from '@mantine/core';

const AnimatedBackground = () => {
  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* Subtle Grid Pattern */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `
            linear-gradient(rgba(50, 205, 50, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(50, 205, 50, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          opacity: 0.7,
        }}
      />

      {/* Animated SVG Route Paths */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <style>
            {`
              @keyframes drawPath1 {
                0% { stroke-dashoffset: 2000; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes drawPath2 {
                0% { stroke-dashoffset: 2500; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes drawPath3 {
                0% { stroke-dashoffset: 1800; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes drawPath4 {
                0% { stroke-dashoffset: 2200; }
                100% { stroke-dashoffset: 0; }
              }

              .route-path-1 {
                stroke-dasharray: 2000;
                animation: drawPath1 30s ease-in-out infinite;
                will-change: stroke-dashoffset;
              }
              .route-path-2 {
                stroke-dasharray: 2500;
                animation: drawPath2 40s ease-in-out infinite;
                animation-delay: 5s;
                will-change: stroke-dashoffset;
              }
              .route-path-3 {
                stroke-dasharray: 1800;
                animation: drawPath3 35s ease-in-out infinite;
                animation-delay: 10s;
                will-change: stroke-dashoffset;
              }
              .route-path-4 {
                stroke-dasharray: 2200;
                animation: drawPath4 45s ease-in-out infinite;
                animation-delay: 15s;
                will-change: stroke-dashoffset;
              }

              /* Respect user preference for reduced motion */
              @media (prefers-reduced-motion: reduce) {
                .route-path-1, .route-path-2, .route-path-3, .route-path-4,
                .floating-node {
                  animation: none !important;
                }
              }
            `}
          </style>
        </defs>

        {/* Route Path 1 - Top flowing curve */}
        <path
          d="M -100 200 Q 200 100, 400 150 T 800 200 Q 1100 250, 1400 180 T 2000 200"
          fill="none"
          stroke="rgba(50, 205, 50, 0.15)"
          strokeWidth="3"
          className="route-path-1"
        />

        {/* Route Path 2 - Middle diagonal */}
        <path
          d="M -100 400 Q 300 350, 500 450 T 900 400 Q 1200 350, 1500 420 T 2000 450"
          fill="none"
          stroke="rgba(50, 205, 50, 0.12)"
          strokeWidth="3"
          className="route-path-2"
        />

        {/* Route Path 3 - Lower wave */}
        <path
          d="M -100 700 Q 250 650, 450 700 T 850 750 Q 1150 800, 1450 720 T 2000 750"
          fill="none"
          stroke="rgba(50, 205, 50, 0.13)"
          strokeWidth="3"
          className="route-path-3"
        />

        {/* Route Path 4 - Bottom subtle curve */}
        <path
          d="M -100 900 Q 350 850, 550 920 T 950 900 Q 1250 850, 1550 940 T 2000 900"
          fill="none"
          stroke="rgba(50, 205, 50, 0.10)"
          strokeWidth="3"
          className="route-path-4"
        />
      </svg>

      {/* Floating Waypoint Nodes */}
      <style>
        {`
          @keyframes float1 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(30px, -40px, 0); }
          }
          @keyframes float2 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(-40px, 30px, 0); }
          }
          @keyframes float3 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(25px, 35px, 0); }
          }
          @keyframes float4 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(-30px, -25px, 0); }
          }
          @keyframes float5 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(35px, 20px, 0); }
          }
          @keyframes float6 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(-20px, -35px, 0); }
          }
          @keyframes float7 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(40px, -30px, 0); }
          }
          @keyframes float8 {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(-35px, 40px, 0); }
          }

          .floating-node {
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(50, 205, 50, 0.25);
            box-shadow: 0 0 15px rgba(50, 205, 50, 0.5), 0 0 25px rgba(50, 205, 50, 0.3);
            will-change: transform;
          }

          .node-1 {
            top: 15%;
            left: 20%;
            animation: float1 25s ease-in-out infinite;
          }
          .node-2 {
            top: 25%;
            left: 70%;
            animation: float2 30s ease-in-out infinite;
            animation-delay: 3s;
          }
          .node-3 {
            top: 40%;
            left: 15%;
            animation: float3 28s ease-in-out infinite;
            animation-delay: 6s;
          }
          .node-4 {
            top: 50%;
            left: 85%;
            animation: float4 32s ease-in-out infinite;
            animation-delay: 9s;
          }
          .node-5 {
            top: 65%;
            left: 25%;
            animation: float5 27s ease-in-out infinite;
            animation-delay: 12s;
          }
          .node-6 {
            top: 75%;
            left: 60%;
            animation: float6 29s ease-in-out infinite;
            animation-delay: 15s;
          }
          .node-7 {
            top: 85%;
            left: 40%;
            animation: float7 31s ease-in-out infinite;
            animation-delay: 18s;
          }
          .node-8 {
            top: 35%;
            left: 50%;
            animation: float8 26s ease-in-out infinite;
            animation-delay: 21s;
          }
        `}
      </style>

      {/* Waypoint nodes */}
      <div className="floating-node node-1" />
      <div className="floating-node node-2" />
      <div className="floating-node node-3" />
      <div className="floating-node node-4" />
      <div className="floating-node node-5" />
      <div className="floating-node node-6" />
      <div className="floating-node node-7" />
      <div className="floating-node node-8" />
    </Box>
  );
};

export default AnimatedBackground;

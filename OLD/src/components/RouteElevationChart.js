import React from 'react';

/**
 * RouteElevationChart Component
 * D3-style SVG elevation profile chart for route visualization
 */
const RouteElevationChart = ({ data, width = 800, height = 280, useImperial = true, elevationUnit = 'ft', distanceUnit = 'mi' }) => {
  console.log('ElevationChart rendering with data:', data?.length, 'points');
  console.log('Sample elevation data:', data?.slice(0, 3));
  
  if (!data || data.length < 2) {
    console.log('ElevationChart: insufficient data');
    return (
      <div style={{ padding: 20, textAlign: 'center', backgroundColor: '#f0f0f0', width: '100%' }}>
        No elevation data to display (got {data?.length || 0} points)
      </div>
    );
  }

  // Handle responsive width
  const actualWidth = width === "100%" ? 800 : width; // Use 800 as base for calculations when 100%
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const chartWidth = actualWidth - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Convert elevation data from meters to display units
  const elevations = data.map(d => useImperial ? d.elevation * 3.28084 : d.elevation);
  const distances = data.map(d => d.distance || 0);
  
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const maxDistance = Math.max(...distances);
  
  // Add padding to elevation range for better visualization
  const elevationRange = maxElevation - minElevation;
  const paddedMin = minElevation - elevationRange * 0.1;
  const paddedMax = maxElevation + elevationRange * 0.1;

  // Create SVG path
  const pathData = data
    .map((point, i) => {
      const x = (point.distance / maxDistance) * chartWidth;
      const y = chartHeight - ((point.elevation - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Create area fill path
  const areaPath = pathData + 
    ` L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  // Generate elevation grid lines
  const elevationTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const elevation = paddedMin + (paddedMax - paddedMin) * (i / tickCount);
    const y = chartHeight - (i / tickCount) * chartHeight;
    elevationTicks.push({ elevation: Math.round(elevation), y });
  }

  // Generate distance grid lines
  const distanceTicks = [];
  const distanceTickCount = 6;
  for (let i = 0; i <= distanceTickCount; i++) {
    const distance = maxDistance * (i / distanceTickCount); // Already in miles/km
    const x = (i / distanceTickCount) * chartWidth;
    distanceTicks.push({ distance: distance.toFixed(1), x });
  }

  return (
    <svg 
      width={width === "100%" ? "100%" : width} 
      height={height} 
      viewBox={width === "100%" ? `0 0 ${actualWidth} ${height}` : undefined}
      style={{ 
        background: '#f8f9fa', 
        borderRadius: '4px',
        width: '100%',
        height: '100%'
      }}
    >
      {/* Background grid */}
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Horizontal grid lines */}
        {elevationTicks.map((tick, i) => (
          <g key={`h-${i}`}>
            <line
              x1={0}
              y1={tick.y}
              x2={chartWidth}
              y2={tick.y}
              stroke="#e0e0e0"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={-10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize="14"
              fill="#666"
            >
              {tick.elevation}{elevationUnit}
            </text>
          </g>
        ))}
        
        {/* Vertical grid lines */}
        {distanceTicks.map((tick, i) => (
          <g key={`v-${i}`}>
            <line
              x1={tick.x}
              y1={0}
              x2={tick.x}
              y2={chartHeight}
              stroke="#e0e0e0"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={tick.x}
              y={chartHeight + 20}
              textAnchor="middle"
              fontSize="14"
              fill="#666"
            >
              {tick.distance}{distanceUnit}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path
          d={areaPath}
          fill="rgba(37, 99, 235, 0.2)"
          stroke="none"
        />

        {/* Elevation line */}
        <path
          d={pathData}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 20)) === 0).map((point, i) => {
          const x = (point.distance / maxDistance) * chartWidth;
          const y = chartHeight - ((point.elevation - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="#2563eb"
              stroke="white"
              strokeWidth="1"
            />
          );
        })}
      </g>

      {/* Axis labels */}
      <text
        x={margin.left + chartWidth / 2}
        y={height - 5}
        textAnchor="middle"
        fontSize="14"
        fill="#333"
        fontWeight="600"
      >
        Distance ({distanceUnit})
      </text>
      <text
        x={15}
        y={margin.top + chartHeight / 2}
        textAnchor="middle"
        fontSize="14"
        fill="#333"
        fontWeight="600"
        transform={`rotate(-90 15 ${margin.top + chartHeight / 2})`}
      >
        Elevation ({elevationUnit})
      </text>
    </svg>
  );
};

export default RouteElevationChart;
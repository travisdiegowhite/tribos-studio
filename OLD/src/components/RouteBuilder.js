import React, { useState, useRef } from 'react';
import ProfessionalRouteBuilder from './ProfessionalRouteBuilder';
import { useNavigate } from 'react-router-dom';

const RouteBuilder = () => {
  const [refreshFlag, setRefreshFlag] = useState(0);
  const routeBuilderRef = useRef(null);
  const navigate = useNavigate();

  const handleExit = () => {
    navigate('/map');
  };

  const handleSaved = (newRoute) => {
    setRefreshFlag(f => f + 1);
    navigate('/map');
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      <ProfessionalRouteBuilder
        ref={routeBuilderRef}
        active={true}
        onExit={handleExit}
        onSaved={handleSaved}
        inline={false}
      />
    </div>
  );
};

export default RouteBuilder;
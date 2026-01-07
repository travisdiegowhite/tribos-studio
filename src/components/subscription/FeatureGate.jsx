import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import UpgradeModal from './UpgradeModal';

/**
 * FeatureGate Component
 * Wraps content that should only be available to users with specific features/tiers
 *
 * Usage:
 * <FeatureGate feature="ai_coach" fallback={<UpgradePrompt />}>
 *   <AICoachComponent />
 * </FeatureGate>
 *
 * Or with limit checking:
 * <FeatureGate limit="max_routes_per_month" fallback={<LimitReachedMessage />}>
 *   <CreateRouteButton />
 * </FeatureGate>
 */
export default function FeatureGate({
  children,
  feature = null,
  limit = null,
  fallback = null,
  showModal = false // If true, clicking fallback opens upgrade modal
}) {
  const { hasFeature, checkLimit, loading } = useSubscription();
  const [modalOpened, setModalOpened] = useState(false);

  // Show nothing while loading
  if (loading) {
    return null;
  }

  // Check feature access
  if (feature && !hasFeature(feature)) {
    if (showModal) {
      return (
        <>
          <div onClick={() => setModalOpened(true)} style={{ cursor: 'pointer' }}>
            {fallback}
          </div>
          <UpgradeModal
            opened={modalOpened}
            onClose={() => setModalOpened(false)}
            feature={feature}
          />
        </>
      );
    }
    return fallback || null;
  }

  // Check limit
  if (limit) {
    const limitCheck = checkLimit(limit);
    if (!limitCheck.allowed) {
      if (showModal) {
        return (
          <>
            <div onClick={() => setModalOpened(true)} style={{ cursor: 'pointer' }}>
              {fallback}
            </div>
            <UpgradeModal
              opened={modalOpened}
              onClose={() => setModalOpened(false)}
              limitName={limit}
              limitMax={limitCheck.max}
            />
          </>
        );
      }
      return fallback || null;
    }
  }

  // User has access
  return children;
}

/**
 * Hook version for more complex logic
 */
export function useFeatureGate(feature) {
  const { hasFeature, loading } = useSubscription();
  const [modalOpened, setModalOpened] = useState(false);

  return {
    hasAccess: !loading && hasFeature(feature),
    loading,
    openUpgradeModal: () => setModalOpened(true),
    closeUpgradeModal: () => setModalOpened(false),
    modalOpened,
    UpgradeModal: () => (
      <UpgradeModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        feature={feature}
      />
    )
  };
}

/**
 * Hook version for limit checking
 */
export function useLimitGate(limitName) {
  const { checkLimit, loading } = useSubscription();
  const [modalOpened, setModalOpened] = useState(false);

  const limitCheck = checkLimit(limitName);

  return {
    ...limitCheck,
    loading,
    openUpgradeModal: () => setModalOpened(true),
    closeUpgradeModal: () => setModalOpened(false),
    modalOpened,
    UpgradeModal: () => (
      <UpgradeModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        limitName={limitName}
        limitMax={limitCheck.max}
      />
    )
  };
}

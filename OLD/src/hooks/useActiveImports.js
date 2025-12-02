// useActiveImports - Custom hook to track active import jobs
// Polls for job status and provides real-time updates

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { stravaService } from '../utils/stravaService';

export function useActiveImports() {
  const { user } = useAuth();
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissedJobIds, setDismissedJobIds] = useState(new Set());
  const pollingIntervalRef = useRef(null);

  // Fetch active jobs on mount
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchActiveJobs();

    // Set up polling for active jobs
    pollingIntervalRef.current = setInterval(() => {
      fetchActiveJobs();
    }, 3000); // Poll every 3 seconds

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [user]);

  const fetchActiveJobs = async () => {
    if (!user) return;

    try {
      // Query for active jobs (pending or running)
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active jobs:', error);
        return;
      }

      // Also check for recently completed jobs (within last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentCompleted, error: completedError } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['completed', 'failed'])
        .gte('completed_at', fiveMinutesAgo)
        .order('completed_at', { ascending: false })
        .limit(3);

      if (completedError) {
        console.error('Error fetching completed jobs:', error);
      }

      // Combine active and recent completed jobs
      const allJobs = [...(data || []), ...(recentCompleted || [])];

      // Filter out dismissed jobs and add show flags
      const jobsWithFlags = allJobs
        .filter(job => !dismissedJobIds.has(job.id))
        .map(job => ({
          ...job,
          _showCompleted: job.status === 'completed',
          _showFailed: job.status === 'failed'
        }));

      setActiveJobs(jobsWithFlags);
      setLoading(false);

    } catch (error) {
      console.error('Error in fetchActiveJobs:', error);
      setLoading(false);
    }
  };

  const dismissJob = (jobId) => {
    // Track dismissed job IDs so polling doesn't bring them back
    setDismissedJobIds(prev => new Set([...prev, jobId]));
    // Also remove from current state immediately
    setActiveJobs(prev => prev.filter(job => job.id !== jobId));
  };

  const refreshJobs = () => {
    fetchActiveJobs();
  };

  return {
    activeJobs,
    loading,
    dismissJob,
    refreshJobs
  };
}
